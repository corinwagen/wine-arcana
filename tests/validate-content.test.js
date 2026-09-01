import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateCorpus } from "../scripts/validate-content.js";

const ENTITY_TYPES = ["grapes", "regions", "styles", "concepts"];
const validatorPath = fileURLToPath(new URL("../scripts/validate-content.js", import.meta.url));

function article(title, body = "", aliases = []) {
  const aliasYaml =
    aliases.length === 0
      ? ""
      : `aliases:\n${aliases.map((alias) => `  - ${alias}`).join("\n")}\n`;
  return `---\ntitle: ${title}\n${aliasYaml}---\n\n# ${title}\n\n${body}\n\n## Sources\n\n- A real source.\n`;
}

async function makeCorpus(t, files = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wine-arcana-validator-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));

  for (const entity of ENTITY_TYPES) {
    await fs.mkdir(path.join(rootDir, "content", entity), { recursive: true });
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }
  return rootDir;
}

function codes(result, severity = "error") {
  return result.diagnostics
    .filter((item) => item.severity === severity)
    .map((item) => item.code);
}

test("accepts minimal articles, aliases, and valid internal links", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/baga.md": article(
      "Baga",
      "Baga is associated with [Bairrada](../regions/bairrada.md).",
      ["Tinta Bairrada"]
    ),
    "content/regions/bairrada.md": article(
      "Bairrada",
      "Its important grapes include [Baga](../grapes/baga.md)."
    ),
  });

  const result = await validateCorpus({ rootDir });
  assert.equal(result.articleCount, 2);
  assert.deepEqual(result.diagnostics, []);
});

test("reports malformed, missing, and unexpected frontmatter", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/missing.md": "# Missing\n\n## Sources\n\n- Source.\n",
    "content/grapes/malformed.md": "---\ntitle: [broken\n---\n\n# Broken\n",
    "content/grapes/unexpected.md": `---\ntitle: Unexpected\nacidity: 5\n---\n\n# Unexpected\n\n## Sources\n\n- Source.\n`,
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("frontmatter.missing"));
  assert.ok(codes(result).includes("frontmatter.invalid"));
  assert.ok(codes(result).includes("frontmatter.unexpected-key"));
});

test("validates alias shape, uniqueness, and title overlap", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/not-a-list.md": `---\ntitle: Not a list\naliases: Alias\n---\n\n# Not a list\n\n## Sources\n\n- Source.\n`,
    "content/grapes/duplicates.md": article("Duplicates", "", ["Same", "same"]),
    "content/grapes/repeats-title.md": article("Baga", "", ["BAGA"]),
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("aliases.invalid"));
  assert.ok(codes(result).includes("aliases.duplicate"));
  assert.ok(codes(result).includes("aliases.matches-title"));
});

test("rejects invalid filenames and nested article paths", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/Bad_Name.md": article("Bad name"),
    "content/grapes/italy/nested.md": article("Nested"),
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("filename.invalid"));
  assert.ok(codes(result).includes("path.invalid-entity"));
});

test("detects title and alias collisions after Unicode and case normalization", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/first.md": article("First", "", ["Dão"]),
    "content/grapes/second.md": article("Second", "", ["Da\u0303o"]),
    "content/grapes/syrah.md": article("Syrah"),
    "content/grapes/syrah-copy.md": article("SYRAH"),
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("name.collision"));
  assert.ok(codes(result).includes("title.duplicate"));
});

test("reports cross-entity name collisions for review without failing", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/regions/madeira.md": article("Madeira"),
    "content/styles/madeira.md": article("Madeira"),
  });

  const result = await validateCorpus({ rootDir });
  assert.deepEqual(codes(result), []);
  assert.equal(codes(result, "warning").filter((code) => code === "name.cross-type-collision").length, 2);
});

test("accepts same-directory and cross-directory article links", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/baga.md": article(
      "Baga",
      "Compare [Syrah](syrah.md) and [Bairrada](../regions/bairrada.md)."
    ),
    "content/grapes/syrah.md": article("Syrah"),
    "content/regions/bairrada.md": article("Bairrada"),
  });

  const result = await validateCorpus({ rootDir });
  assert.deepEqual(result.diagnostics, []);
});

test("rejects missing, escaping, absolute, and non-Markdown internal targets", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/links.md": article(
      "Links",
      [
        "[Missing](missing.md)",
        "[Escape](../../../README.md)",
        "[Absolute](/grapes/baga.md)",
        "[Text](notes.txt)",
      ].join("\n\n")
    ),
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("link.broken"));
  assert.ok(codes(result).includes("link.escapes-content"));
  assert.ok(codes(result).includes("link.absolute"));
  assert.ok(codes(result).includes("link.non-markdown"));
});

test("ignores Markdown-like links in code spans and fenced code blocks", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/concepts/links-in-code.md": article(
      "Links in code",
      "`[Missing](missing.md)`\n\n```md\n[Also missing](also-missing.md)\n```"
    ),
  });

  const result = await validateCorpus({ rootDir });
  assert.deepEqual(result.diagnostics, []);
});

test("reports heading fragments for review while resolving the article", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/baga.md": article("Baga", "See [Syrah](syrah.md#history)."),
    "content/grapes/syrah.md": article("Syrah"),
  });

  const result = await validateCorpus({ rootDir });
  assert.deepEqual(codes(result), []);
  assert.ok(codes(result, "warning").includes("link.fragment"));
});

test("requires exactly one level-one heading matching the title", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/missing-h1.md": `---\ntitle: Missing H1\n---\n\n## Sources\n\n- Source.\n`,
    "content/grapes/mismatch.md": `---\ntitle: Expected\n---\n\n# Different\n\n## Sources\n\n- Source.\n`,
    "content/grapes/wrong-case.md": `---\ntitle: Wrong case\n---\n\n# Wrong Case\n\n## Sources\n\n- Source.\n`,
    "content/grapes/two-h1s.md": `---\ntitle: Two H1s\n---\n\n# Two H1s\n\n# Again\n\n## Sources\n\n- Source.\n`,
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).filter((code) => code === "heading.h1-count").length >= 2);
  assert.equal(codes(result).filter((code) => code === "heading.title-mismatch").length, 2);
});

test("requires a nonempty final Sources section", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/no-sources.md": `---\ntitle: No sources\n---\n\n# No sources\n`,
    "content/grapes/empty-sources.md": `---\ntitle: Empty sources\n---\n\n# Empty sources\n\n## Sources\n`,
    "content/grapes/misplaced-sources.md": `---\ntitle: Misplaced sources\n---\n\n# Misplaced sources\n\n## Sources\n\n- Source.\n\n## Later\n\nText.\n`,
  });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("sources.missing"));
  assert.ok(codes(result).includes("sources.empty"));
  assert.ok(codes(result).includes("sources.not-final"));
});

test("reports missing entity directories", async (t) => {
  const rootDir = await makeCorpus(t);
  await fs.rm(path.join(rootDir, "content", "styles"), { recursive: true });

  const result = await validateCorpus({ rootDir });
  assert.ok(codes(result).includes("content.missing-entity-directory"));
});

test("CLI exits nonzero and prints actionable diagnostics on errors", async (t) => {
  const rootDir = await makeCorpus(t, {
    "content/grapes/broken.md": article("Broken", "See [Missing](missing.md)."),
  });

  const result = spawnSync(process.execPath, [validatorPath, rootDir], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ERROR content\/grapes\/broken\.md:\d+ \[link\.broken\]/);
  assert.match(result.stdout, /Content validation failed:/);
});
