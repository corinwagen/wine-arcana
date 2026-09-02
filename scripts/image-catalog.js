import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import MarkdownIt from "markdown-it";
import { parseDocument } from "yaml";

const CATALOG_PATH = "media/images.yml";
const IMAGE_ROOT = "media/images";
const LICENSES = new Map([
  [
    "CC0-1.0",
    {
      label: "CC0 1.0",
      url: "https://creativecommons.org/publicdomain/zero/1.0/",
    },
  ],
  [
    "Public-Domain",
    {
      label: "Public domain",
      url: "https://commons.wikimedia.org/wiki/Commons:Public_domain",
    },
  ],
]);
const REQUIRED_FIELDS = [
  "path",
  "title",
  "creator",
  "creator_url",
  "source",
  "source_url",
  "original_url",
  "license",
  "license_url",
  "width",
  "height",
  "sha256",
];
const OPTIONAL_FIELDS = new Set(["changes", "openverse_id"]);
const IMAGE_EXTENSIONS = new Set([".avif", ".jpeg", ".jpg", ".png", ".webp"]);
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function diagnostic(file, message) {
  return { file, message };
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function pathExists(filename) {
  try {
    await fs.access(filename);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolutePath)));
    else if (entry.isFile()) files.push(absolutePath);
  }
  return files;
}

async function readCatalog(rootDir, diagnostics) {
  const absolutePath = path.join(rootDir, CATALOG_PATH);
  let source;
  try {
    source = await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const document = parseDocument(source, { prettyErrors: true, strict: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    diagnostics.push(diagnostic(CATALOG_PATH, document.errors[0].message.replaceAll("\n", " ")));
    return [];
  }

  const data = document.toJS();
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    diagnostics.push(diagnostic(CATALOG_PATH, "Image catalog must be a YAML mapping."));
    return [];
  }
  if (Object.keys(data).length !== 1 || !Array.isArray(data.images)) {
    diagnostics.push(diagnostic(CATALOG_PATH, 'Image catalog must contain one "images" list.'));
    return [];
  }
  return data.images;
}

function validateRecord(record, index, diagnostics) {
  const label = `${CATALOG_PATH}: images[${index}]`;
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    diagnostics.push(diagnostic(CATALOG_PATH, `images[${index}] must be a mapping.`));
    return false;
  }

  const diagnosticCount = diagnostics.length;
  const allowed = new Set([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) diagnostics.push(diagnostic(CATALOG_PATH, `${label} has unknown field "${field}".`));
  }
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(record, field)) diagnostics.push(diagnostic(CATALOG_PATH, `${label} is missing "${field}".`));
  }

  for (const field of [
    "path",
    "title",
    "creator",
    "source",
    "license",
    "sha256",
  ]) {
    if (typeof record[field] !== "string" || record[field].trim() === "") {
      diagnostics.push(diagnostic(CATALOG_PATH, `${label}.${field} must be a nonempty string.`));
    }
  }
  for (const field of ["creator_url", "source_url", "original_url", "license_url"]) {
    if (!isHttpsUrl(record[field])) {
      diagnostics.push(diagnostic(CATALOG_PATH, `${label}.${field} must be an HTTPS URL.`));
    }
  }
  for (const field of ["width", "height"]) {
    if (!Number.isInteger(record[field]) || record[field] <= 0) {
      diagnostics.push(diagnostic(CATALOG_PATH, `${label}.${field} must be a positive integer.`));
    }
  }
  const license = LICENSES.get(record.license);
  if (!license || record.license_url !== license.url) {
    diagnostics.push(
      diagnostic(
        CATALOG_PATH,
        `${label} must use an approved license identifier and its canonical URL.`
      )
    );
  }
  if (typeof record.path === "string") {
    const normalized = path.posix.normalize(record.path);
    if (
      normalized !== record.path ||
      !normalized.startsWith(`${IMAGE_ROOT}/`) ||
      !IMAGE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())
    ) {
      diagnostics.push(
        diagnostic(CATALOG_PATH, `${label}.path must be a normalized web image below ${IMAGE_ROOT}/.`)
      );
    }
  }
  if (typeof record.sha256 === "string" && !/^[a-f\d]{64}$/.test(record.sha256)) {
    diagnostics.push(diagnostic(CATALOG_PATH, `${label}.sha256 must be 64 lowercase hexadecimal characters.`));
  }
  if (Object.hasOwn(record, "changes") && (typeof record.changes !== "string" || record.changes.trim() === "")) {
    diagnostics.push(diagnostic(CATALOG_PATH, `${label}.changes must be a nonempty string when present.`));
  }
  if (
    Object.hasOwn(record, "openverse_id") &&
    (typeof record.openverse_id !== "string" || record.openverse_id.trim() === "")
  ) {
    diagnostics.push(
      diagnostic(CATALOG_PATH, `${label}.openverse_id must be a nonempty string when present.`)
    );
  }
  return diagnostics.length === diagnosticCount;
}

async function collectMarkdownImages(rootDir) {
  const contentRoot = path.join(rootDir, "content");
  const files = (await walk(contentRoot)).filter((filename) => filename.endsWith(".md"));
  const aboutPath = path.join(rootDir, "site", "about.md");
  if (await pathExists(aboutPath)) files.push(aboutPath);
  const images = [];

  for (const absolutePath of files) {
    const sourcePath = toPosix(path.relative(rootDir, absolutePath));
    const source = await fs.readFile(absolutePath, "utf8");
    for (const token of markdown.parse(source, {})) {
      if (token.type !== "inline" || token.children === null) continue;
      for (const child of token.children) {
        if (child.type !== "image") continue;
        images.push({
          alt: child.content.trim(),
          line: (token.map?.[0] ?? 0) + 1,
          sourcePath,
          src: child.attrGet("src") ?? "",
          title: child.attrGet("title")?.trim() ?? "",
        });
      }
    }
  }
  return images;
}

export function resolveImagePath(sourcePath, src) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), src));
}

export function imageLicenseLabel(record) {
  return LICENSES.get(record.license)?.label ?? record.license;
}

export function formatImageDiagnostic(item) {
  return `${item.file}: ${item.message}`;
}

export async function validateImageCatalog({ rootDir = process.cwd() } = {}) {
  rootDir = path.resolve(rootDir);
  const diagnostics = [];
  const records = await readCatalog(rootDir, diagnostics);
  const byPath = new Map();
  const openverseIds = new Set();

  for (const [index, record] of records.entries()) {
    if (!validateRecord(record, index, diagnostics)) continue;
    if (byPath.has(record.path)) {
      diagnostics.push(diagnostic(CATALOG_PATH, `Image path "${record.path}" is duplicated.`));
    } else {
      byPath.set(record.path, record);
    }
    if (record.openverse_id && openverseIds.has(record.openverse_id)) {
      diagnostics.push(
        diagnostic(CATALOG_PATH, `Openverse ID "${record.openverse_id}" is duplicated.`)
      );
    }
    if (record.openverse_id) openverseIds.add(record.openverse_id);

    const absolutePath = path.join(rootDir, record.path);
    if (!(await pathExists(absolutePath))) {
      diagnostics.push(diagnostic(record.path, "Cataloged image file does not exist."));
      continue;
    }
    const contents = await fs.readFile(absolutePath);
    const digest = crypto.createHash("sha256").update(contents).digest("hex");
    if (digest !== record.sha256) {
      diagnostics.push(diagnostic(record.path, `SHA-256 is ${digest}, not ${record.sha256}.`));
    }
  }

  const referenced = new Set();
  for (const image of await collectMarkdownImages(rootDir)) {
    const location = `${image.sourcePath}:${image.line}`;
    if (!image.src || image.src.startsWith("/") || /^[a-z][a-z\d+.-]*:/i.test(image.src)) {
      diagnostics.push(diagnostic(location, "Markdown images must use relative local paths."));
      continue;
    }
    const resolved = resolveImagePath(image.sourcePath, image.src);
    if (!resolved.startsWith(`${IMAGE_ROOT}/`) || !byPath.has(resolved)) {
      diagnostics.push(diagnostic(location, `Image "${image.src}" has no record in ${CATALOG_PATH}.`));
      continue;
    }
    referenced.add(resolved);
    if (!image.alt) diagnostics.push(diagnostic(location, "Image alt text must not be empty."));
    if (!image.title) diagnostics.push(diagnostic(location, "Image title must supply its visible caption."));
  }

  for (const record of records) {
    if (record?.path && !referenced.has(record.path)) {
      diagnostics.push(diagnostic(CATALOG_PATH, `Cataloged image "${record.path}" is not used by a page.`));
    }
  }
  const actualImages = await walk(path.join(rootDir, IMAGE_ROOT));
  for (const absolutePath of actualImages) {
    const relativePath = toPosix(path.relative(rootDir, absolutePath));
    if (!byPath.has(relativePath)) {
      diagnostics.push(diagnostic(relativePath, `Image file has no record in ${CATALOG_PATH}.`));
    }
  }

  return { byPath, diagnostics, records };
}
