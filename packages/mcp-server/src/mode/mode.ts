/**
 * Operation mode system for the MCP-AppleScript bridge.
 *
 * Three modes control which tools are available:
 * - readonly: only read/query tools (ping, list_apps, get_mode, set_mode)
 * - create:   readonly + creation tools (notes, calendar, mail, run_template)
 * - full:     all tools including destructive ones (run_script)
 */

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

/** Classification of every registered tool. */
export const TOOL_MODE_MAP: Record<string, ToolModeInfo> = {
  "applescript.ping": { minMode: "readonly", destructive: false },
  "applescript.list_apps": { minMode: "readonly", destructive: false },
  "applescript.get_mode": { minMode: "readonly", destructive: false },
  "applescript.set_mode": { minMode: "readonly", destructive: false },
  "notes.create_note": { minMode: "create", destructive: false },
  "calendar.create_event": { minMode: "create", destructive: false },
  "mail.compose_draft": { minMode: "create", destructive: false },
  "applescript.run_template": { minMode: "create", destructive: true },
  "applescript.run_script": { minMode: "full", destructive: true },
};

export function isToolAllowedInMode(toolName: string, mode: OperationMode): boolean {
  const info = TOOL_MODE_MAP[toolName];
  if (!info) return false;
  return MODE_LEVELS[mode] >= MODE_LEVELS[info.minMode];
}

export function isDestructiveTool(toolName: string): boolean {
  return TOOL_MODE_MAP[toolName]?.destructive === true;
}

export type ModeChangeListener = (oldMode: OperationMode, newMode: OperationMode) => void;

export class ModeManager {
  private mode: OperationMode;
  private listeners: ModeChangeListener[] = [];

  constructor(defaultMode: OperationMode = "readonly") {
    this.mode = defaultMode;
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

  /** Returns tool names that should be enabled for the current mode. */
  getEnabledTools(): string[] {
    return Object.keys(TOOL_MODE_MAP).filter((name) => isToolAllowedInMode(name, this.mode));
  }

  /** Returns tool names that should be disabled for the current mode. */
  getDisabledTools(): string[] {
    return Object.keys(TOOL_MODE_MAP).filter((name) => !isToolAllowedInMode(name, this.mode));
  }
}
