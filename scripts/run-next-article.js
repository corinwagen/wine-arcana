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
  return `Create ${entry.path} as this run's only primary article.

Follow AGENTS.md, CONTRIBUTING.md, the grape template, and every repository
editorial guide. The specific pilot goal is: ${entry.brief}

Research authoritative sources directly using live web search. Prefer primary
scientific, official, and regulatory material where appropriate, supported by
high-quality specialist reference works. Never cite a search result, snippet,
or AI summary as evidence. List only sources actually consulted.

Write a concise explanatory article for an interested non-expert that remains
useful to knowledgeable readers. Qualify disputed history and variable wine
character. Avoid promotional language, false precision, rigid qualitative
rankings, and tasting-note lists.

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

async function nextEntry(queue) {
  for (const entry of queue) {
    if (!(await pathExists(entry.path))) return entry;
  }
  return null;
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
  const dryRun = process.argv.includes("--dry-run");
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== "--dry-run");
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown argument: ${unknownArguments[0]}`);
  }

  const queue = await readQueue();
  const entry = await nextEntry(queue);
  if (entry === null) {
    console.log("Article queue is complete.");
    return;
  }

  const prompt = formatPrompt(entry);
  if (dryRun) {
    console.log(`Next article: ${entry.title} (${entry.path})`);
    console.log("\nCommand:\n");
    console.log(
      "codex --search --ask-for-approval never exec --ephemeral --sandbox workspace-write --cd <repository> -"
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

