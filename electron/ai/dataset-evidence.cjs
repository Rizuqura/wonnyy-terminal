const { ModelRuntimeError } = require("./model-errors.cjs");
const { verifiedEquations } = require("./numeric-equations.cjs");

// Bounded numeric consistency, not semantic or unit verification. Preserve display
// precision and notation; never manufacture a closure of possible arithmetic.
const NUMBER =
  /(?<![\p{L}\p{N}_])[+-]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/gu;
function numberTokens(value) {
  const text = String(value).replace(/\u2212/g, "-");
  return [...text.matchAll(NUMBER)].map((match) => {
    const suffixMatch = text
      .slice(match.index + match[0].length)
      .match(/^[ \t]*(%|percent\b|thousand\b|million\b|billion\b|[kKMB]\b)/);
    const suffix = suffixMatch?.[1] ?? "";
    const scale =
      {
        k: 1e3,
        K: 1e3,
        thousand: 1e3,
        M: 1e6,
        million: 1e6,
        B: 1e9,
        billion: 1e9,
      }[suffix] ?? 1;
    const raw = match[0].replaceAll(",", ""),
      [mantissa, exponent = "0"] = raw.toLowerCase().split("e"),
      decimals = mantissa.split(".")[1]?.length ?? 0;
    return {
      value: Number(raw) * scale,
      percent: suffix === "%" || suffix === "percent",
      quantum: 10 ** (Number(exponent) - decimals) * scale,
      raw: match[0],
      offset: match.index,
      end: match.index + match[0].length + (suffixMatch?.[0].length ?? 0),
    };
  });
}
function equivalent(a, b) {
  return (
    a === b ||
    Math.abs(a - b) <=
      Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE) * 8
  );
}
function inspectDatasetAnswer(answer, results, question, otherSources = []) {
  const allowed = new Set(),
    percentValues = new Set();
  const add = (value, percent = false) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => add(item, percent));
      return;
    }
    for (const token of numberTokens(value)) {
      if (!Number.isFinite(token.value)) continue;
      allowed.add(token.value);
      if (percent || token.percent) percentValues.add(token.value);
    }
  };
  add(question);
  otherSources.forEach((source) => add(source));
  const row = (item, columns) => {
    item.values?.forEach((value, index) =>
      add(
        value,
        typeof columns?.[index] === "string" &&
          /%|percent|(?:^|[^a-z])pct(?:$|[^a-z])/i.test(columns[index]),
      ),
    );
    add(item.record);
    Object.values(item.missingByMetric ?? {}).forEach((value) => add(value));
  };
  for (const result of results) {
    [
      result.totalRows,
      result.matchedRows,
      result.resultCount,
      result.rowCount,
    ].forEach((value) => add(value));
    result.sample?.forEach((item) =>
      row(
        item,
        result.columns?.map((column) =>
          typeof column === "string" ? column : column.name,
        ),
      ),
    );
    result.results?.forEach((item) => row(item, result.columns));
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
  const supported = (token, rounding = true) => {
    if (!Number.isFinite(token.value)) return false;
    for (const value of allowed) {
      const candidates = [value];
      // Percent-to-fraction requires explicit notation/column metadata. Fractions
      // may be displayed as percentages; this does not validate their units.
      if (token.percent && Math.abs(value) <= 1) candidates.push(value * 100);
      if (!token.percent && percentValues.has(value))
        candidates.push(value / 100);
      if (
        candidates.some(
          (candidate) =>
            equivalent(token.value, candidate) ||
            (rounding &&
              Number.isFinite(token.quantum) &&
              token.quantum > 0 &&
              (!Number.isInteger(candidate) || token.quantum > 1) &&
              Math.abs(token.value - candidate) <=
                token.quantum / 2 + Number.EPSILON * Math.abs(candidate) * 8),
        )
      )
        return true;
    }
    return false;
  };
  // Keep offsets stable while removing presentation markers around equations.
  const text = answer
    .replace(
      /(\*\*|__|`)(?=\S)([\s\S]*?\S)\1/g,
      (match, marker, body) =>
        " ".repeat(marker.length) + body + " ".repeat(marker.length),
    )
    .replace(/^\s*(?:\d+[.)]|[-+*])\s+/gm, (match) => " ".repeat(match.length));
  const { verified: calculations, rejected } = verifiedEquations(
    text,
    (value) => supported({ value, percent: false }, false),
  );
  for (const calculation of calculations) allowed.add(calculation.value);
  const unsupported = numberTokens(text).filter(
    (token) =>
      !supported(token) &&
      !calculations.some(
        (calculation) =>
          token.offset >= calculation.start && token.end <= calculation.end,
      ),
  );
  if (unsupported.length || rejected.length) {
    const values = [
      ...new Set(
        unsupported.map((token) =>
          Number.isFinite(token.value) ? token.value : token.raw,
        ),
      ),
    ].slice(0, 10);
    throw new ModelRuntimeError(
      "MODEL_INVALID_RESPONSE",
      `Could not verify ${rejected.length ? "a shown calculation" : `these answer values: ${values.join(", ")}`} against the supplied evidence. Show correct arithmetic using supported inputs, or request the missing analysis.`,
      {
        reason: "dataset_unsupported_number",
        numbers: values,
        calculations: rejected.slice(0, 3),
        validationPolicy: "numeric-evidence-v2",
      },
    );
  }
  return {
    answer,
    policy: "numeric-evidence-v2",
    calculations: calculations.map(
      ({ expression, inputs, value, displayedValue }) => ({
        expression,
        inputs,
        value,
        displayedValue,
      }),
    ),
  };
}
function validateDatasetAnswer(...args) {
  return inspectDatasetAnswer(...args).answer;
}
module.exports = { validateDatasetAnswer, inspectDatasetAnswer };
