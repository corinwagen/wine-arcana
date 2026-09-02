import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSite } from "../scripts/build-site.js";

const ENTITY_TYPES = ["grapes", "regions", "styles", "concepts"];
const SITE_ASSETS = [
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "apple-touch-icon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon.ico",
  "site.webmanifest",
];

function article(title, body = "", aliases = []) {
  const aliasYaml = aliases.length
    ? `aliases:\n${aliases.map((alias) => `  - ${alias}`).join("\n")}\n`
    : "";
  return `---\ntitle: ${title}\n${aliasYaml}---\n\n# ${title}\n\n${body}\n\n## Sources\n\n- A real source.\n`;
}

async function makeProject(t, files = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wine-arcana-site-"));
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  for (const entity of ENTITY_TYPES) {
    await fs.mkdir(path.join(rootDir, "content", entity), { recursive: true });
  }
  await fs.mkdir(path.join(rootDir, "site"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "site", "style.css"), "body { color: #222; }\n");
  await fs.writeFile(path.join(rootDir, "site", "about.md"), "# About\n\nA small encyclopedia.\n");
  for (const filename of SITE_ASSETS) {
    await fs.writeFile(path.join(rootDir, "site", filename), `${filename}\n`);
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }
  return rootDir;
}

test("builds article, category, homepage, about, and fallback pages", async (t) => {
  const rootDir = await makeProject(t, {
    "content/grapes/baga.md": article(
      "Baga",
      "Baga is associated with [Bairrada](../regions/bairrada.md).[^1]\n\n[^1]: Source note.",
      ["Tinta Bairrada"]
    ),
    "content/regions/bairrada.md": article(
      "Bairrada",
      "Its grapes include [Baga](../grapes/baga.md)."
    ),
  });
  const outputDir = path.join(rootDir, "generated", "site");

  const result = await buildSite({ rootDir, outputDir });

  assert.equal(result.articleCount, 2);
  for (const relativePath of [
    "index.html",
    "404.html",
    "robots.txt",
    "sitemap.xml",
    "style.css",
    ...SITE_ASSETS,
    ".nojekyll",
    "about/index.html",
    "grapes/index.html",
    "grapes/baga/index.html",
    "regions/index.html",
    "regions/bairrada/index.html",
    "styles/index.html",
    "concepts/index.html",
  ]) {
    await fs.access(path.join(outputDir, relativePath));
  }

  const homepage = await fs.readFile(path.join(outputDir, "index.html"), "utf8");
  const baga = await fs.readFile(path.join(outputDir, "grapes", "baga", "index.html"), "utf8");
  const notFound = await fs.readFile(path.join(outputDir, "404.html"), "utf8");
  const robots = await fs.readFile(path.join(outputDir, "robots.txt"), "utf8");
  const sitemap = await fs.readFile(path.join(outputDir, "sitemap.xml"), "utf8");
  assert.match(homepage, /Baga/);
  assert.match(homepage, /Tinta Bairrada/);
  assert.match(homepage, /href="favicon\.ico"/);
  assert.match(homepage, /href="site\.webmanifest"/);
  assert.match(homepage, /<h1 class="visually-hidden">Wine Arcana<\/h1>/);
  assert.match(homepage, /A small encyclopædia of wine\./);
  assert.match(homepage, /rel="canonical" href="https:\/\/winearcana\.com\/"/);
  assert.match(homepage, /"@type":"WebSite"/);
  assert.match(baga, /Also known as/);
  assert.match(
    baga,
    /meta name="description" content="Baga is associated with Bairrada\."/
  );
  assert.match(
    baga,
    /rel="canonical" href="https:\/\/winearcana\.com\/grapes\/baga\/"/
  );
  assert.match(baga, /href="\.\.\/\.\.\/favicon\.ico"/);
  assert.match(baga, /href="\.\.\/\.\.\/regions\/bairrada\/"/);
  assert.match(baga, /class="sidenote-number"/);
  assert.match(baga, /class="sidenote" role="note"/);
  assert.match(baga, /Source note\./);
  assert.doesNotMatch(baga, /class="footnotes/);
  assert.doesNotMatch(baga, /github/i);
  assert.doesNotMatch(baga, /href="(?:\.\.?\/|\/)[^"]+\.md(?:#|\")/);
  assert.match(notFound, /meta name="robots" content="noindex"/);
  assert.doesNotMatch(notFound, /rel="canonical"/);
  assert.equal(
    robots,
    "User-agent: *\nAllow: /\n\nSitemap: https://winearcana.com/sitemap.xml\n"
  );
  assert.match(sitemap, /<loc>https:\/\/winearcana\.com\/grapes\/baga\/<\/loc>/);
  assert.doesNotMatch(sitemap, /404\.html/);
});

test("emits only internal links that resolve in the generated tree", async (t) => {
  const rootDir = await makeProject(t, {
    "content/grapes/baga.md": article("Baga", "See [Bairrada](../regions/bairrada.md)."),
    "content/regions/bairrada.md": article("Bairrada", "See [Baga](../grapes/baga.md)."),
  });
  const outputDir = path.join(rootDir, "public");
  await buildSite({ rootDir, outputDir });

  const htmlFiles = [];
  async function collect(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(absolutePath);
      else if (entry.name.endsWith(".html")) htmlFiles.push(absolutePath);
    }
  }
  await collect(outputDir);

  for (const htmlFile of htmlFiles) {
    const html = await fs.readFile(htmlFile, "utf8");
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith("#") || href.startsWith("https://")) continue;
      const pathOnly = href.split("#", 1)[0];
      const resolved = path.resolve(path.dirname(htmlFile), pathOnly);
      const target = pathOnly.endsWith("/") ? path.join(resolved, "index.html") : resolved;
      await fs.access(target);
    }
  }
});

test("refuses to replace output when corpus validation fails", async (t) => {
  const rootDir = await makeProject(t, {
    "content/grapes/baga.md": article("Baga", "See [Missing](missing.md)."),
  });
  const outputDir = path.join(rootDir, "public");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "sentinel.txt"), "keep\n");

  await assert.rejects(buildSite({ rootDir, outputDir }), /content validation failed/);
  assert.equal(await fs.readFile(path.join(outputDir, "sentinel.txt"), "utf8"), "keep\n");
});

test("requires output to remain below the project root", async (t) => {
  const rootDir = await makeProject(t);
  await assert.rejects(buildSite({ rootDir, outputDir: rootDir }), /must be a child/);
});
