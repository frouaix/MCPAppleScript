import { z } from "zod";

export const AppConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowedTools: z.array(z.string()).default([]),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const RunScriptConfigSchema = z.object({
  enabled: z.boolean().default(false),
  allowedBundleIds: z.array(z.string()).default([]),
});

export type RunScriptConfig = z.infer<typeof RunScriptConfigSchema>;

export const LoggingConfigSchema = z.object({
  level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  redact: z.array(z.string()).default([]),
});

export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const ConfigSchema = z.object({
  executorPath: z.string().default("applescript-executor"),
  defaultTimeoutMs: z.number().int().positive().default(12000),
  apps: z.record(z.string(), AppConfigSchema).default({}),
  runScript: RunScriptConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = ConfigSchema.parse({});
