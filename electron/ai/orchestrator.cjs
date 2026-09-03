const crypto = require("node:crypto");
const { MODEL_ERROR_CODES, ModelRuntimeError } = require("./model-errors.cjs");
const { buildContextMessages, validateUserMessage } = require("./prompt-builder.cjs");

const ANSWER_FORMAT = Object.freeze({
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
});

function contextError(message, details = {}) {
  return new ModelRuntimeError(MODEL_ERROR_CODES.CONTEXT_INVALID, message, details);
}

function serializeRunError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : MODEL_ERROR_CODES.INTERNAL,
    message: error instanceof Error ? error.message : "An unexpected model run error occurred.",
    details: error?.details && typeof error.details === "object" && !Array.isArray(error.details) ? structuredClone(error.details) : {},
  };
}

function sourceReference(source) {
  return { sourceId: source.sourceId ?? source.id, relativePath: source.relativePath, contentHash: source.contentHash ?? null };
}

function validateRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== "object" || Array.isArray(rawRequest)) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Context model request must be an object.");
  const allowed = new Set(["model", "userMessage", "activeStationIds", "matchMode"]);
  const unknown = Object.keys(rawRequest).filter((field) => !allowed.has(field));
  if (unknown.length) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "Context model request contains unsupported fields.", { fields: unknown });
  if (typeof rawRequest.model !== "string" || !rawRequest.model.trim()) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "A local model name is required.", { field: "model" });
  if (!Array.isArray(rawRequest.activeStationIds) || rawRequest.activeStationIds.some((id) => typeof id !== "string" || !id)) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, "activeStationIds must be an array of Station identifiers.", { field: "activeStationIds" });
  if (!['any', 'all'].includes(rawRequest.matchMode)) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_REQUEST, 'matchMode must be either "any" or "all".', { field: "matchMode" });
  return {
    model: rawRequest.model.trim(),
    userMessage: validateUserMessage(rawRequest.userMessage),
    activeStationIds: [...new Set(rawRequest.activeStationIds)].sort(),
    matchMode: rawRequest.matchMode,
  };
}

function createContextOrchestrator({ prepareScope, readSource, provider, recordRun, randomUUID = crypto.randomUUID, promptBuilder = buildContextMessages, now = Date.now, providerName = "ollama" }) {
  if (typeof prepareScope !== "function" || typeof readSource !== "function" || typeof provider?.complete !== "function" || typeof recordRun !== "function") throw new TypeError("Context orchestrator dependencies are incomplete.");

  return {
    async run(rawRequest) {
      const request = validateRequest(rawRequest);
      const runId = randomUUID();
      const ownerId = `model-run:${runId}`;
      const startedMs = now();
      const startedAt = new Date(startedMs).toISOString();
      let scope = null;
      let promptVersion = null;
      let sourcesAvailable = [];
      let sourcesActuallyRead = [];
      try {
          scope = await prepareScope({ ownerId, activeStationIds: request.activeStationIds, matchMode: request.matchMode });
          sourcesAvailable = Array.isArray(scope?.sources) ? scope.sources.map(sourceReference) : [];
          if (scope?.mode !== "active-context") throw contextError("M7.2 requires a non-empty Active Context.", { scopeMode: scope?.mode ?? null });
          if (!Array.isArray(scope.sources) || scope.sources.length !== 1) throw contextError("M7.2 requires exactly one approved Active Context source.", { sourceCount: Array.isArray(scope?.sources) ? scope.sources.length : null });
          const manifestSource = scope.sources[0];
          if (!["md", "markdown"].includes(manifestSource.type) || manifestSource.missing || manifestSource.changed || !manifestSource.contentHash) {
            throw contextError("M7.2 requires one available, unchanged Markdown source.", { sourceId: manifestSource.id, type: manifestSource.type, missing: manifestSource.missing, changed: manifestSource.changed });
          }

          const source = await readSource({ ownerId, scopeId: scope.id, sourceId: manifestSource.id });
          if (source.scopeId !== scope.id || source.ownerId !== ownerId || source.manifestVersion !== scope.manifestVersion || source.sourceId !== manifestSource.id || source.relativePath !== manifestSource.relativePath || source.contentHash !== manifestSource.contentHash) {
            throw contextError("The controlled source read did not match the prepared Brain Scope manifest.", { sourceId: manifestSource.id });
          }
          sourcesActuallyRead = [sourceReference(source)];
          const prompt = promptBuilder({ userMessage: request.userMessage, source });
          promptVersion = prompt.promptVersion;
          const response = await provider.complete({ id: runId, model: request.model, messages: prompt.messages, scope, format: ANSWER_FORMAT });
          let answer;
          try {
            const parsed = JSON.parse(response.content);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.answer === "string" && parsed.answer.trim()) answer = parsed.answer.trim();
          } catch {}
          if (!answer) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "The model did not return the required context-answer structure.");
          const completedMs = now();
          const result = { ...response, id: runId, content: answer, sources: sourcesActuallyRead, scopeId: scope.id, scopeMode: scope.mode, scopeManifestVersion: scope.manifestVersion, promptVersion };
          await recordRun({ schemaVersion: 1, runId, status: "succeeded", startedAt, completedAt: new Date(completedMs).toISOString(), durationMs: Math.max(0, completedMs - startedMs), scope: { id: scope.id, mode: scope.mode, manifestVersion: scope.manifestVersion }, provider: response.provider || providerName, model: response.model || request.model, promptVersion, userMessage: request.userMessage, sourcesAvailable, sourcesActuallyRead, response: answer, finishReason: response.finishReason, usage: response.usage ?? null, error: null });
          return result;
      } catch (error) {
        const completedMs = now();
        const failure = serializeRunError(error);
        try {
          await recordRun({ schemaVersion: 1, runId, status: "failed", startedAt, completedAt: new Date(completedMs).toISOString(), durationMs: Math.max(0, completedMs - startedMs), scope: scope ? { id: scope.id, mode: scope.mode, manifestVersion: scope.manifestVersion } : null, provider: providerName, model: request.model, promptVersion, userMessage: request.userMessage, sourcesAvailable, sourcesActuallyRead, response: null, finishReason: null, usage: null, error: failure });
        } catch (recordError) {
          throw new ModelRuntimeError(MODEL_ERROR_CODES.RUN_RECORD_FAILED, "The failed model execution could not be recorded.", { runId, originalError: failure, recordError: serializeRunError(recordError) });
        }
        throw error;
      }
    },
  };
}

module.exports = { ANSWER_FORMAT, createContextOrchestrator, validateRequest };
