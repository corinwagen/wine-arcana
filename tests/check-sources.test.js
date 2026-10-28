import assert from "node:assert/strict";
import test from "node:test";
import { checkSource, externalUrls } from "../scripts/check-sources.js";

test("extracts real external citations, deduplicating fragments and excluding examples", () => {
  assert.deepEqual(externalUrls("[Source](https://example.org/paper#part) <https://example.org/paper>\n\n`[Example](https://example.org/not-a-source)`\n\n[Local](grape.md)\n\nA note.[^1]\n\n[^1]: [Study](https://example.org/study)"), [
    "https://example.org/paper", "https://example.org/study",
  ]);
});

test("falls back to GET and distinguishes missing pages from access and network failures", async () => {
  const calls = [];
  const result = await checkSource("https://example.org/paper", {
    fetchUrl: async (_url, { method }) => {
      calls.push(method);
      return new Response(null, { status: method === "HEAD" ? 405 : 200 });
    },
  });
  assert.deepEqual(calls, ["HEAD", "GET"]);
  assert.equal(result.result, "OK");
  assert.equal((await checkSource("https://example.org/gone", {
    fetchUrl: async () => new Response(null, { status: 410 }),
  })).result, "MISSING");
  assert.equal((await checkSource("https://example.org/limited", {
    fetchUrl: async () => new Response(null, { status: 429 }),
  })).result, "REVIEW");
  assert.equal((await checkSource("https://example.org/offline", {
    fetchUrl: async () => { throw new Error("Network unavailable"); },
  })).result, "REVIEW");
});
