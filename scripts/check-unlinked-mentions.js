#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { parse } from "yaml";

const markdown = new MarkdownIt().use(footnote);
const kinds = ["grapes", "regions", "styles", "concepts"];
const normalize = (value) => value.normalize("NFKC").toLowerCase();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const posix = (value) => value.split(path.sep).join("/");

// Advisory only: matches prose names, not semantic relationships.
export async function findUnlinkedMentions({ rootDir = process.cwd(), targets = [] } = {}) {
  const articles = [];
  for (const kind of kinds) {
    const directory = path.join(rootDir, "content", kind);
    for (const file of (await fs.readdir(directory)).filter((name) => name.endsWith(".md")).sort()) {
      const articlePath = `content/${kind}/${file}`;
      const source = await fs.readFile(path.join(rootDir, articlePath), "utf8");
      const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
      const end = lines.findIndex((line, index) => index > 0 && line === "---");
      if (lines[0] !== "---" || end < 0) throw new Error(`Invalid frontmatter: ${articlePath}`);
      const { title, aliases = [] } = parse(lines.slice(1, end).join("\n"));
      if (typeof title !== "string" || !Array.isArray(aliases) || aliases.some((name) => typeof name !== "string")) {
        throw new Error(`Invalid title or aliases: ${articlePath}`);
      }
      articles.push({ path: articlePath, names: [title, ...aliases], offset: end + 2,
        tokens: markdown.parse(lines.slice(end + 1).join("\n"), {}) });
    }
  }

  const knownPaths = new Set(articles.map((article) => article.path));
  const selected = new Set(targets.map((target) => posix(path.relative(rootDir, path.resolve(rootDir, target)))));
  for (const target of selected) {
    if (!knownPaths.has(target)) throw new Error(`Unknown article target: ${target}`);
  }

  // Keep collisions in the index even when filtering targets; never guess which
  // entity an ambiguous name (for example Hermitage) means.
  const names = new Map();
  for (const article of articles) {
    for (const name of article.names) {
      const key = normalize(name);
      if (!key.trim()) continue;
      if (!names.has(key)) names.set(key, new Set());
      names.get(key).add(article.path);
    }
  }
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!alternatives.length) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${alternatives.map(escape).join("|")})(?![\\p{L}\\p{N}_])`, "giu");
  const suggestions = [];
  for (const article of articles) {
    const linked = new Set([article.path]);
    for (const token of article.tokens) {
      for (const child of token.children ?? []) {
        if (child.type !== "link_open") continue;
        const href = child.attrGet("href") ?? "";
        if (/^[a-z][a-z\d+.-]*:/i.test(href)) continue;
        linked.add(posix(path.normalize(path.join(path.dirname(article.path), decodeURI(href.split(/[?#]/)[0])))));
      }
    }
    let inFootnotes = false;
    for (let i = 0; i < article.tokens.length; i++) {
      const token = article.tokens[i];
      if (token.type === "footnote_block_open") inFootnotes = true;
      if (token.type === "heading_open" && article.tokens[i + 1]?.content === "Sources") break;
      if (inFootnotes || token.type !== "inline" || article.tokens[i - 1]?.type === "heading_open") continue;
      let depth = 0;
      let prose = "";
      for (const child of token.children ?? []) {
        if (child.type === "link_open") { depth++; prose += "\u0000"; }
        else if (child.type === "link_close") { depth--; prose += "\u0000"; }
        else if (!depth && child.type === "text") prose += child.content;
        else if (!depth && ["softbreak", "hardbreak"].includes(child.type)) prose += " ";
        else if (!depth && !["em_open", "em_close", "strong_open", "strong_close"].includes(child.type)) prose += "\u0000";
      }
      for (const match of normalize(prose).matchAll(pattern)) {
        const destinations = names.get(match[0]);
        if (destinations.size !== 1) continue;
        const [target] = destinations;
        if (linked.has(target) || (selected.size && !selected.has(target))) continue;
        linked.add(target); // One suggestion per source/target pair.
        suggestions.push({ source: article.path, line: article.offset + (token.map?.[0] ?? 0),
          mention: match[0], target,
          href: posix(path.relative(path.dirname(article.path), target)),
          context: token.content.replace(/\s+/g, " ").trim() });
      }
    }
  }
  return suggestions.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.target.localeCompare(b.target));
}

async function main() {
  const targets = process.argv.slice(2);
  if (targets.includes("--help")) {
    console.log("Usage: npm run links:check -- [content/grapes/example.md ...]\nScans all pages for unlinked titles/aliases; optional paths restrict destinations.\nLocations identify paragraph starts. Review suggestions in context; no files are changed.");
    return;
  }
  if (targets.some((target) => target.startsWith("-"))) throw new Error("Unknown option; use --help.");
  const suggestions = await findUnlinkedMentions({ targets });
  for (const item of suggestions) {
    console.log(`${item.source}:${item.line}: ${item.mention} -> ${item.href}\n  ${item.context}`);
  }
  console.log(`${suggestions.length} candidate links. Review in context; ambiguous names and already-linked destinations are skipped.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
