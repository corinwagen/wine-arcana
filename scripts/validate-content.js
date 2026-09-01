#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";
import { parseDocument } from "yaml";

const ENTITY_TYPES = new Set(["grapes", "regions", "styles", "concepts"]);
const FRONTMATTER_KEYS = new Set(["title", "aliases"]);
const FILENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

function diagnostic(severity, code, file, line, message) {
  return { severity, code, file, line, message };
}

function normalizeName(value) {
  return value.normalize("NFKC").toLowerCase();
}

function normalizeDisplay(value) {
  return value.normalize("NFKC");
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function lineForField(lines, field) {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedField}\\s*:`);
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? 1 : index + 1;
}

function extractFrontmatter(source, relativePath, diagnostics) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (lines[0] !== "---") {
    diagnostics.push(
      diagnostic(
        "error",
        "frontmatter.missing",
        relativePath,
        1,
        "Article must begin with YAML frontmatter delimited by ---."
      )
    );
    return { data: null, body: source, bodyStartLine: 1, lines };
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    diagnostics.push(
      diagnostic(
        "error",
        "frontmatter.unclosed",
        relativePath,
        1,
        "YAML frontmatter has no closing --- delimiter."
      )
    );
    return { data: null, body: "", bodyStartLine: lines.length + 1, lines };
  }

  const yamlSource = lines.slice(1, closingIndex).join("\n");
  const document = parseDocument(yamlSource, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    for (const error of document.errors) {
      diagnostics.push(
        diagnostic(
          "error",
          "frontmatter.invalid",
          relativePath,
          1,
          error.message.replace(/\n/g, " ")
        )
      );
    }
    return {
      data: null,
      body: lines.slice(closingIndex + 1).join("\n"),
      bodyStartLine: closingIndex + 2,
      lines,
    };
  }

  let data;
  try {
    data = document.toJS();
  } catch (error) {
    diagnostics.push(
      diagnostic(
        "error",
        "frontmatter.invalid",
        relativePath,
        1,
        `Could not read YAML frontmatter: ${error.message}`
      )
    );
    data = null;
  }

  if (data === null || Array.isArray(data) || typeof data !== "object") {
    diagnostics.push(
      diagnostic(
        "error",
        "frontmatter.mapping",
        relativePath,
        1,
        "Frontmatter must be a YAML mapping."
      )
    );
    data = null;
  }

  return {
    data,
    body: lines.slice(closingIndex + 1).join("\n"),
    bodyStartLine: closingIndex + 2,
    lines,
  };
}

function validateFrontmatter(frontmatter, relativePath, diagnostics) {
  const { data, lines } = frontmatter;
  if (data === null) {
    return { title: null, aliases: [] };
  }

  for (const key of Object.keys(data)) {
    if (!FRONTMATTER_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          "error",
          "frontmatter.unexpected-key",
          relativePath,
          lineForField(lines, key),
          `Unexpected frontmatter key "${key}"; only title and aliases are allowed.`
        )
      );
    }
  }

  let title = null;
  if (typeof data.title !== "string" || data.title.trim() === "") {
    diagnostics.push(
      diagnostic(
        "error",
        "title.invalid",
        relativePath,
        lineForField(lines, "title"),
        "Frontmatter title must be a nonempty string."
      )
    );
  } else if (data.title !== data.title.trim()) {
    diagnostics.push(
      diagnostic(
        "error",
        "title.whitespace",
        relativePath,
        lineForField(lines, "title"),
        "Frontmatter title must not have leading or trailing whitespace."
      )
    );
    title = data.title.trim();
  } else {
    title = data.title;
  }

  let aliases = [];
  if (Object.hasOwn(data, "aliases")) {
    if (!Array.isArray(data.aliases)) {
      diagnostics.push(
        diagnostic(
          "error",
          "aliases.invalid",
          relativePath,
          lineForField(lines, "aliases"),
          "Frontmatter aliases must be a YAML list of nonempty strings."
        )
      );
    } else {
      const seen = new Set();
      for (const alias of data.aliases) {
        if (typeof alias !== "string" || alias.trim() === "") {
          diagnostics.push(
            diagnostic(
              "error",
              "aliases.invalid",
              relativePath,
              lineForField(lines, "aliases"),
              "Every alias must be a nonempty string."
            )
          );
          continue;
        }

        if (alias !== alias.trim()) {
          diagnostics.push(
            diagnostic(
              "error",
              "aliases.whitespace",
              relativePath,
              lineForField(lines, "aliases"),
              `Alias "${alias}" must not have leading or trailing whitespace.`
            )
          );
        }

        const cleanAlias = alias.trim();
        const normalized = normalizeName(cleanAlias);
        if (seen.has(normalized)) {
          diagnostics.push(
            diagnostic(
              "error",
              "aliases.duplicate",
              relativePath,
              lineForField(lines, "aliases"),
              `Alias "${cleanAlias}" is duplicated after Unicode and case normalization.`
            )
          );
          continue;
        }
        seen.add(normalized);
        aliases.push(cleanAlias);
      }
    }
  }

  if (title !== null) {
    const normalizedTitle = normalizeName(title);
    for (const alias of aliases) {
      if (normalizeName(alias) === normalizedTitle) {
        diagnostics.push(
          diagnostic(
            "error",
            "aliases.matches-title",
            relativePath,
            lineForField(lines, "aliases"),
            `Alias "${alias}" repeats the canonical title after normalization.`
          )
        );
      }
    }
  }

  return { title, aliases };
}

function validateHeadingsAndSources(tokens, article, diagnostics) {
  const headings = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const inline = tokens[index + 1];
    headings.push({
      level: Number(token.tag.slice(1)),
      text: inline?.type === "inline" ? inline.content.trim() : "",
      tokenIndex: index,
      line: article.bodyStartLine + (token.map?.[0] ?? 0),
    });
  }

  const levelOne = headings.filter((heading) => heading.level === 1);
  if (levelOne.length !== 1) {
    diagnostics.push(
      diagnostic(
        "error",
        "heading.h1-count",
        article.displayPath,
        levelOne[0]?.line ?? article.bodyStartLine,
        `Article must contain exactly one level-one heading; found ${levelOne.length}.`
      )
    );
  } else if (
    article.title !== null &&
    normalizeDisplay(levelOne[0].text) !== normalizeDisplay(article.title)
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "heading.title-mismatch",
        article.displayPath,
        levelOne[0].line,
        `Level-one heading "${levelOne[0].text}" does not match title "${article.title}".`
      )
    );
  }

  const sourceHeadings = headings.filter(
    (heading) => heading.level === 2 && normalizeDisplay(heading.text) === "Sources"
  );

  if (sourceHeadings.length === 0) {
    diagnostics.push(
      diagnostic(
        "error",
        "sources.missing",
        article.displayPath,
        article.bodyStartLine,
        "Article must end with a ## Sources section."
      )
    );
    return;
  }

  if (sourceHeadings.length > 1) {
    diagnostics.push(
      diagnostic(
        "error",
        "sources.multiple",
        article.displayPath,
        sourceHeadings[1].line,
        "Article contains more than one ## Sources section."
      )
    );
  }

  const sources = sourceHeadings.at(-1);
  const laterTopLevelHeading = headings.find(
    (heading) =>
      heading.tokenIndex > sources.tokenIndex && heading.level <= sources.level
  );
  if (laterTopLevelHeading !== undefined) {
    diagnostics.push(
      diagnostic(
        "error",
        "sources.not-final",
        article.displayPath,
        laterTopLevelHeading.line,
        "## Sources must be the final level-two section."
      )
    );
  }

  const hasContent = tokens
    .slice(sources.tokenIndex + 3)
    .some(
      (token) =>
        (token.type === "inline" || token.type === "fence" || token.type === "code_block") &&
        token.content.trim() !== ""
    );
  if (!hasContent) {
    diagnostics.push(
      diagnostic(
        "error",
        "sources.empty",
        article.displayPath,
        sources.line,
        "## Sources must contain at least one source."
      )
    );
  }
}

function collectLinks(tokens, article) {
  const links = [];
  for (const token of tokens) {
    if (token.type !== "inline" || token.children === null) continue;
    for (const child of token.children) {
      if (child.type !== "link_open") continue;
      links.push({
        href: child.attrGet("href"),
        line: article.bodyStartLine + (token.map?.[0] ?? 0),
      });
    }
  }
  return links;
}

function validateLink(link, article, contentRoot, articlePaths, diagnostics) {
  const href = link.href;
  if (href === null || href === "") return;

  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    return;
  }

  const hashIndex = href.indexOf("#");
  if (hashIndex !== -1) {
    diagnostics.push(
      diagnostic(
        "warning",
        "link.fragment",
        article.displayPath,
        link.line,
        `Link "${href}" uses a heading fragment; prefer linking to the whole article.`
      )
    );
  }

  if (href.startsWith("#")) return;

  if (href.startsWith("/")) {
    diagnostics.push(
      diagnostic(
        "error",
        "link.absolute",
        article.displayPath,
        link.line,
        `Internal link "${href}" must be relative.`
      )
    );
    return;
  }

  const encodedPath = href.split(/[?#]/, 1)[0];
  if (encodedPath === "") return;

  let linkPath;
  try {
    linkPath = decodeURIComponent(encodedPath);
  } catch {
    diagnostics.push(
      diagnostic(
        "error",
        "link.encoding",
        article.displayPath,
        link.line,
        `Link "${href}" contains invalid URL encoding.`
      )
    );
    return;
  }

  if (path.posix.extname(linkPath) !== ".md") {
    diagnostics.push(
      diagnostic(
        "error",
        "link.non-markdown",
        article.displayPath,
        link.line,
        `Relative link "${href}" must target a Markdown article.`
      )
    );
    return;
  }

  const sourceDirectory = path.dirname(path.join(contentRoot, article.relativePath));
  const absoluteTarget = path.resolve(sourceDirectory, linkPath);
  const relativeTarget = path.relative(contentRoot, absoluteTarget);
  if (relativeTarget.startsWith(`..${path.sep}`) || relativeTarget === ".." || path.isAbsolute(relativeTarget)) {
    diagnostics.push(
      diagnostic(
        "error",
        "link.escapes-content",
        article.displayPath,
        link.line,
        `Internal link "${href}" escapes the content directory.`
      )
    );
    return;
  }

  const target = toPosix(relativeTarget);
  if (!articlePaths.has(target)) {
    diagnostics.push(
      diagnostic(
        "error",
        "link.broken",
        article.displayPath,
        link.line,
        `Internal link "${href}" does not resolve to an article.`
      )
    );
  }
}

async function walkMarkdown(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkMarkdown(absolute)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolute);
    }
  }
  return files;
}

function indexNames(articles, diagnostics) {
  const titlesByType = new Map();
  const namesByType = new Map();
  const namesAcrossTypes = new Map();

  for (const article of articles) {
    if (article.title === null) continue;
    const claims = [
      { value: article.title, role: "title" },
      ...article.aliases.map((value) => ({ value, role: "alias" })),
    ];

    const titleKey = `${article.entity}\0${normalizeName(article.title)}`;
    const titleEntries = titlesByType.get(titleKey) ?? [];
    titleEntries.push(article);
    titlesByType.set(titleKey, titleEntries);

    for (const claim of claims) {
      const normalized = normalizeName(claim.value);
      const typedKey = `${article.entity}\0${normalized}`;
      const entry = { ...claim, article };

      const typedEntries = namesByType.get(typedKey) ?? [];
      typedEntries.push(entry);
      namesByType.set(typedKey, typedEntries);

      const globalEntries = namesAcrossTypes.get(normalized) ?? [];
      globalEntries.push(entry);
      namesAcrossTypes.set(normalized, globalEntries);
    }
  }

  for (const entries of titlesByType.values()) {
    const files = new Set(entries.map((article) => article.displayPath));
    if (files.size < 2) continue;
    const sortedFiles = [...files].sort();
    for (const article of entries) {
      diagnostics.push(
        diagnostic(
          "error",
          "title.duplicate",
          article.displayPath,
          article.titleLine,
          `Canonical title "${article.title}" is also used by ${sortedFiles.filter((file) => file !== article.displayPath).join(", ")}.`
        )
      );
    }
  }

  for (const entries of namesByType.values()) {
    const articlesForName = new Map(
      entries.map((entry) => [entry.article.displayPath, entry.article])
    );
    if (articlesForName.size < 2) continue;
    if (entries.every((entry) => entry.role === "title")) continue;

    const files = [...articlesForName.keys()].sort();
    for (const entry of entries) {
      diagnostics.push(
        diagnostic(
          "error",
          "name.collision",
          entry.article.displayPath,
          entry.role === "title" ? entry.article.titleLine : entry.article.aliasesLine,
          `Name "${entry.value}" collides within ${entry.article.entity} with ${files.filter((file) => file !== entry.article.displayPath).join(", ")}.`
        )
      );
    }
  }

  for (const entries of namesAcrossTypes.values()) {
    const articlesForName = new Map(
      entries.map((entry) => [entry.article.displayPath, entry.article])
    );
    const entityTypes = new Set(
      [...articlesForName.values()].map((article) => article.entity)
    );
    if (articlesForName.size < 2 || entityTypes.size < 2) continue;

    const files = [...articlesForName.keys()].sort();
    for (const entry of entries) {
      diagnostics.push(
        diagnostic(
          "warning",
          "name.cross-type-collision",
          entry.article.displayPath,
          entry.role === "title" ? entry.article.titleLine : entry.article.aliasesLine,
          `Name "${entry.value}" is also used by another entity type: ${files.filter((file) => file !== entry.article.displayPath).join(", ")}.`
        )
      );
    }
  }
}

export async function validateCorpus({ rootDir = process.cwd() } = {}) {
  const absoluteRoot = path.resolve(rootDir);
  const contentRoot = path.join(absoluteRoot, "content");
  const diagnostics = [];

  let allMarkdown;
  try {
    allMarkdown = await walkMarkdown(contentRoot);
  } catch (error) {
    if (error.code === "ENOENT") {
      diagnostics.push(
        diagnostic(
          "error",
          "content.missing",
          "content",
          1,
          "Content directory does not exist."
        )
      );
      return { articleCount: 0, diagnostics };
    }
    throw error;
  }

  for (const entity of [...ENTITY_TYPES].sort()) {
    try {
      const stat = await fs.stat(path.join(contentRoot, entity));
      if (!stat.isDirectory()) throw new Error("not a directory");
    } catch {
      diagnostics.push(
        diagnostic(
          "error",
          "content.missing-entity-directory",
          `content/${entity}`,
          1,
          `Required entity directory content/${entity} does not exist.`
        )
      );
    }
  }

  const articles = [];
  for (const absolutePath of allMarkdown.sort()) {
    const relativePath = toPosix(path.relative(contentRoot, absolutePath));
    const parts = relativePath.split("/");
    if (parts.length !== 2 || !ENTITY_TYPES.has(parts[0])) {
      diagnostics.push(
        diagnostic(
          "error",
          "path.invalid-entity",
          `content/${relativePath}`,
          1,
          "Articles must be Markdown files directly inside a recognized entity directory."
        )
      );
      continue;
    }

    const [entity, filename] = parts;
    if (!FILENAME_PATTERN.test(filename)) {
      diagnostics.push(
        diagnostic(
          "error",
          "filename.invalid",
          `content/${relativePath}`,
          1,
          "Article filename must be lowercase ASCII kebab-case ending in .md."
        )
      );
    }

    const source = await fs.readFile(absolutePath, "utf8");
    const articlePath = `content/${relativePath}`;
    const frontmatter = extractFrontmatter(source, articlePath, diagnostics);
    const { title, aliases } = validateFrontmatter(frontmatter, articlePath, diagnostics);
    const article = {
      absolutePath,
      aliases,
      aliasesLine: lineForField(frontmatter.lines, "aliases"),
      bodyStartLine: frontmatter.bodyStartLine,
      displayPath: articlePath,
      entity,
      relativePath,
      title,
      titleLine: lineForField(frontmatter.lines, "title"),
    };

    let tokens = [];
    try {
      tokens = markdown.parse(frontmatter.body, {});
    } catch (error) {
      diagnostics.push(
        diagnostic(
          "error",
          "markdown.invalid",
          articlePath,
          frontmatter.bodyStartLine,
          `Markdown could not be parsed: ${error.message}`
        )
      );
    }

    validateHeadingsAndSources(tokens, article, diagnostics);
    article.links = collectLinks(tokens, article);
    articles.push(article);
  }

  indexNames(articles, diagnostics);

  const articlePaths = new Set(articles.map((article) => article.relativePath));
  for (const article of articles) {
    for (const link of article.links) {
      validateLink(link, article, contentRoot, articlePaths, diagnostics);
    }
  }

  diagnostics.sort((left, right) => {
    const fileOrder = left.file.localeCompare(right.file);
    if (fileOrder !== 0) return fileOrder;
    if (left.line !== right.line) return left.line - right.line;
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    return left.code.localeCompare(right.code);
  });

  return { articleCount: articles.length, diagnostics };
}

export function formatDiagnostic(item) {
  const label = item.severity === "error" ? "ERROR" : "REVIEW";
  return `${label} ${item.file}:${item.line} [${item.code}] ${item.message}`;
}

async function main() {
  const rootDir = process.argv[2] ?? process.cwd();
  const result = await validateCorpus({ rootDir });
  for (const item of result.diagnostics) {
    console.log(formatDiagnostic(item));
  }

  const errors = result.diagnostics.filter((item) => item.severity === "error").length;
  const warnings = result.diagnostics.length - errors;
  const articleLabel = result.articleCount === 1 ? "article" : "articles";
  const warningLabel = warnings === 1 ? "review diagnostic" : "review diagnostics";

  if (errors === 0) {
    console.log(
      `Content validation passed: ${result.articleCount} ${articleLabel}, ${warnings} ${warningLabel}.`
    );
    return;
  }

  console.log(
    `Content validation failed: ${result.articleCount} ${articleLabel}, ${errors} errors, ${warnings} ${warningLabel}.`
  );
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  await main();
}
