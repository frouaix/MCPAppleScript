/**
 * Confirmation manager for destructive operations.
 *
 * Strategy:
 * 1. Try MCP elicitation (server asks client to show a confirmation dialog)
 * 2. Fallback: issue a confirmation token that must be passed back
 */

import { randomBytes } from "node:crypto";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

const TOKEN_TTL_MS = 120_000; // 2 minutes

interface PendingConfirmation {
  token: string;
  action: string;
  details: string;
  createdAt: number;
}

export class ConfirmationManager {
  private pending = new Map<string, PendingConfirmation>();
  private lowLevelServer: Server | undefined;

  /** Bind the low-level MCP Server instance (needed for elicitation). */
  attachServer(server: Server): void {
    this.lowLevelServer = server;
  }

  /**
   * Request confirmation for a destructive action.
   * Returns { confirmed: true } if approved, or { confirmed: false, token, message }
   * if the caller needs to present the token to the user for a second-call confirmation.
   */
  async requestConfirmation(
    action: string,
    details: string,
    suppliedToken?: string
  ): Promise<
    | { confirmed: true }
    | { confirmed: false; token: string; message: string }
  > {
    // If a token is supplied, validate it
    if (suppliedToken) {
      return this.validateToken(suppliedToken, action);
    }

    // Try elicitation first
    if (this.lowLevelServer) {
      try {
        const result = await this.lowLevelServer.elicitInput({
          message: `⚠️ Destructive action: ${action}\n\n${details}\n\nDo you want to proceed?`,
          requestedSchema: {
            type: "object" as const,
            properties: {
              confirm: {
                type: "boolean" as const,
                title: "Confirm this action",
                description: details,
              },
            },
          },
        });

        if (result.action === "accept" && result.content?.confirm === true) {
          return { confirmed: true };
        }
        // User declined or cancelled — fall through to token
      } catch {
        // Elicitation not supported by client — fall through to token
      }
    }

    // Fallback: issue a confirmation token
    return this.issueToken(action, details);
  }

  private issueToken(
    action: string,
    details: string
  ): { confirmed: false; token: string; message: string } {
    this.pruneExpired();

    const token = randomBytes(16).toString("hex");
    this.pending.set(token, {
      token,
      action,
      details,
      createdAt: Date.now(),
    });

    return {
      confirmed: false,
      token,
      message:
        `⚠️ This action may cause data loss: ${action}\n` +
        `${details}\n\n` +
        `To confirm, call this tool again with confirmationToken: "${token}"\n` +
        `This token expires in 2 minutes.`,
    };
  }

  private validateToken(
    token: string,
    action: string
  ): { confirmed: true } | { confirmed: false; token: string; message: string } {
    this.pruneExpired();

    const entry = this.pending.get(token);
    if (!entry) {
      return this.issueToken(action, "Previous token expired or invalid. New token issued.");
    }

    if (entry.action !== action) {
      return this.issueToken(action, "Token was for a different action. New token issued.");
    }

    // Token valid — consume it
    this.pending.delete(token);
    return { confirmed: true };
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.pending) {
      if (now - entry.createdAt > TOKEN_TTL_MS) {
        this.pending.delete(key);
      }
    }
  }
}
