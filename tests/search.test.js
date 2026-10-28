import assert from "node:assert/strict";
import test from "node:test";

import { searchArticles } from "../site/search.js";

const records = [
  { title: "Grenache", aliases: ["Garnacha"], text: "A red grape grown in Spain and France." },
  { title: "Priorat", aliases: [], text: "Grenache and Carignan grow on steep slopes." },
  { title: "Rías Baixas", aliases: [], text: "Albariño grows in a wet Atlantic setting." },
];

test("search finds aliases and accent-insensitive names before body mentions", () => {
  assert.equal(searchArticles(records, "garnacha")[0].title, "Grenache");
  assert.equal(searchArticles(records, "rias baixas")[0].title, "Rías Baixas");
  assert.deepEqual(searchArticles(records, "grenache").map((row) => row.title), ["Grenache", "Priorat"]);
});

test("search requires every word and handles empty and unknown queries", () => {
  assert.deepEqual(searchArticles(records, "Carignan slopes").map((row) => row.title), ["Priorat"]);
  assert.deepEqual(searchArticles(records, "Carignan Atlantic"), []);
  assert.deepEqual(searchArticles(records, "  "), []);
  assert.deepEqual(searchArticles(records, "unlisted-grape"), []);
});

test("search provides bounded excerpts near the matching body passage", () => {
  const text = `${"Earlier material. ".repeat(40)}A vineyard retains water in clay. ${"Later material. ".repeat(40)}`;
  const [match] = searchArticles([{ title: "Soil", aliases: [], text }], "vineyard");
  assert.match(match.excerpt, /vineyard/);
  assert.ok(match.excerpt.length <= 222);
  assert.match(match.excerpt, /^…/);
});
