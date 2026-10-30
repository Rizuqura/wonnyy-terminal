/**
 * Purpose: extract content-free metrics from local model-run JSON or trace lists.
 * Inputs: input file, --format json|csv, --output new-file; output is UTF-8.
 * Dependencies: Node fs and the metrics exporter. No provider/network access.
 * Failure modes: generic errors; exclusive output creation prevents overwrites.
 * Tuning knobs: format/path. Owner: backend. Does not export whole chat records.
 */
const fs = require("node:fs/promises");
const { exportTraces } = require("../electron/ai/llm-front-office/export.cjs");

async function main() {
  const [input, ...args] = process.argv.slice(2);
  let output;
  let format = "json";
  if (!input || args.length % 2) throw new Error("usage");
  const seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error("usage");
    seen.add(flag);
    if (flag === "--output") output = args[i + 1];
    else if (flag === "--format") format = args[i + 1];
    else throw new Error("usage");
  }
  if (!output) throw new Error("usage");
  const value = JSON.parse(await fs.readFile(input, "utf8"));
  const traces = Array.isArray(value)
    ? value
    : [value?.diagnostics?.frontOffice ?? value];
  const serialized = exportTraces(traces, format);
  await fs.writeFile(output, serialized, { encoding: "utf8", flag: "wx" });
}

main().catch(() => {
  // Do not print parse errors: they can quote private chat input or paths.
  process.stderr.write(
    "Metrics export failed. Use: node scripts/front-office-metrics-export.cjs INPUT --format json|csv --output NEW_FILE. Check for valid baseline metrics and an unused output path.\n",
  );
  process.exitCode = 1;
});
