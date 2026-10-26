const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculate,
  executePlan,
  STATISTICS_FORMAT,
} = require("./statistics.cjs");
const { parseCsv, query } = require("./dataset-engine.cjs");
const { createContextOrchestrator } = require("./orchestrator.cjs");
const { validateDatasetAnswer } = require("./dataset-evidence.cjs");

test("statistics compute means, zero and signed deltas with explicit domain checks", () => {
  assert.equal(calculate("mean", [2, 4, 8]).value, 14 / 3);
  assert.ok(Math.abs(calculate("geometric_mean", [2, 4, 8]).value - 4) < 1e-12);
  assert.ok(
    Math.abs(calculate("geometric_mean", [1e-300, 1e-200]).value / 1e-250 - 1) <
      1e-12,
  );
  assert.equal(calculate("geometric_mean", [0, 4]).value, 0);
  assert.throws(() => calculate("geometric_mean", [-1, 4]), /non-negative/);
  assert.equal(calculate("delta", [100, 80]).value, -20);
  assert.equal(calculate("percent_change", [100, 80]).value, -20);
  assert.equal(calculate("delta", [0, 80]).value, 80);
  assert.equal(calculate("percent_change", [0, 80]).value, null);
  for (const values of [[], [NaN], [Infinity], ["4"], [1e30]])
    assert.throws(() => calculate("mean", values));
  assert.throws(() => calculate("delta", [1, 2, 3]), /exactly/);
  assert.throws(() => calculate("eval", [1]), /supported/);
});

test("CSV mean aliases and geometric mean use all matching rows and exclude blanks", () => {
  const dataset = parseCsv("group,value\na,2\na,4\na,8\na,\nb,-4");
  const result = query(dataset, {
    operation: "aggregate",
    filters: [{ column: "group", op: "eq", value: "a" }],
    metrics: [
      { op: "mean", column: "value", as: "arithmetic" },
      { op: "geometric_mean", column: "value", as: "geometric" },
    ],
  });
  assert.equal(result.results[0].values[0], 14 / 3);
  assert.ok(Math.abs(result.results[0].values[1] - 4) < 1e-12);
  assert.equal(result.results[0].missingByMetric.geometric, 1);
  assert.equal(
    validateDatasetAnswer("Geometric mean is 4.", [result], "Mean?"),
    "Geometric mean is 4.",
  );
  assert.throws(
    () =>
      query(dataset, {
        operation: "aggregate",
        metrics: [{ op: "geometric_mean", column: "value", as: "gm" }],
      }),
    /non-negative/,
  );
  const metric = {
    operation: "aggregate",
    metrics: [{ op: "geometric_mean", column: "value", as: "gm" }],
  };
  assert.equal(query(parseCsv('value\n""'), metric).results[0].values[0], null);
  assert.equal(query(parseCsv("value\n0\n4"), metric).results[0].values[0], 0);
});

test("PDF operands must quote approved text and typed operands must quote the current question", () => {
  const sources = [
    {
      sourceId: "report",
      relativePath: "report.pdf",
      type: "pdf",
      content: "[PDF page 1]\nBefore: 100\n[PDF page 2]\nAfter: 80",
    },
  ];
  const plan = {
    calculations: [
      {
        label: "change",
        operation: "delta",
        operands: [
          { sourceId: "report", quote: "Before: 100", tokenIndex: 0 },
          { sourceId: "report", quote: "After: 80", tokenIndex: 0 },
        ],
      },
    ],
    limitation: "",
  };
  const [result] = executePlan(plan, sources, "Find delta");
  assert.equal(result.value, -20);
  assert.deepEqual(
    result.evidence.map((o) => o.page),
    [1, 2],
  );
  for (const replacement of [
    { sourceId: "private" },
    { quote: "After: 90" },
    { tokenIndex: 9 },
  ]) {
    const bad = structuredClone(plan);
    Object.assign(bad.calculations[0].operands[0], replacement);
    assert.throws(() => executePlan(bad, sources, "Find delta"));
  }
  const typed = {
    calculations: [
      {
        label: "mean",
        operation: "mean",
        operands: [0, 1, 2].map((tokenIndex) => ({
          sourceId: "user-message",
          quote: "2, 4, 8",
          tokenIndex,
        })),
      },
    ],
    limitation: "",
  };
  assert.equal(
    executePlan(typed, sources, "Mean of 2, 4, 8?")[0].value,
    14 / 3,
  );
  assert.throws(
    () => executePlan(typed, sources, "Mean of previous values?"),
    /verbatim/,
  );
});

test("PDF chat sends verified local statistics to the model and retains calculation provenance", async () => {
  const source = {
    id: "report",
    relativePath: "report.pdf",
    type: "pdf",
    contentHash: "a".repeat(64),
  };
  let owner;
  const records = [];
  const events = [];
  const orchestrator = createContextOrchestrator({
    prepareScope: async ({ ownerId }) => {
      owner = ownerId;
      return {
        id: "scope",
        ownerId,
        mode: "active-context",
        manifestVersion: "v1",
        sources: [source],
      };
    },
    readSource: async () => ({
      ...source,
      sourceId: "report",
      scopeId: "scope",
      ownerId: owner,
      manifestVersion: "v1",
      content: "[PDF page 1]\nValues: 2, 4, 8",
    }),
    recordRun: async (record) => records.push(record),
    provider: {
      complete: async (request) => {
        if (request.format === STATISTICS_FORMAT)
          return {
            content: JSON.stringify({
              calculations: [
                {
                  label: "Geometric mean",
                  operation: "geometric_mean",
                  operands: [0, 1, 2].map((tokenIndex) => ({
                    sourceId: "report",
                    quote: "Values: 2, 4, 8",
                    tokenIndex,
                  })),
                },
              ],
              limitation: "",
            }),
            finishReason: "stop",
          };
        const evidence = request.messages.find((m) =>
          m.content.includes('"kind":"wonnyy-computed-statistics"'),
        );
        assert.ok(evidence);
        assert.ok(
          Math.abs(JSON.parse(evidence.content).results[0].value - 4) < 1e-12,
        );
        request.onContent?.('{"answer":"99999"}');
        return {
          content: '{"answer":"The geometric mean is 4 (report.pdf, page 1)."}',
          finishReason: "stop",
          model: "test",
        };
      },
    },
  });
  const result = await orchestrator.run(
    {
      model: "test",
      userMessage: "Calculate the geometric mean of the PDF values.",
      activeStationIds: [],
      matchMode: "any",
    },
    { onEvent: (event) => events.push(event) },
  );
  assert.match(result.content, /Calculated locally/);
  assert.match(result.content, /geometric_mean\(2, 4, 8\) = 4/);
  assert.equal(result.diagnostics.statistics.results.length, 1);
  assert.equal(records[0].status, "succeeded");
  assert.ok(events.every((event) => !event.content?.includes("99999")));
});
