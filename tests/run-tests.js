import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";

import { compareWithBaseline } from "../dist/baseline.js";
import { listBaselines, loadBaseline, saveBaseline } from "../dist/baseline.js";
import { classifyFile } from "../dist/classify.js";
import { loadConfig } from "../dist/config.js";
import { countRepository } from "../dist/count.js";
import {
  collectManyRepoSnapshots,
  collectRemoteStatus,
  parseRepoInputText,
  parseNativeGitStatusOutput,
  resolveTuiRuntimeOptions
} from "../dist/live.js";
import { renderReport } from "../dist/report.js";
import { scanRepository } from "../dist/scan.js";
import { renderTuiFrame } from "../dist/tui.js";

const tempDirs = [];
const fixtureRoot = path.join(os.tmpdir(), "repo-meter-tests");

async function main() {
  try {
    await run("classifies common repo file types", async () => {
      const cwd = await createTempDir();
      const config = await loadConfig(cwd);

      assert.equal(classifyFile("src/index.ts", config), "source");
      assert.equal(classifyFile("tests/app.test.ts", config), "tests");
      assert.equal(classifyFile("docs/guide.md", config), "docs");
      assert.equal(classifyFile("db/migrations/001_init.sql", config), "migrations");
      assert.equal(classifyFile("package-lock.json", config), "lockfiles");
      assert.deepEqual(config.repos, []);
      assert.equal(config.tui.intervalMs, 2000);
    });

    await run("produces a filesystem summary with category breakdowns", async () => {
      const cwd = await createFixtureRepo({ git: false });
      const scan = await scanRepository({ cwd });
      const summary = await countRepository(scan, 3);

      assert.equal(summary.mode, "filesystem");
      assert.ok(summary.totals.lines > 0);
      assert.ok(summary.categories.source.lines > 0);
      assert.ok(summary.categories.tests.lines > 0);
      assert.ok(summary.categories.docs.lines > 0);
      assert.ok(summary.topFiles.length > 0);
    });

    await run("renders diffs against a baseline", async () => {
      const cwd = await createFixtureRepo({ git: false });
      const scan = await scanRepository({ cwd });
      const summary = await countRepository(scan, 5);

      const baseline = {
        createdAt: new Date().toISOString(),
        name: "default",
        root: cwd,
        mode: summary.mode,
        totals: { ...summary.totals, lines: summary.totals.lines - 5, code: summary.totals.code - 5 },
        tracked: { ...summary.tracked, lines: summary.tracked.lines - 5, code: summary.tracked.code - 5 },
        untracked: summary.untracked,
        categories: {
          ...summary.categories,
          source: {
            ...summary.categories.source,
            lines: summary.categories.source.lines - 5,
            code: summary.categories.source.code - 5
          }
        },
        topFiles: summary.topFiles.map((file) => ({
          path: file.relativePath,
          lines: Math.max(0, file.stats.lines - 2),
          category: file.category
        }))
      };

      const diff = compareWithBaseline(summary, baseline);
      const rendered = renderReport(summary, { format: "text", includeDiff: diff });

      assert.equal(diff.totals.lines, 5);
      assert.match(rendered, /Diff vs baseline:default/);
    });

    await run("persists and lists baselines", async () => {
      const cwd = await createFixtureRepo({ git: false });
      const scan = await scanRepository({ cwd });
      const summary = await countRepository(scan, 5);
      const target = await saveBaseline(summary, ".repo-meter/baselines", "smoke");
      const loaded = await loadBaseline(cwd, ".repo-meter/baselines", "smoke");
      const baselines = await listBaselines(cwd, ".repo-meter/baselines");

      assert.match(target, /smoke\.json$/);
      assert.equal(loaded.name, "smoke");
      assert.ok(baselines.some((baseline) => baseline.name === "smoke"));
    });

    await run("renders dashboard and language summaries", async () => {
      const cwd = await createFixtureRepo({ git: false });
      const scan = await scanRepository({ cwd });
      const summary = await countRepository(scan, 5);
      const rendered = renderReport(summary, { format: "dashboard" });

      assert.match(rendered, /REPO METER DASHBOARD/);
      assert.ok(Object.keys(summary.languages).length > 0);
      assert.ok(summary.languages.TypeScript || summary.languages.Markdown);
    });

    await run("scans tracked and untracked files in git mode without subprocesses", async () => {
      const cwd = await createFixtureRepo({ git: true });
      const scan = await scanRepository({ cwd });
      const summary = await countRepository(scan, 5);

      assert.equal(summary.mode, "git");
      assert.ok(summary.tracked.lines > 0);
      assert.ok(summary.untracked.lines > 0);
      assert.ok(summary.git.trackedFiles > 0);
      assert.ok(summary.git.untrackedFiles > 0);
    });

    await run("supports since-ref scanning in git mode", async () => {
      const cwd = await createFixtureRepo({ git: true });
      await writeFile(path.join(cwd, "src", "index.ts"), "export const changed = true;\n", "utf8");
      await git.add({ fs, dir: cwd, filepath: "src/index.ts" });
      await git.commit({
        fs,
        dir: cwd,
        author: { name: "Repo Meter", email: "repo-meter@example.com" },
        message: "change source"
      });
      const log = await git.log({ fs, dir: cwd, depth: 2 });
      const previousRef = log[1].oid;

      const scan = await scanRepository({ cwd, since: previousRef });
      const summary = await countRepository(scan, 10);
      assert.equal(summary.mode, "git");
      assert.ok(summary.git.since);
      assert.ok(summary.files.some((file) => file.relativePath === "src/index.ts"));
    });

    await run("scans only the requested subdirectory inside a git repo", async () => {
      const cwd = await createTempDir();
      await mkdir(path.join(cwd, "apps", "brand"), { recursive: true });
      await mkdir(path.join(cwd, "apps", "admin"), { recursive: true });
      await writeFile(path.join(cwd, "apps", "brand", "page.ts"), "export const brand = true;\n", "utf8");
      await writeFile(path.join(cwd, "apps", "admin", "page.ts"), "export const admin = true;\n", "utf8");
      await git.init({ fs, dir: cwd, defaultBranch: "main" });
      await git.add({ fs, dir: cwd, filepath: "apps/brand/page.ts" });
      await git.add({ fs, dir: cwd, filepath: "apps/admin/page.ts" });
      await git.commit({
        fs,
        dir: cwd,
        author: { name: "Repo Meter", email: "repo-meter@example.com" },
        message: "monolith apps"
      });

      const scope = path.join(cwd, "apps", "brand");
      const scan = await scanRepository({ cwd: scope });
      const summary = await countRepository(scan, 10);

      assert.equal(summary.root, scope);
      assert.equal(summary.git?.root, cwd);
      assert.ok(summary.files.every((file) => !file.relativePath.includes("admin")));
      assert.ok(summary.files.some((file) => file.relativePath === "page.ts"));
      assert.equal(summary.tracked.lines, summary.totals.lines);
    });

    await run("resolves tui repo targets from args and config", async () => {
      const cwd = await createFixtureRepo({ git: false });
      await writeFile(
        path.join(cwd, "repo-meter.config.json"),
        JSON.stringify({ repos: ["./src", "./tests"], tui: { intervalMs: 1234, remote: true } }, null, 2),
        "utf8"
      );

      const fromConfig = await resolveTuiRuntimeOptions({ cwd });
      assert.equal(fromConfig.repoPaths.length, 2);
      assert.equal(fromConfig.intervalMs, 1234);
      assert.equal(fromConfig.remote, true);

      const fromArgs = await resolveTuiRuntimeOptions({
        cwd,
        pathArgs: ["./docs"],
        interval: 999,
        remote: false
      });
      assert.equal(fromArgs.repoPaths.length, 1);
      assert.ok(fromArgs.repoPaths[0].endsWith(path.join("docs")));
      assert.equal(fromArgs.intervalMs, 999);
      assert.equal(fromArgs.remote, false);
    });

    await run("recovers quoted multi-repo inputs for tui launch", async () => {
      const cwd = await createTempDir();
      const pathA = path.join(cwd, "repo a");
      const pathB = path.join(cwd, "repo b");

      const fromPositionalBlob = await resolveTuiRuntimeOptions({
        cwd,
        pathArgs: [`"${pathA}" "${pathB}"`]
      });
      assert.deepEqual(fromPositionalBlob.repoPaths, [path.normalize(pathA), path.normalize(pathB)]);

      const fromReposFlag = await resolveTuiRuntimeOptions({
        cwd,
        reposFlag: `"${pathA}","${pathB}"`
      });
      assert.deepEqual(fromReposFlag.repoPaths, [path.normalize(pathA), path.normalize(pathB)]);
    });

    await run("parses multi-repo text pasted into the tui add prompt", async () => {
      const cwd = await createTempDir();
      const pathA = path.join(cwd, "repo a");
      const pathB = path.join(cwd, "repo b");
      const pathC = path.join(cwd, "repo c");

      assert.deepEqual(parseRepoInputText(`"${pathA}" "${pathB}" "${pathC}"`), [pathA, pathB, pathC]);
      assert.deepEqual(parseRepoInputText(`repo-meter tui "${pathA}" "${pathB}"`), [pathA, pathB]);
      assert.deepEqual(parseRepoInputText(`--repos "${pathA},${pathB}"`), [pathA, pathB]);
    });

    await run("updates lastUpdated timestamps when repo data changes", async () => {
      const cwd = await createFixtureRepo({ git: false });
      const runtime = await resolveTuiRuntimeOptions({ cwd, pathArgs: [cwd] });
      const first = await collectManyRepoSnapshots(runtime);
      const initialTimestamp = first[0].lastUpdatedAt;
      await writeFile(path.join(cwd, "src", "index.ts"), "export function add(a, b) {\n  return a + b + 1;\n}\n", "utf8");
      const second = await collectManyRepoSnapshots(runtime, first);
      assert.notEqual(second[0].lastUpdatedAt, initialTimestamp);
    });

    await run("reports clean remote status when no remote exists", async () => {
      const cwd = await createFixtureRepo({ git: true });
      const status = await collectRemoteStatus(cwd, true, true);
      assert.equal(status.mode, "no_remote");
    });

    await run("ignores non-porcelain git warning lines in native status parsing", async () => {
      const parsed = parseNativeGitStatusOutput(
        [
          "## main...origin/main",
          "warning: in the working copy of 'README.md', LF will be replaced by CRLF the next time Git touches it",
          "warning: in the working copy of 'docs/guide.md', LF will be replaced by CRLF the next time Git touches it"
        ].join("\n")
      );

      assert.equal(parsed.branch, "main");
      assert.equal(parsed.modified, 0);
      assert.equal(parsed.deleted, 0);
      assert.equal(parsed.staged, 0);
      assert.equal(parsed.untracked, 0);
    });

    await run("renders a tui frame with logo and repo details", async () => {
      const repoA = await createFixtureRepo({ git: false });
      const repoB = await createFixtureRepo({ git: false });
      const runtime = await resolveTuiRuntimeOptions({ cwd: repoA, pathArgs: [repoA, repoB], remote: false });
      const snapshots = await collectManyRepoSnapshots(runtime);
      const frame = renderTuiFrame(
        {
          repos: snapshots,
          selectedRepoIndex: 0,
          selectedRepoPath: snapshots[0].repoPath,
          focusedPanel: "repos",
          detailScroll: 0,
          intervalMs: runtime.intervalMs,
          remoteEnabled: runtime.remote,
          showRemoteDetails: runtime.remote,
          showHelp: false,
          statusMessage: "ok",
          sortMode: "activity",
          filterMode: "all",
          favoriteRepoPaths: []
        },
        120,
        40
      );

      assert.match(frame, /v\d+\.\d+\.\d+/);
      assert.match(frame, /Realtime: local only/);
      assert.match(frame, /Sort: activity/);
      assert.match(frame, /Status Card/);
      assert.match(frame, /updated/);
      assert.match(frame, /clean|dirty/);
    });

    await run("renders help overlay and compact layout for the tui", async () => {
      const repoA = await createFixtureRepo({ git: false });
      const runtime = await resolveTuiRuntimeOptions({ cwd: repoA, pathArgs: [repoA], remote: true });
      const snapshots = await collectManyRepoSnapshots(runtime);
      const helpFrame = renderTuiFrame(
        {
          repos: snapshots,
          selectedRepoIndex: 0,
          selectedRepoPath: snapshots[0].repoPath,
          focusedPanel: "repos",
          detailScroll: 0,
          intervalMs: runtime.intervalMs,
          remoteEnabled: runtime.remote,
          showRemoteDetails: runtime.remote,
          showHelp: true,
          statusMessage: "help",
          sortMode: "activity",
          filterMode: "all",
          favoriteRepoPaths: []
        },
        90,
        30
      );
      const compactFrame = renderTuiFrame(
        {
          repos: snapshots,
          selectedRepoIndex: 0,
          selectedRepoPath: snapshots[0].repoPath,
          focusedPanel: "detail",
          detailScroll: 0,
          intervalMs: runtime.intervalMs,
          remoteEnabled: runtime.remote,
          showRemoteDetails: false,
          showHelp: false,
          statusMessage: "compact",
          sortMode: "dirty",
          filterMode: "all",
          favoriteRepoPaths: [repoA]
        },
        90,
        30
      );

      assert.match(helpFrame, /Help/);
      assert.match(helpFrame, /Press \? again to return/);
      assert.match(helpFrame, /a: add another repo to this TUI session/);
      assert.match(helpFrame, /d: remove the selected repo from this TUI session/);
      assert.match(helpFrame, /s: cycle sort mode/);
      assert.match(compactFrame, /remote not_git/);
      assert.match(compactFrame, /tracked/);
    });

    console.log("\nAll tests passed.");
  } finally {
    await cleanup();
  }
}

async function run(name, fn) {
  await fn();
  console.log(`PASS ${name}`);
}

async function createTempDir() {
  await mkdir(fixtureRoot, { recursive: true });
  const dir = await mkdtemp(path.join(fixtureRoot, "repo-meter-"));
  tempDirs.push(dir);
  return dir;
}

async function createFixtureRepo(options) {
  const cwd = await createTempDir();
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await mkdir(path.join(cwd, "tests"), { recursive: true });
  await mkdir(path.join(cwd, "docs"), { recursive: true });
  await mkdir(path.join(cwd, "db", "migrations"), { recursive: true });
  await mkdir(path.join(cwd, "node_modules", "left-pad"), { recursive: true });

  await writeFile(
    path.join(cwd, "src", "index.ts"),
    "export function add(a, b) {\n  return a + b;\n}\n",
    "utf8"
  );
  await writeFile(
    path.join(cwd, "tests", "index.test.ts"),
    "test('add', () => {\n  if (1 + 2 !== 3) throw new Error('bad');\n});\n",
    "utf8"
  );
  await writeFile(path.join(cwd, "docs", "guide.md"), "# Guide\n\nSome docs.\n", "utf8");
  await writeFile(path.join(cwd, "db", "migrations", "001_init.sql"), "create table demo();\n", "utf8");
  await writeFile(path.join(cwd, "package-lock.json"), "{\n  \"lockfileVersion\": 3\n}\n", "utf8");
  await writeFile(path.join(cwd, "node_modules", "left-pad", "index.js"), "module.exports = {};\n", "utf8");
  await writeFile(path.join(cwd, ".gitignore"), "ignored.txt\nnode_modules/\n", "utf8");
  await writeFile(path.join(cwd, "ignored.txt"), "should not count\n", "utf8");

  if (options.git) {
    await git.init({ fs, dir: cwd, defaultBranch: "main" });
    await git.add({ fs, dir: cwd, filepath: "src/index.ts" });
    await git.add({ fs, dir: cwd, filepath: "tests/index.test.ts" });
    await git.add({ fs, dir: cwd, filepath: "docs/guide.md" });
    await git.add({ fs, dir: cwd, filepath: "db/migrations/001_init.sql" });
    await git.add({ fs, dir: cwd, filepath: "package-lock.json" });
    await git.add({ fs, dir: cwd, filepath: ".gitignore" });
    await git.commit({
      fs,
      dir: cwd,
      author: { name: "Repo Meter", email: "repo-meter@example.com" },
      message: "initial commit"
    });

    await writeFile(path.join(cwd, "scratch.ts"), "export const localOnly = true;\n", "utf8");
  }
  return cwd;
}

async function cleanup() {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch {
        continue;
      }
    }
  }
}

main().catch(async (error) => {
  console.error(error);
  await cleanup();
  process.exitCode = 1;
});
