import { AppName, AppNameSchema, Config, Permission } from "../config/schema.js";
import { ConfigError, PolicyDeniedError } from "../util/errors.js";
import { Logger } from "../util/logging.js";

const LEVEL: Record<Permission, number> = { off: 0, read: 1, readwrite: 2 };
const READ_TOOLS = new Set(["app.list_containers", "app.list", "app.get", "app.search"]);
const WRITE_TOOLS = new Set(["app.create", "app.update", "app.delete", "app.action"]);

export interface PolicyContext {
  toolName: string;
  app: AppName;
  action?: string;
}

export class PolicyEngine {
  private readonly permissions: Readonly<Record<AppName, Permission>>;

  constructor(
    config: Config,
    private readonly logger: Logger,
    readonly profile?: string
  ) {
    const grant =
      profile === undefined
        ? config.permissions
        : Object.hasOwn(config.profiles, profile)
          ? config.profiles[profile]
          : undefined;
    if (!grant) {
      throw new ConfigError(`Unknown permission profile "${profile}". Configure it in "profiles".`);
    }

    this.permissions = Object.freeze(
      Object.fromEntries(
        AppNameSchema.options.map((app) => {
          const ceiling = config.permissions.apps[app] ?? config.permissions.default;
          const requested = grant.apps[app] ?? grant.default;
          const effective = LEVEL[requested] <= LEVEL[ceiling] ? requested : ceiling;
          return [app, effective];
        })
      ) as Record<AppName, Permission>
    );
  }

  getPermissions(): Readonly<Record<AppName, Permission>> {
    return this.permissions;
  }

  assertAllowed({ toolName, app, action }: PolicyContext): void {
    // Unknown operations fail closed; new action types are writes unless explicitly classified.
    const required =
      READ_TOOLS.has(toolName) ||
      (toolName === "app.action" && app === "music" && action === "now_playing")
        ? "read"
        : WRITE_TOOLS.has(toolName)
          ? "readwrite"
          : undefined;
    const permission = this.permissions[app];
    if (!required || LEVEL[permission] < LEVEL[required]) {
      this.logger.warn("Policy denied", { toolName, app, action, permission, required });
      throw new PolicyDeniedError(
        `${toolName}${action ? ` (${action})` : ""} requires ${required ?? "a supported operation"} access to ${app}; this instance has ${permission} access.`,
        { toolName, app, permission, profile: this.profile ?? null }
      );
    }
  }
}
