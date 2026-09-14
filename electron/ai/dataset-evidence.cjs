const { ModelRuntimeError } = require("./model-errors.cjs");

// This is a numeric evidence check, not a claim of semantic verification.
// It prevents the model from inventing new quantities after a metadata-only read.
function numbers(value) {
  return (
    String(value).match(
      /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[+-]?\d+)?/gi,
    ) ?? []
  )
    .map((token) => Number(token.replaceAll(",", "")))
    .filter(Number.isFinite);
}
function validateDatasetAnswer(answer, results, question, otherSources = []) {
  const allowed = new Set(numbers(question));
  const add = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach(add);
      return;
    }
    numbers(value).forEach((number) => allowed.add(number));
  };
  otherSources.forEach(add);
  for (const result of results) {
    [
      result.totalRows,
      result.matchedRows,
      result.resultCount,
      result.rowCount,
    ].forEach(add);
    result.sample?.forEach((row) => {
      add(row.values);
      add(row.record);
    });
    result.results?.forEach((row) => {
      add(row.values);
      add(row.record);
      Object.values(row.missingByMetric ?? {}).forEach(add);
    });
    result.columns?.forEach((column) => {
      if (typeof column === "object") {
        add(column.missingCount);
        add(column.numericCount);
      }
    });
    result.filters?.forEach((filter) => add(filter.value));
    if (result.growth) {
      add(result.growth.from);
      add(result.growth.to);
      add(result.growthConvention);
    }
  }
  const unsupported = numbers(answer.replace(/^\s*\d+[.)]\s+/gm, "")).filter(
    (number) =>
      ![...allowed].some(
        (value) =>
          number === value ||
          (Math.abs(number - value) <= 0.005 && !Number.isInteger(number)),
      ),
  );
  if (unsupported.length)
    throw new ModelRuntimeError(
      "MODEL_INVALID_RESPONSE",
      "The model introduced numbers that were not present in the dataset evidence.",
      {
        reason: "dataset_unsupported_number",
        numbers: [...new Set(unsupported)].slice(0, 10),
      },
    );
  return answer;
}
module.exports = { validateDatasetAnswer };
