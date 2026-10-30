/**
 * Purpose: export baseline metrics without exporting ordinary chat records.
 * Inputs/outputs: trace array + json/csv format -> sanitized string.
 * Dependencies: allowlist contract; no file/network side effects.
 * Failure modes: generic TypeError for bad metrics/format, never raw data.
 * Tuning knobs: format only. Owner: backend; UI/export destination is future work.
 */
const { validateTrace } = require("./contracts.cjs");

const CSV_FIELDS = [
  "requestId",
  "runId",
  "providerId",
  "requestedModelId",
  "status",
  "providerCallCount",
  "reportedPromptTokens",
  "reportedCompletionTokens",
  "usageCoverage",
  "durationMs",
  "estimatedCostUsd",
  "errorCode",
];

const csvCell = (value) => {
  let text = value === null ? "" : String(value);
  // Also safe if the allowed identifier alphabet expands in a future version.
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};

/**
 * Serialize a list of BaselineTrace objects; unknown fields are stripped.
 * JSON retains per-call detail. CSV is one summary row per run; partial token
 * totals are known subtotals, and unknown cost is blank rather than zero.
 */
function exportTraces(values, format = "json") {
  if (!Array.isArray(values) || !["json", "csv"].includes(format))
    throw new TypeError("Provide metrics traces and a json or csv format.");
  const traces = values.map(validateTrace);
  if (format === "json") return JSON.stringify(traces, null, 2) + "\n";
  return (
    [
      CSV_FIELDS.join(","),
      ...traces.map((trace) =>
        CSV_FIELDS.map((field) => csvCell(trace[field])).join(","),
      ),
    ].join("\r\n") + "\r\n"
  );
}

module.exports = { exportTraces };
