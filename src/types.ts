export type RepoCategory =
  | "source"
  | "tests"
  | "docs"
  | "config"
  | "migrations"
  | "generated"
  | "lockfiles"
  | "assets"
  | "other";

export interface CategoryRule {
  include?: string[];
  exclude?: string[];
}

export interface RepoMeterConfig {
  include: string[];
  exclude: string[];
  generated: string[];
  categories: Partial<Record<RepoCategory, CategoryRule>>;
  largeFileWarning: number;
  topFiles: number;
  baselineDir: string;
  watchIntervalMs: number;
  repos: string[];
  tui: {
    intervalMs: number;
    remote: boolean;
  };
}

export interface FileRecord {
  absolutePath: string;
  relativePath: string;
  tracked: boolean;
  exists: boolean;
  extension: string;
  sizeBytes: number;
  modifiedAtMs: number;
  category: RepoCategory;
  isText: boolean;
}

export interface CountStats {
  lines: number;
  code: number;
  comments: number;
  blanks: number;
  language: string;
}

export interface LanguageSummary extends CountStats {
  files: number;
}

export interface CountedFile extends FileRecord {
  stats: CountStats;
}

export interface CountSummary {
  totals: CountStats;
  tracked: CountStats;
  untracked: CountStats;
  categories: Record<RepoCategory, CountStats>;
  languages: Record<string, LanguageSummary>;
  topFiles: CountedFile[];
  files: CountedFile[];
  health: string[];
  root: string;
  mode: "filesystem" | "git";
  git?: {
    root: string;
    trackedFiles: number;
    untrackedFiles: number;
    since?: string;
  };
}

export interface BaselineSnapshot {
  createdAt: string;
  name: string;
  root: string;
  mode: CountSummary["mode"];
  totals: CountStats;
  tracked: CountStats;
  untracked: CountStats;
  categories: Record<RepoCategory, CountStats>;
  languages: Record<string, LanguageSummary>;
  topFiles: Array<{
    path: string;
    lines: number;
    category: RepoCategory;
    language: string;
  }>;
}

export interface DiffSummary {
  label: string;
  totals: CountStats;
  tracked: CountStats;
  untracked: CountStats;
  categories: Record<RepoCategory, CountStats>;
  languages: Record<string, CountStats>;
  topFilesChanged: Array<{
    path: string;
    currentLines: number;
    previousLines: number;
    delta: number;
  }>;
}

export interface BaselineInfo {
  name: string;
  path: string;
  createdAt: string;
}

export interface ScanOptions {
  cwd: string;
  configPath?: string;
  top?: number;
  since?: string;
}

export interface RenderOptions {
  format: "text" | "json" | "markdown" | "dashboard" | "summary";
  includeDiff?: DiffSummary;
}

export interface RepoLocalGitStatus {
  branch?: string;
  modified: number;
  deleted: number;
  staged: number;
  untracked: number;
  clean: boolean;
  lastCommitAt?: string;
}

export interface RepoRemoteStatus {
  mode: "disabled" | "not_git" | "no_remote" | "no_tracking" | "unknown" | "synced" | "ahead" | "behind" | "diverged";
  remoteName?: string;
  branch?: string;
  message: string;
  aheadCount?: number;
  behindCount?: number;
  lastRemoteCommitAt?: string;
  warning?: string;
}

export interface RepoLiveSnapshot {
  repoPath: string;
  repoName: string;
  summary: CountSummary;
  lastUpdatedAt: string;
  lastSignature: string;
  lastFileChangeAt?: string;
  deltaLines: number;
  localGit: RepoLocalGitStatus;
  remote: RepoRemoteStatus;
}

export interface TuiRuntimeOptions {
  repoPaths: string[];
  intervalMs: number;
  remote: boolean;
  top?: number;
}

export interface TuiState {
  repos: RepoLiveSnapshot[];
  selectedRepoIndex: number;
  selectedRepoPath?: string;
  focusedPanel: "repos" | "detail";
  detailScroll: number;
  intervalMs: number;
  remoteEnabled: boolean;
  showRemoteDetails: boolean;
  showHelp: boolean;
  statusMessage: string;
  sortMode: "activity" | "size" | "dirty";
  filterMode: "all" | "dirty" | "active" | "favorites";
  favoriteRepoPaths: string[];
}
