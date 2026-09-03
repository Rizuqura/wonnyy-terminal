const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { MODEL_ERROR_CODES, ModelRuntimeError } = require("./model-errors.cjs");

const RUN_SCHEMA_VERSION = 1;
const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/u;

const runsDirectory = (rootPath) => path.join(path.resolve(rootPath), ".wonnyy", "model-runs");

function invalidRecord(message, details = {}) {
  throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_INVALID, message, details);
}

function validateError(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.code !== "string" || typeof value.message !== "string" || !value.details || typeof value.details !== "object" || Array.isArray(value.details)) invalidRecord("Model run error metadata is malformed.");
  return { code: value.code, message: value.message, details: structuredClone(value.details) };
}

function validateSource(value, field, allowMissingHash = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidRecord(`Model run ${field} source is malformed.`);
  for (const key of ["sourceId", "relativePath"]) if (typeof value[key] !== "string" || !value[key]) invalidRecord(`Model run ${field} source has an invalid ${key}.`);
  if ((!allowMissingHash && (typeof value.contentHash !== "string" || !CONTENT_HASH_PATTERN.test(value.contentHash))) || (allowMissingHash && value.contentHash !== null && (typeof value.contentHash !== "string" || !CONTENT_HASH_PATTERN.test(value.contentHash)))) invalidRecord(`Model run ${field} source has an invalid contentHash.`);
  return { sourceId: value.sourceId, relativePath: value.relativePath, contentHash: value.contentHash };
}

function validateRunRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidRecord("Model run record must be an object.");
  const allowed = new Set(["schemaVersion", "runId", "status", "startedAt", "completedAt", "durationMs", "scope", "provider", "model", "promptVersion", "userMessage", "sourcesAvailable", "sourcesActuallyRead", "response", "finishReason", "usage", "error"]);
  const unknown = Object.keys(value).filter((field) => !allowed.has(field));
  if (unknown.length) invalidRecord("Model run record contains unsupported fields.", { fields: unknown });
  if (value.schemaVersion !== RUN_SCHEMA_VERSION) invalidRecord("Model run schema version is unsupported.");
  if (typeof value.runId !== "string" || !RUN_ID_PATTERN.test(value.runId)) invalidRecord("Model run ID is invalid.");
  if (!["succeeded", "failed"].includes(value.status)) invalidRecord("Model run status is invalid.");
  const startedMs = Date.parse(value.startedAt);
  const completedMs = Date.parse(value.completedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs) || completedMs < startedMs) invalidRecord("Model run timestamps are invalid.");
  if (!Number.isFinite(value.durationMs) || value.durationMs < 0) invalidRecord("Model run duration is invalid.");
  if (typeof value.provider !== "string" || !value.provider || typeof value.model !== "string" || !value.model) invalidRecord("Model run provider or model is invalid.");
  if (typeof value.userMessage !== "string" || !value.userMessage) invalidRecord("Model run question is invalid.");
  if (!Array.isArray(value.sourcesAvailable) || !Array.isArray(value.sourcesActuallyRead)) invalidRecord("Model run source collections are invalid.");
  const scope = value.scope === null ? null : {
    id: value.scope?.id,
    mode: value.scope?.mode,
    manifestVersion: value.scope?.manifestVersion,
  };
  if (scope && [scope.id, scope.mode, scope.manifestVersion].some((item) => typeof item !== "string" || !item)) invalidRecord("Model run scope metadata is malformed.");
  if (scope && !["universe", "station", "active-context"].includes(scope.mode)) invalidRecord("Model run scope mode is invalid.");
  const succeeded = value.status === "succeeded";
  if (succeeded && (typeof value.response !== "string" || !value.response || typeof value.finishReason !== "string" || !value.finishReason || value.error !== null || !scope || typeof value.promptVersion !== "string" || !value.promptVersion)) invalidRecord("Successful model run data is incomplete.");
  if (!succeeded && (value.response !== null || value.finishReason !== null || value.error === null)) invalidRecord("Failed model run data is incomplete.");
  let usage = null;
  if (value.usage !== null) {
    if (!value.usage || typeof value.usage !== "object" || Array.isArray(value.usage) || Object.keys(value.usage).some((field) => !["promptTokens", "completionTokens", "totalDurationNs"].includes(field))) invalidRecord("Model run usage is malformed.");
    for (const field of ["promptTokens", "completionTokens", "totalDurationNs"]) if (value.usage[field] !== null && (!Number.isFinite(value.usage[field]) || value.usage[field] < 0)) invalidRecord("Model run usage is malformed.");
    usage = { promptTokens: value.usage.promptTokens ?? null, completionTokens: value.usage.completionTokens ?? null, totalDurationNs: value.usage.totalDurationNs ?? null };
  }
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId: value.runId,
    status: value.status,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    durationMs: value.durationMs,
    scope,
    provider: value.provider,
    model: value.model,
    promptVersion: value.promptVersion ?? null,
    userMessage: value.userMessage,
    sourcesAvailable: value.sourcesAvailable.map((source) => validateSource(source, "available", true)),
    sourcesActuallyRead: value.sourcesActuallyRead.map((source) => validateSource(source, "read")),
    response: value.response,
    finishReason: value.finishReason,
    usage,
    error: validateError(value.error),
  };
}

function runPath(rootPath, runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) invalidRecord("Model run ID is invalid.");
  return path.join(runsDirectory(rootPath), `${runId}.json`);
}

async function createModelRun(rootPath, rawRecord) {
  const record = validateRunRecord(rawRecord);
  const directory = runsDirectory(rootPath);
  await fs.mkdir(directory, { recursive: true });
  const target = runPath(rootPath, record.runId);
  const temporary = path.join(directory, `.${record.runId}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await fs.link(temporary, target);
    } catch (error) {
      if (error?.code === "EEXIST") throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_EXISTS, "An immutable record already exists for this model run.", { runId: record.runId });
      throw error;
    }
    return structuredClone(record);
  } catch (error) {
    if (error instanceof ModelRuntimeError) throw error;
    throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_FAILED, "The model run record could not be saved.", { runId: record.runId, cause: error instanceof Error ? error.message : String(error) });
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function readModelRun(rootPath, runId) {
  try {
    return validateRunRecord(JSON.parse(await fs.readFile(runPath(rootPath, runId), "utf8")));
  } catch (error) {
    if (error instanceof ModelRuntimeError) throw error;
    if (error?.code === "ENOENT") throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_NOT_FOUND, "Model run record was not found.", { runId });
    throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_INVALID, "Model run record is unreadable or malformed.", { runId });
  }
}

async function listModelRuns(rootPath) {
  let entries;
  try { entries = await fs.readdir(runsDirectory(rootPath), { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  const records = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).sort((a, b) => a.name.localeCompare(b.name))) records.push(await readModelRun(rootPath, entry.name.slice(0, -5)));
  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.runId.localeCompare(b.runId));
}

module.exports = { RUN_SCHEMA_VERSION, createModelRun, listModelRuns, readModelRun, validateRunRecord };
