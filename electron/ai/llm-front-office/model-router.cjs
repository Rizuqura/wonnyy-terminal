/** Purpose: hard eligibility before readable deterministic ranking. Inputs: requirements/catalog/policy/health.
 * Outputs: primary, permitted fallback chain and per-model explanations. Dependencies: pure budget/evidence modules.
 * Failure: actionable no-eligible result, never silent manual substitution. Knobs: policy weights. Owner: backend. */
const { checkBudget } = require("./token-budget.cjs");
const { reliabilityProfile } = require("./long-context-reliability.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");
const coverage = (p) =>
  [p.tools, p.vision, p.structuredOutput].filter((v) => v === true).length;

const { sortProfiles } = require("./catalog-sort.cjs");

/** Manual pins either execute exactly that deployment or produce an explicit rejection. */
function routeModels(
  requirements,
  profiles,
  evidence,
  config,
  isHealthy = () => true,
) {
  const rows = profiles.map((model) => {
    const budget = checkBudget(requirements, model, config);
    const measured = reliabilityProfile(
      model,
      evidence,
      requirements.taskType,
      config.routing.benchmarkMaxAgeDays,
      Date.now(),
      requirements.transport ?? "direct",
    );
    const reasons = [...budget.reasons];
    const warnings = [...budget.warnings];
    const stale =
      Date.now() - Date.parse((model.pricingSource ?? model.source).checkedAt) >
      config.routing.benchmarkMaxAgeDays * 86400000;
    if (stale) {
      warnings.push(
        "Catalog metadata is stale; refresh before relying on prices or capacity.",
      );
      if (config.routing.mode === "auto" || requirements.costCap !== null)
        reasons.push(
          "Stale catalog metadata cannot justify automatic routing or a cost cap.",
        );
    }
    if (!config.routing.allowedProviders.includes(model.providerId))
      reasons.push("Provider is outside the explicitly permitted list.");
    if (!model.credentialConfigured)
      reasons.push("Provider credential is not configured.");
    if (!isHealthy(model.deploymentId))
      reasons.push("Endpoint circuit is cooling down.");
    if (
      !model.inputModalities.includes("text") ||
      !model.outputModalities.includes("text")
    )
      reasons.push("Text input/output is not verified.");
    if (requirements.requiresJsonSchema && model.structuredOutput !== true)
      reasons.push("Structured output support is false or unknown.");
    if (
      model.supportedParameters &&
      ["temperature", "max_tokens"].some(
        (p) => !model.supportedParameters.includes(p),
      )
    )
      reasons.push(
        "A requested generation parameter is not supported by this deployment.",
      );
    if (
      config.routing.mode === "auto" &&
      (model.contextTokens === null || model.maxOutputTokens === null)
    )
      reasons.push(
        "Automatic routing requires known advertised context and output limits.",
      );
    if (
      measured.testedContextTokens === null ||
      measured.testedContextTokens < requirements.expectedInputTokens
    ) {
      if (config.routing.unverifiedContext === "strict")
        reasons.push(
          "No fresh long-context evidence covers this input length.",
        );
      else if (config.routing.unverifiedContext === "warn")
        warnings.push("Reliable context at this input length is unverified.");
    }
    const w = config.routing.weights;
    const quality = measured.qualityScore ?? 0,
      reliability = measured.successRate ?? 0;
    const price =
      budget.estimatedCostUsd === null ? 0 : 1 / (1 + budget.estimatedCostUsd);
    const speed =
      measured.medianTtftMs === null
        ? 0
        : 1 / (1 + measured.medianTtftMs / 1000);
    const score =
      config.routing.priority === "quality"
        ? quality
        : config.routing.priority === "speed"
          ? speed
          : config.routing.priority === "cost"
            ? price
            : quality * w.quality +
              price * w.cost +
              speed * w.latency +
              reliability * w.reliability;
    return { model, budget, evidence: measured, reasons, warnings, score };
  });
  let eligible = rows
    .filter((r) => !r.reasons.length)
    .toSorted(
      (a, b) =>
        b.score - a.score ||
        coverage(b.model) - coverage(a.model) ||
        (b.model.contextTokens ?? 0) - (a.model.contextTokens ?? 0) ||
        a.model.deploymentId.localeCompare(b.model.deploymentId),
    );
  if (requirements.userModelOverride)
    eligible = eligible.filter(
      (r) => r.model.deploymentId === requirements.userModelOverride,
    );
  if (!eligible.length)
    throw new ModelRuntimeError(
      "MODEL_UNAVAILABLE",
      "No eligible model. Review the pinned model, credentials, capability evidence and token/cost limits. No provider call was made.",
      {
        rejections: rows
          .filter(
            (r) =>
              !requirements.userModelOverride ||
              r.model.deploymentId === requirements.userModelOverride,
          )
          .map((r) => ({
            deploymentId: r.model.deploymentId,
            reasons: r.reasons,
          })),
      },
    );
  const primary = eligible[0];
  const fallback =
    config.routing.mode === "auto" && config.routing.allowFallback
      ? eligible
          .slice(1)
          .filter(
            (r) =>
              r.model.providerId === primary.model.providerId ||
              config.routing.allowCrossProviderFallback,
          )
          .filter(
            (r) =>
              config.routing.allowModelSwitch ||
              r.model.logicalModelId === primary.model.logicalModelId,
          )
      : [];
  return {
    mode: config.routing.mode,
    priority: config.routing.priority,
    primary,
    fallback,
    eligibleDeploymentIds: eligible.map((r) => r.model.deploymentId),
    selectionReasons: [
      requirements.userModelOverride
        ? "Explicit manual deployment pin preserved."
        : `Highest ${config.routing.priority} score among eligible deployments.`,
      "Capability and token/cost preflight passed.",
    ],
    warnings: primary.warnings,
    rejections: rows
      .filter((r) => r.reasons.length)
      .map((r) => ({ deploymentId: r.model.deploymentId, reasons: r.reasons })),
  };
}
module.exports = { routeModels, sortProfiles };
