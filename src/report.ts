import type { CountSummary, DiffSummary, RenderOptions, RepoCategory } from "./types.js";
import { formatNumber } from "./utils.js";

const CATEGORY_LABELS: Record<RepoCategory, string> = {
  source: "Source",
  tests: "Tests",
  docs: "Docs",
  config: "Config",
  migrations: "Migrations",
  generated: "Generated",
  lockfiles: "Lockfiles",
  assets: "Assets",
  other: "Other"
};

export function renderReport(summary: CountSummary, options: RenderOptions): string {
  if (options.format === "json") {
    return `${JSON.stringify(serialize(summary, options.includeDiff), null, 2)}\n`;
  }

  if (options.format === "markdown") {
    return renderMarkdown(summary, options.includeDiff);
  }

  if (options.format === "dashboard") {
    return renderDashboard(summary, options.includeDiff);
  }

  if (options.format === "summary") {
    return renderSummary(summary, options.includeDiff);
  }

  return renderText(summary, options.includeDiff);
}

function renderText(summary: CountSummary, diff?: DiffSummary): string {
  const lines: string[] = [];
  lines.push("Repo Meter");
  lines.push("");
  lines.push(`Working tree total: ${formatNumber(summary.totals.lines)} lines`);
  lines.push(`Tracked total:      ${formatNumber(summary.tracked.lines)} lines`);
  lines.push(`Untracked total:    ${formatNumber(summary.untracked.lines)} lines`);
  lines.push("");
  lines.push("Categories:");
  for (const [category, stats] of Object.entries(summary.categories) as Array<
    [RepoCategory, CountSummary["categories"][RepoCategory]]
  >) {
    if (stats.lines === 0 && category === "other") {
      continue;
    }
    lines.push(`- ${CATEGORY_LABELS[category]}: ${formatNumber(stats.lines)} lines`);
  }

  const topLanguages = sortedLanguages(summary).slice(0, 5);
  if (topLanguages.length > 0) {
    lines.push("");
    lines.push("Languages:");
    for (const [language, stats] of topLanguages) {
      lines.push(`- ${language}: ${formatNumber(stats.lines)} lines across ${formatNumber(stats.files)} files`);
    }
  }

  if (summary.topFiles.length > 0) {
    lines.push("");
    lines.push("Top files:");
    summary.topFiles.forEach((file, index) => {
      lines.push(`${index + 1}. ${file.relativePath} (${formatNumber(file.stats.lines)} lines)`);
    });
  }

  if (summary.health.length > 0) {
    lines.push("");
    lines.push("Health notes:");
    for (const note of summary.health) {
      lines.push(`- ${note}`);
    }
  }

  if (summary.git?.since) {
    lines.push("");
    lines.push(`Compared scope: changed tracked files since ${summary.git.since} plus current untracked files`);
  }

  if (diff) {
    lines.push("");
    lines.push(`Diff vs ${diff.label}:`);
    lines.push(`- Total: ${signed(diff.totals.lines)} lines`);
    lines.push(`- Tracked: ${signed(diff.tracked.lines)} lines`);
    lines.push(`- Untracked: ${signed(diff.untracked.lines)} lines`);
    for (const [category, stats] of Object.entries(diff.categories) as Array<
      [RepoCategory, DiffSummary["categories"][RepoCategory]]
    >) {
      if (stats.lines === 0) {
        continue;
      }
      lines.push(`- ${CATEGORY_LABELS[category]}: ${signed(stats.lines)} lines`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderMarkdown(summary: CountSummary, diff?: DiffSummary): string {
  const lines: string[] = [];
  lines.push("# Repo Meter");
  lines.push("");
  lines.push(`- Working tree total: **${formatNumber(summary.totals.lines)}** lines`);
  lines.push(`- Tracked total: **${formatNumber(summary.tracked.lines)}** lines`);
  lines.push(`- Untracked total: **${formatNumber(summary.untracked.lines)}** lines`);
  lines.push("");
  lines.push("## Categories");
  for (const [category, stats] of Object.entries(summary.categories) as Array<
    [RepoCategory, CountSummary["categories"][RepoCategory]]
  >) {
    if (stats.lines === 0 && category === "other") {
      continue;
    }
    lines.push(`- ${CATEGORY_LABELS[category]}: ${formatNumber(stats.lines)} lines`);
  }
  const topLanguages = sortedLanguages(summary).slice(0, 5);
  if (topLanguages.length > 0) {
    lines.push("");
    lines.push("## Languages");
    for (const [language, stats] of topLanguages) {
      lines.push(`- ${language}: ${formatNumber(stats.lines)} lines across ${formatNumber(stats.files)} files`);
    }
  }
  if (summary.topFiles.length > 0) {
    lines.push("");
    lines.push("## Top Files");
    summary.topFiles.forEach((file, index) => {
      lines.push(`${index + 1}. ${file.relativePath} - ${formatNumber(file.stats.lines)} lines`);
    });
  }
  if (summary.health.length > 0) {
    lines.push("");
    lines.push("## Health Notes");
    summary.health.forEach((note) => lines.push(`- ${note}`));
  }
  if (diff) {
    lines.push("");
    lines.push(`## Diff vs ${diff.label}`);
    lines.push(`- Total: ${signed(diff.totals.lines)} lines`);
    lines.push(`- Tracked: ${signed(diff.tracked.lines)} lines`);
    lines.push(`- Untracked: ${signed(diff.untracked.lines)} lines`);
  }
  return `${lines.join("\n")}\n`;
}

function serialize(summary: CountSummary, diff?: DiffSummary) {
  return {
    root: summary.root,
    mode: summary.mode,
    git: summary.git,
    totals: summary.totals,
    tracked: summary.tracked,
    untracked: summary.untracked,
    categories: summary.categories,
    languages: summary.languages,
    topFiles: summary.topFiles.map((file) => ({
      path: file.relativePath,
      category: file.category,
      language: file.stats.language,
      lines: file.stats.lines,
      code: file.stats.code,
      comments: file.stats.comments,
      blanks: file.stats.blanks,
      tracked: file.tracked
    })),
    health: summary.health,
    diff
  };
}

function signed(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function renderDashboard(summary: CountSummary, diff?: DiffSummary): string {
  const lines: string[] = [];
  lines.push("REPO METER DASHBOARD");
  lines.push("=".repeat(72));
  lines.push(
    `Working tree ${padMetric(formatNumber(summary.totals.lines) + " lines")} Tracked ${padMetric(formatNumber(summary.tracked.lines))} Untracked ${padMetric(formatNumber(summary.untracked.lines))}`
  );
  lines.push("");
  lines.push("Category Mix");
  lines.push("-".repeat(72));
  for (const [category, stats] of Object.entries(summary.categories) as Array<
    [RepoCategory, CountSummary["categories"][RepoCategory]]
  >) {
    if (stats.lines === 0 && category === "other") {
      continue;
    }
    lines.push(
      `${CATEGORY_LABELS[category].padEnd(12)} ${bar(stats.lines, summary.totals.lines, 28)} ${String(
        formatNumber(stats.lines)
      ).padStart(8)}`
    );
  }
  lines.push("");
  lines.push("Top Languages");
  lines.push("-".repeat(72));
  for (const [language, stats] of sortedLanguages(summary).slice(0, 6)) {
    lines.push(
      `${language.slice(0, 20).padEnd(20)} ${bar(stats.lines, summary.totals.lines, 24)} ${String(
        formatNumber(stats.lines)
      ).padStart(8)}  ${String(stats.files).padStart(4)} files`
    );
  }
  lines.push("");
  lines.push("Largest Files");
  lines.push("-".repeat(72));
  summary.topFiles.forEach((file, index) => {
    lines.push(
      `${String(index + 1).padStart(2)}. ${file.relativePath.slice(0, 46).padEnd(46)} ${String(
        formatNumber(file.stats.lines)
      ).padStart(8)}`
    );
  });
  if (summary.health.length > 0) {
    lines.push("");
    lines.push("Health");
    lines.push("-".repeat(72));
    summary.health.forEach((note) => lines.push(`- ${note}`));
  }
  if (diff) {
    lines.push("");
    lines.push(`Diff vs ${diff.label}`);
    lines.push("-".repeat(72));
    lines.push(`Total ${signed(diff.totals.lines)}  Tracked ${signed(diff.tracked.lines)}  Untracked ${signed(diff.untracked.lines)}`);
    for (const [language, stats] of Object.entries(diff.languages)
      .sort((a, b) => Math.abs(b[1].lines) - Math.abs(a[1].lines))
      .slice(0, 5)) {
      if (stats.lines === 0) continue;
      lines.push(`${language.slice(0, 20).padEnd(20)} ${signed(stats.lines)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderSummary(summary: CountSummary, diff?: DiffSummary): string {
  const lines: string[] = [];
  lines.push("## Repo Meter Summary");
  lines.push("");
  lines.push(`- Working tree total: **${formatNumber(summary.totals.lines)}** lines`);
  lines.push(`- Tracked total: **${formatNumber(summary.tracked.lines)}** lines`);
  lines.push(`- Untracked total: **${formatNumber(summary.untracked.lines)}** lines`);
  const biggest = summary.topFiles[0];
  if (biggest) {
    lines.push(`- Largest file: \`${biggest.relativePath}\` at **${formatNumber(biggest.stats.lines)}** lines`);
  }
  const language = sortedLanguages(summary)[0];
  if (language) {
    lines.push(`- Largest language bucket: **${language[0]}** with **${formatNumber(language[1].lines)}** lines`);
  }
  if (diff) {
    lines.push(`- Delta vs ${diff.label}: **${signed(diff.totals.lines)}** lines`);
  }
  if (summary.health.length > 0) {
    lines.push("");
    lines.push("### Health Notes");
    for (const note of summary.health) {
      lines.push(`- ${note}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function sortedLanguages(summary: CountSummary) {
  return Object.entries(summary.languages).sort((a, b) => b[1].lines - a[1].lines || a[0].localeCompare(b[0]));
}

function bar(value: number, total: number, width: number) {
  if (total <= 0 || value <= 0) {
    return " ".repeat(width);
  }
  const filled = Math.max(1, Math.round((value / total) * width));
  return `${"#".repeat(Math.min(width, filled))}${".".repeat(Math.max(0, width - filled))}`;
}

function padMetric(value: string) {
  return value.padEnd(12);
}
