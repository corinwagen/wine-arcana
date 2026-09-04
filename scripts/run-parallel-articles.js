#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  formatPrompt,
  validateQueue,
} from "./run-next-article.js";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const queuePath = path.join(repositoryRoot, "tasks", "article-queue.json");
const runsRoot = path.join(repositoryRoot, ".codex-runs");
const worktreesRoot = path.join(runsRoot, "worktrees");
const logsRoot = path.join(runsRoot, "logs");
const articlePathPattern = /^content\/(grapes|regions|styles|concepts)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const kinds = new Set(["grape", "region", "style", "concept"]);
const reasoningEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);
const directoryKinds = {
  grapes: "grape",
  regions: "region",
  styles: "style",
  concepts: "concept",
};

function kindForPath(articlePath) {
  return directoryKinds[articlePath.split("/")[1]];
}

function slugForPath(articlePath) {
  return path.basename(articlePath, ".md");
}

function parsePositiveInteger(value, flag) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || String(parsed) !== value) {
    throw new Error(`${flag} requires a positive integer.`);
  }
  return parsed;
}

export function parseArguments(arguments_) {
  const mode = arguments_[0];
  if (mode !== "new" && mode !== "editorial") {
    throw new Error("Choose the new or editorial subcommand.");
  }

  let count = 3;
  let dryRun = false;
  let kind = null;
  let model = DEFAULT_MODEL;
  let reasoningEffort = DEFAULT_REASONING_EFFORT;
  const paths = [];

  for (let index = 1; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--count") {
      const value = arguments_[index + 1];
      if (value === undefined) throw new Error("--count requires a value.");
      count = parsePositiveInteger(value, "--count");
      index += 1;
    } else if (argument === "--kind") {
      kind = arguments_[index + 1];
      if (!kinds.has(kind)) {
        throw new Error("--kind must be grape, region, style, or concept.");
      }
      index += 1;
    } else if (argument === "--model") {
      model = arguments_[index + 1];
      if (!model) throw new Error("--model requires a value.");
      index += 1;
    } else if (argument === "--reasoning") {
      reasoningEffort = arguments_[index + 1];
      if (!reasoningEfforts.has(reasoningEffort)) {
        throw new Error("--reasoning must be none, low, medium, high, xhigh, or max.");
      }
      index += 1;
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    } else {
      paths.push(argument);
    }
  }

  if (mode === "new" && paths.length > 0) {
    throw new Error("The new subcommand selects paths from the queue; do not pass article paths.");
  }
  if (mode === "editorial" && paths.length === 0) {
    throw new Error("The editorial subcommand requires at least one article path.");
  }
  if (mode === "editorial" && kind !== null) {
    throw new Error("--kind applies only to new queued articles.");
  }
  if (mode === "editorial" && arguments_.includes("--count")) {
    throw new Error("--count applies only to new queued articles.");
  }

  return { count, dryRun, kind, mode, model, paths, reasoningEffort };
}

export function formatEditorialPrompt(articlePath) {
  return `Revise ${articlePath} as this run's only primary article.

Perform a focused editorial and link-enrichment pass. Read AGENTS.md,
CONTRIBUTING.md, all four repository editorial guides, the appropriate
template, the full target article, and directly related existing articles
before editing.

Improve clarity, economy, concrete diction, and cadence while preserving sound
prose, structure, factual nuance, citations, and the established voice. Apply
the current house style, including ligatures and diaereses where appropriate.
Remove redundancy, scholarly overgrowth, generic transitions, and conspicuous
LLM habits such as repeatedly framing a point as “X does Y; it does not do Z.”
Make surgical edits rather than regenerating the page wholesale.

Add useful relative links where names in the older article now resolve to
canonical pages that already exist. Link meaningful first mentions, not every
occurrence. Do not create placeholders or broken links.

Verify any factual claim you materially change using authoritative sources.
Do not manufacture research or churn sources merely to make the bibliography
look newer. Preserve reliable sources that still support the article, and list
only sources actually consulted.

Do not edit any file other than ${articlePath}. Do not change project guides,
templates, configuration, the article queue, or another article. Run npm run
check, inspect the final Git diff, and do not commit. In the final message,
summarize substantive changes, sources consulted, checks performed, and useful
follow-up work.`;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readQueue() {
  try {
    return validateQueue(JSON.parse(await fs.readFile(queuePath, "utf8")));
  } catch (error) {
    throw new Error(`Could not read tasks/article-queue.json: ${error.message}`);
  }
}

export async function selectIncompleteEntries(queue, count, kind = null, root = repositoryRoot) {
  const selected = [];
  for (const entry of queue) {
    if (kind !== null && kindForPath(entry.path) !== kind) continue;
    if (!(await pathExists(path.join(root, entry.path)))) selected.push(entry);
    if (selected.length === count) break;
  }
  return selected;
}

async function validateEditorialPaths(paths) {
  const uniquePaths = new Set();
  for (const articlePath of paths) {
    if (!articlePathPattern.test(articlePath)) {
      throw new Error(
        `Invalid article path ${articlePath}; use content/<type>/<kebab-case>.md.`
      );
    }
    if (uniquePaths.has(articlePath)) {
      throw new Error(`Article path supplied more than once: ${articlePath}.`);
    }
    uniquePaths.add(articlePath);
    if (!(await pathExists(path.join(repositoryRoot, articlePath)))) {
      throw new Error(`Editorial target does not exist: ${articlePath}.`);
    }
  }
}

async function git(args, cwd = repositoryRoot) {
  return execFileAsync("git", args, { cwd });
}

async function rootChanges() {
  const { stdout } = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
  return stdout.trimEnd().split("\n").filter(Boolean);
}

function changedPath(statusLine) {
  const value = statusLine.slice(3);
  const renameSeparator = value.lastIndexOf(" -> ");
  return renameSeparator === -1 ? value : value.slice(renameSeparator + 4);
}

function makeJob(mode, articlePath, title = null, prompt = null) {
  const kind = kindForPath(articlePath);
  const slug = slugForPath(articlePath);
  const identifier = `${mode}-${kind}-${slug}`;
  return {
    articlePath,
    branch: `codex/${mode}/${kind}-${slug}`,
    finalPath: path.join(logsRoot, `${identifier}-final.md`),
    identifier,
    logPath: path.join(logsRoot, `${identifier}.log`),
    prompt: prompt ?? formatEditorialPrompt(articlePath),
    title: title ?? slug,
    worktreePath: path.join(worktreesRoot, identifier),
  };
}

async function assertJobAvailable(job) {
  if (await pathExists(job.worktreePath)) {
    throw new Error(
      `Worktree path already exists: ${job.worktreePath}. Review or remove that prior run first.`
    );
  }
  const { stdout } = await git(["branch", "--list", job.branch]);
  if (stdout.trim() !== "") {
    throw new Error(`Branch already exists: ${job.branch}. Review or remove that prior run first.`);
  }
}

async function createWorktree(job) {
  await git(["worktree", "add", "-b", job.branch, job.worktreePath, "HEAD"]);
}

function runLogged(command, args, options) {
  return new Promise((resolve, reject) => {
    const log = fsSync.createWriteStream(options.logPath, { flags: "a" });
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on("error", (error) => {
      log.end();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      log.end();
      if (code === 0) {
        resolve();
      } else {
        const detail = signal === null ? `exit code ${code}` : `signal ${signal}`;
        reject(new Error(`${command} failed with ${detail}.`));
      }
    });
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

async function worktreeChanges(job) {
  const { stdout } = await git(
    ["status", "--porcelain=v1", "--untracked-files=all"],
    job.worktreePath
  );
  return stdout.trimEnd().split("\n").filter(Boolean);
}

async function runJob(job, model, reasoningEffort) {
  console.log(`Starting ${job.title} on ${job.branch}`);
  await fs.writeFile(
    job.logPath,
    `Article: ${job.articlePath}\nBranch: ${job.branch}\nModel: ${model}\nReasoning: ${reasoningEffort}\n\n`
  );
  await runLogged(
    "codex",
    [
      "--search",
      "--ask-for-approval",
      "never",
      "exec",
      "--model",
      model,
      "-c",
      `model_reasoning_effort="${reasoningEffort}"`,
      "--ephemeral",
      "--sandbox",
      "workspace-write",
      "--cd",
      job.worktreePath,
      "--output-last-message",
      job.finalPath,
      "-",
    ],
    { cwd: job.worktreePath, input: job.prompt, logPath: job.logPath }
  );

  const changes = await worktreeChanges(job);
  const unexpected = changes.filter((line) => changedPath(line) !== job.articlePath);
  if (unexpected.length > 0) {
    throw new Error(`changed files outside ${job.articlePath}:\n${unexpected.join("\n")}`);
  }
  if (!(await pathExists(path.join(job.worktreePath, job.articlePath)))) {
    throw new Error(`did not create ${job.articlePath}`);
  }

  await runLogged("npm", ["run", "check"], {
    cwd: job.worktreePath,
    logPath: job.logPath,
  });
  console.log(`Ready for review: ${job.articlePath}`);
}

function printDryRun(jobs, model, reasoningEffort) {
  console.log(`Model: ${model}`);
  console.log(`Reasoning: ${reasoningEffort}`);
  console.log(`Parallel jobs: ${jobs.length}`);
  for (const job of jobs) {
    console.log(`\n${job.title}`);
    console.log(`  article:  ${job.articlePath}`);
    console.log(`  branch:   ${job.branch}`);
    console.log(`  worktree: ${job.worktreePath}`);
    console.log(`  log:      ${job.logPath}`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let jobs;

  if (options.mode === "new") {
    const entries = await selectIncompleteEntries(
      await readQueue(),
      options.count,
      options.kind
    );
    jobs = entries.map((entry) => makeJob("new", entry.path, entry.title, formatPrompt(entry)));
    if (jobs.length === 0) {
      console.log("No matching incomplete articles remain in the queue.");
      return;
    }
  } else {
    await validateEditorialPaths(options.paths);
    jobs = options.paths.map((articlePath) => makeJob("editorial", articlePath));
  }

  if (options.dryRun) {
    printDryRun(jobs, options.model, options.reasoningEffort);
    return;
  }

  const changes = await rootChanges();
  if (changes.length > 0) {
    throw new Error(
      "Refusing to start parallel runs with a dirty primary worktree. Review and commit or stash existing changes first."
    );
  }

  await fs.mkdir(worktreesRoot, { recursive: true });
  await fs.mkdir(logsRoot, { recursive: true });
  for (const job of jobs) await assertJobAvailable(job);
  for (const job of jobs) await createWorktree(job);

  const results = await Promise.allSettled(
    jobs.map((job) => runJob(job, options.model, options.reasoningEffort))
  );
  let failed = false;
  for (const [index, result] of results.entries()) {
    const job = jobs[index];
    if (result.status === "rejected") {
      failed = true;
      console.error(`Failed: ${job.articlePath}: ${result.reason.message}`);
    }
  }

  console.log("\nReview each isolated result before committing or merging:");
  for (const job of jobs) {
    console.log(`  git -C ${job.worktreePath} diff -- ${job.articlePath}`);
    console.log(`  log: ${job.logPath}`);
    console.log(`  final message: ${job.finalPath}`);
  }
  if (failed) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    await main();
  } catch (error) {
    console.error(`Parallel article runner stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
