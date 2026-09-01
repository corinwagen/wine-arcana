#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { parseDocument } from "yaml";

import { formatDiagnostic, validateCorpus } from "./validate-content.js";

const ENTITY_TYPES = [
  { directory: "grapes", label: "Grapes", singular: "Grape" },
  { directory: "regions", label: "Regions", singular: "Region" },
  { directory: "styles", label: "Styles", singular: "Style" },
  { directory: "concepts", label: "Concepts", singular: "Concept" },
];
const REPOSITORY_URL = "https://github.com/corinwagen/wine-arcana";
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isExternalHref(href) {
  return href.startsWith("#") || href.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(href);
}

function routeHref(outputPath, targetRoute) {
  const currentDirectory = path.posix.dirname(outputPath);
  const relative = path.posix.relative(currentDirectory, targetRoute || ".");
  return relative === "" || relative === "." ? "./" : `${relative}/`;
}

function fileHref(outputPath, targetPath) {
  const relative = path.posix.relative(path.posix.dirname(outputPath), targetPath);
  return relative || path.posix.basename(targetPath);
}

function slugifyHeading(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "");
  return slug || "section";
}

function extractFrontmatter(source, sourcePath) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0] !== "---") {
    throw new Error(`${sourcePath}: missing YAML frontmatter`);
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closingIndex === -1) {
    throw new Error(`${sourcePath}: unclosed YAML frontmatter`);
  }

  const document = parseDocument(lines.slice(1, closingIndex).join("\n"), {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`${sourcePath}: ${document.errors[0].message.replace(/\n/g, " ")}`);
  }

  const data = document.toJS();
  return {
    aliases: Array.isArray(data.aliases) ? data.aliases : [],
    body: lines.slice(closingIndex + 1).join("\n"),
    title: data.title,
  };
}

function makeMarkdown(articleBySourcePath) {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false }).use(footnote);
  const defaultLinkOpen =
    markdown.renderer.rules.link_open ??
    ((tokens, index, options, _environment, renderer) =>
      renderer.renderToken(tokens, index, options));

  markdown.renderer.rules.link_open = (tokens, index, options, environment, renderer) => {
    const token = tokens[index];
    const hrefIndex = token.attrIndex("href");
    if (hrefIndex >= 0) {
      const href = token.attrs[hrefIndex][1];
      if (!isExternalHref(href)) {
        const fragmentIndex = href.indexOf("#");
        const markdownPath = fragmentIndex === -1 ? href : href.slice(0, fragmentIndex);
        const fragment = fragmentIndex === -1 ? "" : href.slice(fragmentIndex);
        const targetSourcePath = path.posix.normalize(
          path.posix.join(path.posix.dirname(environment.article.sourcePath), markdownPath)
        );
        const target = articleBySourcePath.get(targetSourcePath);
        if (!target) {
          throw new Error(`${environment.article.sourcePath}: unresolved article link ${href}`);
        }
        token.attrs[hrefIndex][1] = `${routeHref(environment.article.outputPath, target.route)}${fragment}`;
      }
    }
    return defaultLinkOpen(tokens, index, options, environment, renderer);
  };

  return markdown;
}

function renderMarkdown(markdown, body, environment) {
  const tokens = markdown.parse(body, environment);
  const headingCounts = new Map();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "heading_open") continue;
    const inline = tokens[index + 1];
    const baseSlug = slugifyHeading(inline?.content ?? "section");
    const count = (headingCounts.get(baseSlug) ?? 0) + 1;
    headingCounts.set(baseSlug, count);
    token.attrSet("id", count === 1 ? baseSlug : `${baseSlug}-${count}`);
    if (inline?.content.trim().toLowerCase() === "sources") {
      token.attrJoin("class", "sources-heading");
    }
  }

  return markdown.renderer.render(tokens, markdown.options, environment);
}

function navigation(outputPath, currentSection = "") {
  const links = ENTITY_TYPES.map(({ directory, label }) => {
    const current = currentSection === directory ? ' aria-current="page"' : "";
    return `<a href="${routeHref(outputPath, directory)}"${current}>${label}</a>`;
  });
  const aboutCurrent = currentSection === "about" ? ' aria-current="page"' : "";
  links.push(`<a href="${routeHref(outputPath, "about")}"${aboutCurrent}>About</a>`);

  return `<header class="site-header">
  <a class="site-name" href="${routeHref(outputPath, "")}">Wine Arcana</a>
  <nav aria-label="Primary">${links.join("<span aria-hidden=\"true\"> · </span>")}</nav>
</header>`;
}

function pageTemplate({ body, currentSection = "", description, outputPath, title }) {
  const documentTitle = title === "Wine Arcana" ? title : `${title} · Wine Arcana`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(documentTitle)}</title>
  <link rel="stylesheet" href="${fileHref(outputPath, "style.css")}">
</head>
<body>
${navigation(outputPath, currentSection)}
<main>
${body}
</main>
</body>
</html>
`;
}

function initialFor(title) {
  return [...title.normalize("NFKD").replace(/\p{Mark}/gu, "")][0]?.toUpperCase() ?? "#";
}

function articleIndex(articles, outputPath) {
  const groups = new Map();
  for (const article of [...articles].sort((left, right) => collator.compare(left.title, right.title))) {
    const initial = initialFor(article.title);
    const group = groups.get(initial) ?? [];
    group.push(article);
    groups.set(initial, group);
  }

  return [...groups]
    .map(
      ([initial, group]) => `<div class="letter-group">
  <h3>${escapeHtml(initial)}</h3>
  <ul class="article-index">
${group
  .map((article) => {
    const aliases = article.aliases.length
      ? ` <span class="index-aliases">— ${escapeHtml(article.aliases.join(", "))}</span>`
      : "";
    return `    <li><a href="${routeHref(outputPath, article.route)}">${escapeHtml(article.title)}</a>${aliases}</li>`;
  })
  .join("\n")}
  </ul>
</div>`
    )
    .join("\n");
}

function renderArticlePage(article, markdown, repositoryUrl) {
  let rendered = renderMarkdown(markdown, article.body, { article });
  if (article.aliases.length > 0) {
    const aliasMarkup = `<p class="aliases"><span>Also known as</span> ${escapeHtml(
      article.aliases.join(", ")
    )}</p>`;
    rendered = rendered.replace("</h1>", `</h1>\n${aliasMarkup}`);
  }

  const editUrl = `${repositoryUrl}/edit/main/${encodeURI(article.sourcePath)}`;
  const body = `<article class="article">
  <p class="section-label"><a href="${routeHref(article.outputPath, article.entity)}">${escapeHtml(article.type.singular)}</a></p>
${rendered}
</article>
<footer class="article-footer">
  <a href="${routeHref(article.outputPath, article.entity)}">← All ${article.type.label.toLowerCase()}</a>
  <a href="${editUrl}">Edit this page on GitHub</a>
</footer>`;

  return pageTemplate({
    body,
    currentSection: article.entity,
    description: `${article.title}, from Wine Arcana, a small encyclopedia of wine.`,
    outputPath: article.outputPath,
    title: article.title,
  });
}

async function readArticles(rootDir) {
  const articles = [];
  for (const type of ENTITY_TYPES) {
    const directory = path.join(rootDir, "content", type.directory);
    const filenames = (await fs.readdir(directory)).filter((filename) => filename.endsWith(".md"));
    for (const filename of filenames) {
      const sourcePath = path.posix.join("content", type.directory, filename);
      const source = await fs.readFile(path.join(rootDir, sourcePath), "utf8");
      const frontmatter = extractFrontmatter(source, sourcePath);
      const slug = filename.slice(0, -3);
      articles.push({
        ...frontmatter,
        entity: type.directory,
        outputPath: path.posix.join(type.directory, slug, "index.html"),
        route: path.posix.join(type.directory, slug),
        slug,
        sourcePath,
        type,
      });
    }
  }
  return articles;
}

async function writeOutput(rootDir, outputDir, relativePath, contents) {
  const absolutePath = path.join(outputDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, contents);
  return toPosix(path.relative(rootDir, absolutePath));
}

function assertSafeOutputDirectory(rootDir, outputDir) {
  const relative = path.relative(rootDir, outputDir);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The site output directory must be a child of the repository root.");
  }
}

export async function buildSite({
  rootDir = process.cwd(),
  outputDir = path.join(rootDir, "public"),
  repositoryUrl = REPOSITORY_URL,
} = {}) {
  rootDir = path.resolve(rootDir);
  outputDir = path.resolve(outputDir);
  assertSafeOutputDirectory(rootDir, outputDir);

  const validation = await validateCorpus({ rootDir });
  const errors = validation.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `Site build stopped because content validation failed:\n${errors
        .map(formatDiagnostic)
        .join("\n")}`
    );
  }

  const articles = await readArticles(rootDir);
  const articleBySourcePath = new Map(articles.map((article) => [article.sourcePath, article]));
  const markdown = makeMarkdown(articleBySourcePath);
  const written = [];

  await fs.rm(outputDir, { force: true, recursive: true });
  await fs.mkdir(outputDir, { recursive: true });

  const stylesheet = await fs.readFile(path.join(rootDir, "site", "style.css"), "utf8");
  written.push(await writeOutput(rootDir, outputDir, "style.css", stylesheet));
  written.push(await writeOutput(rootDir, outputDir, ".nojekyll", ""));

  for (const article of articles) {
    const html = renderArticlePage(article, markdown, repositoryUrl);
    written.push(await writeOutput(rootDir, outputDir, article.outputPath, html));
  }

  for (const type of ENTITY_TYPES) {
    const outputPath = path.posix.join(type.directory, "index.html");
    const matching = articles.filter((article) => article.entity === type.directory);
    const body = `<header class="page-introduction">
  <p class="section-label">Wine Arcana</p>
  <h1>${type.label}</h1>
  <p>${matching.length} ${matching.length === 1 ? type.singular.toLowerCase() : type.label.toLowerCase()}.</p>
</header>
${articleIndex(matching, outputPath)}`;
    const html = pageTemplate({
      body,
      currentSection: type.directory,
      description: `${type.label} in Wine Arcana.`,
      outputPath,
      title: type.label,
    });
    written.push(await writeOutput(rootDir, outputDir, outputPath, html));
  }

  const homepageOutputPath = "index.html";
  const homepageSections = ENTITY_TYPES.map((type) => {
    const matching = articles.filter((article) => article.entity === type.directory);
    return `<section class="directory-section" aria-labelledby="${type.directory}-heading">
  <h2 id="${type.directory}-heading"><a href="${routeHref(homepageOutputPath, type.directory)}">${type.label}</a> <span>${matching.length}</span></h2>
${articleIndex(matching, homepageOutputPath)}
</section>`;
  }).join("\n");
  const homepage = pageTemplate({
    body: `<header class="page-introduction home-introduction">
  <h1>Wine Arcana</h1>
  <p>A small encyclopedia of wine.</p>
</header>
${homepageSections}`,
    description: "Wine Arcana is a small encyclopedia of wine.",
    outputPath: homepageOutputPath,
    title: "Wine Arcana",
  });
  written.push(await writeOutput(rootDir, outputDir, homepageOutputPath, homepage));

  const aboutBody = await fs.readFile(path.join(rootDir, "site", "about.md"), "utf8");
  const aboutOutputPath = "about/index.html";
  const aboutArticle = { outputPath: aboutOutputPath, sourcePath: "site/about.md" };
  const aboutHtml = pageTemplate({
    body: `<article class="article about">${renderMarkdown(markdown, aboutBody, {
      article: aboutArticle,
    })}</article>`,
    currentSection: "about",
    description: "About Wine Arcana and its editorial approach.",
    outputPath: aboutOutputPath,
    title: "About",
  });
  written.push(await writeOutput(rootDir, outputDir, aboutOutputPath, aboutHtml));

  const notFoundOutputPath = "404.html";
  const notFound = pageTemplate({
    body: `<article class="article">
  <h1>Page not found</h1>
  <p>The requested page is not part of Wine Arcana. Return to the <a href="${routeHref(
    notFoundOutputPath,
    ""
  )}">article index</a>.</p>
</article>`,
    description: "Page not found.",
    outputPath: notFoundOutputPath,
    title: "Page not found",
  });
  written.push(await writeOutput(rootDir, outputDir, notFoundOutputPath, notFound));

  return { articleCount: articles.length, outputDir, written: written.sort() };
}

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--out" || !arguments_[index + 1]) {
      throw new Error("Usage: node scripts/build-site.js [--out DIRECTORY]");
    }
    options.outputDir = path.resolve(arguments_[index + 1]);
    index += 1;
  }
  return options;
}

async function main() {
  const result = await buildSite(parseArguments(process.argv.slice(2)));
  console.log(`Built ${result.articleCount} articles in ${toPosix(result.outputDir)}.`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
