import assert from "node:assert/strict";
import test from "node:test";

import { formatPrompt, validateQueue } from "../scripts/run-next-article.js";

test("accepts a focused article queue", () => {
  const queue = validateQueue([
    {
      path: "content/grapes/baga.md",
      title: "Baga",
      brief: "Test regional specificity.",
    },
  ]);
  assert.equal(queue[0].path, "content/grapes/baga.md");
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
  assert.match(prompt, /Do not create or edit any other article/);
  assert.match(prompt, /Run npm run check/);
  assert.match(prompt, /do not commit/);
});

