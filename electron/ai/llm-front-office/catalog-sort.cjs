/** Purpose: deterministic catalog sorting shared by renderer/backend. Inputs: profiles/sort; output: new list.
 * Dependencies: none (renderer-safe). Failure: unknown metrics sort last. Knobs: sort mode. Owner: backend/UI. */
/** Prefer fresh measured quality; otherwise capability coverage then known capacity, with stable ties. */
function sortProfiles(profiles, sort = "match") {
  const nullable = (a, b, d = 1) =>
    a === null && b === null
      ? 0
      : a === null
        ? 1
        : b === null
          ? -1
          : (a - b) * d;
  const coverage = (p) =>
    [p.tools, p.vision, p.structuredOutput].filter((v) => v === true).length;
  return profiles.toSorted((a, b) => {
    const ae = a.evidence ?? {},
      be = b.evidence ?? {};
    let score = 0;
    if (sort === "quality")
      score = nullable(ae.qualityScore ?? null, be.qualityScore ?? null, -1);
    else if (sort === "price")
      score = nullable(
        a.inputUsdPerMillion === null || a.outputUsdPerMillion === null
          ? null
          : 1000 * a.inputUsdPerMillion + 256 * a.outputUsdPerMillion,
        b.inputUsdPerMillion === null || b.outputUsdPerMillion === null
          ? null
          : 1000 * b.inputUsdPerMillion + 256 * b.outputUsdPerMillion,
      );
    else if (sort === "reliability")
      score = nullable(ae.successRate ?? null, be.successRate ?? null, -1);
    else if (sort === "alphabetical")
      score = (a.label ?? a.modelId ?? a.deploymentId).localeCompare(
        b.label ?? b.modelId ?? b.deploymentId,
      );
    else if (sort === "latency")
      score = nullable(ae.medianTtftMs ?? null, be.medianTtftMs ?? null);
    else if (sort === "context")
      score = nullable(a.contextTokens, b.contextTokens, -1);
    else if (sort === "output")
      score = nullable(a.maxOutputTokens, b.maxOutputTokens, -1);
    else if (sort === "provider")
      score = a.providerId.localeCompare(b.providerId);
    else
      score =
        nullable(ae.qualityScore ?? null, be.qualityScore ?? null, -1) ||
        coverage(b) - coverage(a) ||
        nullable(a.contextTokens, b.contextTokens, -1) ||
        nullable(a.maxOutputTokens, b.maxOutputTokens, -1);
    return score || a.deploymentId.localeCompare(b.deploymentId);
  });
}
module.exports = { sortProfiles };
