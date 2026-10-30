# Observability and reproducible evaluation

For ordinary agent chats, diagnostics.frontOffice remains the content-free existing-agent-baseline trace. Experimental runs use mode experiment with routing decisions, full-history counts, per-call usage/timing/price source, output validation, attempt/fallback state and allowlisted errors. Provider count totals are known subtotals when coverage is partial; missing usage or prices are null, not zero.

| Field | Meaning |
| --- | --- |
| requestId / runId | Existing correlation identities; replay does not spend again |
| sessionPseudonym | Linkable SHA-256 conversation pseudonym, not anonymity |
| calls / providerCallCount | Physical inference calls, including planner/repair calls for normal agents and bounded experiment attempts |
| estimatedInputTokens | Approximate UTF-8-byte estimate; no tokenizer claim |
| usageCoverage | complete, partial or none across reported input/output counts |
| firstContentMs | First existing callback, including any adapter buffering |
| adapterFirstTokenMs | Adapter's separately supplied TTFT, unknown if absent |
| durationMs | Named backend boundary; excludes final persistence/rendering, not full user-perceived E2E |
| estimatedCostUsd / costSources | Local price calculation over reported counts; unknown if usage/pricing is incomplete or stale |
| routing / rejections | Selection reason, eligible models, warnings and preflight rejections |
| formatPass | Explicit JSON/schema validation; null if no result was validated |

Experimental content-free traces are also retained under .wonnyy/front-office-metrics/. Configurable retention defaults to 14 days with a 2,000-record bound, enforced on local activity/export. Retention deletes only metrics, never immutable model-run or conversation records. Existing private run records still contain user content: do not export an entire run when sharing metrics.

Settings offers JSON/CSV metrics export. The CLI can extract a validated metrics object from a model-run record or trace array, and refuses to overwrite an existing destination:

    node scripts/front-office-metrics-export.cjs "path/to/vault/.wonnyy/model-runs/RUN_ID.json" --format json --output metrics.json

## A/B/C harness

Run the safe synthetic harness from the repository root:

    npm.cmd run benchmark:front-office
    node scripts/front-office-benchmark.cjs --mock --repetitions 3 --output test-results/front-office

Outputs are report.json, results.csv, report.md and evidence.json. JSON/CSV rows contain metrics and control hashes, not raw prompts, answers, keys or provider errors. Mock mode labels every row as mock, uses fixture responses and emits no importable production model evidence.

The suite has 40 task cases / 112 turns per repetition: exact short responses, controlled facts, human-rubric conceptual finance, JSON instructions, nine beginning/middle/end retrieval tests and three 25-turn conversation replays. A/B share underlying model/provider/messages/temperature/output cap; C can use permitted catalog models. Scenario order rotates. Canonical assistant history keeps A/B prompts identical and deliberately tests controlled replay rather than naturally evolving conversation. Compare hashes and reported identities before interpreting transport effects. A/B perform exactly one call per turn with fallback disabled.

The report distinguishes execution success from scored-answer success. Human-rubric finance answers remain unscored until reviewed; null quality is excluded from scored-answer-rate denominator and counted explicitly. Cost per successful answer is unknown unless all relevant costs are known. Descriptive Wilson intervals show sample size/uncertainty, with an explicit caveat that repeated prompts and turns are correlated. No single run is treated as conclusive.

Live execution is separate and requires an explicit model, permitted provider, call cap and environment-only key:

    node scripts/front-office-benchmark.cjs --live --provider openrouter --model YOUR_MODEL_ID --max-calls 1008 --max-output 128 --repetitions 3 --output test-results/front-office-live

Use --provider nvidia with NVIDIA_API_KEY for the verified NVIDIA-hosted endpoint. The harness never reads saved application credentials. Missing keys generate a live-skipped.json record; missing authenticated loopback service skips B explicitly. LITELLM_MASTER_KEY enables a liveness probe for B. The optional proxy's provider keys are configured separately. --models limits C's eligible model IDs to the explicit comma-separated list. --max-usd adds a cumulative estimated reservation cap; unknown prices reject that cap. No real provider/proxy benchmark was run in this session.

Live evidence.json records can be inspected and imported one at a time through Settings. They carry task/transport/model version, dataset, repeated quality/success results, context measurement source, timestamps and uncertainty. Exact model-version mismatch fails import rather than attaching evidence to an alias silently. Mock evidence is never written back into the registry.

See 10-benchmark-report.md for the factual local execution result and limitations.
