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

function createContextOrchestrator({ prepareScope, readSource, provider, randomUUID = crypto.randomUUID, promptBuilder = buildContextMessages }) {
  if (typeof prepareScope !== "function" || typeof readSource !== "function" || typeof provider?.complete !== "function") throw new TypeError("Context orchestrator dependencies are incomplete.");

  return {
    async run(rawRequest) {
      const request = validateRequest(rawRequest);
      const runId = randomUUID();
      const ownerId = `model-run:${runId}`;
      const scope = await prepareScope({ ownerId, activeStationIds: request.activeStationIds, matchMode: request.matchMode });
      if (scope?.mode !== "active-context") throw contextError("M7.2 requires a non-empty Active Context.", { scopeMode: scope?.mode ?? null });
      if (!Array.isArray(scope.sources) || scope.sources.length !== 1) throw contextError("M7.2 requires exactly one approved Active Context source.", { sourceCount: Array.isArray(scope?.sources) ? scope.sources.length : null });
      const manifestSource = scope.sources[0];
      if (!['md', 'markdown'].includes(manifestSource.type) || manifestSource.missing || manifestSource.changed || !manifestSource.contentHash) {
        throw contextError("M7.2 requires one available, unchanged Markdown source.", { sourceId: manifestSource.id, type: manifestSource.type, missing: manifestSource.missing, changed: manifestSource.changed });
      }

      const source = await readSource({ ownerId, scopeId: scope.id, sourceId: manifestSource.id });
      if (source.scopeId !== scope.id || source.ownerId !== ownerId || source.manifestVersion !== scope.manifestVersion || source.sourceId !== manifestSource.id || source.relativePath !== manifestSource.relativePath || source.contentHash !== manifestSource.contentHash) {
        throw contextError("The controlled source read did not match the prepared Brain Scope manifest.", { sourceId: manifestSource.id });
      }
      const prompt = promptBuilder({ userMessage: request.userMessage, source });
      const response = await provider.complete({ id: runId, model: request.model, messages: prompt.messages, scope, format: ANSWER_FORMAT });
      let answer;
      try {
        const parsed = JSON.parse(response.content);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof parsed.answer === "string" && parsed.answer.trim()) answer = parsed.answer.trim();
      } catch {}
      if (!answer) throw new ModelRuntimeError(MODEL_ERROR_CODES.INVALID_RESPONSE, "The model did not return the required context-answer structure.");
      const provenance = { sourceId: source.sourceId, relativePath: source.relativePath, contentHash: source.contentHash };
      return {
        ...response,
        id: runId,
        content: answer,
        sources: [provenance],
        scopeId: scope.id,
        scopeMode: scope.mode,
        scopeManifestVersion: scope.manifestVersion,
        promptVersion: prompt.promptVersion,
      };
    },
  };
}

module.exports = { ANSWER_FORMAT, createContextOrchestrator, validateRequest };
