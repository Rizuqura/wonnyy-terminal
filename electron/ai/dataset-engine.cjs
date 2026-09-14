// Pure, read-only operations. Model output is data, never executable code or SQL.
const fail = (message) => {
  throw new Error(message);
};
const MAX_BYTES = 50 * 1024 * 1024;
const missing = (value) => value.trim() === "";
function numeric(value) {
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER
    ? number
    : null;
}
function dateKey(value, unit) {
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text))
    fail(`Expected an ISO date, received ${JSON.stringify(value)}.`);
  const date = new Date(`${text.slice(0, 10)}T00:00:00Z`);
  if (
    !Number.isFinite(Date.parse(text)) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== text.slice(0, 10)
  )
    fail(`Invalid ISO date: ${text}.`);
  return text.slice(0, { year: 4, month: 7, day: 10 }[unit]);
}

function records(text, delimiter, maxRecords = Infinity) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += char;
    } else if (char === delimiter) pushCell();
    else if (char === "\n" || char === "\r") {
      const emptyLine = row.length === 0 && cell === "" && !closed;
      pushCell();
      if (!emptyLine) rows.push(row);
      row = [];
      if (char === "\r" && text[i + 1] === "\n") i++;
      if (rows.length >= maxRecords) return rows;
    } else if (char === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || char === '"')
        fail(`Malformed CSV quoting near character ${i + 1}.`);
      cell += char;
    }
  }
  if (quoted) fail("CSV has an unterminated quoted cell.");
  if (cell || row.length || closed) {
    pushCell();
    rows.push(row);
  }
  return rows;
}

function parseCsv(content) {
  if (typeof content !== "string" || Buffer.byteLength(content) > MAX_BYTES)
    fail("CSV analysis supports UTF-8 files up to 50 MB.");
  if (/[\u0000\ufffd]/u.test(content))
    fail("CSV has unsupported or invalid text encoding. Save it as UTF-8.");
  const text = content.replace(/^\uFEFF/, "");
  const candidates = [",", ";", "\t", "|"]
    .map((delimiter) => {
      try {
        const sample = records(text, delimiter, 20);
        const width = sample[0]?.length ?? 0;
        return {
          delimiter,
          score:
            width > 1
              ? (sample.filter((r) => r.length === width).length /
                  sample.length) *
                  100 +
                Math.min(width, 50)
              : 0,
        };
      } catch {
        return { delimiter, score: -1 };
      }
    })
    .sort((a, b) => b.score - a.score);
  const delimiter = candidates[0].delimiter;
  const parsed = records(text, delimiter);
  if (!parsed.length) fail("CSV is empty; a header row is required.");
  const [headers, ...rows] = parsed;
  if (headers.length > 200) fail("CSV analysis supports at most 200 columns.");
  if (
    headers.some((h) => !h.trim()) ||
    new Set(headers).size !== headers.length
  )
    fail("CSV headers must be non-empty and unique.");
  const bad = rows.findIndex((row) => row.length !== headers.length);
  if (bad !== -1)
    fail(
      `CSV record ${bad + 2} has ${rows[bad].length} cells; expected ${headers.length}.`,
    );
  const columns = headers.map((name, index) => {
    let missingCount = 0,
      numericCount = 0,
      dateCount = 0;
    for (const row of rows) {
      if (missing(row[index])) {
        missingCount++;
        continue;
      }
      if (numeric(row[index]) !== null) numericCount++;
      if (/^\d{4}-\d{2}-\d{2}/.test(row[index])) {
        try {
          dateKey(row[index], "day");
          dateCount++;
        } catch {}
      }
    }
    const present = rows.length - missingCount;
    return {
      name,
      type: !present
        ? "empty"
        : numericCount === present
          ? "number"
          : dateCount === present
            ? "date"
            : "text",
      missingCount,
      numericCount,
    };
  });
  return { headers, rows, delimiter, columns };
}

function describe(dataset) {
  return {
    rowCount: dataset.rows.length,
    delimiter: dataset.delimiter,
    columns: dataset.columns,
    sample: dataset.rows
      .slice(0, 3)
      .map((values, index) => ({ record: index + 2, values })),
    sampleOnly: true,
    conventions:
      "First record is the header. Empty physical lines are ignored. Record numbers count parsed CSV records, including multiline and quoted-empty cells. Blank cells are missing. Numeric operations accept decimal/scientific notation; currency symbols, thousands separators and percentages require explicit cleaning. Dates must be ISO; grouping uses the date as written, without timezone conversion. Malformed records are rejected.",
  };
}

function keys(object, allowed, label) {
  if (
    !object ||
    typeof object !== "object" ||
    Array.isArray(object) ||
    Object.keys(object).some((k) => !allowed.includes(k))
  )
    fail(`Unsupported ${label} fields.`);
}
function query(dataset, input) {
  keys(
    input,
    [
      "sourceId",
      "operation",
      "columns",
      "filters",
      "groupBy",
      "metrics",
      "sort",
      "limit",
      "offset",
      "growth",
    ],
    "query",
  );
  if (!["profile", "rows", "aggregate"].includes(input.operation))
    fail("Supported operations: profile, rows, aggregate.");
  const column = (name) => {
    const index = dataset.headers.indexOf(name);
    if (index < 0) fail(`Unknown column: ${name}.`);
    return index;
  };
  const array = (value, max, label) => {
    if (!Array.isArray(value) || value.length > max) fail(`Invalid ${label}.`);
    return value;
  };
  const filters = array(input.filters ?? [], 12, "filters").map((filter) => {
    keys(filter, ["column", "op", "value"], "filter");
    const index = column(filter.column);
    if (
      ![
        "eq",
        "ne",
        "gt",
        "gte",
        "lt",
        "lte",
        "contains",
        "is_missing",
        "not_missing",
      ].includes(filter.op)
    )
      fail("Unsupported filter operator.");
    if (
      !["is_missing", "not_missing"].includes(filter.op) &&
      !["string", "number"].includes(typeof filter.value)
    )
      fail("Filter value must be text or a number.");
    if (typeof filter.value === "number" && !Number.isFinite(filter.value))
      fail("Filter numbers must be finite.");
    return { ...filter, index };
  });
  let selected = dataset.rows
    .map((values, index) => ({ values, record: index + 2 }))
    .filter(({ values }) =>
      filters.every((f) => {
        const raw = values[f.index];
        if (f.op === "is_missing") return missing(raw);
        if (f.op === "not_missing") return !missing(raw);
        if (f.op === "contains") return raw.includes(String(f.value));
        if (missing(raw)) return false;
        const value = typeof f.value === "number" ? numeric(raw) : raw;
        if (value === null)
          fail(`Non-numeric value in numeric filter on ${f.column}.`);
        return {
          eq: () => value === f.value,
          ne: () => value !== f.value,
          gt: () => value > f.value,
          gte: () => value >= f.value,
          lt: () => value < f.value,
          lte: () => value <= f.value,
        }[f.op]();
      }),
    );
  const provenance = {
    totalRows: dataset.rows.length,
    matchedRows: selected.length,
    filters,
    operation: input.operation,
  };
  if (input.operation === "profile") {
    if (
      filters.length ||
      input.columns?.length ||
      input.sort?.length ||
      input.groupBy?.length ||
      input.metrics?.length ||
      input.growth ||
      input.offset
    )
      fail(
        "Profile describes the entire dataset; use rows or aggregate for selection and filters.",
      );
    return { ...provenance, ...describe(dataset) };
  }
  const limit = input.limit ?? 30,
    offset = input.offset ?? 0;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    fail("Use limit 1–100 and a non-negative integer offset.");
  let output, outputColumns;
  if (input.operation === "rows") {
    if (input.groupBy?.length || input.metrics?.length || input.growth)
      fail("Rows does not accept grouping, metrics or growth.");
    outputColumns = array(input.columns ?? dataset.headers, 200, "columns");
    const indexes = outputColumns.map(column);
    output = selected.map((row) => ({
      record: row.record,
      values: indexes.map((i) => row.values[i]),
    }));
  } else {
    if (input.columns?.length)
      fail("Use groupBy and metrics for aggregate output.");
    const groupSpecs = [...array(input.groupBy ?? [], 4, "groupBy")];
    if (input.growth) {
      keys(input.growth, ["periodColumn", "metric", "from", "to"], "growth");
      const growthColumn = column(input.growth.periodColumn);
      if (
        !groupSpecs.some((group) => group.column === input.growth.periodColumn)
      ) {
        let unit = "value";
        if (dataset.columns[growthColumn].type === "date") {
          const periodUnit = (value) =>
            typeof value === "string" && /^\d{4}$/.test(value)
              ? "year"
              : typeof value === "string" && /^\d{4}-\d{2}$/.test(value)
                ? "month"
                : typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
                  ? "day"
                  : null;
          unit = periodUnit(input.growth.from);
          if (!unit || unit !== periodUnit(input.growth.to))
            fail(
              "Date growth requires from/to periods in the same ISO year, month or day format.",
            );
        }
        groupSpecs.push({ column: input.growth.periodColumn, unit });
      }
    }
    const groups = groupSpecs.map((g) => {
      keys(g, ["column", "unit"], "groupBy");
      if (g.unit && !["value", "year", "month", "day"].includes(g.unit))
        fail("Group unit must be value, year, month or day.");
      return { ...g, index: column(g.column) };
    });
    const metrics = array(input.metrics ?? [], 8, "metrics").map((m) => {
      keys(m, ["op", "column", "as"], "metric");
      if (
        !["count", "sum", "average", "min", "max"].includes(m.op) ||
        typeof m.as !== "string" ||
        !m.as ||
        m.as.length > 80
      )
        fail(
          "Metrics require count/sum/average/min/max and a unique 'as' name.",
        );
      return {
        ...m,
        index: m.op === "count" && !m.column ? -1 : column(m.column),
      };
    });
    if (!metrics.length) fail("An aggregate requires at least one metric.");
    if (
      new Set(metrics.map((metric) => `${metric.op}:${metric.index}`)).size !==
      metrics.length
    )
      fail(
        "Duplicate metrics calculate the same values. Renaming a metric does not filter years or categories. Use growth for period comparisons, or separate queries with different filters.",
      );
    outputColumns = [
      ...groups.map((g) => g.column),
      ...metrics.map((m) => m.as),
    ];
    if (new Set(outputColumns).size !== outputColumns.length)
      fail("Output column names must be unique.");
    const buckets = new Map();
    if (!groups.length)
      buckets.set("[]", {
        values: [],
        states: metrics.map(() => ({
          count: 0,
          sum: 0,
          min: null,
          max: null,
          missing: 0,
        })),
      });
    for (const row of selected) {
      const values = groups.map((g) =>
        missing(row.values[g.index])
          ? null
          : g.unit && g.unit !== "value"
            ? dateKey(row.values[g.index], g.unit)
            : row.values[g.index],
      );
      const key = JSON.stringify(values);
      if (!buckets.has(key))
        buckets.set(key, {
          values,
          states: metrics.map(() => ({
            count: 0,
            sum: 0,
            min: null,
            max: null,
            missing: 0,
          })),
        });
      if (buckets.size > 100000)
        fail("Too many groups; filter the dataset or use broader groups.");
      const bucket = buckets.get(key);
      metrics.forEach((m, i) => {
        const s = bucket.states[i];
        if (m.index >= 0 && missing(row.values[m.index])) {
          s.missing++;
          return;
        }
        s.count++;
        if (m.op === "count") return;
        const value = numeric(row.values[m.index]);
        if (value === null)
          fail(
            `Cannot calculate ${m.op}: record ${row.record}, column ${m.column} is not an unambiguous number.`,
          );
        if (["sum", "average"].includes(m.op)) {
          s.sum += value;
          if (
            !Number.isFinite(s.sum) ||
            Math.abs(s.sum) > Number.MAX_SAFE_INTEGER
          )
            fail("Numeric total exceeds the supported safe range.");
        }
        s.min = s.min === null ? value : Math.min(s.min, value);
        s.max = s.max === null ? value : Math.max(s.max, value);
      });
    }
    output = [...buckets.values()].map((b) => ({
      values: [
        ...b.values,
        ...metrics.map((m, i) => {
          const s = b.states[i];
          return m.op === "count"
            ? s.count
            : !s.count
              ? null
              : m.op === "average"
                ? s.sum / s.count
                : s[m.op];
        }),
      ],
      missingByMetric: Object.fromEntries(
        metrics.map((m, i) => [m.as, b.states[i].missing]),
      ),
    }));
    provenance.groupBy = groupSpecs;
    provenance.metrics = input.metrics;
    if (input.growth) {
      keys(input.growth, ["periodColumn", "metric", "from", "to"], "growth");
      const g = input.growth,
        period = groups.findIndex((x) => x.column === g.periodColumn),
        metric = outputColumns.indexOf(g.metric);
      if (period < 0)
        fail(
          `Growth periodColumn must be one of the grouped column names: ${JSON.stringify(groups.map((x) => x.column))}; received ${JSON.stringify(g.periodColumn)}. Use the source column name, not the grouping unit.`,
        );
      if (metric < groups.length)
        fail(
          `Growth metric must be an aggregate alias: ${JSON.stringify(metrics.map((x) => x.as))}; received ${JSON.stringify(g.metric)}.`,
        );
      if (
        period < 0 ||
        metric < groups.length ||
        typeof g.from !== "string" ||
        typeof g.to !== "string" ||
        g.from === g.to
      )
        fail(
          "Growth needs a grouped periodColumn, a metric, and distinct string from/to periods.",
        );
      const pairs = new Map();
      for (const row of output) {
        const periodValue = String(row.values[period]);
        if (![g.from, g.to].includes(periodValue)) continue;
        const values = row.values
          .slice(0, groups.length)
          .filter((_, i) => i !== period);
        const key = JSON.stringify(values);
        if (!pairs.has(key)) pairs.set(key, { values, from: null, to: null });
        pairs.get(key)[periodValue === g.from ? "from" : "to"] =
          row.values[metric];
      }
      outputColumns = [
        ...groups.filter((_, i) => i !== period).map((g) => g.column),
        "from",
        "to",
        "change",
        "percentChange",
      ];
      if (new Set(outputColumns).size !== outputColumns.length)
        fail("Growth column names conflict with grouping columns.");
      output = [...pairs.values()].map((p) => {
        const change = p.from === null || p.to === null ? null : p.to - p.from;
        const percentChange =
          change === null || p.from === 0 ? null : (change / p.from) * 100;
        if (
          [change, percentChange].some(
            (value) =>
              value !== null &&
              (!Number.isFinite(value) ||
                Math.abs(value) > Number.MAX_SAFE_INTEGER),
          )
        )
          fail("Growth calculation exceeds the supported safe range.");
        return { values: [...p.values, p.from, p.to, change, percentChange] };
      });
      provenance.growth = g;
      provenance.growthConvention =
        "(to-from)/from*100; absent periods or zero baseline yield null, never zero.";
    }
  }
  const sorting = array(input.sort ?? [], 4, "sort").map((s) => {
    keys(s, ["column", "direction"], "sort");
    const index = outputColumns.indexOf(s.column);
    if (index < 0 || !["asc", "desc"].includes(s.direction))
      fail("Sort requires an output column and asc/desc direction.");
    return { ...s, index };
  });
  output.sort((a, b) => {
    for (const s of sorting) {
      let x = a.values[s.index],
        y = b.values[s.index];
      if (
        input.operation === "rows" &&
        dataset.columns[column(s.column)].type === "number"
      ) {
        x = numeric(x);
        y = numeric(y);
      }
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
        continue;
      }
      const order = x < y ? -1 : x > y ? 1 : 0;
      if (order) return s.direction === "desc" ? -order : order;
    }
    return 0;
  });
  return {
    ...provenance,
    columns: outputColumns,
    results: output.slice(offset, offset + limit),
    resultCount: output.length,
    offset,
    limit,
    truncated: offset > 0 || output.length > offset + limit,
    sort: input.sort ?? [],
    numericPrecision:
      "IEEE-754 double; blank numeric cells excluded and counted",
  };
}

module.exports = { parseCsv, describe, query };
