/**
 * Operation mode system for the MCP-AppleScript bridge.
 *
 * Three modes control which tools are available:
 * - readonly: only read/query tools (ping, list_apps, get_mode, set_mode)
 * - create:   readonly + creation tools (notes, calendar, mail, run_template)
 * - full:     all tools including destructive ones (run_script)
 *
 * The tool-to-mode mapping is configurable via config.modes. Each mode lists
 * the tools introduced at that level; modes are cumulative.
 */

import { ModesConfig } from "../config/schema.js";

export type OperationMode = "readonly" | "create" | "full";

export const MODE_LEVELS: Record<OperationMode, number> = {
  readonly: 0,
  create: 1,
  full: 2,
};

export const ALL_MODES: OperationMode[] = ["readonly", "create", "full"];

/** Minimum mode required and whether the tool is destructive. */
export interface ToolModeInfo {
  minMode: OperationMode;
  destructive: boolean;
}

/** Hardcoded destructive flags — inherent to the tool's nature. */
const DESTRUCTIVE_TOOLS = new Set([
  "applescript.run_template",
  "applescript.run_script",
]);

/**
 * Build a ToolModeMap from the config `modes` section.
 * Each mode lists the tools introduced at that level.
 */
export function buildToolModeMap(modes: ModesConfig): Record<string, ToolModeInfo> {
  const map: Record<string, ToolModeInfo> = {};
  for (const mode of ALL_MODES) {
    for (const tool of modes[mode]) {
      map[tool] = {
        minMode: mode,
        destructive: DESTRUCTIVE_TOOLS.has(tool),
      };
    }
  }
  return map;
}

/** Default tool-to-mode mapping (matches ModesConfigSchema defaults). */
export const DEFAULT_TOOL_MODE_MAP: Record<string, ToolModeInfo> = buildToolModeMap({
  readonly: [
    "applescript.ping",
    "applescript.list_apps",
    "applescript.get_mode",
    "applescript.set_mode",
  ],
  create: [
    "notes.create_note",
    "calendar.create_event",
    "mail.compose_draft",
    "applescript.run_template",
  ],
  full: [
    "applescript.run_script",
  ],
});

export type ModeChangeListener = (oldMode: OperationMode, newMode: OperationMode) => void;

export class ModeManager {
  private mode: OperationMode;
  private readonly toolModeMap: Record<string, ToolModeInfo>;
  private listeners: ModeChangeListener[] = [];

  constructor(
    defaultMode: OperationMode = "readonly",
    toolModeMap: Record<string, ToolModeInfo> = DEFAULT_TOOL_MODE_MAP,
  ) {
    this.mode = defaultMode;
    this.toolModeMap = toolModeMap;
  }

  getMode(): OperationMode {
    return this.mode;
  }

  setMode(newMode: OperationMode): { oldMode: OperationMode; newMode: OperationMode } {
    const oldMode = this.mode;
    this.mode = newMode;
    if (oldMode !== newMode) {
      for (const listener of this.listeners) {
        listener(oldMode, newMode);
      }
    }
    return { oldMode, newMode };
  }

  onModeChange(listener: ModeChangeListener): void {
    this.listeners.push(listener);
  }

  /** Check if a tool is allowed in the given mode. */
  isToolAllowedInMode(toolName: string, mode: OperationMode): boolean {
    const info = this.toolModeMap[toolName];
    if (!info) return false;
    return MODE_LEVELS[mode] >= MODE_LEVELS[info.minMode];
  }

  /** Check if a tool is classified as destructive. */
  isDestructiveTool(toolName: string): boolean {
    return this.toolModeMap[toolName]?.destructive === true;
  }

  /** Returns tool names that should be enabled for the current mode. */
  getEnabledTools(): string[] {
    return Object.keys(this.toolModeMap).filter((name) => this.isToolAllowedInMode(name, this.mode));
  }

  /** Returns tool names that should be disabled for the current mode. */
  getDisabledTools(): string[] {
    return Object.keys(this.toolModeMap).filter((name) => !this.isToolAllowedInMode(name, this.mode));
  }
}
