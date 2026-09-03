const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".csv", ".pdf"]);
const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".csv"]);
const IGNORED_DIRECTORIES = new Set([".git", ".wonnyy", "node_modules"]);
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const STANDARD_FONT_DATA_URL = `${pathToFileURL(path.join(__dirname, "..", "node_modules", "pdfjs-dist", "standard_fonts")).href}/`;

let pdfjsPromise;
let indexedRootPath = null;
const pdfTextIndex = new Map();

function issue(relativePath, message) {
  return { relativePath, message };
}

function readableError(error) {
  if (error && error.code === "ENOENT") return "Folder or file no longer exists.";
  if (error && error.code === "EACCES") return "Permission was denied.";
  return "Could not read this location.";
}

function resetPdfIndexForRoot(rootPath) {
  if (indexedRootPath === rootPath) return;
  indexedRootPath = rootPath;
  pdfTextIndex.clear();
}

async function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

async function extractPdfText(absolutePath) {
  const pdfjs = await loadPdfJs();
  const bytes = new Uint8Array(await fs.readFile(absolutePath));
  const loadingTask = pdfjs.getDocument({ data: bytes, disableWorker: true, useSystemFonts: true, standardFontDataUrl: STANDARD_FONT_DATA_URL });
  try {
    const document = await loadingTask.promise;
    try {
      const pages = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        pages.push(textContent.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        page.cleanup();
      }
      return { text: pages.join("\n").replace(/\s+/g, " ").trim(), pageCount: document.numPages };
    } finally {
      await document.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}

async function indexPdf(rootPath, absolutePath, relativePath, stats, issues) {
  const existing = pdfTextIndex.get(relativePath);
  if (stats.size > MAX_PDF_BYTES) {
    pdfTextIndex.delete(relativePath);
    issues.push(issue(relativePath, "PDF exceeds the 100 MB preview and indexing limit."));
    return { textStatus: "too-large", pageCount: null };
  }
  if (existing && existing.size === stats.size && existing.mtimeMs === stats.mtimeMs) {
    return { textStatus: existing.text ? "ready" : "empty", pageCount: existing.pageCount };
  }
  try {
    const { text, pageCount } = await extractPdfText(absolutePath);
    pdfTextIndex.set(relativePath, { size: stats.size, mtimeMs: stats.mtimeMs, text, pageCount });
    return { textStatus: text ? "ready" : "empty", pageCount };
  } catch {
    pdfTextIndex.delete(relativePath);
    issues.push(issue(relativePath, "Could not extract searchable PDF text. The file may still be previewable."));
    return { textStatus: "error", pageCount: null };
  }
}

async function scanDirectory(rootPath, directoryPath, relativePath, issues, seenPdfPaths) {
  let directoryEntries;
  try {
    directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    issues.push(issue(relativePath || ".", readableError(error)));
    return [];
  }

  const entries = [];
  for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue;

    const absolutePath = path.join(directoryPath, entry.name);
    // Vault IDs are portable metadata keys, so always use forward slashes even on Windows.
    const childRelativePath = path.posix.join(relativePath.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const children = await scanDirectory(rootPath, absolutePath, childRelativePath, issues, seenPdfPaths);
      entries.push({ kind: "folder", name: entry.name, relativePath: childRelativePath, children });
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (!entry.isFile()) continue;
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      entries.push({ kind: "file", name: entry.name, relativePath: childRelativePath, extension, readable: false });
      continue;
    }
    if (extension === ".pdf") {
      const stats = await fs.stat(absolutePath).catch(() => null);
      if (!stats) {
        issues.push(issue(childRelativePath, "Could not inspect PDF metadata."));
        entries.push({ kind: "file", name: entry.name, relativePath: childRelativePath, extension });
        continue;
      }
      seenPdfPaths.add(childRelativePath);
      const pdf = await indexPdf(rootPath, absolutePath, childRelativePath, stats, issues);
      entries.push({ kind: "file", name: entry.name, relativePath: childRelativePath, extension, readable: true, pdf });
      continue;
    }
    entries.push({ kind: "file", name: entry.name, relativePath: childRelativePath, extension, readable: true });
  }
  return entries;
}

function countEntries(entries) {
  return entries.reduce(
    (total, entry) => {
      if (entry.kind === "file") return { ...total, files: total.files + (entry.readable === false ? 0 : 1) };
      const nested = countEntries(entry.children);
      return { files: total.files + nested.files, directories: total.directories + nested.directories + 1 };
    },
    { files: 0, directories: 0 },
  );
}

async function scanVault(rootPath) {
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      return { status: "unavailable", rootPath, entries: [], totalFiles: 0, totalDirectories: 0, lastScannedAt: null, issues: [], message: "Vault path is not a directory." };
    }
  } catch (error) {
    const missing = error && error.code === "ENOENT";
    return { status: missing ? "missing" : "unavailable", rootPath, entries: [], totalFiles: 0, totalDirectories: 0, lastScannedAt: null, issues: [], message: missing ? "Vault folder does not exist." : readableError(error) };
  }

  resetPdfIndexForRoot(rootPath);
  const issues = [];
  const seenPdfPaths = new Set();
  const entries = await scanDirectory(rootPath, rootPath, "", issues, seenPdfPaths);
  for (const indexedPath of pdfTextIndex.keys()) {
    if (!seenPdfPaths.has(indexedPath)) pdfTextIndex.delete(indexedPath);
  }
  const { files, directories } = countEntries(entries);
  return { status: "ready", rootPath, entries, totalFiles: files, totalDirectories: directories, lastScannedAt: new Date().toISOString(), issues };
}

function resolveVaultFile(rootPath, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) throw new Error("Invalid vault file path.");
  const absolutePath = path.resolve(rootPath, relativePath);
  const pathWithinVault = path.relative(rootPath, absolutePath);
  if (pathWithinVault.startsWith("..") || path.isAbsolute(pathWithinVault)) throw new Error("File is outside the active vault.");
  if (!SUPPORTED_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) throw new Error("This file type is not supported.");
  return absolutePath;
}

async function statVaultFile(rootPath, relativePath, requiredExtension) {
  const absolutePath = resolveVaultFile(rootPath, relativePath);
  const extension = path.extname(absolutePath).toLowerCase();
  if (requiredExtension && extension !== requiredExtension) throw new Error("Selected file is not a PDF.");
  const stats = await fs.stat(absolutePath).catch((error) => { throw new Error(readableError(error)); });
  if (!stats.isFile()) throw new Error("Selected path is not a file.");
  return { absolutePath, extension, stats };
}

async function readVaultFile(rootPath, relativePath) {
  const { absolutePath, extension } = await statVaultFile(rootPath, relativePath);
  if (!TEXT_EXTENSIONS.has(extension)) throw new Error("Use the PDF reader for this file.");
  return { name: path.basename(absolutePath), relativePath, extension, content: await fs.readFile(absolutePath, "utf8").catch((error) => { throw new Error(readableError(error)); }) };
}

async function readPdfFile(rootPath, relativePath) {
  const { absolutePath, stats } = await statVaultFile(rootPath, relativePath, ".pdf");
  if (stats.size > MAX_PDF_BYTES) throw new Error("PDF exceeds the 100 MB preview limit.");
  return { name: path.basename(absolutePath), relativePath, size: stats.size, data: new Uint8Array(await fs.readFile(absolutePath).catch((error) => { throw new Error(readableError(error)); })) };
}

function countMatches(text, query) {
  let count = 0;
  let offset = 0;
  while (offset >= 0) {
    offset = text.indexOf(query, offset);
    if (offset >= 0) { count += 1; offset += query.length; }
  }
  return count;
}

function searchPdfText(rootPath, rawQuery) {
  if (rootPath !== indexedRootPath || typeof rawQuery !== "string") return [];
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return [];
  return [...pdfTextIndex.entries()].flatMap(([relativePath, record]) => {
    const normalizedText = record.text.toLocaleLowerCase();
    const matchAt = normalizedText.indexOf(query);
    if (matchAt < 0) return [];
    const excerptStart = Math.max(0, matchAt - 72);
    const excerptEnd = Math.min(record.text.length, matchAt + query.length + 108);
    return [{ relativePath, name: path.basename(relativePath), matchCount: countMatches(normalizedText, query), excerpt: `${excerptStart > 0 ? "…" : ""}${record.text.slice(excerptStart, excerptEnd)}${excerptEnd < record.text.length ? "…" : ""}` }];
  });
}

function getIndexedPdfText(rootPath, relativePath) {
  if (rootPath !== indexedRootPath) return null;
  return pdfTextIndex.get(relativePath)?.text ?? null;
}

module.exports = { MAX_PDF_BYTES, getIndexedPdfText, readPdfFile, readVaultFile, resolveVaultFile, scanVault, searchPdfText };
