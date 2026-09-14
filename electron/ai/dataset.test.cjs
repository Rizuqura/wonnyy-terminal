const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsv, describe, query } = require("./dataset-engine.cjs");
const { createDatasetSession } = require("./dataset-session.cjs");
const { createContextOrchestrator } = require("./orchestrator.cjs");
const { DEFAULTS } = require("./model-registry.cjs");
const { validateDatasetAnswer } = require("./dataset-evidence.cjs");

test("metric names cannot manufacture different period totals", () => {
  assert.throws(
    () =>
      query(parseCsv("revenue\n3\n4"), {
        operation: "aggregate",
        metrics: [
          { op: "sum", column: "revenue", as: "total_2024" },
          { op: "sum", column: "revenue", as: "total_2025" },
        ],
      }),
    /Renaming a metric does not filter/,
  );
});

test("overflowing growth fails instead of serializing Infinity as a missing result", () => {
  assert.throws(
    () =>
      query(parseCsv("year,revenue\n2024,1e-300\n2025,1000000000"), {
        operation: "aggregate",
        metrics: [{ op: "sum", column: "revenue", as: "total" }],
        growth: {
          periodColumn: "year",
          metric: "total",
          from: "2024",
          to: "2025",
        },
      }),
    /Growth calculation exceeds/,
  );
});

test("percentage explanations may use the engine's declared formula constant", () => {
  const result = query(parseCsv("year,revenue\n2024,40000\n2025,60000"), {
    operation: "aggregate",
    metrics: [{ op: "sum", column: "revenue", as: "total" }],
    growth: { periodColumn: "year", metric: "total", from: "2024", to: "2025" },
  });
  const answer = "Growth is (60000 - 40000) / 40000 * 100 = 50%.";
  assert.equal(
    validateDatasetAnswer(answer, [result], "What was the growth?"),
    answer,
  );
  assert.throws(
    () =>
      validateDatasetAnswer(
        "Revenue was 100.",
        [{ results: [{ values: [7] }] }],
        "Total?",
      ),
    /introduced numbers/,
  );
});

test("follow-ups receive recomputed evidence only from the same approved snapshot", async () => {
  let sawPrevious = false;
  const aggregate = {
    sourceId: "sales.csv",
    operation: "aggregate",
    metrics: [{ op: "sum", column: "revenue", as: "total" }],
  };
  const f = integration(
    {
      complete: async (request) => {
        if (request.format.properties.queries) {
          sawPrevious = request.messages.some(
            (message) =>
              message.role === "user" &&
              message.content.includes("previousResults"),
          );
          return {
            content: JSON.stringify({
              queries: [
                sawPrevious
                  ? { sourceId: "sales.csv", operation: "profile" }
                  : aggregate,
              ],
            }),
            finishReason: "stop",
          };
        }
        return {
          content: '{"answer":"Total revenue is 7."}',
          finishReason: "stop",
          model: "test",
        };
      },
    },
    "revenue\n3\n4",
  );
  await f.run();
  const previous = {
    runId: "earlier",
    contextIdentityId: f.identity.id,
    question: "Total?",
    queries: [aggregate],
    results: [{ values: [999999] }],
  };
  const result = await f.run({ datasetHistory: [previous] });
  assert.equal(sawPrevious, true);
  assert.equal(
    result.diagnostics.datasetHistory[0].results[0].results[0].values[0],
    7,
  );
  assert.match(result.content, /Recomputed earlier analysis/);
  await f.run({
    datasetHistory: [{ ...previous, contextIdentityId: "different-snapshot" }],
  });
  assert.equal(sawPrevious, false);
  const skipped = await f.run({
    datasetHistory: [
      {
        ...previous,
        queries: [{ sourceId: "private.csv", operation: "profile" }],
      },
    ],
  });
  assert.equal(sawPrevious, false);
  assert.equal(skipped.diagnostics.datasetHistory.length, 0);
  assert.equal(skipped.diagnostics.skippedDatasetHistory[0].runId, "earlier");
});

test("invented quantities are rejected after a profile-only read; computed and approved document values pass", () => {
  const profile = {
    totalRows: 16000,
    matchedRows: 16000,
    sample: [{ record: 2, values: ["2024-01-01", "A", "10"] }],
  };
  assert.throws(
    () =>
      validateDatasetAnswer(
        "Category A earned 130,000 in 2025.",
        [profile],
        "Revenue in 2025?",
      ),
    { code: "MODEL_INVALID_RESPONSE" },
  );
  assert.equal(
    validateDatasetAnswer(
      "Revenue was 60,000 in 2025.",
      [{ ...profile, results: [{ values: [60000] }] }],
      "Revenue in 2025?",
    ),
    "Revenue was 60,000 in 2025.",
  );
  assert.equal(
    validateDatasetAnswer(
      "The note reports 25%.",
      [profile],
      "What does the note say?",
      ["Allocation is 25%."],
    ),
    "The note reports 25%.",
  );
});
const {
  PLAN_FORMAT,
  planFormat,
  isPlanFormat,
} = require("./dataset-planner.cjs");

test("planning schema constrains source and column names independently", () => {
  const schema = planFormat([
    {
      type: "csv",
      sourceId: "sales.csv",
      content: JSON.stringify({
        columns: [{ name: "date" }, { name: "revenue" }],
      }),
    },
  ]);
  const fields = schema.properties.queries.items.properties;
  assert.deepEqual(fields.sourceId.enum, ["sales.csv"]);
  assert.deepEqual(fields.filters.items.properties.column.enum, [
    "date",
    "revenue",
  ]);
  assert.deepEqual(fields.metrics.items.properties.column.enum, [
    "",
    "date",
    "revenue",
  ]);
  assert.equal(
    PLAN_FORMAT.properties.queries.items.properties.sourceId.enum,
    undefined,
  );
  assert.ok(isPlanFormat(schema));
  fields.operation.enum.push("execute_code");
  assert.equal(isPlanFormat(schema), false);
});

test("CSV parser preserves quoted multiline cells, escaped quotes, BOM, blanks and delimiters", () => {
  const d = parseCsv(
    '\ufeffname;amount;note\r\n"Doe, Jane";10;"first\nsecond ""quoted"""\r\nAlex;;\r\n',
  );
  assert.equal(d.delimiter, ";");
  assert.deepEqual(d.rows, [
    ["Doe, Jane", "10", 'first\nsecond "quoted"'],
    ["Alex", "", ""],
  ]);
  assert.equal(describe(d).columns[1].missingCount, 1);
  assert.equal(parseCsv("name\tvalue\na\t1").delimiter, "\t");
  assert.equal(parseCsv("name|value\na|1").delimiter, "|");
  assert.equal(parseCsv('only\n"a,b"').rows[0][0], "a,b");
});

test("malformed CSV and ambiguous arithmetic fail explicitly", () => {
  for (const text of [
    "",
    "a,a\n1,2",
    "a,b\n1",
    'a,b\n1,"open',
    'a,b\n1,"closed"x',
    "a,\n1,2",
    "a\n\ufffd",
  ])
    assert.throws(() => parseCsv(text));
  const d = parseCsv('name,amount\na,"1,000"\nb,2');
  assert.throws(
    () =>
      query(d, {
        operation: "aggregate",
        metrics: [{ op: "sum", column: "amount", as: "total" }],
      }),
    /not an unambiguous number/,
  );
  assert.equal(
    query(parseCsv("a\n"), {
      operation: "aggregate",
      metrics: [{ op: "count", as: "count" }],
    }).results[0].values[0],
    0,
  );
});

test("quoted empty records count as missing while empty physical lines are ignored", () => {
  const dataset = parseCsv('value\n""\n\n5\n');
  assert.deepEqual(dataset.rows, [[""], ["5"]]);
  assert.equal(describe(dataset).columns[0].missingCount, 1);
  assert.equal(
    query(dataset, {
      operation: "aggregate",
      metrics: [{ op: "count", as: "rows" }],
    }).results[0].values[0],
    2,
  );
});

test("full-file aggregation, missing counts, numeric sorting and record pagination", () => {
  const d = parseCsv("category,amount\na,10\nb,2\na,30\na,\nb,8");
  const result = query(d, {
    operation: "aggregate",
    groupBy: [{ column: "category" }],
    metrics: [
      { op: "sum", column: "amount", as: "total" },
      { op: "average", column: "amount", as: "mean" },
      { op: "count", as: "count" },
    ],
    sort: [{ column: "total", direction: "desc" }],
    limit: 1,
  });
  assert.deepEqual(result.results[0].values, ["a", 40, 20, 3]);
  assert.equal(result.results[0].missingByMetric.total, 1);
  assert.equal(result.matchedRows, 5);
  assert.equal(result.resultCount, 2);
  assert.equal(result.truncated, true);
  const rows = query(d, {
    operation: "rows",
    columns: ["amount"],
    filters: [{ column: "amount", op: "not_missing" }],
    sort: [{ column: "amount", direction: "desc" }],
    offset: 1,
    limit: 2,
  });
  assert.deepEqual(rows.results, [
    { record: 2, values: ["10"] },
    { record: 6, values: ["8"] },
  ]);
  assert.equal(
    query(d, {
      operation: "rows",
      filters: [{ column: "amount", op: "gte", value: 10 }],
    }).matchedRows,
    2,
  );
  assert.throws(
    () =>
      query(d, {
        operation: "rows",
        filters: [{ column: "absent", op: "eq", value: 1 }],
      }),
    /Unknown column/,
  );
  assert.throws(
    () => query(d, { operation: "rows", code: "process.exit()" }),
    /Unsupported/,
  );
});

test("date trends and growth are computed locally; absent periods and zero baselines are null", () => {
  const d = parseCsv(
    "date,category,revenue\n2024-01-01,A,100\n2025-01-01,A,160\n2024-02-01,B,0\n2025-02-01,B,10\n2025-02-01,C,8",
  );
  const result = query(d, {
    operation: "aggregate",
    groupBy: [{ column: "date", unit: "year" }, { column: "category" }],
    metrics: [{ op: "sum", column: "revenue", as: "total" }],
    growth: { periodColumn: "date", metric: "total", from: "2024", to: "2025" },
    sort: [{ column: "percentChange", direction: "desc" }],
  });
  assert.deepEqual(
    result.results.map((r) => r.values),
    [
      ["A", 100, 160, 60, 60],
      ["B", 0, 10, 10, null],
      ["C", null, 8, null, null],
    ],
  );
  assert.throws(
    () =>
      query(parseCsv("date,value\n2025-02-30,3"), {
        operation: "aggregate",
        groupBy: [{ column: "date", unit: "month" }],
        metrics: [{ op: "count", as: "count" }],
      }),
    /Invalid ISO/,
  );
});

test("worker enforces scope and is cancellable", async () => {
  const controller = new AbortController();
  const session = createDatasetSession(controller.signal);
  try {
    await session.call("load", {
      sources: [{ sourceId: "a.csv", content: "a\n1" }],
    });
    await assert.rejects(
      session.call("query", {
        queries: [{ sourceId: "../secret.csv", operation: "profile" }],
      }),
      /outside the approved/,
    );
    const pending = session.call("load", {
      sources: [
        { sourceId: "big.csv", content: "a,b\n" + "x,1\n".repeat(1000000) },
      ],
    });
    controller.abort(new Error("stopped"));
    await assert.rejects(pending, /stopped/);
  } finally {
    await session.close();
  }
});

test("growth adds the explicitly requested period grouping and reports its execution", () => {
  const d = parseCsv(
    "date,category,revenue\n2024-01-01,A,100\n2025-01-01,A,160\n2024-01-01,B,200\n2025-01-01,B,220",
  );
  const result = query(d, {
    operation: "aggregate",
    groupBy: [{ column: "category", unit: "value" }],
    metrics: [{ op: "sum", column: "revenue", as: "total" }],
    growth: { periodColumn: "date", metric: "total", from: "2024", to: "2025" },
  });
  assert.deepEqual(result.groupBy, [
    { column: "category", unit: "value" },
    { column: "date", unit: "year" },
  ]);
  assert.deepEqual(
    result.results.map((row) => row.values),
    [
      ["A", 100, 160, 60, 60],
      ["B", 200, 220, 20, 10],
    ],
  );
  assert.throws(
    () =>
      query(d, {
        operation: "aggregate",
        metrics: [{ op: "sum", column: "revenue", as: "total" }],
        growth: {
          periodColumn: "date",
          metric: "total",
          from: "2024",
          to: "2025-01",
        },
      }),
    /same ISO/,
  );
});

test("large valid values can be compared without calculating an unnecessary overflowing sum", () => {
  const d = parseCsv("value\n9000000000000000\n9000000000000000");
  const result = query(d, {
    operation: "aggregate",
    metrics: [
      { op: "max", column: "value", as: "maximum" },
      { op: "min", column: "value", as: "minimum" },
    ],
  });
  assert.deepEqual(
    result.results[0].values,
    [9000000000000000, 9000000000000000],
  );
  assert.throws(
    () =>
      query(d, {
        operation: "aggregate",
        metrics: [{ op: "sum", column: "value", as: "total" }],
      }),
    /safe range/,
  );
});

function integration(provider, content, history = []) {
  const source = {
    id: "sales.csv",
    relativePath: "sales.csv",
    type: "csv",
    contentHash: "a".repeat(64),
    missing: false,
    changed: false,
  };
  const scope = {
    id: "scope",
    ownerId: "owner",
    mode: "active-context",
    manifestVersion: "v1",
    sources: [source],
  };
  const records = [];
  const orchestrator = createContextOrchestrator({
    prepareScope: async (input) => ({ ...scope, ownerId: input.ownerId }),
    readSource: async (input) => ({
      ...source,
      sourceId: source.id,
      scopeId: "scope",
      ownerId: input.ownerId,
      manifestVersion: "v1",
      content,
    }),
    provider,
    recordRun: async (r) => records.push(r),
  });
  return {
    records,
    identity: require("./context-identity.cjs").contextIdentity(scope),
    run: (options = {}) =>
      orchestrator.run(
        {
          model: "test",
          userMessage: "What is the total revenue?",
          activeStationIds: [],
          matchMode: "any",
          history,
        },
        { settings: DEFAULTS, ...options },
      ),
  };
}

test("model plans and receives full-dataset evidence beyond the raw prompt limit, including history", async () => {
  let calls = 0;
  const csv =
    "category,revenue\n" +
    Array.from(
      { length: 15000 },
      (_, i) => `row${i},${i === 14999 ? 900 : 1}`,
    ).join("\n");
  const f = integration(
    {
      complete: async (request) => {
        calls++;
        if (request.format.properties.queries) {
          assert.ok(
            request.messages.some((m) => m.content === "Use all years."),
          );
          assert.ok(JSON.stringify(request.messages).length < 15000);
          assert.doesNotMatch(JSON.stringify(request.messages), /row14999/);
          return {
            content: JSON.stringify({
              queries: [
                {
                  sourceId: "sales.csv",
                  operation: "aggregate",
                  metrics: [{ op: "sum", column: "revenue", as: "total" }],
                },
              ],
            }),
            finishReason: "stop",
          };
        }
        const evidence = JSON.parse(
          JSON.parse(request.messages[1].content).content,
        ).computedResults[0];
        assert.equal(evidence.results[0].values[0], 15899);
        assert.equal(evidence.matchedRows, 15000);
        return {
          content: JSON.stringify({
            answer:
              "Total revenue is 15,899 across all 15,000 rows in sales.csv.",
          }),
          finishReason: "stop",
          model: "test",
        };
      },
    },
    csv,
    [
      { role: "user", content: "Which years?" },
      { role: "assistant", content: "Use all years." },
    ],
  );
  const result = await f.run();
  assert.equal(calls, 2);
  assert.equal(
    result.diagnostics.datasetAnalysis.results[0].matchedRows,
    15000,
  );
  assert.equal(f.records[0].status, "succeeded");
});

test("unsupported dataset numbers never stream or become a successful saved answer", async () => {
  const events = [];
  let calls = 0;
  const f = integration(
    {
      complete: async (request) => {
        calls++;
        if (request.format.properties.queries)
          return {
            content: JSON.stringify({
              queries: [{ sourceId: "sales.csv", operation: "profile" }],
            }),
            finishReason: "stop",
          };
        request.onContent?.('{"answer":"Revenue was 130,000."}');
        return {
          content: '{"answer":"Revenue was 130,000."}',
          finishReason: "stop",
          model: "test",
        };
      },
    },
    "revenue\n10\n15",
  );
  await assert.rejects(
    f.run({ onEvent: (event) => events.push(event) }),
    (error) => error.details?.reason === "dataset_unsupported_number",
  );
  assert.equal(calls, 3);
  assert.equal(f.records[0].status, "failed");
  assert.equal(f.records[0].response, null);
  assert.ok(events.every((event) => !event.content?.includes("130,000")));
});

test("invalid or out-of-scope plans get one repair, then fail without an invented answer", async () => {
  let calls = 0;
  const f = integration(
    {
      complete: async () => {
        calls++;
        return {
          content: JSON.stringify({
            queries: [{ sourceId: "secret.csv", operation: "profile" }],
          }),
          finishReason: "stop",
        };
      },
    },
    "a\n1",
  );
  await assert.rejects(
    f.run(),
    /could not produce a valid dataset analysis request/,
  );
  assert.equal(calls, 2);
  assert.equal(f.records[0].status, "failed");
  assert.equal(f.records[0].response, null);
});

test("a rejected request is repaired using diagnostic data, without putting source errors in system instructions", async () => {
  let calls = 0;
  const f = integration(
    {
      complete: async (request) => {
        calls++;
        if (calls === 1)
          return {
            content: JSON.stringify({
              queries: [
                {
                  sourceId: "sales.csv",
                  operation: "aggregate",
                  metrics: [{ op: "sum", as: "total" }],
                },
              ],
            }),
            finishReason: "stop",
          };
        if (calls === 2) {
          const diagnostic = request.messages.find((message) =>
            message.content.includes('"kind":"rejected-dataset-request"'),
          );
          assert.ok(diagnostic);
          assert.equal(diagnostic.role, "user");
          assert.match(diagnostic.content, /Unknown column/);
          assert.doesNotMatch(request.messages[0].content, /Unknown column/);
          return {
            content: JSON.stringify({
              queries: [
                {
                  sourceId: "sales.csv",
                  operation: "aggregate",
                  metrics: [{ op: "sum", column: "revenue", as: "total" }],
                },
              ],
            }),
            finishReason: "stop",
          };
        }
        return {
          content: JSON.stringify({ answer: "Total revenue is 7." }),
          finishReason: "stop",
          model: "test",
        };
      },
    },
    "revenue\n3\n4",
  );
  const result = await f.run();
  assert.equal(result.diagnostics.datasetAnalysis.planningAttempts, 2);
  assert.equal(
    result.diagnostics.datasetAnalysis.results[0].results[0].values[0],
    7,
  );
  assert.match(result.content, /Source: "sales.csv"; 2\/2 rows matched/);
});
