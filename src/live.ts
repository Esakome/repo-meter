import fs from "node:fs";
import path from "node:path";

import git from "isomorphic-git";

import { loadConfig } from "./config.js";
import { countRepository } from "./count.js";
import { scanRepository } from "./scan.js";
import type {
  RepoLiveSnapshot,
  RepoLocalGitStatus,
  RepoRemoteStatus,
  TuiRuntimeOptions
} from "./types.js";

export async function resolveTuiRuntimeOptions(input: {
  cwd: string;
  configPath?: string;
  pathArgs?: string[];
  reposFlag?: string;
  interval?: number;
  remote?: boolean;
  top?: number;
}): Promise<TuiRuntimeOptions> {
  const config = await loadConfig(input.cwd, input.configPath);
  const repoPaths = uniquePaths(
    (input.pathArgs?.length
      ? input.pathArgs
      : input.reposFlag
        ? input.reposFlag.split(",")
        : config.repos.length
          ? config.repos
          : [input.cwd]
    )
      .map((repoPath) => path.resolve(input.cwd, repoPath.trim()))
      .filter(Boolean)
  );

  return {
    repoPaths,
    intervalMs: input.interval ?? config.tui.intervalMs ?? config.watchIntervalMs,
    remote: input.remote ?? config.tui.remote,
    top: input.top ?? config.topFiles
  };
}

export async function collectRepoLiveSnapshot(
  repoPath: string,
  options: { top?: number; remote?: boolean; previous?: RepoLiveSnapshot }
): Promise<RepoLiveSnapshot> {
  const scan = await scanRepository({ cwd: repoPath, top: options.top });
  const summary = await countRepository(scan, options.top);
  const localGit = await collectLocalGitStatus(repoPath, scan.mode === "git");
  const remote = await collectRemoteStatus(repoPath, scan.mode === "git", options.remote === true);
  const lastFileChangeAt = latestFileChange(summary);
  const signature = JSON.stringify({
    totals: summary.totals,
    tracked: summary.tracked,
    untracked: summary.untracked,
    topFiles: summary.topFiles.map((file) => [file.relativePath, file.stats.lines]),
    fileTimes: summary.files.map((file) => [file.relativePath, file.modifiedAtMs, file.sizeBytes]),
    localGit,
    remote
  });

  return {
    repoPath,
    repoName: path.basename(repoPath) || repoPath,
    summary,
    lastUpdatedAt:
      options.previous?.lastSignature === signature ? options.previous.lastUpdatedAt : new Date().toISOString(),
    lastSignature: signature,
    lastFileChangeAt,
    deltaLines: summary.totals.lines - (options.previous?.summary.totals.lines ?? summary.totals.lines),
    localGit,
    remote
  };
}

export async function collectManyRepoSnapshots(
  runtime: TuiRuntimeOptions,
  previous: RepoLiveSnapshot[] = []
): Promise<RepoLiveSnapshot[]> {
  const previousByPath = new Map(previous.map((snapshot) => [snapshot.repoPath, snapshot]));
  const snapshots: RepoLiveSnapshot[] = [];
  for (const repoPath of runtime.repoPaths) {
    snapshots.push(
      await collectRepoLiveSnapshot(repoPath, {
        top: runtime.top,
        remote: runtime.remote,
        previous: previousByPath.get(repoPath)
      })
    );
  }
  return snapshots;
}

export async function collectLocalGitStatus(repoPath: string, isGitRepo: boolean): Promise<RepoLocalGitStatus> {
  if (!isGitRepo) {
    return {
      modified: 0,
      deleted: 0,
      staged: 0,
      untracked: 0,
      clean: true
    };
  }

  try {
    const branch = await git.currentBranch({ fs, dir: repoPath, fullname: false });
    const headOid = await safeResolveRef(repoPath, "HEAD");
    const lastCommitAt = headOid ? await safeCommitTimestamp(repoPath, headOid) : undefined;
    const matrix = await git.statusMatrix({ fs, dir: repoPath });
    let modified = 0;
    let deleted = 0;
    let staged = 0;
    let untracked = 0;

    for (const [, head, workdir, stage] of matrix) {
      if (head === 0 && workdir !== 0) {
        untracked += 1;
      }
      if (head !== 0 && workdir === 0) {
        deleted += 1;
      } else if (head !== workdir) {
        modified += 1;
      }
      if (stage !== head) {
        staged += 1;
      }
    }

    return {
      branch: branch ?? undefined,
      modified,
      deleted,
      staged,
      untracked,
      clean: modified === 0 && deleted === 0 && staged === 0 && untracked === 0,
      lastCommitAt
    };
  } catch {
    return {
      modified: 0,
      deleted: 0,
      staged: 0,
      untracked: 0,
      clean: true
    };
  }
}

export async function collectRemoteStatus(
  repoPath: string,
  isGitRepo: boolean,
  remoteEnabled: boolean
): Promise<RepoRemoteStatus> {
  if (!remoteEnabled) {
    return {
      mode: "disabled",
      message: "Remote polling disabled"
    };
  }

  if (!isGitRepo) {
    return {
      mode: "not_git",
      message: "Not a Git repository"
    };
  }

  try {
    const remotes = await git.listRemotes({ fs, dir: repoPath });
    const remoteName = remotes[0]?.remote;
    if (!remoteName) {
      return {
        mode: "no_remote",
        message: "No remote configured"
      };
    }

    const branch = await git.currentBranch({ fs, dir: repoPath, fullname: false });
    if (!branch) {
      return {
        mode: "no_tracking",
        remoteName,
        message: `No current branch for ${remoteName}`
      };
    }

    let headOid: string | undefined;
    let remoteOid: string | undefined;
    try {
      headOid = await safeResolveRef(repoPath, "HEAD");
      remoteOid = await safeResolveRef(repoPath, `refs/remotes/${remoteName}/${branch}`);
    } catch {
      return {
        mode: "no_tracking",
        remoteName,
        branch,
        message: `No local tracking ref for ${remoteName}/${branch}`
      };
    }

    if (!headOid || !remoteOid) {
      return {
        mode: "unknown",
        remoteName,
        branch,
        message: `Unable to resolve ${remoteName}/${branch}`
      };
    }

    if (headOid === remoteOid) {
      return {
        mode: "synced",
        remoteName,
        branch,
        message: `${remoteName}/${branch} is in sync`,
        aheadCount: 0,
        behindCount: 0,
        lastRemoteCommitAt: await safeCommitTimestamp(repoPath, remoteOid)
      };
    }

    const localAhead = await safeIsDescendent(repoPath, headOid, remoteOid);
    const remoteAhead = await safeIsDescendent(repoPath, remoteOid, headOid);
    const counts = await countAheadBehind(repoPath, headOid, remoteOid);
    const lastRemoteCommitAt = await safeCommitTimestamp(repoPath, remoteOid);

    if (localAhead && !remoteAhead) {
      return {
        mode: "ahead",
        remoteName,
        branch,
        message: `Local branch is ahead of ${remoteName}/${branch}`,
        aheadCount: counts?.aheadCount,
        behindCount: counts?.behindCount,
        lastRemoteCommitAt,
        warning: "Push recommended"
      };
    }

    if (remoteAhead && !localAhead) {
      return {
        mode: "behind",
        remoteName,
        branch,
        message: `Local branch is behind ${remoteName}/${branch}`,
        aheadCount: counts?.aheadCount,
        behindCount: counts?.behindCount,
        lastRemoteCommitAt,
        warning: "Pull or fetch+rebase recommended"
      };
    }

    return {
      mode: "diverged",
      remoteName,
      branch,
      message: `Local branch diverged from ${remoteName}/${branch}`,
      aheadCount: counts?.aheadCount,
      behindCount: counts?.behindCount,
      lastRemoteCommitAt,
      warning: "Branches diverged"
    };
  } catch (error) {
    return {
      mode: "unknown",
      message: error instanceof Error ? error.message : "Unable to inspect remote status"
    };
  }
}

async function safeIsDescendent(repoPath: string, oid: string, ancestor: string): Promise<boolean> {
  try {
    return await git.isDescendent({ fs, dir: repoPath, oid, ancestor });
  } catch {
    return false;
  }
}

async function safeResolveRef(repoPath: string, ref: string): Promise<string | undefined> {
  try {
    return await git.resolveRef({ fs, dir: repoPath, ref });
  } catch {
    return undefined;
  }
}

async function safeCommitTimestamp(repoPath: string, oid: string): Promise<string | undefined> {
  try {
    const commit = await git.readCommit({ fs, dir: repoPath, oid });
    const seconds = commit.commit.committer.timestamp;
    return new Date(seconds * 1000).toISOString();
  } catch {
    return undefined;
  }
}

async function countAheadBehind(
  repoPath: string,
  localOid: string,
  remoteOid: string
): Promise<{ aheadCount: number; behindCount: number } | undefined> {
  const local = await walkAncestors(repoPath, localOid, 512);
  const remote = await walkAncestors(repoPath, remoteOid, 512);
  let best:
    | {
        aheadCount: number;
        behindCount: number;
        score: number;
      }
    | undefined;

  for (const [oid, aheadCount] of local.entries()) {
    const behindCount = remote.get(oid);
    if (behindCount === undefined) {
      continue;
    }
    const score = aheadCount + behindCount;
    if (!best || score < best.score) {
      best = { aheadCount, behindCount, score };
    }
  }

  return best ? { aheadCount: best.aheadCount, behindCount: best.behindCount } : undefined;
}

async function walkAncestors(repoPath: string, startOid: string, limit: number): Promise<Map<string, number>> {
  const seen = new Map<string, number>();
  const queue: Array<{ oid: string; depth: number }> = [{ oid: startOid, depth: 0 }];

  while (queue.length > 0 && seen.size < limit) {
    const current = queue.shift()!;
    if (seen.has(current.oid)) {
      continue;
    }
    seen.set(current.oid, current.depth);
    try {
      const commit = await git.readCommit({ fs, dir: repoPath, oid: current.oid });
      for (const parent of commit.commit.parent) {
        if (!seen.has(parent)) {
          queue.push({ oid: parent, depth: current.depth + 1 });
        }
      }
    } catch {
      continue;
    }
  }

  return seen;
}

function latestFileChange(summary: Awaited<ReturnType<typeof countRepository>>): string | undefined {
  let latest = 0;
  for (const file of summary.files) {
    latest = Math.max(latest, file.modifiedAtMs);
  }
  return latest > 0 ? new Date(latest).toISOString() : undefined;
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.map((entry) => path.normalize(entry)))];
}
