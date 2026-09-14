const crypto = require("node:crypto");
const { MODEL_ERROR_CODES, ModelRuntimeError } = require("./model-errors.cjs");
const {
  buildContextMessages,
  validateUserMessage,
} = require("./prompt-builder.cjs");
const { contextIdentity } = require("./context-identity.cjs");
const { budgetHistory } = require("./history-budget.cjs");
const { validateAnswer, answerPrefix } = require("./response-validation.cjs");
const { DEFAULTS } = require("./model-registry.cjs");
const { createDatasetSession } = require("./dataset-session.cjs");
const { planDataset } = require("./dataset-planner.cjs");
const { validateDatasetAnswer } = require("./dataset-evidence.cjs");

const ANSWER_FORMAT = Object.freeze({
  type: "object",
  properties: {
    answer: {
      type: "string",
      description:
        "The completed useful answer, grounded in the approved source and conversation. Perform the user's task; never echo their request.",
    },
  },
  required: ["answer"],
  additionalProperties: false,
});

function contextError(message, details = {}) {
  return new ModelRuntimeError(
    MODEL_ERROR_CODES.CONTEXT_INVALID,
    message,
    details,
  );
}

function serializeRunError(error) {
  return {
    code:
      typeof error?.code === "string" ? error.code : MODEL_ERROR_CODES.INTERNAL,
    message:
      error instanceof Error
        ? error.message
        : "An unexpected model run error occurred.",
    details:
      error?.details &&
      typeof error.details === "object" &&
      !Array.isArray(error.details)
        ? structuredClone(error.details)
        : {},
  };
}

function sourceReference(source) {
  return {
    sourceId: source.sourceId ?? source.id,
    relativePath: source.relativePath,
    contentHash: source.contentHash ?? null,
  };
}

function validateRequest(rawRequest) {
  if (
    !rawRequest ||
    typeof rawRequest !== "object" ||
    Array.isArray(rawRequest)
  )
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      "Context model request must be an object.",
    );
  const allowed = new Set([
    "model",
    "userMessage",
    "history",
    "activeStationIds",
    "matchMode",
  ]);
  const unknown = Object.keys(rawRequest).filter(
    (field) => !allowed.has(field),
  );
  if (unknown.length)
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      "Context model request contains unsupported fields.",
      { fields: unknown },
    );
  if (typeof rawRequest.model !== "string" || !rawRequest.model.trim())
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      "A model name is required.",
      { field: "model" },
    );
  if (
    !Array.isArray(rawRequest.activeStationIds) ||
    rawRequest.activeStationIds.some((id) => typeof id !== "string" || !id)
  )
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      "activeStationIds must be an array of Station identifiers.",
      { field: "activeStationIds" },
    );
  if (!["any", "all"].includes(rawRequest.matchMode))
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      'matchMode must be either "any" or "all".',
      { field: "matchMode" },
    );
  const history = rawRequest.history ?? [];
  if (
    !Array.isArray(history) ||
    history.length > 24 ||
    history.some(
      (message) =>
        !message ||
        typeof message !== "object" ||
        !["user", "assistant"].includes(message.role) ||
        typeof message.content !== "string" ||
        !message.content.trim() ||
        message.content.length > 100_000,
    )
  ) {
    throw new ModelRuntimeError(
      MODEL_ERROR_CODES.INVALID_REQUEST,
      "Chat history must contain at most twelve valid exchanges.",
      { field: "history" },
    );
  }
  return {
    model: rawRequest.model.trim(),
    userMessage: validateUserMessage(rawRequest.userMessage),
    history: history.map((message) => ({
      role: message.role,
      content: message.content.trim(),
    })),
    activeStationIds: [...new Set(rawRequest.activeStationIds)].sort(),
    matchMode: rawRequest.matchMode,
  };
}

function createContextOrchestrator({
  prepareScope,
  readSource,
  provider,
  recordRun,
  randomUUID = crypto.randomUUID,
  promptBuilder = buildContextMessages,
  now = Date.now,
  providerName = "ollama",
}) {
  if (
    typeof prepareScope !== "function" ||
    typeof readSource !== "function" ||
    typeof provider?.complete !== "function" ||
    typeof recordRun !== "function"
  )
    throw new TypeError("Context orchestrator dependencies are incomplete.");

  return {
    async run(rawRequest, options = {}) {
      const request = validateRequest(rawRequest);
      const runId = options.runId ?? randomUUID();
      const settings = { ...DEFAULTS, ...options.settings };
      const diagnostics = {
        executionLocation: providerName === "ollama" ? "local" : "remote",
      };
      // Share one retry across loading, initial generation and answer repair.
      // The ChatService signal still owns the original absolute deadline.
      const recoverTimeout = async (state, operation) => {
        try {
          return await operation();
        } catch (error) {
          if (
            error.code !== "MODEL_TIMEOUT" ||
            options.signal?.aborted ||
            !options.signal ||
            diagnostics.timeoutRetryCount
          )
            throw error;
          diagnostics.timeoutRetryCount = 1;
          diagnostics.timeoutRetryPhase = error.details?.phase ?? state;
          options.onEvent?.({
            state,
            content: "",
            diagnostics: { ...diagnostics },
          });
          options.signal.throwIfAborted();
          return await operation();
        }
      };
      const stage = (state) => {
        options.signal?.throwIfAborted();
        options.onEvent?.({ state });
      };
      const measure = async (name, operation) => {
        const start = performance.now();
        try {
          return await operation();
        } finally {
          diagnostics[name] = Math.round(performance.now() - start);
        }
      };
      const ownerId = `model-run:${runId}`;
      const startedMs = now();
      const startedAt = new Date(startedMs).toISOString();
      let scope = null;
      let promptVersion = null;
      let sourcesAvailable = [];
      let sourcesActuallyRead = [];
      let datasetSession;
      const recordMetadata = () =>
        options.conversationId
          ? {
              schemaVersion: 2,
              conversationId: options.conversationId,
              requestId: options.requestId,
              contextIdentity: options.contextIdentity,
              settings,
              diagnostics,
            }
          : { schemaVersion: 1 };
      try {
        stage("PREPARING_CONTEXT");
        scope = await measure("scopeMs", () =>
          prepareScope({
            ownerId,
            activeStationIds: request.activeStationIds,
            matchMode: request.matchMode,
          }),
        );
        const identity = contextIdentity(scope);
        if (
          options.contextIdentity &&
          identity.id !== options.contextIdentity.id
        )
          throw contextError(
            "Active Context changed. Start a new conversation.",
          );
        sourcesAvailable = Array.isArray(scope?.sources)
          ? scope.sources.map(sourceReference)
          : [];
        const sources = [];
        for (const manifestSource of scope.sources) {
          options.signal?.throwIfAborted();

          const source = await measure("sourceReadMs", () =>
            readSource({
              ownerId,
              scopeId: scope.id,
              sourceId: manifestSource.id,
            }),
          );
          if (
            source.scopeId !== scope.id ||
            source.ownerId !== ownerId ||
            source.manifestVersion !== scope.manifestVersion ||
            source.sourceId !== manifestSource.id ||
            source.relativePath !== manifestSource.relativePath ||
            source.contentHash !== manifestSource.contentHash ||
            source.type !== manifestSource.type
          ) {
            throw contextError(
              "The controlled source read did not match the prepared Brain Scope manifest.",
              { sourceId: manifestSource.id },
            );
          }
          sources.push(source);
          sourcesActuallyRead.push(sourceReference(source));
        }
        const csvSources = sources.filter((source) => source.type === "csv");
        if (csvSources.length) {
          if (
            csvSources.reduce(
              (sum, source) => sum + Buffer.byteLength(source.content),
              0,
            ) >
            50 * 1024 * 1024
          )
            throw new ModelRuntimeError(
              "MODEL_CONTEXT_TOO_LARGE",
              "CSV analysis supports up to 50 MB of combined approved CSV data. Select fewer or smaller datasets.",
            );
          datasetSession = createDatasetSession(options.signal);
          const profiles = await measure("datasetReadMs", () =>
            datasetSession.call("load", { sources: csvSources }),
          );
          for (const source of csvSources) {
            const profile = profiles.find(
              (item) => item.sourceId === source.sourceId,
            );
            source.content = JSON.stringify({
              kind: "dataset-profile",
              ...profile,
            });
          }
        }
        if (options.prepareModel && typeof provider.prepare === "function") {
          stage(
            providerName === "ollama" ? "MODEL_LOADING" : "REMOTE_CONNECTING",
          );
          await measure("modelLoadMs", () =>
            recoverTimeout("MODEL_LOADING", () =>
              provider.prepare(request.model, settings, options.signal),
            ),
          );
        }
        if (datasetSession) {
          stage("GENERATING");
          const previousAnalyses = [];
          for (const previous of (options.datasetHistory ?? []).slice(-2)) {
            if (previous.contextIdentityId !== identity.id) continue;
            let results;
            try {
              results = await datasetSession.call("query", {
                queries: previous.queries,
              });
            } catch (error) {
              options.signal?.throwIfAborted();
              if (error.code !== "MODEL_INVALID_REQUEST") throw error;
              // An older app may have accepted a now-unsupported query. Optional
              // memory must not prevent a new analysis with current validation.
              diagnostics.skippedDatasetHistory ??= [];
              diagnostics.skippedDatasetHistory.push({
                runId: previous.runId,
                reason: error.message,
              });
              continue;
            }
            const entry = {
              runId: previous.runId,
              question: previous.question,
              queries: previous.queries,
              results,
            };
            // Analytical memory is optional and bounded independently of source data.
            if (JSON.stringify([...previousAnalyses, entry]).length <= 6000)
              previousAnalyses.push(entry);
          }
          diagnostics.datasetHistory = previousAnalyses;
          for (const source of csvSources) {
            const previousResults = previousAnalyses.flatMap((entry) =>
              entry.results
                .filter((result) => result.sourceId === source.sourceId)
                .map((result) => ({ question: entry.question, result })),
            );
            if (previousResults.length)
              source.content = JSON.stringify({
                ...JSON.parse(source.content),
                previousResults,
              });
          }
          const results = await measure("datasetAnalysisMs", () =>
            planDataset({
              session: datasetSession,
              sources,
              model: request.model,
              settings,
              signal: options.signal,
              history: request.history,
              userMessage: request.userMessage,
              diagnostics,
              complete: (input) =>
                recoverTimeout("GENERATING", () =>
                  provider.complete({ ...input, id: runId, scope }),
                ),
            }),
          );
          for (const source of csvSources)
            source.content = JSON.stringify({
              kind: "dataset-analysis",
              profile: JSON.parse(source.content),
              computedResults: results.filter(
                (result) => result.sourceId === source.sourceId,
              ),
              evidenceRule:
                "Computed results cover all matched rows before pagination. Samples are previews only. Cite the file, columns, filters and matched row count. Do not claim unsupported analyses or calculate unseen results. Explain nulls and any truncation.",
            });
          await datasetSession.close();
          datasetSession = null;
        }
        const base = promptBuilder({
          userMessage: request.userMessage,
          sources,
        });
        const budget = budgetHistory(base.messages, request.history, settings);
        Object.assign(diagnostics, budget.diagnostics);
        diagnostics.droppedExchanges += options.earlierExchangesDropped ?? 0;
        diagnostics.includedExchanges = budget.history.length / 2;
        const prompt = promptBuilder({
          userMessage: request.userMessage,
          history: budget.history,
          sources,
        });
        promptVersion = prompt.promptVersion;
        stage("GENERATING");
        const generate = (messages, answerRepair = false) =>
          recoverTimeout("GENERATING", () =>
            provider.complete({
              id: runId,
              model: request.model,
              messages,
              scope,
              format: ANSWER_FORMAT,
              contextWindow: settings.contextWindow,
              settings,
              answerRepair,
              signal: options.signal,
              onContent: (raw) => {
                if (csvSources.length) return;
                const content = answerPrefix(raw);
                if (content)
                  options.onEvent?.({ state: "GENERATING", content });
              },
            }),
          );
        let response = await measure("generationMs", () =>
          generate(prompt.messages),
        );
        stage("VALIDATING");
        let answer;
        const validate = (response) => {
          const text = validateAnswer(
            response,
            request.userMessage,
            request.history,
          );
          return diagnostics.datasetAnalysis
            ? validateDatasetAnswer(
                text,
                [
                  ...diagnostics.datasetAnalysis.results,
                  ...(diagnostics.datasetHistory ?? []).flatMap(
                    (entry) => entry.results,
                  ),
                ],
                request.userMessage,
                sources
                  .filter((source) => source.type !== "csv")
                  .map((source) => source.content),
              )
            : text;
        };
        try {
          answer = validate(response);
        } catch (error) {
          if (
            ![
              "task_echo",
              "planning",
              "repeated_answer",
              "dataset_unsupported_number",
            ].includes(error.details?.reason)
          )
            throw error;
          // One bounded final-answer repair within the same authorized run. Never
          // append rejected content to conversation history or execute tools.
          diagnostics.validationRepairCount = 1;
          diagnostics.initialValidationFailure = error.details.reason;
          diagnostics.initialUsage = response.usage;
          options.onEvent?.({ state: "VALIDATING", content: "" });
          const correction =
            error.details.reason === "dataset_unsupported_number"
              ? "The previous answer introduced quantities absent from the computed dataset results. Use only the supplied computed values, without estimating, inferring missing totals or inventing units. If the needed calculation was not performed, state that limitation."
              : error.details.reason === "repeated_answer"
                ? "The previous attempt copied an earlier answer to a different question. Answer the LAST user message directly from the approved source. Follow its requested count and format. Supply the requested facts or deliverable, not the earlier general summary."
                : "The previous response only repeated the task or described a plan. Produce the requested content itself now. Use concrete facts from the source and discussion. The answer must be the actual completed deliverable, not an instruction to create it.";
          const withCorrection = (messages) =>
            messages.map((message, index) =>
              index === 0
                ? {
                    ...message,
                    content: `${message.content}\nCORRECTION: ${correction}`,
                  }
                : message,
            );
          const repairBudget = budgetHistory(
            withCorrection(base.messages),
            request.history,
            settings,
          );
          diagnostics.repairEstimatedPromptTokens =
            repairBudget.diagnostics.estimatedPromptTokens;
          diagnostics.repairDroppedExchanges =
            repairBudget.diagnostics.droppedExchanges +
            (options.earlierExchangesDropped ?? 0);
          diagnostics.initialDroppedExchanges = diagnostics.droppedExchanges;
          diagnostics.droppedExchanges = diagnostics.repairDroppedExchanges;
          diagnostics.includedExchanges = repairBudget.history.length / 2;
          const repairedMessages = withCorrection(
            promptBuilder({
              userMessage: request.userMessage,
              history: repairBudget.history,
              sources,
            }).messages,
          );
          stage("GENERATING");
          response = await measure("repairGenerationMs", () =>
            generate(repairedMessages, true),
          );
          stage("VALIDATING");
          answer = validate(response);
        }
        if (response.diagnostics) diagnostics.provider = response.diagnostics;
        if (diagnostics.datasetAnalysis) {
          const analyses = [
            diagnostics.datasetAnalysis,
            ...(diagnostics.datasetHistory ?? []),
          ];
          const evidence = analyses.flatMap((analysis) =>
            analysis.results.map((result, index) => {
              const query = analysis.queries[index];
              const fields =
                query.metrics
                  ?.map((metric) => `${metric.op}(${metric.column || "rows"})`)
                  .join(", ") ||
                query.columns?.join(", ") ||
                "column profile";
              const operators = {
                eq: "=",
                ne: "≠",
                gt: ">",
                gte: "≥",
                lt: "<",
                lte: "≤",
                contains: "contains",
                is_missing: "is blank",
                not_missing: "is not blank",
              };
              const filters = query.filters?.length
                ? query.filters
                    .map(
                      (filter) =>
                        `${JSON.stringify(filter.column)} ${operators[filter.op]}${["is_missing", "not_missing"].includes(filter.op) ? "" : ` ${JSON.stringify(filter.value)}`}`,
                    )
                    .join(" AND ")
                : "none";
              const grouping = query.groupBy?.length
                ? `; grouped by ${query.groupBy.map((group) => `${JSON.stringify(group.column)}${group.unit && group.unit !== "value" ? ` (${group.unit})` : ""}`).join(", ")}`
                : "";
              const growth = query.growth
                ? `; growth of ${JSON.stringify(query.growth.metric)} from ${JSON.stringify(query.growth.from)} to ${JSON.stringify(query.growth.to)}`
                : "";
              return `${analysis.runId ? "Recomputed earlier analysis. " : ""}Source: ${JSON.stringify(result.sourceId)}; ${result.matchedRows}/${result.totalRows} rows matched; ${fields}; filters: ${filters}${grouping}${growth}${result.truncated ? "; result preview is paginated" : ""}.`;
            }),
          );
          answer += `\n\n${evidence.join("\n")}`;
        }
        const completedMs = now();
        const result = {
          ...response,
          id: runId,
          content: answer,
          sources: sourcesActuallyRead,
          scopeId: scope.id,
          scopeMode: scope.mode,
          scopeManifestVersion: scope.manifestVersion,
          promptVersion,
          diagnostics,
        };
        stage("RECORDING");
        await recordRun({
          ...recordMetadata(),
          runId,
          status: "succeeded",
          startedAt,
          completedAt: new Date(completedMs).toISOString(),
          durationMs: Math.max(0, completedMs - startedMs),
          scope: {
            id: scope.id,
            mode: scope.mode,
            manifestVersion: scope.manifestVersion,
          },
          provider: response.provider || providerName,
          model: response.model || request.model,
          promptVersion,
          userMessage: request.userMessage,
          sourcesAvailable,
          sourcesActuallyRead,
          response: answer,
          finishReason: response.finishReason,
          usage: response.usage ?? null,
          error: null,
        });
        return result;
      } catch (error) {
        if (options.signal?.aborted)
          error = new ModelRuntimeError(
            options.signal.reason?.code ?? "MODEL_CANCELLED",
            options.signal.reason?.message ?? "The response was stopped.",
          );
        const completedMs = now();
        const failure = serializeRunError(error);
        try {
          await recordRun({
            ...recordMetadata(),
            runId,
            status:
              options.conversationId && failure.code === "MODEL_CANCELLED"
                ? "cancelled"
                : "failed",
            startedAt,
            completedAt: new Date(completedMs).toISOString(),
            durationMs: Math.max(0, completedMs - startedMs),
            scope: scope
              ? {
                  id: scope.id,
                  mode: scope.mode,
                  manifestVersion: scope.manifestVersion,
                }
              : null,
            provider: providerName,
            model: request.model,
            promptVersion,
            userMessage: request.userMessage,
            sourcesAvailable,
            sourcesActuallyRead,
            response: null,
            finishReason: null,
            usage: null,
            error: failure,
          });
        } catch (recordError) {
          throw new ModelRuntimeError(
            MODEL_ERROR_CODES.RUN_RECORD_FAILED,
            "The failed model execution could not be recorded.",
            {
              runId,
              originalError: failure,
              recordError: serializeRunError(recordError),
            },
          );
        }
        throw error;
      } finally {
        await datasetSession?.close();
      }
    },
  };
}

module.exports = {
  ANSWER_FORMAT,
  createContextOrchestrator,
  validateRequest,
};
