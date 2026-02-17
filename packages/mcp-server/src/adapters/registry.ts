/**
 * Registry of app adapters. Maps app names to their ResourceAdapter instances.
 */

import { ResourceAdapter, AppInfo } from "./types.js";

export class AppRegistry {
  private adapters = new Map<string, ResourceAdapter>();

  register(adapter: ResourceAdapter): void {
    this.adapters.set(adapter.info.name, adapter);
  }

  get(appName: string): ResourceAdapter | undefined {
    return this.adapters.get(appName);
  }

  getOrThrow(appName: string): ResourceAdapter {
    const adapter = this.adapters.get(appName);
    if (!adapter) {
      const available = this.listApps().map((a) => a.name).join(", ");
      throw new Error(`Unknown app "${appName}". Available apps: ${available}`);
    }
    return adapter;
  }

  listApps(): AppInfo[] {
    return Array.from(this.adapters.values()).map((a) => a.info);
  }

  has(appName: string): boolean {
    return this.adapters.has(appName);
  }
}
