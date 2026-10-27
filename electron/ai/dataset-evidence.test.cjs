const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateDatasetAnswer,
  inspectDatasetAnswer,
} = require("./dataset-evidence.cjs");
const evidence = (...values) => [{ results: [{ values }] }];
const accepts = (
  answer,
  values,
  question = "Explain the evidence.",
  sources = [],
) =>
  assert.equal(
    validateDatasetAnswer(answer, evidence(...values), question, sources),
    answer,
  );
const rejects = (answer, values, question = "Explain the evidence.") =>
  assert.throws(
    () => validateDatasetAnswer(answer, evidence(...values), question),
    { code: "MODEL_INVALID_RESPONSE" },
  );

test("numeric evidence permits precision-aware rounding and compact display without permitting nearby arbitrary values", () => {
  accepts("Mean: 12.35. Rounded to a whole number: 12.", [12.3456]);
  accepts("Mean: 13.", [12.6]);
  accepts("Total: 1.23M. Smaller total: 1.2k.", [1234567, 1234]);
  accepts("Tiny value: 1.23e-7.", [0.000000123456]);
  rejects("Mean: 12.4.", [12.3456]);
  rejects("Count: 4.", [3]);
  rejects("Rate: 0.004.", [0.0001]);
});

test("numeric evidence handles leading decimals, signed values and equivalent percentage displays", () => {
  accepts("Allocation: 25%.", [0.25]);
  accepts("Allocation: 25 percent.", [0.25]);
  accepts("Allocation as a fraction: .25.", [], "Explain.", [
    "Allocation: 25%.",
  ]);
  accepts("Change: -25%.", [-0.25]);
  accepts("Change: \u221225%.", [-0.25]);
  rejects("Allocation: 26%.", [0.25]);
  rejects("Allocation: .25.", [25]);
  rejects("Change: 25%.", [-0.25]);
  const answer = "Allocation as a fraction: 0.25.";
  assert.equal(
    validateDatasetAnswer(
      answer,
      [{ columns: ["allocation_pct"], results: [{ values: [25] }] }],
      "Explain.",
    ),
    answer,
  );
});

test("shown arithmetic is recomputed locally and its result can be reused in the same answer", () => {
  const answer = "Total: **25 + 15 = 40**. The total is 40.";
  const result = inspectDatasetAnswer(answer, evidence(25, 15), "Total?");
  assert.equal(result.answer, answer);
  assert.equal(result.policy, "numeric-evidence-v2");
  assert.deepEqual(
    result.calculations.map(({ inputs, value }) => ({ inputs, value })),
    [{ inputs: [25, 15], value: 40 }],
  );
  rejects("The total is 40.", [25, 15]);
  rejects("25 + 15 = 41.", [25, 15]);
  rejects("25 + 15 = 25.", [25, 15]);
});

test("numeric equations respect precedence, signs, parentheses, user inputs and display rounding", () => {
  accepts("(25 + 15) * 2 = 80.", [25, 15], "Multiply by 2.");
  accepts("25 + 15 * 2 = 55.", [25, 15, 2]);
  accepts("-25 + 15 = -10. Result: -10.", [-25, 15]);
  accepts("\u221225 + 15 = \u221210. Result: \u221210.", [-25, 15]);
  accepts("10 / 3 = 3.33. Rounded result: 3.33.", [10, 3]);
  accepts(".25 + .15 = 40%.", [0.25, 0.15]);
  rejects("(25 + 15) * 2 = 55.", [25, 15, 2]);
  rejects("10 / 3 = 3.4.", [10, 3]);
  rejects("25 + 15 * 2 = 80.", [25, 15, 2]);
});

test("equations cannot invent operands, salvage an unsupported suffix or smuggle unrelated new values", () => {
  rejects("999 + 25 + 15 = 1039.", [25, 15]);
  rejects("25 + 15 = 40. The annual total is 400.", [25, 15]);
  rejects("25 + 15 = 40. Then 40 * 2 = 80.", [25, 15, 2]);
  rejects("0 / 0 = 0.", [0]);
  rejects("25 / 0 = 0.", [25, 0]);
  rejects("1e308 * 1e308 = 1.", [1]);
  rejects("Total is 1e309.", [1]);
});

test("formatting markers do not become claims or hide unsupported table/code numbers", () => {
  accepts("**1.** First item.\n2. Second item.\n**25 + 15 = 40**.", [25, 15]);
  accepts("- **25 + 15 = 40**.\n+ Total: 40.", [25, 15]);
  rejects("| Revenue | 999 |", [25]);
  rejects("`Revenue: 999`", [25]);
  rejects("Math.max(25, 15) = 999.", [25, 15]);
  rejects("2 ^ 3 + 4 = 7.", [2, 3, 4]);
  rejects("2 ** 3 + 4 = 7.", [2, 3, 4]);
  rejects("0.6 + 0.6 = 1.2M.", [0.6]);
  accepts("600000 + 600000 = 1.2M.", [600000]);
});

test("failed number checks identify the actual values with the stable repair reason", () => {
  assert.throws(
    () => validateDatasetAnswer("Revenue was 999.", evidence(25), "Revenue?"),
    (error) => {
      assert.equal(error.details.reason, "dataset_unsupported_number");
      assert.deepEqual(error.details.numbers, [999]);
      assert.equal(error.details.validationPolicy, "numeric-evidence-v2");
      assert.match(error.message, /999/);
      return true;
    },
  );
});
