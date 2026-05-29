import path from "node:path";
import readline from "node:readline";

import { collectManyRepoSnapshots } from "./live.js";
import type { RepoLiveSnapshot, TuiRuntimeOptions, TuiState } from "./types.js";
import { formatNumber } from "./utils.js";
import { REPO_METER_VERSION } from "./version.js";

const LOGO = [
  "██████╗ ███████╗██████╗  ██████╗       ███╗   ███╗███████╗████████╗███████╗██████╗",
  "██╔══██╗██╔════╝██╔══██╗██╔═══██╗      ████╗ ████║██╔════╝╚══██╔══╝██╔════╝██╔══██╗",
  "██████╔╝█████╗  ██████╔╝██║   ██║█████╗██╔████╔██║█████╗     ██║   █████╗  ██████╔╝",
  "██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║╚════╝██║╚██╔╝██║██╔══╝     ██║   ██╔══╝  ██╔══██╗",
  "██║  ██║███████╗██║     ╚██████╔╝      ██║ ╚═╝ ██║███████╗   ██║   ███████╗██║  ██║",
  "╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝       ╚═╝     ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝"
];

const SORT_MODES: TuiState["sortMode"][] = ["activity", "size", "dirty"];
const FILTER_MODES: TuiState["filterMode"][] = ["all", "dirty", "active", "favorites"];
const INTERACTION_GRACE_MS = 2500;

export async function runTui(runtime: TuiRuntimeOptions) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("TUI mode requires an interactive terminal (TTY).");
  }

  const initialRepos = await collectManyRepoSnapshots(runtime);
  const initialSelected = initialRepos[0]?.repoPath;
  const state: TuiState = {
    repos: initialRepos,
    selectedRepoIndex: 0,
    selectedRepoPath: initialSelected,
    focusedPanel: "repos",
    detailScroll: 0,
    intervalMs: runtime.intervalMs,
    remoteEnabled: runtime.remote,
    showRemoteDetails: runtime.remote,
    showHelp: false,
    statusMessage: "Live local refresh enabled",
    sortMode: "activity",
    filterMode: "all",
    favoriteRepoPaths: []
  };

  let refreshInFlight = false;
  let interactionPaused = false;
  let lastInteractionAt = 0;
  let interval: NodeJS.Timeout | undefined;
  let settled = false;
  let resolveDone: (() => void) | undefined;

  function markInteraction() {
    lastInteractionAt = Date.now();
  }

  function startInterval() {
    if (!interval) {
      interval = setInterval(() => {
        if (!interactionPaused && Date.now() - lastInteractionAt >= INTERACTION_GRACE_MS) {
          void refreshState("Auto refresh");
        }
      }, runtime.intervalMs);
    }
  }

  function stopInterval() {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
  }

  function render() {
    if (interactionPaused) {
      return;
    }
    process.stdout.write("\u001bc");
    process.stdout.write(renderTuiFrame(state, process.stdout.columns ?? 120, process.stdout.rows ?? 40));
  }

  function restoreRawInput() {
    interactionPaused = false;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", onData);
    process.stdout.write("\u001b[?25l");
    markInteraction();
    startInterval();
  }

  async function promptForRepoPath(label: string): Promise<string | undefined> {
    interactionPaused = true;
    stopInterval();
    process.stdin.removeListener("data", onData);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdout.write("\u001b[?25h");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      const answer = await new Promise<string>((resolve) => {
        rl.question(`${label}: `, resolve);
      });
      return answer.trim() || undefined;
    } finally {
      rl.close();
      restoreRawInput();
    }
  }

  async function refreshState(reason: string) {
    if (refreshInFlight || interactionPaused) {
      return;
    }
    refreshInFlight = true;
    try {
      state.repos = await collectManyRepoSnapshots(runtime, state.repos);
      preserveSelection(state, state.selectedRepoPath);
      state.statusMessage = `${reason}: ${selectedRepo(state)?.lastUpdatedAt ?? "No repo selected"}`;
    } catch (error) {
      state.statusMessage = error instanceof Error ? error.message : "Refresh failed";
    } finally {
      refreshInFlight = false;
      render();
    }
  }

  async function addRepoPrompt() {
    try {
      const input = await promptForRepoPath("Add repo path");
      if (!input) {
        state.statusMessage = "Add repo cancelled";
        render();
        return;
      }

      const repoPath = path.resolve(process.cwd(), input);
      if (runtime.repoPaths.includes(repoPath)) {
        state.statusMessage = `Already watching ${repoPath}`;
        render();
        return;
      }

      const previousPaths = [...runtime.repoPaths];
      runtime.repoPaths = [...runtime.repoPaths, repoPath];
      state.statusMessage = `Adding ${repoPath}`;
      try {
        state.repos = await collectManyRepoSnapshots(runtime, state.repos);
      } catch (error) {
        runtime.repoPaths = previousPaths;
        preserveSelection(state, state.selectedRepoPath);
        throw error;
      }
      preserveSelection(state, repoPath);
      state.statusMessage = `Added ${selectedRepo(state)?.repoName ?? repoPath}`;
    } catch (error) {
      state.statusMessage = error instanceof Error ? error.message : "Unable to add repo";
    } finally {
      render();
    }
  }

  function removeSelectedRepo() {
    const repo = selectedRepo(state);
    if (!repo) {
      state.statusMessage = "No repo selected";
      render();
      return;
    }

    markInteraction();
    runtime.repoPaths = runtime.repoPaths.filter((entry) => entry !== repo.repoPath);
    state.repos = state.repos.filter((entry) => entry.repoPath !== repo.repoPath);
    state.favoriteRepoPaths = state.favoriteRepoPaths.filter((entry) => entry !== repo.repoPath);
    state.selectedRepoPath = visibleRepos(state)[0]?.repoPath;
    preserveSelection(state, state.selectedRepoPath);
    state.statusMessage = `Removed ${repo.repoName}`;
    render();
  }

  function moveSelection(delta: number) {
    markInteraction();
    if (state.focusedPanel === "repos") {
      const repos = visibleRepos(state);
      if (repos.length === 0) {
        state.statusMessage = "No repos match the current filter";
        render();
        return;
      }
      const nextIndex = Math.max(0, Math.min(repos.length - 1, state.selectedRepoIndex + delta));
      state.selectedRepoIndex = nextIndex;
      state.selectedRepoPath = repos[nextIndex]!.repoPath;
      state.statusMessage = `Selected ${repos[nextIndex]!.repoName}`;
    } else {
      state.detailScroll = Math.max(0, state.detailScroll + delta);
      state.statusMessage = `Scrolled detail to ${state.detailScroll}`;
    }
    render();
  }

  function cycleSortMode() {
    markInteraction();
    const currentIndex = SORT_MODES.indexOf(state.sortMode);
    state.sortMode = SORT_MODES[(currentIndex + 1) % SORT_MODES.length]!;
    preserveSelection(state, state.selectedRepoPath);
    state.statusMessage = `Sort: ${state.sortMode}`;
    render();
  }

  function cycleFilterMode() {
    markInteraction();
    const currentIndex = FILTER_MODES.indexOf(state.filterMode);
    state.filterMode = FILTER_MODES[(currentIndex + 1) % FILTER_MODES.length]!;
    preserveSelection(state, state.selectedRepoPath);
    state.statusMessage = `Filter: ${state.filterMode}`;
    render();
  }

  function toggleFavorite() {
    const repo = selectedRepo(state);
    if (!repo) {
      return;
    }
    markInteraction();
    if (state.favoriteRepoPaths.includes(repo.repoPath)) {
      state.favoriteRepoPaths = state.favoriteRepoPaths.filter((entry) => entry !== repo.repoPath);
      state.statusMessage = `Unpinned ${repo.repoName}`;
    } else {
      state.favoriteRepoPaths = [...state.favoriteRepoPaths, repo.repoPath];
      state.statusMessage = `Pinned ${repo.repoName}`;
    }
    preserveSelection(state, repo.repoPath);
    render();
  }

  function cleanup() {
    if (settled) {
      return;
    }
    settled = true;
    stopInterval();
    process.stdin.removeListener("data", onData);
    process.off("SIGINT", cleanup);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    process.stdout.write("\u001b[?25h");
    process.stdout.write("\u001b[0m\n");
    resolveDone?.();
  }

  const onData = (buffer: Buffer) => {
    const key = buffer.toString("utf8");
    if (key === "\u0003" || key === "q") {
      cleanup();
      return;
    }
    if (key === "\t") {
      markInteraction();
      state.focusedPanel = state.focusedPanel === "repos" ? "detail" : "repos";
      state.statusMessage = `Focus: ${state.focusedPanel}`;
      render();
      return;
    }
    if (key === "?" || key === "h") {
      markInteraction();
      state.showHelp = !state.showHelp;
      state.statusMessage = state.showHelp ? "Help opened" : "Help closed";
      render();
      return;
    }
    if (key === "r") {
      markInteraction();
      void refreshState("Manual refresh");
      return;
    }
    if (key === "u") {
      markInteraction();
      void refreshState("Upstream check");
      return;
    }
    if (key === "a") {
      void addRepoPrompt();
      return;
    }
    if (key === "d") {
      removeSelectedRepo();
      return;
    }
    if (key === "s") {
      cycleSortMode();
      return;
    }
    if (key === "x") {
      cycleFilterMode();
      return;
    }
    if (key === "p") {
      toggleFavorite();
      return;
    }
    if (key === "g" && state.remoteEnabled) {
      markInteraction();
      state.showRemoteDetails = !state.showRemoteDetails;
      state.statusMessage = state.showRemoteDetails ? "Remote details shown" : "Remote details hidden";
      render();
      return;
    }
    if (key === "\u001b[A" || key === "k") {
      moveSelection(-1);
      return;
    }
    if (key === "\u001b[B" || key === "j") {
      moveSelection(1);
    }
  };

  process.stdout.write("\u001b[?25l");
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  startInterval();
  render();
  process.on("SIGINT", cleanup);

  await new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
}

export function renderTuiFrame(state: TuiState, width: number, height: number): string {
  if (state.showHelp) {
    return `${renderHelpFrame(state, width)}\n`;
  }

  const compact = width < 110;
  const leftWidth = compact ? width : Math.max(34, Math.floor(width * 0.36));
  const rightWidth = compact ? width : Math.max(42, width - leftWidth - 3);
  const lines: string[] = [];
  const repos = visibleRepos(state);
  const repo = selectedRepo(state);

  lines.push(...renderLogoWithVersion());
  lines.push(
    `Realtime: ${state.remoteEnabled ? "local + remote status" : "local only"}  Interval: ${state.intervalMs}ms  Visible: ${repos.length}/${state.repos.length}  Sort: ${state.sortMode}  Filter: ${state.filterMode}`
  );
  if (repo) {
    lines.push("Repo state hint: clean means no local Git changes, dirty means local changes are present.");
  }
  lines.push("=".repeat(width));

  const repoLines = renderRepoList(state, leftWidth);
  const detailLines = renderDetailPane(state, rightWidth, Math.max(height - lines.length - 2, repoLines.length));
  if (compact) {
    lines.push(...repoLines);
    lines.push("-".repeat(width));
    lines.push(...detailLines);
  } else {
    const bodyHeight = Math.max(repoLines.length, detailLines.length);
    for (let index = 0; index < bodyHeight; index += 1) {
      const left = repoLines[index] ?? "".padEnd(leftWidth);
      const right = detailLines[index] ?? "";
      lines.push(`${left.padEnd(leftWidth)} │ ${right}`);
    }
  }

  lines.push("-".repeat(width));
  lines.push(renderFooter(state, width));
  return `${lines.join("\n")}\n`;
}

function renderRepoList(state: TuiState, width: number): string[] {
  const repos = visibleRepos(state);
  const lines: string[] = [];
  const title = state.focusedPanel === "repos" ? "[Repos]" : " Repos ";
  lines.push(title.padEnd(width));
  lines.push("-".repeat(width));

  if (repos.length === 0) {
    lines.push("No repos match the current filter.".padEnd(width));
    lines.push("Try pressing x to change filters.".padEnd(width));
    return lines;
  }

  for (let index = 0; index < repos.length; index += 1) {
    const repo = repos[index]!;
    const prefix = repo.repoPath === state.selectedRepoPath ? ">" : " ";
    const pin = state.favoriteRepoPaths.includes(repo.repoPath) ? "*" : " ";
    const cleanliness = repo.localGit.clean ? "clean" : "dirty";
    const delta = repo.deltaLines === 0 ? "0" : repo.deltaLines > 0 ? `+${repo.deltaLines}` : `${repo.deltaLines}`;
    lines.push(`${prefix}${pin} ${truncate(`${repo.repoName} ${formatNumber(repo.summary.totals.lines)}l ${cleanliness}`, width - 3)}`);
    lines.push(`   delta ${delta}  updated ${relativeTime(repo.lastUpdatedAt)}`.slice(0, width));
    lines.push(`   ${remoteBadge(repo)}  branch ${repo.localGit.branch ?? "n/a"}`.slice(0, width));
    lines.push("");
  }

  return lines;
}

function renderDetailPane(state: TuiState, width: number, maxHeight: number): string[] {
  const repo = selectedRepo(state);
  const header = state.focusedPanel === "detail" ? "[Details]" : " Details ";
  const lines: string[] = [header, "-".repeat(width)];

  if (!repo) {
    lines.push("No repo selected.");
    return lines;
  }

  lines.push(`Repo: ${repo.repoName}`);
  lines.push(`Path: ${repo.repoPath}`);
  lines.push(`Working Tree: ${formatNumber(repo.summary.totals.lines)} lines`);
  lines.push(`Tracked: ${formatNumber(repo.summary.tracked.lines)}  Untracked: ${formatNumber(repo.summary.untracked.lines)}`);
  lines.push(`Session Delta: ${signed(repo.deltaLines)} lines`);
  lines.push("");
  lines.push("Status Card");
  lines.push(`- Last scan refresh: ${repo.lastUpdatedAt}`);
  lines.push(`- Last file change: ${repo.lastFileChangeAt ?? "Unknown"}`);
  lines.push(`- Last local commit: ${repo.localGit.lastCommitAt ?? "Unknown"}`);
  lines.push(`- Local git: ${formatLocalGit(repo)}`);
  lines.push(`- Repo state: ${repo.localGit.clean ? "Clean" : "Dirty"} (${dirtyExplanation(repo)})`);

  if (state.showRemoteDetails || !state.remoteEnabled) {
    lines.push("Remote Card");
    lines.push(`- Mode: ${repo.remote.mode}`);
    lines.push(`- Message: ${repo.remote.message}`);
    lines.push(`- Branch: ${repo.remote.remoteName ?? "remote"}/${repo.remote.branch ?? "n/a"}`);
    if (repo.remote.aheadCount !== undefined || repo.remote.behindCount !== undefined) {
      lines.push(`- Ahead/Behind: ${repo.remote.aheadCount ?? "?"}/${repo.remote.behindCount ?? "?"}`);
    }
    lines.push(`- Last remote commit: ${repo.remote.lastRemoteCommitAt ?? "Unknown"}`);
    if (repo.remote.warning) {
      lines.push(`- Warning: ${repo.remote.warning}`);
    }
  }

  lines.push("", "Advice");
  for (const note of repoAdvice(repo)) {
    lines.push(`- ${note}`);
  }

  lines.push("", "Categories");
  for (const [category, stats] of Object.entries(repo.summary.categories)) {
    if (stats.lines === 0 && category === "other") continue;
    lines.push(`- ${category}: ${formatNumber(stats.lines)}`);
  }

  lines.push("", "Largest Files");
  for (const file of repo.summary.topFiles.slice(0, 5)) {
    lines.push(`- ${truncate(file.relativePath, Math.max(10, width - 18))} ${formatNumber(file.stats.lines)}`);
  }

  lines.push("", "Top Languages");
  for (const [language, stats] of Object.entries(repo.summary.languages)
    .sort((a, b) => b[1].lines - a[1].lines)
    .slice(0, 5)) {
    lines.push(`- ${language}: ${formatNumber(stats.lines)} lines / ${formatNumber(stats.files)} files`);
  }

  lines.push("", "Health");
  for (const note of repo.summary.health) {
    lines.push(`- ${note}`);
  }

  lines.push("", `Scroll: ${state.detailScroll}`);
  const sliced = lines.slice(state.detailScroll, state.detailScroll + Math.max(8, maxHeight));
  return sliced.map((line) => truncate(line, width));
}

function renderFooter(state: TuiState, width: number): string {
  const repos = visibleRepos(state);
  const selected = selectedRepo(state);
  const text = `q quit  j/k move  a add  d remove  p pin  s sort  x filter  r refresh  u upstream  g remote  ? help  ${selected ? `repo ${state.selectedRepoIndex + 1}/${Math.max(repos.length, 1)}: ${selected.repoName}` : "no selection"}  status: ${state.statusMessage}`;
  return truncate(text, width);
}

function renderHelpFrame(state: TuiState, width: number): string {
  const lines = [
    ...renderLogoWithVersion(),
    "Help",
    "=".repeat(width),
    "Navigation",
    "- q: quit",
    "- j / k or arrow keys: move",
    "- a: add another repo to this TUI session",
    "- d: remove the selected repo from this TUI session",
    "- p: pin or unpin the selected repo",
    "- s: cycle sort mode (activity, size, dirty)",
    "- x: cycle filter mode (all, dirty, active, favorites)",
    "- tab: switch focus between repo list and detail pane",
    "- r: force refresh now",
    "- u: explicit upstream status check using local tracking refs",
    "- g: toggle remote section visibility when remote mode is enabled",
    "- ?: toggle this help screen",
    "",
    "Realtime behavior",
    "- local changes update automatically based on polling",
    "- auto refresh waits briefly after keyboard interaction",
    "- input prompts pause auto-refresh until you finish typing",
    "- remote mode is optional and never replaces local refresh",
    "",
    "Current session",
    `- Sort: ${state.sortMode}`,
    `- Filter: ${state.filterMode}`,
    `- Pinned repos: ${state.favoriteRepoPaths.length}`,
    "",
    "Press ? again to return."
  ];
  return lines.map((line) => truncate(line, width)).join("\n");
}

function visibleRepos(state: TuiState): RepoLiveSnapshot[] {
  return state.repos
    .filter((repo) => matchesFilter(repo, state))
    .sort((left, right) => compareRepos(left, right, state));
}

function matchesFilter(repo: RepoLiveSnapshot, state: TuiState): boolean {
  if (state.filterMode === "all") return true;
  if (state.filterMode === "dirty") return !repo.localGit.clean;
  if (state.filterMode === "favorites") return state.favoriteRepoPaths.includes(repo.repoPath);
  return isActiveRepo(repo);
}

function compareRepos(left: RepoLiveSnapshot, right: RepoLiveSnapshot, state: TuiState): number {
  const leftPinned = state.favoriteRepoPaths.includes(left.repoPath) ? 1 : 0;
  const rightPinned = state.favoriteRepoPaths.includes(right.repoPath) ? 1 : 0;
  if (leftPinned !== rightPinned) {
    return rightPinned - leftPinned;
  }
  if (state.sortMode === "size") {
    return right.summary.totals.lines - left.summary.totals.lines || left.repoName.localeCompare(right.repoName);
  }
  if (state.sortMode === "dirty") {
    const dirtyDelta =
      dirtyScore(right) - dirtyScore(left) || Math.abs(right.deltaLines) - Math.abs(left.deltaLines);
    return dirtyDelta || left.repoName.localeCompare(right.repoName);
  }
  const activityDelta =
    activityScore(right) - activityScore(left) ||
    new Date(right.lastUpdatedAt).getTime() - new Date(left.lastUpdatedAt).getTime();
  return activityDelta || left.repoName.localeCompare(right.repoName);
}

function dirtyScore(repo: RepoLiveSnapshot): number {
  return (
    (repo.localGit.clean ? 0 : 1000) +
    repo.localGit.modified * 10 +
    repo.localGit.staged * 8 +
    repo.localGit.untracked * 6 +
    repo.localGit.deleted * 4
  );
}

function activityScore(repo: RepoLiveSnapshot): number {
  return dirtyScore(repo) + Math.abs(repo.deltaLines) * 5 + (isActiveRepo(repo) ? 50 : 0);
}

function isActiveRepo(repo: RepoLiveSnapshot): boolean {
  if (!repo.localGit.clean || repo.deltaLines !== 0) return true;
  if (!repo.lastFileChangeAt) return false;
  return Date.now() - new Date(repo.lastFileChangeAt).getTime() <= 24 * 60 * 60 * 1000;
}

function preserveSelection(state: TuiState, repoPath?: string) {
  const repos = visibleRepos(state);
  if (repos.length === 0) {
    state.selectedRepoIndex = 0;
    state.selectedRepoPath = undefined;
    return;
  }
  if (!repoPath) {
    state.selectedRepoIndex = Math.min(state.selectedRepoIndex, repos.length - 1);
    state.selectedRepoPath = repos[state.selectedRepoIndex]?.repoPath;
    return;
  }
  const nextIndex = repos.findIndex((repo) => repo.repoPath === repoPath);
  state.selectedRepoIndex = nextIndex >= 0 ? nextIndex : Math.min(state.selectedRepoIndex, repos.length - 1);
  state.selectedRepoPath = repos[state.selectedRepoIndex]?.repoPath;
}

function selectedRepo(state: TuiState): RepoLiveSnapshot | undefined {
  const repos = visibleRepos(state);
  if (repos.length === 0) return undefined;
  if (state.selectedRepoPath) {
    return repos.find((repo) => repo.repoPath === state.selectedRepoPath) ?? repos[0];
  }
  return repos[state.selectedRepoIndex] ?? repos[0];
}

function remoteBadge(repo: RepoLiveSnapshot): string {
  if (repo.remote.mode === "disabled") return "remote off";
  if (repo.remote.mode === "synced") return "remote synced";
  if (repo.remote.mode === "ahead" || repo.remote.mode === "behind" || repo.remote.mode === "diverged") {
    return `${repo.remote.mode} ${repo.remote.aheadCount ?? "?"}/${repo.remote.behindCount ?? "?"}`;
  }
  return `remote ${repo.remote.mode}`;
}

function renderLogoWithVersion(): string[] {
  return LOGO.map((line, index) => (index === 0 ? `${line}  v${REPO_METER_VERSION}` : line));
}

function dirtyExplanation(repo: RepoLiveSnapshot): string {
  if (repo.localGit.clean) {
    return "no modified, staged, deleted, or untracked files";
  }
  return `${repo.localGit.modified} modified, ${repo.localGit.staged} staged, ${repo.localGit.deleted} deleted, ${repo.localGit.untracked} untracked`;
}

function repoAdvice(repo: RepoLiveSnapshot): string[] {
  if (repo.localGit.clean) {
    return ["Repo is clean. No local cleanup needed right now."];
  }
  const advice = ["Dirty means the repo has local changes that are not fully settled yet."];
  if (repo.localGit.staged > 0) {
    advice.push("Review staged changes and commit them if they are ready.");
  }
  if (repo.localGit.modified > 0 || repo.localGit.deleted > 0) {
    advice.push("Either commit, stash, or discard working tree changes you no longer need.");
  }
  if (repo.localGit.untracked > 0) {
    advice.push("Review untracked files. Commit them, ignore them, or delete them if they are temporary.");
  }
  return advice;
}

function truncate(value: string, width: number): string {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function relativeTime(iso: string): string {
  const deltaMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function formatLocalGit(snapshot: RepoLiveSnapshot): string {
  const git = snapshot.localGit;
  const branch = git.branch ? `branch ${git.branch}` : "no branch";
  return `${branch}, modified ${git.modified}, staged ${git.staged}, deleted ${git.deleted}, untracked ${git.untracked}`;
}

function signed(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}
