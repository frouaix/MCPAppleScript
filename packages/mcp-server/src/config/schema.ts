import { z } from "zod";

export const AppNameSchema = z.enum([
  "notes",
  "calendar",
  "reminders",
  "mail",
  "contacts",
  "messages",
  "photos",
  "music",
  "finder",
  "safari",
]);
export type AppName = z.infer<typeof AppNameSchema>;

export const PermissionSchema = z.enum(["off", "read", "readwrite"]);
export type Permission = z.infer<typeof PermissionSchema>;

export const PermissionsSchema = z
  .object({
    default: PermissionSchema.default("off"),
    apps: z.record(AppNameSchema, PermissionSchema).default({}),
  })
  .strict();
export type Permissions = z.infer<typeof PermissionsSchema>;

export const SafariConfigSchema = z.object({
  doJavaScript: z.boolean().default(false),
});
export type SafariConfig = z.infer<typeof SafariConfigSchema>;

export const FinderConfigSchema = z.object({
  allowedPaths: z.array(z.string().min(1)).default([]),
});
export type FinderConfig = z.infer<typeof FinderConfigSchema>;

export const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  redact: z.array(z.string()).default([]),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const ConfigSchema = z
  .object({
    defaultTimeoutMs: z.number().int().positive().default(12000),
    permissions: PermissionsSchema.default({}),
    profiles: z
      .record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), PermissionsSchema)
      .default({}),
    safari: SafariConfigSchema.default({}),
    finder: FinderConfigSchema.default({}),
    logging: LoggingConfigSchema.default({}),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});
