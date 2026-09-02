#!/usr/bin/env node

import process from "node:process";

import { formatImageDiagnostic, validateImageCatalog } from "./image-catalog.js";

const result = await validateImageCatalog();
if (result.diagnostics.length > 0) {
  for (const item of result.diagnostics) console.error(formatImageDiagnostic(item));
  process.exitCode = 1;
} else {
  console.log(`Validated ${result.records.length} reusable images.`);
}
