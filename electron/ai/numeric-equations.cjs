// Bounded numeric expressions only. No eval, names, calls or code execution.
const NUMBER =
  /^(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;
function parseExpression(expression) {
  let index = 0,
    steps = 0,
    operations = 0;
  const inputs = [];
  const spaces = () => {
    while (index < expression.length && /\s/.test(expression[index])) index++;
  };
  const bounded = (value) => {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      const error = new Error("Numeric range");
      error.numeric = true;
      throw error;
    }
    return value;
  };
  const primary = () => {
    if (++steps > 64) throw new Error("Expression limit");
    spaces();
    let sign = 1;
    while (expression[index] === "+" || expression[index] === "-") {
      if (++steps > 64) throw new Error("Expression limit");
      if (expression[index++] === "-") sign *= -1;
      spaces();
    }
    if (expression[index] === "(") {
      index++;
      const value = sum();
      spaces();
      if (expression[index++] !== ")") throw new Error("Missing parenthesis");
      return bounded(sign * value);
    }
    const match = expression.slice(index).match(NUMBER);
    if (!match) throw new Error("Number required");
    index += match[0].length;
    const value = bounded(sign * Number(match[0].replaceAll(",", "")));
    inputs.push(value);
    return value;
  };
  const product = () => {
    let value = primary();
    spaces();
    while (expression[index] === "*" || expression[index] === "/") {
      const op = expression[index++],
        right = primary();
      operations++;
      value = bounded(op === "*" ? value * right : value / right);
      spaces();
    }
    return value;
  };
  const sum = () => {
    let value = product();
    spaces();
    while (expression[index] === "+" || expression[index] === "-") {
      const op = expression[index++],
        right = product();
      operations++;
      value = bounded(op === "+" ? value + right : value - right);
      spaces();
    }
    return value;
  };
  const value = sum();
  spaces();
  if (index !== expression.length || !operations)
    throw new Error("A complete calculation is required");
  return { inputs, value };
}
function verifiedEquations(text, supported) {
  const normalized = text.replace(
    /[\u00d7\u00f7\u2212]/g,
    (char) => ({ "\u00d7": "*", "\u00f7": "/", "\u2212": "-" })[char],
  );
  const verified = [],
    rejected = [];
  let attempts = 0;
  for (const match of normalized.matchAll(/[=\u2248]/g)) {
    if (++attempts > 32 || verified.length >= 16) break;
    const right = normalized
      .slice(match.index + 1)
      .match(
        /^\s*([+-]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?)(?:[ \t]*(%|percent\b|thousand\b|million\b|billion\b|[kKMB]\b))?(?![\p{L}\p{N}_]|[.,]\d)/u,
      );
    if (!right) continue;
    const scale =
      {
        k: 1e3,
        K: 1e3,
        thousand: 1e3,
        M: 1e6,
        million: 1e6,
        B: 1e9,
        billion: 1e9,
      }[right[2]] ?? 1;
    const displayedValue = Number(right[1].replaceAll(",", "")) * scale;
    const percent = right[2] === "%" || right[2] === "percent";
    const mantissa = right[1].toLowerCase().split("e"),
      decimals = mantissa[0].split(".")[1]?.length ?? 0,
      quantum = 10 ** (Number(mantissa[1] ?? 0) - decimals) * scale;
    const start = Math.max(0, match.index - 256);
    for (let position = start; position < match.index; position++) {
      if (
        !/[\d.(+-]/.test(normalized[position]) ||
        /[\p{L}\p{N}_^*/.]/u.test(normalized[position - 1] ?? "") ||
        /[+\-*/^]\s*$/.test(normalized.slice(start, position))
      )
        continue;
      const expression = normalized.slice(position, match.index).trim();
      let calculated;
      try {
        calculated = parseExpression(expression);
      } catch (error) {
        if (error.numeric) {
          rejected.push(expression);
          break;
        }
        continue;
      }
      const candidates = [calculated.value];
      if (percent && Math.abs(calculated.value) <= 1)
        candidates.push(calculated.value * 100);
      // Never salvage a smaller suffix when a real input lacks evidence.
      if (
        calculated.inputs.every(supported) &&
        Number.isFinite(displayedValue) &&
        candidates.some(
          (value) =>
            Math.abs(value - displayedValue) <=
            Number.EPSILON * Math.abs(value) * 8 +
              (Number.isInteger(value) ? 0 : quantum / 2),
        )
      ) {
        verified.push({
          expression: text
            .slice(position, match.index + 1 + right[0].length)
            .trim(),
          inputs: calculated.inputs,
          value: calculated.value,
          displayedValue,
          start: position,
          end: match.index + 1 + right[0].length,
        });
      } else rejected.push(expression);
      break;
    }
  }
  return { verified, rejected };
}
module.exports = { verifiedEquations };
