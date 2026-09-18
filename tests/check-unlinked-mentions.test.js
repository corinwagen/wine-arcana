import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findUnlinkedMentions } from "../scripts/check-unlinked-mentions.js";

async function corpus(t, pages) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "wine-mentions-"));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  for (const kind of ["grapes", "regions", "styles", "concepts"]) {
    await fs.mkdir(path.join(rootDir, "content", kind), { recursive: true });
  }
  for (const [file, source] of Object.entries(pages)) {
    await fs.writeFile(path.join(rootDir, "content", file), source);
  }
  return rootDir;
}
const page = (title, body, aliases = []) => `---\ntitle: ${title}\naliases: ${JSON.stringify(aliases)}\n---\n\n# ${title}\n\n${body}\n\n## Sources\n\n- Reference\n`;

test("finds case-insensitive aliases and wrapped names with paragraph locations", async (t) => {
  const rootDir = await corpus(t, {
    "grapes/white.md": page("White", "A *SÉMILLON* blend with Cabernet\nFranc. Semillon appears again."),
    "grapes/semillon.md": page("Sémillon", "Sémillon.", ["Semillon"]),
    "grapes/cabernet-franc.md": page("Cabernet Franc", "Cabernet Franc."),
  });
  const results = await findUnlinkedMentions({ rootDir });
  assert.deepEqual(results.map(({ target, line, href }) => ({ target, line, href })), [
    { target: "content/grapes/cabernet-franc.md", line: 8, href: "cabernet-franc.md" },
    { target: "content/grapes/semillon.md", line: 8, href: "semillon.md" },
  ]);
});

test("skips existing links, code, images, headings, footnotes and sources", async (t) => {
  const rootDir = await corpus(t, {
    "grapes/a.md": page("A", "## Syrah\n\n`Syrah` ![Syrah](photo.jpg) [Syrah](https://example.com).\n\n```\nSyrah\n```\n\nA note.[^n]\n\n[^n]: Syrah\n\nGrenache and Grenache. [Already linked](grenache.md).\n\n## Sources\n\n- Syrah"),
    "grapes/syrah.md": page("Syrah", "Syrah."),
    "grapes/grenache.md": page("Grenache", "Grenache."),
  });
  assert.deepEqual(await findUnlinkedMentions({ rootDir }), []);
});

test("uses longest whole names and suppresses collisions even with target filters", async (t) => {
  const rootDir = await corpus(t, {
    "grapes/a.md": page("A", "Hermitage; Pinot Blanc; pinots; СPinot; Pinotage."),
    "grapes/pinot.md": page("Pinot", ""),
    "grapes/pinot-blanc.md": page("Pinot Blanc", ""),
    "grapes/cinsault.md": page("Cinsault", "", ["Hermitage"]),
    "regions/hermitage.md": page("Hermitage", ""),
  });
  const results = await findUnlinkedMentions({ rootDir });
  assert.equal(results.length, 1);
  assert.equal(results[0].target, "content/grapes/pinot-blanc.md");
  assert.deepEqual(await findUnlinkedMentions({ rootDir, targets: ["content/regions/hermitage.md"] }), []);
  await assert.rejects(findUnlinkedMentions({ rootDir, targets: ["content/grapes/missing.md"] }), /Unknown article/);
});
