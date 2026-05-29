import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BaselineInfo,
  BaselineSnapshot,
  CountSummary,
  DiffSummary,
  RepoCategory
} from "./types.js";
import { diffStats } from "./utils.js";

export async function saveBaseline(
  summary: CountSummary,
  baselineDir: string,
  name = "default"
): Promise<string> {
  const resolvedDir = path.resolve(summary.root, baselineDir);
  await mkdir(resolvedDir, { recursive: true });
  const outputPath = path.join(resolvedDir, `${name}.json`);
  const payload: BaselineSnapshot = {
    createdAt: new Date().toISOString(),
    name,
    root: summary.root,
    mode: summary.mode,
    totals: summary.totals,
    tracked: summary.tracked,
    untracked: summary.untracked,
    categories: summary.categories,
    languages: summary.languages,
    topFiles: summary.topFiles.map((file) => ({
      path: file.relativePath,
      lines: file.stats.lines,
      category: file.category,
      language: file.stats.language
    }))
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

export async function loadBaseline(root: string, baselineDir: string, name = "default") {
  const baselinePath = path.resolve(root, baselineDir, `${name}.json`);
  const raw = await readFile(baselinePath, "utf8");
  return JSON.parse(raw) as BaselineSnapshot;
}

export function compareWithBaseline(
  summary: CountSummary,
  baseline: BaselineSnapshot,
  label = `baseline:${baseline.name}`
): DiffSummary {
  const categories = {} as Record<RepoCategory, ReturnType<typeof diffStats>>;
  const languages = {} as Record<string, ReturnType<typeof diffStats>>;
  for (const [category, current] of Object.entries(summary.categories) as Array<
    [RepoCategory, CountSummary["categories"][RepoCategory]]
  >) {
    categories[category] = diffStats(current, baseline.categories[category]);
  }
  const languageNames = new Set([...Object.keys(summary.languages), ...Object.keys(baseline.languages ?? {})]);
  for (const language of languageNames) {
    languages[language] = diffStats(
      summary.languages[language] ?? { lines: 0, code: 0, comments: 0, blanks: 0 },
      baseline.languages?.[language] ?? { lines: 0, code: 0, comments: 0, blanks: 0 }
    );
  }

  const previousTop = new Map(baseline.topFiles.map((file) => [file.path, file.lines]));
  const topFilesChanged = summary.topFiles.map((file) => ({
    path: file.relativePath,
    currentLines: file.stats.lines,
    previousLines: previousTop.get(file.relativePath) ?? 0,
    delta: file.stats.lines - (previousTop.get(file.relativePath) ?? 0)
  }));

  return {
    label,
    totals: diffStats(summary.totals, baseline.totals),
    tracked: diffStats(summary.tracked, baseline.tracked),
    untracked: diffStats(summary.untracked, baseline.untracked),
    categories,
    languages,
    topFilesChanged
  };
}

export async function listBaselines(root: string, baselineDir: string): Promise<BaselineInfo[]> {
  const resolvedDir = path.resolve(root, baselineDir);
  try {
    const entries = await readdir(resolvedDir, { withFileTypes: true });
    const baselines: BaselineInfo[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        continue;
      }
      const baselinePath = path.join(resolvedDir, entry.name);
      const raw = await readFile(baselinePath, "utf8");
      const parsed = JSON.parse(raw) as BaselineSnapshot;
      baselines.push({
        name: parsed.name,
        path: baselinePath,
        createdAt: parsed.createdAt
      });
    }
    return baselines.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return [];
  }
}
