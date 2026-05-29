import fs from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import git from "isomorphic-git";
import ignore from "ignore";

import { classifyFile } from "./classify.js";
import { loadConfig } from "./config.js";
import { TEXT_FILE_EXTENSIONS } from "./defaults.js";
import type { FileRecord, RepoMeterConfig, ScanOptions } from "./types.js";
import { isProbablyTextFile, matchAny, normalizePath } from "./utils.js";

export interface ScanResult {
  root: string;
  mode: "filesystem" | "git";
  config: RepoMeterConfig;
  files: FileRecord[];
  trackedFiles: number;
  untrackedFiles: number;
  since?: string;
}

export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const config = await loadConfig(options.cwd, options.configPath);
  const gitRoot = await detectGitRoot(options.cwd);

  if (gitRoot) {
    return scanGitRepository(gitRoot, config, options.since);
  }

  return scanFilesystem(options.cwd, config);
}

async function detectGitRoot(cwd: string): Promise<string | undefined> {
  let current = path.resolve(cwd);
  for (;;) {
    try {
      const gitStat = await stat(path.join(current, ".git"));
      if (gitStat.isDirectory() || gitStat.isFile()) {
        return current;
      }
    } catch {
      // ignore and continue walking upward
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function scanGitRepository(
  root: string,
  config: RepoMeterConfig,
  since?: string
): Promise<ScanResult> {
  const tracked = await git.listFiles({ fs, dir: root });
  const ignoreFilter = await createIgnoreFilter(root);
  const allFiles = await collectFiles(root, root, config, ignoreFilter);

  const trackedSet = new Set(tracked.map(normalizePath));
  let trackedSelection = tracked.map(normalizePath);

  if (since) {
    try {
      const changedTracked = await diffFilesSinceRef(root, since);
      if (changedTracked.length > 0) {
        trackedSelection = changedTracked.filter((file) => trackedSet.has(file));
      }
    } catch {
      // If statusMatrix fails, keep the full tracked set.
    }
  }

  const untracked = allFiles.filter((file) => !trackedSet.has(file));
  const records = await materializeFiles(root, trackedSelection, untracked, config);
  return {
    root,
    mode: "git",
    config,
    files: records,
    trackedFiles: records.filter((file) => file.tracked).length,
    untrackedFiles: records.filter((file) => !file.tracked).length,
    since
  };
}

async function scanFilesystem(root: string, config: RepoMeterConfig): Promise<ScanResult> {
  const collected = await collectFiles(root, root, config);
  const records = await materializeFiles(root, collected, [], config);
  return {
    root,
    mode: "filesystem",
    config,
    files: records,
    trackedFiles: records.length,
    untrackedFiles: 0
  };
}

async function collectFiles(
  currentDir: string,
  root: string,
  config: RepoMeterConfig,
  ignoreFilter?: ReturnType<typeof ignore>
): Promise<string[]> {
  const output: string[] = [];
  await walk(currentDir, root, config, output, ignoreFilter);
  return output;
}

async function walk(
  currentDir: string,
  root: string,
  config: RepoMeterConfig,
  output: string[],
  ignoreFilter?: ReturnType<typeof ignore>
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(root, absolutePath));

    if (!relativePath || matchAny(relativePath, config.exclude) || ignoreFilter?.ignores(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await walk(absolutePath, root, config, output, ignoreFilter);
      continue;
    }

    output.push(relativePath);
  }
}

async function materializeFiles(
  root: string,
  trackedPaths: string[],
  untrackedPaths: string[],
  config: RepoMeterConfig
): Promise<FileRecord[]> {
  const all = [
    ...trackedPaths.map((file) => ({ file, tracked: true })),
    ...untrackedPaths.map((file) => ({ file, tracked: false }))
  ];
  const deduped = new Map<string, boolean>();

  for (const item of all) {
    const normalized = normalizePath(item.file);
    if (!normalized || matchAny(normalized, config.exclude)) {
      continue;
    }
    if (config.include.length > 0 && !matchAny(normalized, config.include)) {
      continue;
    }
    deduped.set(normalized, item.tracked);
  }

  const records: FileRecord[] = [];
  for (const [relativePath, tracked] of deduped.entries()) {
    const absolutePath = path.resolve(root, relativePath);
    try {
      const fileStat = await stat(absolutePath);
      const extension = path.extname(relativePath).toLowerCase();
      const category = classifyFile(relativePath, config);
      const isText =
        category !== "assets" &&
        (TEXT_FILE_EXTENSIONS.has(extension) || (extension === "" && (await isProbablyTextFile(absolutePath))));

      records.push({
        absolutePath,
        relativePath,
        tracked,
        exists: true,
        extension,
        sizeBytes: fileStat.size,
        modifiedAtMs: fileStat.mtimeMs,
        category,
        isText
      });
    } catch {
      continue;
    }
  }

  return records.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function createIgnoreFilter(root: string) {
  const ig = ignore();
  const gitignorePath = path.join(root, ".gitignore");
  try {
    const contents = await readFile(gitignorePath, "utf8");
    ig.add(contents);
  } catch {
    // No gitignore is fine.
  }
  return ig;
}

async function diffFilesSinceRef(root: string, ref: string): Promise<string[]> {
  const results = await git.walk({
    fs,
    dir: root,
    trees: [git.TREE({ ref }), git.TREE({ ref: "HEAD" })],
    map: async (filepath, [fromEntry, headEntry]) => {
      if (filepath === ".") {
        return undefined;
      }

      const fromType = await fromEntry?.type();
      const headType = await headEntry?.type();
      if (fromType === "tree" || headType === "tree") {
        return undefined;
      }

      const fromOid = await fromEntry?.oid();
      const headOid = await headEntry?.oid();
      if (fromOid !== headOid) {
        return normalizePath(filepath);
      }

      return undefined;
    }
  });

  return results.filter(Boolean) as string[];
}
