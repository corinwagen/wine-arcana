#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";

const markdown = new MarkdownIt().use(footnote);

export function externalUrls(source) {
  const urls = new Set();
  for (const token of markdown.parse(source, {})) {
    for (const child of token.children ?? []) {
      if (child.type !== "link_open") continue;
      const href = child.attrGet("href");
      if (!/^https?:\/\//i.test(href ?? "")) continue;
      const url = new URL(href);
      url.hash = "";
      urls.add(url.href);
    }
  }
  return [...urls];
}

export async function checkSource(url, { fetchUrl = fetch, timeoutMs = 10000 } = {}) {
  try {
    const request = async (method) => {
      const response = await fetchUrl(url, {
        method, redirect: "follow", signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "WineArcana-Source-Check/1.0" },
      });
      await response.body?.cancel();
      return response;
    };
    let response = await request("HEAD");
    if ([403, 405, 501].includes(response.status)) response = await request("GET");
    return { url, status: response.status,
      result: response.ok ? "OK" : [404, 410].includes(response.status) ? "MISSING" : "REVIEW",
      destination: response.url || url };
  } catch (error) {
    return { url, result: "REVIEW", error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  let limit = 50;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help") {
      console.log("Usage: npm run sources:check -- [--limit N] [content/path.md ...]\nChecks up to 50 unique external URLs by default, two at a time. Read-only and separate from offline validation. HTTP success does not verify claims; access blocks and transient errors need review.");
      return;
    }
    if (args[i] === "--limit") {
      limit = Number(args[++i]);
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit requires a positive integer");
    } else if (args[i].startsWith("-")) throw new Error(`Unknown option: ${args[i]}`);
    else paths.push(args[i]);
  }
  if (!paths.length) {
    for (const kind of ["concepts", "grapes", "regions", "styles"]) {
      for (const name of (await fs.readdir(`content/${kind}`)).sort()) {
        if (name.endsWith(".md")) paths.push(`content/${kind}/${name}`);
      }
    }
  }
  const occurrences = new Map();
  for (const filename of paths) {
    const source = await fs.readFile(filename, "utf8");
    for (const url of externalUrls(source)) {
      if (!occurrences.has(url)) occurrences.set(url, new Set());
      occurrences.get(url).add(path.normalize(filename));
    }
  }
  const urls = [...occurrences.keys()].slice(0, limit);
  const results = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      results[i] = await checkSource(urls[i]);
    }
  }
  await Promise.all([worker(), worker()]);
  for (const result of results) {
    console.log(`${result.result} ${result.status ?? result.error} ${result.url}`);
    if (result.destination && result.destination !== result.url) console.log(`  redirects to ${result.destination}`);
    if (result.result !== "OK") console.log(`  ${[...occurrences.get(result.url)].join(", ")}`);
  }
  console.log(`Checked ${results.length} of ${occurrences.size} unique URLs; ${results.filter((r) => r.result === "MISSING").length} missing, ${results.filter((r) => r.result === "REVIEW").length} requiring review.`);
  if (results.some((r) => r.result === "MISSING")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
