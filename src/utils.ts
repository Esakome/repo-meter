import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { LANGUAGE_BY_EXTENSION } from "./defaults.js";
import { minimatch } from "minimatch";

const execFileAsync = promisify(execFile);

export async function tryExecFile(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; ok: boolean }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20
    });
    return { stdout: result.stdout, stderr: result.stderr, ok: true };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
      ok: false
    };
  }
}

export function normalizePath(input: string): string {
  return input.replace(/\\/g, "/");
}

export function matchAny(target: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(target, pattern, { dot: true, nocase: true }));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function resolveFrom(root: string, relativePath: string): string {
  return path.resolve(root, relativePath);
}

export function detectLanguageFromPath(relativePath: string): string {
  const normalized = normalizePath(relativePath).toLowerCase();
  const extension = path.extname(normalized).toLowerCase();

  if (normalized.endsWith(".d.ts")) {
    return "TypeScript Typings";
  }
  if (normalized.endsWith("package.json")) {
    return "JSON";
  }
  if (normalized.endsWith(".gitignore") || normalized.endsWith(".npmignore")) {
    return "Ignore";
  }

  return LANGUAGE_BY_EXTENSION[extension] ?? "Text";
}

export async function isProbablyTextFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await readFile(filePath);
    const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
    for (const byte of sample) {
      if (byte === 0) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function emptyStats() {
  return {
    lines: 0,
    code: 0,
    comments: 0,
    blanks: 0,
    language: "Mixed"
  };
}

export function emptyLanguageSummary() {
  return {
    lines: 0,
    code: 0,
    comments: 0,
    blanks: 0,
    language: "Mixed",
    files: 0
  };
}

export function addStats<T extends { lines: number; code: number; comments: number; blanks: number }>(
  base: T,
  extra: { lines: number; code: number; comments: number; blanks: number }
): T {
  base.lines += extra.lines;
  base.code += extra.code;
  base.comments += extra.comments;
  base.blanks += extra.blanks;
  return base;
}

export function diffStats(
  current: { lines: number; code: number; comments: number; blanks: number },
  previous: { lines: number; code: number; comments: number; blanks: number }
) {
  return {
    lines: current.lines - previous.lines,
    code: current.code - previous.code,
    comments: current.comments - previous.comments,
    blanks: current.blanks - previous.blanks,
    language: "Diff"
  };
}
