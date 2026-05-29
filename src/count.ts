import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { CountStats, CountSummary, CountedFile, FileRecord, LanguageSummary } from "./types.js";
import { addStats, detectLanguageFromPath, emptyLanguageSummary, emptyStats, tryExecFile } from "./utils.js";
import type { ScanResult } from "./scan.js";

interface SccFileStats {
  Location: string;
  Lines: number;
  Code: number;
  Comment: number;
  Blank: number;
  Language: string;
}

interface SccJson {
  languageSummary?: Array<{
    Files?: SccFileStats[];
  }>;
}

export async function countRepository(scan: ScanResult, topOverride?: number): Promise<CountSummary> {
  const sccMap = await collectSccStats(scan.root);
  const countedFiles: CountedFile[] = [];

  for (const file of scan.files) {
    const stats = sccMap.get(file.relativePath) ?? (await fallbackCount(file));
    countedFiles.push({ ...file, stats });
  }

  const totals = emptyStats();
  const tracked = emptyStats();
  const untracked = emptyStats();
  const languages: Record<string, LanguageSummary> = {};
  const categories = {
    source: emptyStats(),
    tests: emptyStats(),
    docs: emptyStats(),
    config: emptyStats(),
    migrations: emptyStats(),
    generated: emptyStats(),
    lockfiles: emptyStats(),
    assets: emptyStats(),
    other: emptyStats()
  };

  for (const file of countedFiles) {
    addStats(totals, file.stats);
    addStats(file.tracked ? tracked : untracked, file.stats);
    addStats(categories[file.category], file.stats);
    const language = file.stats.language || "Unknown";
    languages[language] ??= { ...emptyLanguageSummary(), language };
    addStats(languages[language], file.stats);
    languages[language].files += 1;
  }

  const topLimit = topOverride ?? scan.config.topFiles;
  const topFiles = countedFiles
    .filter((file) => file.isText)
    .sort((a, b) => b.stats.lines - a.stats.lines || a.relativePath.localeCompare(b.relativePath))
    .slice(0, topLimit);

  const health: string[] = [];
  const largeFiles = topFiles.filter((file) => file.stats.lines >= scan.config.largeFileWarning);
  if (largeFiles.length > 0) {
    health.push(`${largeFiles.length} files are at or above ${scan.config.largeFileWarning} lines.`);
  }
  if (categories.source.lines > 0) {
    const ratio = categories.tests.lines / categories.source.lines;
    health.push(`Tests are ${(ratio * 100).toFixed(1)}% of source lines.`);
  }
  if (categories.docs.lines > 0 && categories.source.lines > 0) {
    const ratio = categories.docs.lines / categories.source.lines;
    health.push(`Docs are ${(ratio * 100).toFixed(1)}% of source lines.`);
  }

  return {
    totals,
    tracked,
    untracked,
    categories,
    languages,
    topFiles,
    files: countedFiles,
    health,
    root: scan.root,
    mode: scan.mode,
    git:
      scan.mode === "git"
        ? {
            root: scan.root,
            trackedFiles: scan.trackedFiles,
            untrackedFiles: scan.untrackedFiles,
            since: scan.since
          }
        : undefined
  };
}

async function collectSccStats(root: string): Promise<Map<string, CountStats>> {
  const binary = await resolveSccBinary(root);
  const result = await tryExecFile(binary, ["--by-file", "--format", "json2", root], root);
  if (!result.ok) {
    return new Map();
  }

  const parsed = JSON.parse(result.stdout) as SccJson;
  const map = new Map<string, CountStats>();

  for (const language of parsed.languageSummary ?? []) {
    for (const file of language.Files ?? []) {
      map.set(file.Location.replace(/\\/g, "/"), {
        lines: file.Lines,
        code: file.Code,
        comments: file.Comment,
        blanks: file.Blank,
        language: file.Language
      });
    }
  }

  return map;
}

async function fallbackCount(file: FileRecord): Promise<CountStats> {
  if (!file.isText) {
    return {
      lines: 0,
      code: 0,
      comments: 0,
      blanks: 0,
      language: "Binary"
    };
  }

  const raw = await readFile(file.absolutePath, "utf8");
  const lines = raw.length === 0 ? [] : raw.split(/\r?\n/);
  let blanks = 0;
  let code = 0;
  for (const line of lines) {
    if (line.trim().length === 0) {
      blanks += 1;
    } else {
      code += 1;
    }
  }
  return {
    lines: lines.length,
    code,
    comments: 0,
    blanks,
    language: detectLanguageFromPath(file.relativePath)
  };
}

async function resolveSccBinary(root: string): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(root, "vendor", "scc", "scc.exe"),
    path.resolve(moduleDir, "..", "vendor", "scc", "scc.exe"),
    path.resolve(process.cwd(), "vendor", "scc", "scc.exe"),
    "scc"
  ];

  for (const candidate of candidates) {
    if (candidate === "scc") {
      return candidate;
    }
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return "scc";
}
