// Explicit local operator tool. Not exposed through IPC, model tools or source text.
const { KnowledgeStore, hash } = require("../electron/ai/knowledge-store.cjs");
const {
  readCompletedRun,
  readResearchSource,
} = require("../electron/ai/research-knowledge.cjs");
const fs = require("node:fs/promises");
async function main() {
  const args = process.argv.slice(2),
    options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !/^--[a-z-]+$/.test(args[i]) ||
      !args[i + 1] ||
      Object.hasOwn(options, args[i])
    )
      throw new Error("Use explicit --name value arguments, once each.");
    options[args[i]] = args[i + 1];
  }
  if (!options["--app-data"] || !options["--vault"])
    throw new Error(
      "Required: --app-data PATH --vault PATH --action list|approve|retrieve. Approve also requires --iteration N --record ID --reviewer NAME --rationale TEXT [--supersedes ID]. Retrieve requires --run ID --entity NAME --topic NAME --period PERIOD [--max-tokens N].",
    );
  const store = new KnowledgeStore(
    await fs.realpath(options["--app-data"]),
    await fs.realpath(options["--vault"]),
  );
  let result;
  if (options["--action"] === "list") {
    await store.checkBoundary();
    result = {
      directory: store.directory,
      proposals: await store.proposals(),
      knowledge: await store.latest(),
    };
  } else if (options["--action"] === "approve")
    result = await store.approve(
      {
        iteration: Number(options["--iteration"]),
        recordId: options["--record"],
        reviewer: options["--reviewer"],
        rationale: options["--rationale"],
        ...(options["--supersedes"]
          ? { supersedes: options["--supersedes"] }
          : {}),
      },
      (file) => readResearchSource(store.vault, file),
    );
  else if (options["--action"] === "retrieve") {
    const run = await readCompletedRun(store.vault, options["--run"]);
    const manifest = [];
    for (const source of run.contextIdentity.sources) {
      try {
        if (
          hash(await readResearchSource(store.vault, source.relativePath)) ===
          source.contentHash
        )
          manifest.push(source);
      } catch {
        /* Unavailable source versions cannot authorize reuse. */
      }
    }
    result = await store.retrieve(
      {
        entity: options["--entity"],
        topic: options["--topic"],
        period: options["--period"],
        maxTokens: Number(options["--max-tokens"] ?? 1500),
      },
      manifest,
    );
  } else throw new Error("Unknown action. Use list, approve or retrieve.");
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
