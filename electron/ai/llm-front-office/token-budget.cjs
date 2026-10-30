/** Purpose: pure context/cost preflight. Inputs: requirements/profile/config; outputs: explicit decision.
 * Dependencies: none. Failure: rejected decisions, never truncation. Knobs: headroom, caps. Owner: backend. */

/** Check configured capacity against advertised metadata; never treat it as measured reliable context. */
function checkBudget(requirements, model, config) {
  const g = config.generation;
  const capacity = Math.min(
    g.contextWindow,
    model.contextTokens ?? g.contextWindow,
  );
  const reserve = Math.ceil(capacity * g.headroomFraction);
  const totalTokens =
    requirements.expectedInputTokens + g.maxOutputTokens + reserve;
  const knownPrice =
    model.inputUsdPerMillion !== null && model.outputUsdPerMillion !== null;
  const estimatedCostUsd = knownPrice
    ? (requirements.expectedInputTokens * model.inputUsdPerMillion +
        g.maxOutputTokens * model.outputUsdPerMillion) /
      1000000
    : null;
  const reasons = [];
  if (totalTokens > capacity)
    reasons.push(
      `Full history and question (~${requirements.expectedInputTokens} input tokens), ${g.maxOutputTokens} output and ${reserve} headroom exceed ${capacity}. Start a new experiment or adjust supported limits. Nothing was dropped.`,
    );
  if (
    model.maxOutputTokens !== null &&
    g.maxOutputTokens > model.maxOutputTokens
  )
    reasons.push("Output cap exceeds the advertised output limit.");
  if (
    config.budget.maxTotalTokens !== null &&
    totalTokens > config.budget.maxTotalTokens
  )
    reasons.push("Projected tokens exceed the configured total token cap.");
  if (
    requirements.costCap !== null &&
    (estimatedCostUsd === null || estimatedCostUsd > requirements.costCap)
  )
    reasons.push(
      estimatedCostUsd === null
        ? "Cannot enforce a cost cap without verified input/output prices."
        : "Estimated request cost exceeds the cap.",
    );
  return {
    eligible: reasons.length === 0,
    reasons,
    estimatedInputTokens: requirements.expectedInputTokens,
    reservedOutputTokens: g.maxOutputTokens,
    headroomTokens: reserve,
    capacityTokens: capacity,
    totalTokens,
    estimatedCostUsd,
    estimateMethod: "utf8-bytes/3 + framing",
    warnings:
      model.contextTokens === null
        ? [
            "Provider capacity is unknown; using the explicitly configured local context bound.",
          ]
        : [],
  };
}
module.exports = { checkBudget };
