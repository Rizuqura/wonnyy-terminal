const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getIndexedPdfText, readVaultFile, scanVault } = require("./vault-service.cjs");

const SCHEMA_VERSION = 1;
const SUPPORTED = new Set([".md", ".markdown", ".csv", ".pdf"]);
const cache = new Map();
const queues = new Map();
const brainScopes = new Map();

const emptyDocument = () => ({ schemaVersion: SCHEMA_VERSION, revision: 0, stations: [], assignments: [], activeContext: [] });
const metadataPath = (rootPath) => path.join(rootPath, ".wonnyy", "stations.json");

function resolveKnowledgeObject(rootPath, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) throw new Error("Invalid knowledge object path.");
  const absolute = path.resolve(rootPath, relativePath); const within = path.relative(path.resolve(rootPath), absolute);
  if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("Knowledge object is outside the active vault.");
  if (within.split(path.sep)[0] === ".wonnyy") throw new Error("Wonnyy metadata cannot be labeled as knowledge.");
  return absolute;
}

function normalizeName(value) {
  if (typeof value !== "string") throw new Error("Station name must be text.");
  const name = value.trim().normalize("NFC");
  if (!name || /[\u0000-\u001f\u007f]/u.test(name)) throw new Error("Station name cannot be empty or contain control characters.");
  return name;
}

function validateDocument(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== SCHEMA_VERSION || !Number.isInteger(value.revision)) throw new Error("Unsupported or malformed Station metadata.");
  if (!Array.isArray(value.stations) || !Array.isArray(value.assignments) || !Array.isArray(value.activeContext)) throw new Error("Station metadata collections are malformed.");
  const stationIds = new Set(); const names = new Set();
  for (const station of value.stations) {
    if (!station || typeof station.id !== "string" || typeof station.name !== "string" || typeof station.createdAt !== "string" || typeof station.updatedAt !== "string") throw new Error("A Station record is malformed.");
    const name = normalizeName(station.name);
    if (stationIds.has(station.id) || names.has(name)) throw new Error("Station IDs and names must be unique.");
    stationIds.add(station.id); names.add(name);
  }
  for (const assignment of value.assignments) {
    if (!assignment || typeof assignment.relativePath !== "string" || !["file", "folder"].includes(assignment.kind) || !Array.isArray(assignment.stationIds)) throw new Error("A Station assignment is malformed.");
    if (assignment.stationIds.some((id) => !stationIds.has(id))) throw new Error("An assignment references an unknown Station.");
  }
  for (const entry of value.activeContext) if (!entry || typeof entry.relativePath !== "string" || typeof entry.addedAt !== "string") throw new Error("An Active Context entry is malformed.");
  return structuredClone(value);
}

async function load(rootPath) {
  const target = metadataPath(rootPath);
  try {
    const stats = await fs.stat(target); const current = cache.get(rootPath);
    if (current?.mtimeMs === stats.mtimeMs) return current;
    const loaded = { document: validateDocument(JSON.parse(await fs.readFile(target, "utf8"))), mtimeMs: stats.mtimeMs, error: null };
    cache.set(rootPath, loaded); return loaded;
  } catch (error) {
    if (error?.code === "ENOENT") { const loaded = { document: emptyDocument(), mtimeMs: null, error: null }; cache.set(rootPath, loaded); return loaded; }
    const current = cache.get(rootPath);
    if (current) return { ...current, error: `Station metadata was not reloaded: ${error.message}` };
    return { document: emptyDocument(), mtimeMs: null, error: `Station metadata is unavailable: ${error.message}` };
  }
}

async function save(rootPath, document) {
  const directory = path.dirname(metadataPath(rootPath)); await fs.mkdir(directory, { recursive: true });
  const target = metadataPath(rootPath); const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  document.revision += 1;
  await fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporary, target);
  const stats = await fs.stat(target); cache.set(rootPath, { document: structuredClone(document), mtimeMs: stats.mtimeMs, error: null });
}

function mutate(rootPath, operation) {
  const next = (queues.get(rootPath) ?? Promise.resolve()).then(async () => {
    const loaded = await load(rootPath); if (loaded.error) throw new Error(loaded.error);
    const document = structuredClone(loaded.document); await operation(document); validateDocument(document); await save(rootPath, document); return getStationState(rootPath);
  });
  queues.set(rootPath, next.catch(() => {})); return next;
}

function flatten(entries, output = new Map()) {
  for (const entry of entries) { output.set(entry.relativePath, entry); if (entry.children) flatten(entry.children, output); }
  return output;
}

async function getStationState(rootPath) {
  const loaded = await load(rootPath); const known = flatten((await scanVault(rootPath)).entries); const counts = new Map(loaded.document.stations.map((station) => [station.id, 0]));
  const assignments = loaded.document.assignments.map((assignment) => { assignment.stationIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)); return { ...assignment, missing: !known.has(assignment.relativePath) }; });
  let contextEstimatedTokens = 0; const activeContext = [];
  for (const item of loaded.document.activeContext) {
    const entry = known.get(item.relativePath); const missing = !entry; let changed = false;
    if (entry?.kind === "file") { const content = entry.extension === ".pdf" ? getIndexedPdfText(rootPath, entry.relativePath) ?? "" : (await readVaultFile(rootPath, entry.relativePath)).content; contextEstimatedTokens += Math.ceil(content.length / 4); if (item.fingerprint) { const current = await fingerprint(rootPath, entry.relativePath, "file"); changed = Boolean(item.fingerprint.sha256 && item.fingerprint.sha256 !== current.sha256); } }
    activeContext.push({ ...item, missing, changed });
  }
  return { schemaVersion: SCHEMA_VERSION, revision: loaded.document.revision, stations: loaded.document.stations.map((station) => ({ ...station, assignmentCount: counts.get(station.id) ?? 0 })), assignments, activeContext, contextEstimatedTokens, writable: !loaded.error, error: loaded.error };
}

function createStation(rootPath, value) { return mutate(rootPath, (document) => { const name = normalizeName(value); if (document.stations.some((station) => station.name === name)) throw new Error(`Station “${name}” already exists.`); const now = new Date().toISOString(); document.stations.push({ id: crypto.randomUUID(), name, createdAt: now, updatedAt: now }); }); }
function renameStation(rootPath, stationId, value) { return mutate(rootPath, (document) => { const station = document.stations.find((item) => item.id === stationId); if (!station) throw new Error("Station not found."); const name = normalizeName(value); if (document.stations.some((item) => item.id !== stationId && item.name === name)) throw new Error(`Station “${name}” already exists.`); station.name = name; station.updatedAt = new Date().toISOString(); }); }
function deleteStation(rootPath, stationId) { return mutate(rootPath, (document) => { if (!document.stations.some((station) => station.id === stationId)) throw new Error("Station not found."); document.stations = document.stations.filter((station) => station.id !== stationId); document.assignments = document.assignments.map((assignment) => ({ ...assignment, stationIds: assignment.stationIds.filter((id) => id !== stationId) })).filter((assignment) => assignment.stationIds.length); }); }

async function fingerprint(rootPath, relativePath, kind) {
  const absolute = resolveKnowledgeObject(rootPath, relativePath); const stats = await fs.stat(absolute);
  if (kind === "folder") return { size: 0, modifiedMs: stats.mtimeMs };
  return { size: stats.size, modifiedMs: stats.mtimeMs, sha256: crypto.createHash("sha256").update(await fs.readFile(absolute)).digest("hex") };
}

function setAssignments(rootPath, relativePaths, stationId, assigned) {
  return mutate(rootPath, async (document) => {
    if (!document.stations.some((station) => station.id === stationId)) throw new Error("Station not found.");
    const known = flatten((await scanVault(rootPath)).entries);
    for (const relativePath of [...new Set(relativePaths)]) {
      const entry = known.get(relativePath); if (!entry) throw new Error(`Knowledge object not found: ${relativePath}`);
      let record = document.assignments.find((item) => item.relativePath === relativePath);
      if (assigned && !record) { record = { relativePath, kind: entry.kind, stationIds: [], fingerprint: await fingerprint(rootPath, relativePath, entry.kind) }; document.assignments.push(record); }
      if (!record) continue;
      record.stationIds = assigned ? [...new Set([...record.stationIds, stationId])] : record.stationIds.filter((id) => id !== stationId);
      if (!record.stationIds.length) document.assignments = document.assignments.filter((item) => item !== record);
    }
  });
}

function collectFiles(entry, output = []) { if (entry.kind === "file" && SUPPORTED.has(entry.extension)) output.push(entry.relativePath); for (const child of entry.children ?? []) collectFiles(child, output); return output; }
async function previewContext(rootPath, relativePaths) {
  const known = flatten((await scanVault(rootPath)).entries); const files = [];
  for (const relativePath of [...new Set(relativePaths)]) { const entry = known.get(relativePath); if (!entry) throw new Error(`Knowledge object not found: ${relativePath}`); if (entry.kind === "folder") files.push(...collectFiles(entry)); else if (SUPPORTED.has(entry.extension)) files.push(relativePath); }
  const unique = [...new Set(files)].sort(); let estimatedTokens = 0;
  for (const relativePath of unique) { const entry = known.get(relativePath); const content = entry.extension === ".pdf" ? getIndexedPdfText(rootPath, relativePath) ?? "" : (await readVaultFile(rootPath, relativePath)).content; estimatedTokens += Math.ceil(content.length / 4); }
  return { files: unique, estimatedTokens };
}
function addContext(rootPath, relativePaths) { return mutate(rootPath, async (document) => { const preview = await previewContext(rootPath, relativePaths); const existing = new Set(document.activeContext.map((entry) => entry.relativePath)); for (const relativePath of preview.files) if (!existing.has(relativePath)) document.activeContext.push({ relativePath, addedAt: new Date().toISOString(), fingerprint: await fingerprint(rootPath, relativePath, "file") }); }); }
function removeContext(rootPath, relativePaths) { return mutate(rootPath, (document) => { const paths = new Set(relativePaths); document.activeContext = document.activeContext.filter((entry) => !paths.has(entry.relativePath)); }); }
function clearContext(rootPath) { return mutate(rootPath, (document) => { document.activeContext = []; }); }

async function buildContextPackage(rootPath) {
  const loaded = await load(rootPath); const known = flatten((await scanVault(rootPath)).entries); const assignmentMap = new Map(loaded.document.assignments.map((item) => [item.relativePath, item.stationIds])); const stationMap = new Map(loaded.document.stations.map((item) => [item.id, item.name])); const sources = [];
  for (const [order, item] of loaded.document.activeContext.entries()) {
    const entry = known.get(item.relativePath);
    if (!entry || entry.kind !== "file" || !SUPPORTED.has(entry.extension)) { sources.push({ id: item.relativePath, relativePath: item.relativePath, order, missing: true, stations: [], content: null, contentHash: null, estimatedTokens: 0 }); continue; }
    const content = entry.extension === ".pdf" ? getIndexedPdfText(rootPath, entry.relativePath) ?? "" : (await readVaultFile(rootPath, entry.relativePath)).content;
    sources.push({ id: entry.relativePath, relativePath: entry.relativePath, name: entry.name, type: entry.extension.slice(1), order, missing: false, stations: (assignmentMap.get(entry.relativePath) ?? []).map((id) => stationMap.get(id)).filter(Boolean), content, contentHash: crypto.createHash("sha256").update(content).digest("hex"), estimatedTokens: Math.ceil(content.length / 4) });
  }
  return { schemaVersion: SCHEMA_VERSION, vault: { rootPath }, generatedAt: new Date().toISOString(), tokenEstimateMethod: "ceil(characters / 4)", estimatedTokens: sources.reduce((sum, source) => sum + source.estimatedTokens, 0), sources };
}

async function readableSource(rootPath, entry, assignmentMap, stationMap, recordedContext) {
  const extension = entry.extension.toLowerCase();
  const content = extension === ".pdf" ? getIndexedPdfText(rootPath, entry.relativePath) ?? "" : (await readVaultFile(rootPath, entry.relativePath)).content;
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  const recorded = recordedContext?.get(entry.relativePath);
  return {
    id: entry.relativePath,
    relativePath: entry.relativePath,
    name: entry.name,
    type: extension.slice(1),
    stations: (assignmentMap.get(entry.relativePath) ?? []).map((id) => stationMap.get(id)).filter(Boolean),
    estimatedTokens: Math.ceil(content.length / 4),
    contentHash,
    missing: false,
    changed: Boolean(recorded?.fingerprint?.sha256 && recorded.fingerprint.sha256 !== contentHash),
  };
}

async function prepareBrainScope(rootPath, rawInput = {}) {
  const input = rawInput && typeof rawInput === "object" ? rawInput : {};
  const matchMode = input.matchMode === "all" ? "all" : "any";
  const loaded = await load(rootPath);
  if (loaded.error) throw new Error(loaded.error);
  const snapshot = await scanVault(rootPath);
  if (snapshot.status !== "ready") throw new Error(snapshot.message || "Vault is unavailable.");
  const known = flatten(snapshot.entries);
  const stationMap = new Map(loaded.document.stations.map((station) => [station.id, station.name]));
  const activeStationIds = [...new Set(Array.isArray(input.activeStationIds) ? input.activeStationIds : [])]
    .filter((id) => stationMap.has(id))
    .sort();
  const assignmentMap = new Map(loaded.document.assignments.map((item) => [item.relativePath, item.stationIds]));
  const recordedContext = new Map(loaded.document.activeContext.map((item) => [item.relativePath, item]));
  const selectedPaths = new Set();
  let mode;
  let reason;

  if (loaded.document.activeContext.length > 0) {
    mode = "active-context";
    reason = "Active Context overrides the current Planet view.";
    loaded.document.activeContext.forEach((item) => selectedPaths.add(item.relativePath));
  } else if (activeStationIds.length > 0) {
    mode = "station";
    reason = `${matchMode.toUpperCase()} match across ${activeStationIds.length} active Station${activeStationIds.length === 1 ? "" : "s"}.`;
    for (const assignment of loaded.document.assignments) {
      const count = activeStationIds.filter((id) => assignment.stationIds.includes(id)).length;
      if ((matchMode === "any" && count > 0) || (matchMode === "all" && count === activeStationIds.length)) selectedPaths.add(assignment.relativePath);
    }
  } else {
    mode = "universe";
    reason = "No Station or Active Context narrows the universal vault.";
    for (const entry of known.values()) if (entry.kind === "file" && SUPPORTED.has(entry.extension)) selectedPaths.add(entry.relativePath);
  }

  const filePaths = new Set();
  const missing = [];
  for (const relativePath of selectedPaths) {
    const entry = known.get(relativePath);
    if (!entry) { missing.push(relativePath); continue; }
    if (entry.kind === "folder") collectFiles(entry).forEach((pathValue) => filePaths.add(pathValue));
    else if (SUPPORTED.has(entry.extension)) filePaths.add(relativePath);
  }
  const sources = [];
  for (const relativePath of [...filePaths].sort()) {
    const entry = known.get(relativePath);
    if (entry?.kind === "file" && SUPPORTED.has(entry.extension)) sources.push(await readableSource(rootPath, entry, assignmentMap, stationMap, recordedContext));
  }
  for (const relativePath of missing.sort()) sources.push({ id: relativePath, relativePath, name: path.basename(relativePath), type: "md", stations: [], estimatedTokens: 0, contentHash: null, missing: true, changed: false });

  const scope = {
    id: crypto.randomUUID(),
    mode,
    reason,
    stationIds: activeStationIds,
    stationNames: activeStationIds.map((id) => stationMap.get(id)),
    createdAt: new Date().toISOString(),
    estimatedTokens: sources.reduce((sum, source) => sum + source.estimatedTokens, 0),
    sources,
  };
  const resolvedRoot = path.resolve(rootPath);
  for (const [existingId, existing] of brainScopes) if (existing.rootPath === resolvedRoot) brainScopes.delete(existingId);
  brainScopes.set(scope.id, { rootPath: resolvedRoot, allowed: new Map(sources.filter((source) => !source.missing).map((source) => [source.id, source.contentHash])) });
  while (brainScopes.size > 32) brainScopes.delete(brainScopes.keys().next().value);
  return scope;
}

async function readBrainSource(rootPath, scopeId, sourceId) {
  const scope = brainScopes.get(scopeId);
  if (!scope || scope.rootPath !== path.resolve(rootPath)) throw new Error("Brain scope is unavailable or expired.");
  if (!scope.allowed.has(sourceId)) throw new Error("Source is outside the prepared Brain scope.");
  const snapshot = await scanVault(rootPath);
  const entry = flatten(snapshot.entries).get(sourceId);
  if (!entry || entry.kind !== "file" || !SUPPORTED.has(entry.extension)) throw new Error("Brain source is missing or unsupported.");
  const extension = entry.extension.toLowerCase();
  const content = extension === ".pdf" ? getIndexedPdfText(rootPath, sourceId) ?? "" : (await readVaultFile(rootPath, sourceId)).content;
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  if (scope.allowed.get(sourceId) !== contentHash) throw new Error("Brain source changed after the scope was prepared. Prepare a fresh scope before reading it.");
  return { scopeId, sourceId, relativePath: sourceId, type: extension.slice(1), content, contentHash, estimatedTokens: Math.ceil(content.length / 4) };
}

async function suggestReattachments(rootPath) {
  const loaded = await load(rootPath); const known = flatten((await scanVault(rootPath)).entries); const suggestions = [];
  for (const assignment of loaded.document.assignments.filter((item) => !known.has(item.relativePath) && item.fingerprint?.sha256)) { const candidates = []; for (const entry of known.values()) if (entry.kind === "file") { const stats = await fs.stat(resolveKnowledgeObject(rootPath, entry.relativePath)); if (stats.size === assignment.fingerprint.size && (await fingerprint(rootPath, entry.relativePath, "file")).sha256 === assignment.fingerprint.sha256) candidates.push(entry.relativePath); } suggestions.push({ relativePath: assignment.relativePath, candidates }); }
  return suggestions;
}
function reattach(rootPath, fromPath, toPath) { return mutate(rootPath, async (document) => { const record = document.assignments.find((item) => item.relativePath === fromPath); if (!record) throw new Error("Orphaned assignment not found."); const stats = await fs.stat(resolveKnowledgeObject(rootPath, toPath)); record.relativePath = toPath; record.kind = stats.isDirectory() ? "folder" : "file"; record.fingerprint = await fingerprint(rootPath, toPath, record.kind); document.activeContext = document.activeContext.map((entry) => entry.relativePath === fromPath ? { ...entry, relativePath: toPath } : entry); }); }

module.exports = { addContext, buildContextPackage, clearContext, createStation, deleteStation, getStationState, normalizeName, prepareBrainScope, previewContext, readBrainSource, reattach, removeContext, renameStation, setAssignments, suggestReattachments };
