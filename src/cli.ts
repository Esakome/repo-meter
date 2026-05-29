#!/usr/bin/env node
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { compareWithBaseline, listBaselines, loadBaseline, saveBaseline } from "./baseline.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { resolveTuiRuntimeOptions } from "./live.js";
import { countRepository } from "./count.js";
import { renderReport } from "./report.js";
import { scanRepository } from "./scan.js";
import { runTui } from "./tui.js";
import { watchRepository } from "./watch.js";

async function main() {
  const rawArgs = hideBin(process.argv);

  if (rawArgs[0] === "completion") {
    const shell = rawArgs[1];
    if (shell !== "bash" && shell !== "zsh" && shell !== "powershell") {
      process.stderr.write("completion requires one of: bash, zsh, powershell\n");
      process.exitCode = 1;
      return;
    }
    process.stdout.write(renderCompletionScript(shell));
    return;
  }

  if (rawArgs[0] === "baseline") {
    const subcommand = rawArgs[1];
    if (subcommand === "list") {
      const scan = await scanRepository({
        cwd: process.cwd(),
        configPath: readOptionValue(rawArgs, "--config")
      });
      const baselines = await listBaselines(scan.root, scan.config.baselineDir);
      if (baselines.length === 0) {
        process.stdout.write("No baselines found.\n");
        return;
      }
      for (const baseline of baselines) {
        process.stdout.write(`${baseline.createdAt}  ${baseline.name}  ${baseline.path}\n`);
      }
      return;
    }
    if (subcommand === "save") {
      const name = readPositionalValue(rawArgs, 2) ?? "default";
      const scan = await scanRepository({
        cwd: process.cwd(),
        configPath: readOptionValue(rawArgs, "--config"),
        top: readNumericOptionValue(rawArgs, "--top"),
        since: readOptionValue(rawArgs, "--since")
      });
      const summary = await countRepository(scan, readNumericOptionValue(rawArgs, "--top"));
      const output = await saveBaseline(summary, scan.config.baselineDir, name);
      process.stdout.write(`Saved baseline to ${output}\n`);
      return;
    }
    if (subcommand === "trend") {
      const scan = await scanRepository({
        cwd: process.cwd(),
        configPath: readOptionValue(rawArgs, "--config")
      });
      const baselines = await listBaselines(scan.root, scan.config.baselineDir);
      if (baselines.length === 0) {
        process.stdout.write("No baselines found.\n");
        return;
      }
      const snapshots = [];
      for (const baseline of baselines) {
        snapshots.push(await loadBaseline(scan.root, scan.config.baselineDir, baseline.name));
      }
      process.stdout.write(renderTrend(snapshots));
      return;
    }
    if (subcommand === "compare") {
      const name = readPositionalValue(rawArgs, 2) ?? "default";
      const scan = await scanRepository({
        cwd: process.cwd(),
        configPath: readOptionValue(rawArgs, "--config"),
        top: readNumericOptionValue(rawArgs, "--top"),
        since: readOptionValue(rawArgs, "--since")
      });
      const summary = await countRepository(scan, readNumericOptionValue(rawArgs, "--top"));
      const baseline = await loadBaseline(scan.root, scan.config.baselineDir, name);
      const diff = compareWithBaseline(summary, baseline);
      const format = rawArgs.includes("--json")
        ? "json"
        : rawArgs.includes("--summary")
          ? "summary"
          : rawArgs.includes("--markdown")
            ? "markdown"
            : "text";
      process.stdout.write(renderReport(summary, { format, includeDiff: diff }));
      return;
    }
  }

  const cli = yargs(rawArgs)
    .scriptName("repo-meter")
    .usage("$0 [command]")
    .example("$0", "Open the live interactive TUI")
    .example("$0 scan", "Print the standard repo metrics report")
    .example("$0 baseline save first", "Save a baseline snapshot named 'first'")
    .help()
    .alias("h", "help")
    .epilog("By default `repo-meter` opens the live TUI. Use `repo-meter scan` for the quick report.")
    .wrap(Math.min(100, yargs().terminalWidth()))
    .option("config", {
      type: "string",
      describe: "Path to repo-meter.config.json"
    })
    .option("top", {
      type: "number",
      describe: "Number of top files to show"
    })
    .option("since", {
      type: "string",
      describe: "Only scan changed tracked files since this git ref, plus current untracked files"
    })
    .command(
      "completion <shell>",
      "Generate a shell completion script",
      (command: any) =>
        command.positional("shell", {
          type: "string",
          choices: ["bash", "zsh", "powershell"]
        }),
      async (args: any) => {
        process.stdout.write(renderCompletionScript(args.shell));
      }
    )
    .command(
      "init",
      "Write a starter repo-meter.config.json into the current directory",
      (command: any) =>
        command.option("force", {
          type: "boolean",
          default: false,
          describe: "Overwrite an existing config file"
        }),
      async (args: any) => {
        const targetPath = path.resolve(process.cwd(), "repo-meter.config.json");
        await mkdir(path.dirname(targetPath), { recursive: true });
        if (!args.force) {
          try {
            await access(targetPath);
            process.stdout.write(
              `Refusing to overwrite ${targetPath}. Re-run with --force if you want to replace it.\n`
            );
            return;
          } catch {
            // fall through and write the template
          }
        }
        await writeFile(targetPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
        process.stdout.write(`Wrote ${targetPath}\n`);
      }
    )
    .command(
      "tui [paths..]",
      "Open the interactive multi-repo TUI",
      (command: any) =>
        command
          .positional("paths", {
            type: "string",
            array: true,
            describe: "Repo paths to watch"
          })
          .option("repos", {
            type: "string",
            describe: "Comma-separated repo paths to watch"
          })
          .option("remote", {
            type: "boolean",
            default: undefined,
            describe: "Show optional remote tracking status when available"
          })
          .option("interval", {
            type: "number",
            describe: "Refresh interval in milliseconds"
          }),
      async (args: any) => {
        const runtime = await resolveTuiRuntimeOptions({
          cwd: process.cwd(),
          configPath: args.config,
          pathArgs: args.paths,
          reposFlag: args.repos,
          interval: args.interval,
          remote: args.remote,
          top: args.top
        });
        await runTui(runtime);
      }
    )
    .command(
      "scan",
      "Scan the repo and print the default text report",
      (command: any) => command,
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config,
          top: args.top,
          since: args.since
        });
        const summary = await countRepository(scan, args.top);
        process.stdout.write(renderReport(summary, { format: "text" }));
      }
    )
    .command(
      "dashboard",
      "Render a denser terminal dashboard view",
      (command: any) =>
        command.option("json", { type: "boolean", default: false, describe: "Output JSON instead" }),
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config,
          top: args.top,
          since: args.since
        });
        const summary = await countRepository(scan, args.top);
        process.stdout.write(renderReport(summary, { format: args.json ? "json" : "dashboard" }));
      }
    )
    .command(
      "report",
      "Render the repo report in text, JSON, or Markdown",
      (command: any) =>
        command
          .option("json", { type: "boolean", default: false, describe: "Output JSON" })
          .option("markdown", { type: "boolean", default: false, describe: "Output Markdown" })
          .option("summary", {
            type: "boolean",
            default: false,
            describe: "Output a compact Markdown summary for CI or PR comments"
          })
          .option("write", { type: "string", describe: "Write the rendered output to a file" }),
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config,
          top: args.top,
          since: args.since
        });
        const summary = await countRepository(scan, args.top);
        const format = args.json ? "json" : args.summary ? "summary" : args.markdown ? "markdown" : "text";
        const rendered = renderReport(summary, { format });
        if (args.write) {
          const targetPath = path.resolve(process.cwd(), args.write);
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, rendered, "utf8");
          process.stdout.write(`Wrote ${targetPath}\n`);
          return;
        }
        process.stdout.write(rendered);
      }
    )
    .command(
      "watch",
      "Continuously refresh the repo report",
      (command: any) =>
        command.option("interval", {
          type: "number",
          default: 3000,
          describe: "Refresh interval in milliseconds"
        }).option("view", {
          type: "string",
          choices: ["text", "dashboard"],
          default: "dashboard",
          describe: "Refresh using the standard text report or the denser dashboard view"
        }),
      async (args: any) => {
        await watchRepository(
          {
            cwd: process.cwd(),
            configPath: args.config,
            top: args.top,
            since: args.since
          },
          { format: args.view },
          args.interval
        );
      }
    )
    .command(
      "baseline save [name]",
      "Save a baseline snapshot",
      (command: any) => command.positional("name", { type: "string", default: "default" }),
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config,
          top: args.top,
          since: args.since
        });
        const summary = await countRepository(scan, args.top);
        const output = await saveBaseline(summary, scan.config.baselineDir, args.name);
        process.stdout.write(`Saved baseline to ${output}\n`);
      }
    )
    .command(
      "baseline list",
      "List saved baseline snapshots",
      () => {},
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config
        });
        const baselines = await listBaselines(scan.root, scan.config.baselineDir);
        if (baselines.length === 0) {
          process.stdout.write("No baselines found.\n");
          return;
        }
        for (const baseline of baselines) {
          process.stdout.write(`${baseline.createdAt}  ${baseline.name}  ${baseline.path}\n`);
        }
      }
    )
    .command(
      "baseline compare [name]",
      "Compare the current repo against a saved baseline",
      (command: any) =>
        command
          .positional("name", { type: "string", default: "default" })
          .option("json", { type: "boolean", default: false, describe: "Output JSON" })
          .option("summary", {
            type: "boolean",
            default: false,
            describe: "Output a compact Markdown summary"
          })
          .option("markdown", { type: "boolean", default: false, describe: "Output Markdown" }),
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config,
          top: args.top,
          since: args.since
        });
        const summary = await countRepository(scan, args.top);
        const baseline = await loadBaseline(scan.root, scan.config.baselineDir, args.name);
        const diff = compareWithBaseline(summary, baseline);
        const format = args.json ? "json" : args.summary ? "summary" : args.markdown ? "markdown" : "text";
        process.stdout.write(renderReport(summary, { format, includeDiff: diff }));
      }
    )
    .command(
      "baseline trend",
      "Show saved baselines as a simple growth trend",
      () => {},
      async (args: any) => {
        const scan = await scanRepository({
          cwd: process.cwd(),
          configPath: args.config
        });
        const baselines = await listBaselines(scan.root, scan.config.baselineDir);
        if (baselines.length === 0) {
          process.stdout.write("No baselines found.\n");
          return;
        }
        const snapshots = [];
        for (const baseline of baselines) {
          snapshots.push(await loadBaseline(scan.root, scan.config.baselineDir, baseline.name));
        }
        process.stdout.write(renderTrend(snapshots));
      }
    )
    .command(
      "__complete [words..]",
      false,
      (command: any) => command.positional("words", { type: "string", array: true }),
      async (args: any) => {
        const words = (args.words as string[] | undefined) ?? [];
        process.stdout.write(`${completeWords(words).join("\n")}\n`);
      }
    )
    .recommendCommands()
    .strict();

  if (rawArgs.length === 0) {
    const runtime = await resolveTuiRuntimeOptions({
      cwd: process.cwd()
    });
    await runTui(runtime);
    return;
  }

  await cli.parseAsync();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

const ROOT_COMMANDS = ["completion", "init", "scan", "dashboard", "tui", "report", "watch", "baseline"];
const GLOBAL_OPTIONS = ["--config", "--top", "--since", "--help"];

function completeWords(words: string[]): string[] {
  const filtered = words.filter((word) => word !== "repo-meter");
  const current = filtered.at(-1) ?? "";
  const previous = filtered.at(-2);
  const stableWords = current.startsWith("-") ? filtered.slice(0, -1) : filtered;
  const command = stableWords[0];

  let suggestions: string[] = [];
  if (!command) {
    suggestions = [...ROOT_COMMANDS, ...GLOBAL_OPTIONS];
  } else if (command === "baseline" && stableWords.length <= 1) {
    suggestions = ["save", "compare", "list", "trend"];
  } else if (command === "completion" && stableWords.length <= 1) {
    suggestions = ["bash", "zsh", "powershell"];
  } else if (command === "dashboard") {
    suggestions = ["--json", "--config", "--top", "--since", "--help"];
  } else if (command === "tui") {
    suggestions = ["--repos", "--remote", "--interval", "--config", "--top", "--help"];
  } else if (command === "scan") {
    suggestions = ["--config", "--top", "--since", "--help"];
  } else if (command === "report") {
    suggestions = ["--json", "--markdown", "--summary", "--write", "--config", "--top", "--since", "--help"];
  } else if (command === "watch") {
    suggestions = ["--interval", "--view", "--config", "--top", "--since", "--help"];
  } else if (command === "baseline" && previous === "save") {
    suggestions = ["default"];
  } else if (command === "baseline" && previous === "compare") {
    suggestions = ["default", "--json", "--markdown"];
  } else {
    suggestions = GLOBAL_OPTIONS;
  }

  return suggestions.filter((item) => item.startsWith(current));
}

function renderCompletionScript(shell: string): string {
  if (shell === "powershell") {
    return `Register-ArgumentCompleter -Native -CommandName repo-meter -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $words = @()
  foreach ($element in $commandAst.CommandElements) {
    $words += $element.Extent.Text
  }
  repo-meter __complete @($words + $wordToComplete) |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`;
  }

  if (shell === "zsh") {
    return `#compdef repo-meter
_repo_meter_completions() {
  local -a completions
  completions=($(repo-meter __complete "$words[@]"))
  _describe 'values' completions
}
compdef _repo_meter_completions repo-meter
`;
  }

  return `_repo_meter_completions() {
  local cur_word
  cur_word="\${COMP_WORDS[COMP_CWORD]}"
  COMPREPLY=($(compgen -W "$(repo-meter __complete "\${COMP_WORDS[@]}")" -- "$cur_word"))
}
complete -o bashdefault -o default -F _repo_meter_completions repo-meter
`;
}

function readOptionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function readNumericOptionValue(args: string[], option: string): number | undefined {
  const value = readOptionValue(args, option);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readPositionalValue(args: string[], index: number): string | undefined {
  const value = args[index];
  if (!value || value.startsWith("-")) {
    return undefined;
  }
  return value;
}

function renderTrend(
  snapshots: Array<Awaited<ReturnType<typeof loadBaseline>>>
): string {
  const totals = snapshots.map((snapshot) => snapshot.totals.lines);
  const max = Math.max(...totals, 1);
  const blocks = "▁▂▃▄▅▆▇█";
  const sparkline = totals
    .map((value) => {
      const index = Math.min(blocks.length - 1, Math.round((value / max) * (blocks.length - 1)));
      return blocks[index];
    })
    .join("");

  const lines = ["Baseline Trend", "", `Sparkline: ${sparkline}`, ""];
  let previous = 0;
  for (const snapshot of snapshots) {
    const delta = previous === 0 ? 0 : snapshot.totals.lines - previous;
    lines.push(
      `${snapshot.createdAt}  ${snapshot.name.padEnd(16)} ${String(snapshot.totals.lines).padStart(8)}  ${delta === 0 ? "-" : delta > 0 ? `+${delta}` : `${delta}`}`
    );
    previous = snapshot.totals.lines;
  }

  return `${lines.join("\n")}\n`;
}
