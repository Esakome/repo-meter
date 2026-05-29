import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CONFIG } from "./defaults.js";
import type { RepoMeterConfig } from "./types.js";

export async function loadConfig(cwd: string, explicitPath?: string): Promise<RepoMeterConfig> {
  const configPath = explicitPath
    ? path.resolve(cwd, explicitPath)
    : path.resolve(cwd, "repo-meter.config.json");

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RepoMeterConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      tui: {
        ...DEFAULT_CONFIG.tui,
        ...(parsed.tui ?? {})
      },
      categories: {
        ...DEFAULT_CONFIG.categories,
        ...(parsed.categories ?? {})
      }
    };
  } catch {
    return {
      ...DEFAULT_CONFIG,
      tui: { ...DEFAULT_CONFIG.tui },
      categories: { ...DEFAULT_CONFIG.categories }
    };
  }
}
