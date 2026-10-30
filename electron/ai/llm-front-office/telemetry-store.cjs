/** Purpose: local content-free trace retention/export, separate from private immutable run records.
 * Inputs: validated metrics and retention days; outputs: retained metrics. Dependencies: existing safe JSON store.
 * Failure: safe storage errors. Knobs: retentionDays, maximum 2000 records. Owner: backend. */
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  safeDirectory,
  readJson,
  writeJson,
  rejectSymlink,
} = require("../json-store.cjs");
const { validateTrace } = require("./contracts.cjs");

/** Purge expired content-free metrics only; never delete conversation or model-run records. */
async function retainedTraces(root, days) {
  const directory = path.join(root, ".wonnyy", "front-office-metrics");
  await safeDirectory(directory);
  const rows = [];
  for (const name of await fs.readdir(directory)) {
    if (!/^[A-Za-z0-9_-]+\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    const value = await readJson(file, validateTrace);
    if (
      Date.parse(value.completedAt ?? value.startedAt) <
      Date.now() - days * 86400000
    ) {
      await rejectSymlink(file);
      await fs.unlink(file);
    } else rows.push({ file, value });
  }
  rows.sort((a, b) => b.value.startedAt.localeCompare(a.value.startedAt));
  for (const row of rows.slice(2000)) {
    await rejectSymlink(row.file);
    await fs.unlink(row.file);
  }
  return rows.slice(0, 2000).map((r) => r.value);
}
/** Append a metrics-only record and enforce local retention on activity, without a background timer. */
async function recordTrace(root, trace, days) {
  const value = validateTrace(trace);
  await writeJson(
    path.join(root, ".wonnyy", "front-office-metrics", `${value.runId}.json`),
    value,
  );
  await retainedTraces(root, days);
}
module.exports = { retainedTraces, recordTrace };
