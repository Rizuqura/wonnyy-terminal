/** Purpose: controlled A/B/C comparisons with explicit mocked/live evidence and unknown quality.
 * Inputs: fixtures, clients, settings, repetitions; outputs: inspectable rows, aggregates and Markdown.
 * Dependencies: crypto; no implicit network. Failure: client errors become safe rows; caps enforced before calls.
 * Knobs: repeats/scenarios/call cap. Owner: evaluation. Human rubric tasks remain unscored. */
const { createHash, randomUUID } = require("node:crypto");
const { publicError } = require("../errors.cjs");
const { estimateTokens } = require("../../history-budget.cjs");
const { VERSION } = require("./fixtures.cjs");
const COLUMNS = [
  "run_id",
  "timestamp",
  "evidence",
  "scenario",
  "prompt_id",
  "turn_index",
  "provider",
  "deployment",
  "model",
  "routing_policy",
  "input_tokens_estimated",
  "input_tokens_reported",
  "output_tokens_reported",
  "cost_usd_estimated",
  "ttft_ms",
  "e2e_ms",
  "attempts",
  "fallback_used",
  "finish_reason",
  "error_class",
  "quality_score",
  "format_pass",
  "control_hash",
  "notes",
];
const median = (values) => {
  const a = values.filter((v) => Number.isFinite(v)).toSorted((a, b) => a - b);
  return a.length
    ? a.length % 2
      ? a[(a.length - 1) / 2]
      : (a[a.length / 2 - 1] + a[a.length / 2]) / 2
    : null;
};
const validCount = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
/** Binomial Wilson interval for scored answer success; no invented quality on human-rubric tasks. */
function wilson(successes, n) {
  if (!n) return null;
  const z = 1.96,
    p = successes / n,
    d = 1 + (z * z) / n,
    c = (p + (z * z) / (2 * n)) / d,
    h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
/** Score only ground-truth tasks. Unreviewed conceptual answers remain null. */
function score(turn, content) {
  if (turn.jsonExpected) {
    try {
      const value = JSON.parse(content);
      return {
        quality:
          JSON.stringify(value) === JSON.stringify(turn.jsonExpected) ? 1 : 0,
        format: true,
      };
    } catch {
      return { quality: 0, format: false };
    }
  }
  return {
    quality:
      turn.expected === undefined
        ? null
        : Number(content.trim() === turn.expected),
    format: typeof content === "string" && Boolean(content.trim()),
  };
}
/** Run all scenarios on identical canonical histories/settings; baseline A/B never retry/fallback. */
async function runEvaluation({
  cases,
  clients,
  model,
  provider,
  settings,
  repetitions = 3,
  maxCalls,
  evidence = "mock",
}) {
  if (!Number.isInteger(repetitions) || repetitions < 2 || repetitions > 20)
    throw new TypeError("Use 2–20 repetitions.");
  const scenarios = Object.keys(clients);
  const plannedCalls =
    cases.reduce((n, c) => n + c.turns.length, 0) *
    repetitions *
    scenarios.length;
  if (!Number.isInteger(maxCalls) || maxCalls < plannedCalls)
    throw new TypeError(
      "The explicit call cap must cover the complete planned evaluation before any calls start.",
    );
  const rows = [];
  for (let repeat = 0; repeat < repetitions; repeat++)
    for (const fixture of cases) {
      let history = [];
      for (let turnIndex = 0; turnIndex < fixture.turns.length; turnIndex++) {
        const turn = fixture.turns[turnIndex];
        const messages = [...history, { role: "user", content: turn.prompt }];
        const controlHash = createHash("sha256")
          .update(
            JSON.stringify({
              provider,
              model,
              messages,
              temperature: settings.temperature,
              maxOutputTokens: settings.maxOutputTokens,
            }),
          )
          .digest("hex");
        // Rotate order to avoid a fixed A-first warmup/order effect.
        const order = scenarios
          .slice((repeat + turnIndex) % scenarios.length)
          .concat(scenarios.slice(0, (repeat + turnIndex) % scenarios.length));
        for (const scenario of order) {
          const started = performance.now();
          let first = null;
          const row = {
            run_id: randomUUID(),
            timestamp: new Date().toISOString(),
            evidence,
            scenario,
            prompt_id: fixture.id,
            task_type: fixture.task,
            context_position: fixture.position ?? "not-applicable",
            transport: scenario === "B" ? "litellm" : "direct",
            turn_index: turnIndex + 1,
            repetition: repeat + 1,
            provider,
            deployment: `${provider}:${model}`,
            model,
            routing_policy: scenario === "C" ? "auto" : "manual",
            input_tokens_estimated: estimateTokens(messages),
            input_tokens_reported: null,
            output_tokens_reported: null,
            cost_usd_estimated: null,
            ttft_ms: null,
            e2e_ms: 0,
            attempts: 1,
            fallback_used: false,
            finish_reason: null,
            error_class: null,
            quality_score: null,
            format_pass: false,
            control_hash: controlHash,
            notes:
              turn.expected === undefined
                ? "Human rubric review required; quality unscored."
                : "Exact synthetic ground-truth check.",
          };
          try {
            const response = await clients[scenario]({
              messages,
              fixture,
              turn,
              settings,
              onContent: () => {
                first ??= performance.now() - started;
              },
            });
            row.provider = response.provider ?? provider;
            row.model = response.model ?? model;
            row.deployment =
              response.deploymentId ?? `${row.provider}:${row.model}`;
            row.input_tokens_reported = validCount(
              response.usage?.promptTokens,
            );
            row.output_tokens_reported = validCount(
              response.usage?.completionTokens,
            );
            row.cost_usd_estimated =
              Number.isFinite(response.estimatedCostUsd) &&
              response.estimatedCostUsd >= 0
                ? response.estimatedCostUsd
                : null;
            row.ttft_ms = response.diagnostics?.firstTokenMs ?? first;
            row.finish_reason = response.finishReason;
            if (response.finishReason !== "stop") {
              row.error_class = "MODEL_INVALID_RESPONSE";
              row.quality_score = turn.expected === undefined ? null : 0;
            } else {
              const scored = score(turn, response.content);
              row.quality_score = scored.quality;
              row.format_pass = scored.format;
            }
          } catch (error) {
            row.error_class = publicError(error).code;
            row.quality_score = turn.expected === undefined ? null : 0;
          }
          row.e2e_ms = performance.now() - started;
          rows.push(row);
        }
        history = [
          ...history,
          { role: "user", content: turn.prompt },
          { role: "assistant", content: turn.expected ?? turn.canonical },
        ];
      }
    }
  return {
    fixtureVersion: VERSION,
    evidence,
    repetitions,
    fixtureCount: cases.length,
    plannedCalls,
    rows,
    summary: summarize(rows),
    limitations: [
      "Canonical conversation replay keeps A/B histories identical; this is not a natural evolving conversation study.",
      "Wilson intervals treat scored turns as independent; repeated prompts/turns are correlated, so intervals are descriptive, not conclusive.",
      "Unreviewed human-rubric tasks have null quality and are excluded from successful-answer-rate denominator.",
      evidence === "mock"
        ? "Fixture responses measure harness correctness only; no provider quality, gateway overhead or speed improvement is established."
        : "A/B provider/model/settings are controlled; compare hashes and observed identities before attributing transport overhead.",
    ],
  };
}
/** Aggregate measured outcomes without turning missing prices/quality into zeros. */
function summarize(rows) {
  return [...new Set(rows.map((r) => r.scenario))].map((scenario) => {
    const group = rows.filter((r) => r.scenario === scenario),
      scored = group.filter((r) => r.quality_score !== null),
      success = scored.filter(
        (r) => !r.error_class && r.quality_score === 1 && r.format_pass,
      ).length,
      costKnown = group.every((r) => r.cost_usd_estimated !== null);
    return {
      scenario,
      sampleSize: group.length,
      scoredSampleSize: scored.length,
      unscoredSampleSize: group.length - scored.length,
      executionSuccessRate:
        group.filter((r) => !r.error_class).length / group.length,
      successfulAnswerRate: scored.length ? success / scored.length : null,
      successfulAnswerRate95: wilson(success, scored.length),
      medianTtftMs: median(group.map((r) => r.ttft_ms)),
      medianE2eMs: median(group.map((r) => r.e2e_ms)),
      costPerSuccessfulAnswer:
        costKnown && success
          ? group.reduce((n, r) => n + r.cost_usd_estimated, 0) / success
          : null,
      errorCount: group.filter((r) => r.error_class).length,
    };
  });
}
/** Produce a compact human-readable factual report beside JSON/CSV evidence. */
function reportMarkdown(report) {
  return `# Front-office evaluation\n\nEvidence: **${report.evidence}**. Fixtures: ${report.fixtureCount}; repetitions: ${report.repetitions}; calls: ${report.rows.length}. Fixture version: ${report.fixtureVersion}.\n\n| Scenario | Samples | Scored / unscored | Execution success | Scored answer success | 95% descriptive interval | Median TTFT ms | Median E2E ms | USD per successful answer |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${report.summary.map((s) => `| ${s.scenario} | ${s.sampleSize} | ${s.scoredSampleSize} / ${s.unscoredSampleSize} | ${s.executionSuccessRate} | ${s.successfulAnswerRate ?? "Unknown"} | ${s.successfulAnswerRate95?.map((v) => v.toFixed(4)).join("–") ?? "Unknown"} | ${s.medianTtftMs ?? "Unknown"} | ${s.medianE2eMs ?? "Unknown"} | ${s.costPerSuccessfulAnswer ?? "Unknown"} |`).join("\n")}\n\n${report.limitations.map((v) => `- ${v}`).join("\n")}\n`;
}
/** CSV contains metric columns only, no prompts, answers or raw errors. */
function reportCsv(rows) {
  const cell = (v) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    COLUMNS.join(",") +
    "\r\n" +
    rows.map((row) => COLUMNS.map((k) => cell(row[k])).join(",")).join("\r\n") +
    "\r\n"
  );
}
module.exports = {
  runEvaluation,
  summarize,
  reportMarkdown,
  reportCsv,
  wilson,
  score,
  evidenceRecords,
};

/** Produce importable empirical records only for live, scored, repeated outcomes.
 * Mock fixtures never bootstrap production model quality or reliability evidence. */
function evidenceRecords(report) {
  if (report.evidence !== "live") return [];
  const groups = new Map();
  for (const row of report.rows.filter((r) => r.quality_score !== null)) {
    const key = JSON.stringify([
      row.deployment,
      row.model,
      row.task_type,
      row.context_position,
      row.transport,
      row.task_type === "retrieval" ? row.prompt_id : "task-suite",
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()]
    .filter((rows) => new Set(rows.map((r) => r.repetition)).size >= 2)
    .map((rows) => {
      const first = rows[0],
        successes = rows.filter(
          (r) => !r.error_class && r.quality_score === 1 && r.format_pass,
        ).length;
      const interval = wilson(successes, rows.length);
      const reported = rows.every((r) => r.input_tokens_reported !== null);
      return {
        deploymentId: first.deployment,
        modelVersion: first.model,
        task: first.task_type,
        benchmark: VERSION,
        dataset: VERSION,
        methodology: `Exact synthetic ground truth; ${rows.length} scored calls; canonical-history replay for conversation tasks; ${first.transport} transport. Descriptive Wilson interval; repeated prompts are correlated.`,
        position: first.context_position,
        contextTokens: Math.max(
          1,
          ...rows.map((r) =>
            reported ? r.input_tokens_reported : r.input_tokens_estimated,
          ),
        ),
        contextMeasurement: reported ? "provider-reported" : "estimated",
        transport: first.transport,
        score: rows.reduce((n, r) => n + r.quality_score, 0) / rows.length,
        successRate: successes / rows.length,
        repetitions: new Set(rows.map((r) => r.repetition)).size,
        uncertainty: (interval[1] - interval[0]) / 2,
        medianTtftMs: median(rows.map((r) => r.ttft_ms)),
        medianE2eMs: median(rows.map((r) => r.e2e_ms)),
        checkedAt: rows.toSorted((a, b) =>
          b.timestamp.localeCompare(a.timestamp),
        )[0].timestamp,
      };
    });
}
