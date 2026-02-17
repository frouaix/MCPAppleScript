import { Config, AppConfig } from "../config/schema.js";
import { PolicyDeniedError } from "../util/errors.js";
import { Logger } from "../util/logging.js";
import { ModeManager, isToolAllowedInMode } from "../mode/mode.js";

export interface PolicyContext {
  toolName: string;
  bundleId?: string;
  args?: Record<string, unknown>;
}

export class PolicyEngine {
  private readonly config: Config;
  private readonly logger: Logger;
  private modeManager: ModeManager | undefined;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /** Attach a ModeManager for mode-based enforcement. */
  setModeManager(modeManager: ModeManager): void {
    this.modeManager = modeManager;
  }

  assertAllowed(ctx: PolicyContext): void {
    const { toolName, bundleId } = ctx;

    // Mode check: reject tools not allowed in current mode
    if (this.modeManager) {
      const mode = this.modeManager.getMode();
      if (!isToolAllowedInMode(toolName, mode)) {
        this.logger.warn("Policy denied: tool not allowed in current mode", {
          toolName,
          mode,
        });
        throw new PolicyDeniedError(
          `Tool ${toolName} is not available in "${mode}" mode. Change mode with applescript.set_mode.`,
          { toolName, mode }
        );
      }
    }

    // run_script requires explicit enablement
    if (toolName === "applescript.run_script") {
      this.assertRunScriptAllowed(bundleId);
      return;
    }

    // Tools without a bundleId (e.g. applescript.list_apps, applescript.ping) are always allowed
    if (!bundleId) return;

    this.assertAppAllowed(bundleId, toolName);
  }

  isAppEnabled(bundleId: string): boolean {
    const appConfig = this.config.apps[bundleId];
    return appConfig?.enabled === true;
  }

  getAllowedTools(bundleId: string): string[] {
    const appConfig = this.config.apps[bundleId];
    return appConfig?.allowedTools ?? [];
  }

  getConfiguredApps(): Array<{ bundleId: string; config: AppConfig }> {
    return Object.entries(this.config.apps).map(([bundleId, config]) => ({
      bundleId,
      config,
    }));
  }

  private assertRunScriptAllowed(bundleId?: string): void {
    if (!this.config.runScript.enabled) {
      this.logger.warn("run_script denied: globally disabled");
      throw new PolicyDeniedError(
        "applescript.run_script is disabled. Enable it in config to use.",
        { toolName: "applescript.run_script" }
      );
    }

    if (bundleId && this.config.runScript.allowedBundleIds.length > 0) {
      if (!this.config.runScript.allowedBundleIds.includes(bundleId)) {
        this.logger.warn("run_script denied: bundle not in allowlist", { bundleId });
        throw new PolicyDeniedError(
          `applescript.run_script is not allowed for app ${bundleId}`,
          { toolName: "applescript.run_script", bundleId }
        );
      }
    }
  }

  private assertAppAllowed(bundleId: string, toolName: string): void {
    const appConfig = this.config.apps[bundleId];

    if (!appConfig) {
      this.logger.warn("Policy denied: app not configured", { bundleId, toolName });
      throw new PolicyDeniedError(
        `App ${bundleId} is not configured. Add it to config to use.`,
        { toolName, bundleId }
      );
    }

    if (!appConfig.enabled) {
      this.logger.warn("Policy denied: app disabled", { bundleId, toolName });
      throw new PolicyDeniedError(`App ${bundleId} is disabled in config.`, {
        toolName,
        bundleId,
      });
    }

    if (appConfig.allowedTools.length > 0 && !appConfig.allowedTools.includes(toolName)) {
      this.logger.warn("Policy denied: tool not in allowlist", { bundleId, toolName });
      throw new PolicyDeniedError(
        `Tool ${toolName} is not allowed for app ${bundleId}`,
        { toolName, bundleId, allowedTools: appConfig.allowedTools }
      );
    }
  }
}
