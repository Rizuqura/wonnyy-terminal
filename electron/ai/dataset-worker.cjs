const { parentPort } = require("node:worker_threads");
const { parseCsv, describe, query } = require("./dataset-engine.cjs");
const datasets = new Map();
parentPort.on("message", ({ id, method, sources, queries }) => {
  try {
    let value;
    if (method === "load") {
      value = sources.map((source) => {
        const dataset = parseCsv(source.content);
        datasets.set(source.sourceId, dataset);
        return {
          sourceId: source.sourceId,
          relativePath: source.relativePath,
          contentHash: source.contentHash,
          ...describe(dataset),
        };
      });
    } else if (method === "query") {
      if (!Array.isArray(queries) || !queries.length || queries.length > 6)
        throw new Error("Request between 1 and 6 dataset queries.");
      value = queries.map((input) => {
        if (!datasets.has(input?.sourceId))
          throw new Error("Dataset is outside the approved Brain Scope.");
        return {
          sourceId: input.sourceId,
          ...query(datasets.get(input.sourceId), input),
        };
      });
    } else throw new Error("Unsupported dataset operation.");
    const encoded = JSON.stringify(value);
    if (encoded.length > 60000)
      throw new Error(
        "Dataset result is too large. Select fewer columns, reduce the row limit, or aggregate.",
      );
    parentPort.postMessage({ id, value });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
