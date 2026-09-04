import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  formatPrompt,
  validateQueue,
} from "../scripts/run-next-article.js";
import {
  formatEditorialPrompt,
  parseArguments,
  selectIncompleteEntries,
} from "../scripts/run-parallel-articles.js";

test("accepts a focused article queue", () => {
  const queue = validateQueue([
    {
      path: "content/grapes/baga.md",
      title: "Baga",
      brief: "Test regional specificity.",
    },
    {
      path: "content/regions/bairrada.md",
      title: "Bairrada",
      brief: "Explain a region.",
    },
  ]);
  assert.equal(queue[0].path, "content/grapes/baga.md");
  assert.equal(queue[1].path, "content/regions/bairrada.md");
});

test("rejects duplicate, nested, and noncanonical queue paths", () => {
  assert.throws(
    () =>
      validateQueue([
        { path: "content/grapes/baga.md", title: "Baga", brief: "First." },
        { path: "content/grapes/baga.md", title: "Baga", brief: "Second." },
      ]),
    /duplicate path/
  );
  assert.throws(
    () =>
      validateQueue([
        {
          path: "content/grapes/portugal/baga.md",
          title: "Baga",
          brief: "Nested.",
        },
      ]),
    /invalid article path/
  );
});

test("builds a one-file, no-commit article prompt", () => {
  const prompt = formatPrompt({
    path: "content/grapes/baga.md",
    title: "Baga",
    brief: "Test regional specificity.",
  });
  assert.match(prompt, /only primary article/);
  assert.match(prompt, /templates\/grape\.md/);
  assert.match(prompt, /grape article/);
  assert.match(prompt, /Do not create or edit any other article/);
  assert.match(prompt, /700–1,200 words/);
  assert.match(prompt, /three to six principal sources/);
  assert.match(prompt, /Prefer synthesis/);
  assert.match(prompt, /Run npm run check/);
  assert.match(prompt, /do not commit/);
});

test("selects the template and article kind from the queued path", () => {
  const cases = [
    ["content/regions/bairrada.md", "templates/region.md", "region article"],
    ["content/styles/traditional-method-sparkling-wine.md", "templates/style.md", "style article"],
    ["content/concepts/carbonic-maceration.md", "templates/concept.md", "concept article"],
  ];

  for (const [path, template, kind] of cases) {
    const prompt = formatPrompt({ path, title: "Example", brief: "Explain it." });
    assert.match(prompt, new RegExp(template.replace(".", "\\.")));
    assert.match(prompt, new RegExp(kind));
  }
});

test("uses Terra with medium reasoning as the queue-runner default", () => {
  assert.equal(DEFAULT_MODEL, "gpt-5.6-terra");
  assert.equal(DEFAULT_REASONING_EFFORT, "medium");
});

test("configures a small parallel Terra batch by default", () => {
  const options = parseArguments(["new"]);
  assert.equal(options.count, 3);
  assert.equal(options.model, "gpt-5.6-terra");
  assert.equal(options.reasoningEffort, "medium");
});

test("builds a surgical, link-aware editorial prompt", () => {
  const prompt = formatEditorialPrompt("content/grapes/syrah.md");
  assert.match(prompt, /only primary article/);
  assert.match(prompt, /link-enrichment/);
  assert.match(prompt, /surgical edits/);
  assert.match(prompt, /Do not edit any file other than content\/grapes\/syrah\.md/);
  assert.match(prompt, /do not commit/);
});

test("selects only missing queued articles", async () => {
  const queue = [
    { path: "content/grapes/baga.md", title: "Baga", brief: "Existing." },
    { path: "content/grapes/example-one.md", title: "One", brief: "Missing." },
    { path: "content/regions/example-two.md", title: "Two", brief: "Missing." },
  ];
  const selected = await selectIncompleteEntries(queue, 2, null, process.cwd());
  assert.deepEqual(
    selected.map((entry) => entry.path),
    ["content/grapes/example-one.md", "content/regions/example-two.md"]
  );
});
