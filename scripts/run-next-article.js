#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const queuePath = path.join(repositoryRoot, "tasks", "article-queue.json");
const articlePathPattern = /^content\/(grapes|regions|styles|concepts)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const articleTypes = {
  grapes: { kind: "grape", template: "templates/grape.md" },
  regions: { kind: "region", template: "templates/region.md" },
  styles: { kind: "style", template: "templates/style.md" },
  concepts: { kind: "concept", template: "templates/concept.md" },
};
const kinds = new Set(Object.values(articleTypes).map(({ kind }) => kind));
export const DEFAULT_MODEL = "gpt-5.6-terra";
export const DEFAULT_REASONING_EFFORT = "medium";
const reasoningEfforts = new Set(["none", "low", "medium", "high", "xhigh", "max"]);

function articleType(articlePath) {
  const directory = articlePath.split("/")[1];
  return articleTypes[directory];
}

export function validateQueue(value) {
  if (!Array.isArray(value)) {
    throw new Error("Article queue must be a JSON array.");
  }

  const paths = new Set();
  return value.map((entry, index) => {
    if (entry === null || Array.isArray(entry) || typeof entry !== "object") {
      throw new Error(`Queue entry ${index + 1} must be an object.`);
    }
    const { path: articlePath, title, brief } = entry;
    if (typeof articlePath !== "string" || !articlePathPattern.test(articlePath)) {
      throw new Error(
        `Queue entry ${index + 1} has an invalid article path; use content/<type>/<kebab-case>.md.`
      );
    }
    if (paths.has(articlePath)) {
      throw new Error(`Queue contains duplicate path ${articlePath}.`);
    }
    paths.add(articlePath);

    if (typeof title !== "string" || title.trim() === "" || title !== title.trim()) {
      throw new Error(`Queue entry ${index + 1} must have a trimmed, nonempty title.`);
    }
    if (typeof brief !== "string" || brief.trim() === "" || brief !== brief.trim()) {
      throw new Error(`Queue entry ${index + 1} must have a trimmed, nonempty brief.`);
    }
    return { path: articlePath, title, brief };
  });
}

export function formatPrompt(entry) {
  const type = articleType(entry.path);
  return `Create ${entry.path} as this run's only primary article.

Follow AGENTS.md, CONTRIBUTING.md, ${type.template}, and every repository
editorial guide. Treat this as a ${type.kind} article. The specific pilot goal
is: ${entry.brief}

Research authoritative sources directly using live web search. Prefer primary
scientific, official, and regulatory material where appropriate, supported by
high-quality specialist reference works. Never cite a search result, snippet,
or AI summary as evidence. List only sources actually consulted.

Write a concise explanatory article for an interested non-expert that remains
useful to knowledgeable readers. Qualify disputed history, legal or regulatory
claims, and variable wine character where relevant. Avoid promotional language,
false precision, rigid qualitative rankings, and tasting-note lists.

Default to roughly 700–1,200 words and three to six principal sources. Treat
these as soft depth budgets, not hard limits. Prefer synthesis and omission of
secondary detail to exhaustive coverage; use isolated studies when they resolve
a particular claim rather than as a citation target for every paragraph.

Do not create or edit any other article, the shared bibliography, project
guides, templates, queue, validator, or configuration. Link only to canonical
articles that already exist. Mention desirable missing pages as unlinked prose
and report them in the final handoff rather than creating placeholders.

Run npm run check, inspect the final Git diff, and do not commit. In the final
message, summarize the article, principal sources consulted, checks performed,
and worthwhile follow-up topics.`;
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function nextEntry(queue, kind = null) {
  for (const entry of queue) {
    if (kind !== null && articleType(entry.path).kind !== kind) continue;
    if (!(await pathExists(entry.path))) return entry;
  }
  return null;
}

function parseArguments(arguments_) {
  let dryRun = false;
  let kind = null;
  let model = DEFAULT_MODEL;
  let reasoningEffort = DEFAULT_REASONING_EFFORT;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--kind") {
      kind = arguments_[index + 1];
      if (kind === undefined) throw new Error("--kind requires a value.");
      if (!kinds.has(kind)) {
        throw new Error(`Unknown article kind: ${kind}. Use grape, region, style, or concept.`);
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
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return { dryRun, kind, model, reasoningEffort };
}

async function readQueue() {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(queuePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read tasks/article-queue.json: ${error.message}`);
  }
  return validateQueue(parsed);
}

async function worktreeChanges() {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: repositoryRoot }
  );
  return stdout.trimEnd().split("\n").filter(Boolean);
}

function changedPath(statusLine) {
  const value = statusLine.slice(3);
  const renameSeparator = value.lastIndexOf(" -> ");
  return renameSeparator === -1 ? value : value.slice(renameSeparator + 4);
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
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

async function main() {
  const { dryRun, kind, model, reasoningEffort } = parseArguments(process.argv.slice(2));

  const queue = await readQueue();
  const entry = await nextEntry(queue, kind);
  if (entry === null) {
    console.log(kind === null ? "Article queue is complete." : `No incomplete ${kind} articles in queue.`);
    return;
  }

  const prompt = formatPrompt(entry);
  if (dryRun) {
    console.log(`Next article: ${entry.title} (${entry.path})`);
    console.log("\nCommand:\n");
    console.log(
      `codex --search --ask-for-approval never exec --model ${model} -c 'model_reasoning_effort="${reasoningEffort}"' --ephemeral --sandbox workspace-write --cd <repository> -`
    );
    console.log("\nPrompt:\n");
    console.log(prompt);
    return;
  }

  const initialChanges = await worktreeChanges();
  if (initialChanges.length > 0) {
    throw new Error(
      "Refusing to start an article run with a dirty worktree. Review and commit or stash existing changes first."
    );
  }

  console.log(`Starting fresh Codex run for ${entry.title} (${entry.path})...`);
  await run(
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
      repositoryRoot,
      "-",
    ],
    { input: prompt }
  );

  if (!(await pathExists(entry.path))) {
    throw new Error(`Codex completed without creating ${entry.path}.`);
  }

  const finalChanges = await worktreeChanges();
  const unexpectedChanges = finalChanges.filter(
    (statusLine) => changedPath(statusLine) !== entry.path
  );
  if (unexpectedChanges.length > 0) {
    throw new Error(
      `Codex changed files outside the queued article:\n${unexpectedChanges.join("\n")}\nReview the worktree manually; no changes were reverted.`
    );
  }

  await run("npm", ["run", "check"]);
  console.log(`\n${entry.title} is ready for human review.`);
  console.log(`Review ${entry.path}, verify its sources, and commit it before running the next queue item.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    await main();
  } catch (error) {
    console.error(`Article queue stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
