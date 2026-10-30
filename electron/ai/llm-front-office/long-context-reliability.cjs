/** Purpose: interpret empirical evidence separately from advertised capacity.
 * Inputs: profile, records, task, age policy; outputs: measured scores or unknown.
 * Dependencies: none. Failure: absent/stale/version-mismatched evidence is unverified.
 * Knobs: max age; no automatic benchmarks. Owner: backend. */
/** Only matching version/task, repeated, fresh measurements contribute; do not extrapolate context lengths. */
function reliabilityProfile(
  model,
  evidence,
  task,
  maxAgeDays,
  now = Date.now(),
  transport = "direct",
) {
  const rows = evidence.filter(
    (e) =>
      e.deploymentId === model.deploymentId &&
      e.modelVersion === model.modelId &&
      e.task === task &&
      (e.transport ?? "direct") === transport &&
      e.repetitions >= 2 &&
      now - Date.parse(e.checkedAt) <= maxAgeDays * 86400000 &&
      Date.parse(e.checkedAt) <= now,
  );
  if (!rows.length)
    return {
      status: "unverified",
      qualityScore: null,
      successRate: null,
      medianTtftMs: null,
      medianE2eMs: null,
      testedContextTokens: null,
      lastTestAt: null,
      methodology: null,
      observations: [],
    };
  const latest = rows.toSorted((a, b) =>
    b.checkedAt.localeCompare(a.checkedAt),
  )[0];
  // Retrieval lengths only count when beginning/middle/end were actually measured
  // with the same benchmark/dataset and all three tests achieved perfect scores.
  const lengths = rows
    .filter(
      (e) =>
        e.task === "retrieval" && e.contextMeasurement === "provider-reported",
    )
    .filter((e) =>
      ["beginning", "middle", "end"].every((position) =>
        rows.some(
          (r) =>
            r.position === position &&
            r.contextMeasurement === "provider-reported" &&
            r.contextTokens === e.contextTokens &&
            r.benchmark === e.benchmark &&
            r.dataset === e.dataset &&
            r.score === 1,
        ),
      ),
    )
    .map((e) => e.contextTokens);
  return {
    status: "measured",
    qualityScore: latest.score,
    successRate: latest.successRate,
    medianTtftMs: latest.medianTtftMs,
    medianE2eMs: latest.medianE2eMs,
    testedContextTokens: lengths.length ? Math.max(...lengths) : null,
    lastTestAt: latest.checkedAt,
    methodology: latest.methodology,
    observations: rows,
  };
}
module.exports = { reliabilityProfile };
