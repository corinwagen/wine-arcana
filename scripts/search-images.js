#!/usr/bin/env node

import process from "node:process";

function usage() {
  return 'Usage: npm run images:search -- "SEARCH TERMS" [--limit NUMBER]';
}

const arguments_ = process.argv.slice(2);
let limit = 10;
const queryParts = [];
for (let index = 0; index < arguments_.length; index += 1) {
  if (arguments_[index] === "--limit") {
    limit = Number(arguments_[index + 1]);
    index += 1;
  } else {
    queryParts.push(arguments_[index]);
  }
}
const query = queryParts.join(" ").trim();
if (!query || !Number.isInteger(limit) || limit < 1 || limit > 50) {
  console.error(usage());
  process.exit(1);
}

const url = new URL("https://api.openverse.org/v1/images/");
url.searchParams.set("q", query);
url.searchParams.set("license", "cc0");
url.searchParams.set("page_size", String(limit));

const response = await fetch(url, { headers: { "User-Agent": "Wine Arcana image research" } });
if (!response.ok) throw new Error(`Openverse returned HTTP ${response.status}.`);
const data = await response.json();
const results = data.results.map((item) => ({
  creator: item.creator,
  creator_url: item.creator_url,
  height: item.height,
  id: item.id,
  image_url: item.url,
  license: item.license,
  license_url: item.license_url,
  source: item.source,
  source_url: item.foreign_landing_url,
  title: item.title,
  width: item.width,
}));

console.log(JSON.stringify(results, null, 2));
console.error(`\n${results.length} CC0 candidates. Verify each original source page before use.`);
