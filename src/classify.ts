import path from "node:path";

import type { RepoCategory, RepoMeterConfig } from "./types.js";
import { matchAny, normalizePath } from "./utils.js";

const CATEGORY_ORDER: RepoCategory[] = [
  "generated",
  "lockfiles",
  "assets",
  "tests",
  "docs",
  "config",
  "migrations",
  "source"
];

export function classifyFile(relativePath: string, config: RepoMeterConfig): RepoCategory {
  const normalized = normalizePath(relativePath);

  if (matchAny(normalized, config.generated)) {
    return "generated";
  }

  for (const category of CATEGORY_ORDER) {
    const rule = config.categories[category];
    if (!rule?.include?.length) {
      continue;
    }
    if (matchAny(normalized, rule.include)) {
      if (rule.exclude?.length && matchAny(normalized, rule.exclude)) {
        continue;
      }
      return category;
    }
  }

  const base = path.basename(normalized).toLowerCase();
  if (base.includes("lock")) {
    return "lockfiles";
  }

  return "source";
}
