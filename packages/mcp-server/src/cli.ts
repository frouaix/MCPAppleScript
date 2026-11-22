import { ConfigError } from "./util/errors.js";

export function parseArgs(args: string[]): { profile?: string; help: boolean } {
  let profile: string | undefined;
  let help = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--profile") {
      const value = args[++i];
      if (!value || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
        throw new ConfigError("--profile requires a valid profile name.");
      }
      if (profile !== undefined) throw new ConfigError("--profile may only be specified once.");
      profile = value;
    } else {
      throw new ConfigError(`Unknown argument "${arg}". Only stdio transport is supported.`);
    }
  }
  return { profile, help };
}
