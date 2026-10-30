/**
 * Purpose: measure existing inference calls without changing routing/retries.
 * Inputs: run identity, selected provider/model, adapter requests and responses.
 * Outputs: content-free BaselineTrace snapshots; original results/errors intact.
 * Dependencies: crypto, existing token estimator and metrics contract.
 * Failure modes: missing/invalid provider metrics become unknown, never zero.
 * Tuning knobs: enabled (default true); no logs, network or new retention store.
 * Owner: backend. The caller owns cancellation, retries and persistence.
 */
const { createHash } = require("node:crypto");
const { estimateTokens } = require("../history-budget.cjs");
const contracts = require("./contracts.cjs");

const knownCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;
const knownDuration = (value) =>
  Number.isFinite(value) && value >= 0 ? value : null;
const safeIdentity = (value) =>
  contracts.identity.safeParse(value).success ? value : "unknown";
const safeProvider = (value) =>
  contracts.providerId.safeParse(value).success ? value : "unknown";
const safeError = (error) =>
  contracts.errorCode.safeParse(error?.code).success
    ? error.code
    : "MODEL_INTERNAL_ERROR";
const elapsed = (clock, start) => Math.max(0, Math.round(clock() - start));

/**
 * Create a run-scoped passive observer. Inject clocks for deterministic tests.
 * complete() preserves adapter receiver, callbacks, result identity and errors.
 * finish() closes run timing; snapshot() returns an independent allowlisted copy.
 * No prompt, response, header, credential or raw exception is retained.
 * @returns {{ complete: Function, finish: Function, snapshot: Function }}
 */
function createBaselineObserver({
  enabled = true,
  mode = "existing-agent-baseline",
  requestId,
  runId,
  conversationId,
  providerId,
  modelId,
  wallClock = Date.now,
  clock = () => performance.now(),
}) {
  const started = clock();
  const selectedProvider = safeProvider(providerId);
  /** @type {import('../../../types/front-office').BaselineTrace} */
  const trace = {
    schemaVersion: 1,
    mode,
    requestId: safeIdentity(requestId ?? runId),
    runId: safeIdentity(runId),
    sessionPseudonym: conversationId
      ? createHash("sha256")
          .update(`qterminal-baseline-session:${conversationId}`)
          .digest("hex")
      : null,
    startedAt: new Date(wallClock()).toISOString(),
    completedAt: null,
    durationMs: 0,
    timingBoundary:
      mode === "experiment"
        ? "accepted-service-through-validation-before-persistence"
        : "orchestrator-through-validation-before-persistence",
    providerId: selectedProvider,
    requestedModelId: safeIdentity(modelId),
    deploymentAlias: `${selectedProvider}:default`,
    selectionReason:
      mode === "experiment"
        ? "manual-experiment"
        : "existing-manual-selection-preserved",
    status: "running",
    errorCode: null,
    providerCallCount: 0,
    usageCoverage: "none",
    reportedPromptTokens: null,
    reportedCompletionTokens: null,
    // Catalog price/provenance are absent from this baseline. Unknown != free.
    estimatedCostUsd: null,
    costSource: null,
    calls: [],
  };

  const total = (field) => {
    const values = trace.calls
      .map((call) => call[field])
      .filter((v) => v !== null);
    const sum = values.reduce((a, b) => a + b, 0);
    return values.length ? knownCount(sum) : null;
  };

  return {
    /**
     * Observe one adapter.complete invocation, including planner/repair attempts.
     * Does not validate/change the adapter's request, route, signal or settings.
     * Provider errors and callback exceptions propagate unchanged; never retried.
     */
    async complete(provider, request, phase = "generation") {
      if (!enabled) return provider.complete(request);
      const callStarted = clock();
      let estimate = null;
      try {
        estimate = knownCount(estimateTokens(request.messages));
      } catch {
        // An estimate failure must not mask the adapter's own validation error.
      }
      const call = {
        index: trace.calls.length + 1,
        phase,
        requestedModelId: safeIdentity(request.model),
        actualModelId: null,
        actualProviderId: null,
        estimatedInputTokens: estimate,
        estimateMethod: "utf8-bytes/3 + framing",
        estimateBoundary: "before-provider-translation",
        outputTokenCap: knownCount(request.settings?.outputLimit),
        reportedPromptTokens: null,
        reportedCompletionTokens: null,
        durationMs: 0,
        firstContentMs: null,
        adapterFirstTokenMs: null,
        streamingRequested: request.settings?.streaming === true,
        contentCallbackObserved: false,
        generationStarted: false,
        status: "running",
        finishReason: null,
        errorCode: null,
      };
      trace.calls.push(call);
      try {
        const response = await provider.complete({
          ...request,
          ...(typeof request.onContent === "function"
            ? {
                onContent: (content) => {
                  if (typeof content === "string" && content.length) {
                    call.firstContentMs ??= elapsed(clock, callStarted);
                    call.contentCallbackObserved = true;
                  }
                  return request.onContent(content);
                },
              }
            : {}),
          ...(typeof request.onGenerationStarted === "function"
            ? {
                onGenerationStarted: (...args) => {
                  call.generationStarted = true;
                  return request.onGenerationStarted(...args);
                },
              }
            : {}),
        });
        call.actualModelId = response?.model
          ? safeIdentity(response.model)
          : null;
        call.actualProviderId = response?.provider
          ? safeProvider(response.provider)
          : null;
        call.reportedPromptTokens = knownCount(response?.usage?.promptTokens);
        call.reportedCompletionTokens = knownCount(
          response?.usage?.completionTokens,
        );
        call.adapterFirstTokenMs = knownDuration(
          response?.diagnostics?.firstTokenMs,
        );
        call.finishReason = response?.finishReason
          ? contracts.finishReason.safeParse(response.finishReason).success
            ? response.finishReason
            : "other"
          : null;
        call.status = "succeeded";
        return response;
      } catch (error) {
        call.errorCode = safeError(error);
        call.status =
          call.errorCode === "MODEL_CANCELLED" ? "cancelled" : "failed";
        throw error;
      } finally {
        call.durationMs = elapsed(clock, callStarted);
      }
    },

    /** Close overall execution timing; validation failures can follow successful calls. */
    finish(status, error) {
      if (!enabled) return;
      trace.status = status;
      trace.errorCode = error ? safeError(error) : null;
      trace.completedAt = new Date(wallClock()).toISOString();
      trace.durationMs = elapsed(clock, started);
    },

    /** Return only content-free metrics; missing usage totals are known subtotals. */
    snapshot() {
      if (!enabled) return null;
      trace.providerCallCount = trace.calls.length;
      trace.reportedPromptTokens = total("reportedPromptTokens");
      trace.reportedCompletionTokens = total("reportedCompletionTokens");
      const present = trace.calls.reduce(
        (sum, call) =>
          sum +
          Number(call.reportedPromptTokens !== null) +
          Number(call.reportedCompletionTokens !== null),
        0,
      );
      trace.usageCoverage = !present
        ? "none"
        : present === trace.calls.length * 2
          ? "complete"
          : "partial";
      return contracts.validateTrace(trace);
    },
  };
}

module.exports = { createBaselineObserver };
