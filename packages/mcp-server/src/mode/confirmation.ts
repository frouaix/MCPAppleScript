import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

export class ConfirmationManager {
  private server: Server | undefined;

  attachServer(server: Server): void {
    this.server = server;
  }

  async requestConfirmation(
    action: string,
    details: string
  ): Promise<{ confirmed: boolean; message: string }> {
    if (!this.server?.getClientCapabilities()?.elicitation?.form) {
      return {
        confirmed: false,
        message:
          "This operation requires user confirmation through MCP form elicitation. " +
          "The connected client does not support it; the operation was not executed.",
      };
    }

    const result = await this.server.elicitInput({
      mode: "form",
      message: `Confirm ${action}:\n\n${details}`,
      requestedSchema: {
        type: "object",
        properties: { confirm: { type: "boolean", title: "Allow this operation" } },
        required: ["confirm"],
      },
    });
    const confirmed = result.action === "accept" && result.content?.confirm === true;
    return {
      confirmed,
      message: confirmed ? "Confirmed." : "User declined or cancelled; operation not executed.",
    };
  }
}
