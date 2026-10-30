# QT-RCA-001 evidence

Captured 2026-10-30 in a disposable Electron profile/vault. These files contain fixed public test markers, counts, public model IDs, safe error categories and content-free traces. No key/ciphertext, account identifier, authorization header or private conversation is included.

- `baseline-live.json`: actual raw provider A before repair; OpenRouter exact marker, initial NVIDIA timeout. NVIDIA initial probe could overlap startup model checks; use isolated follow-up below for attribution.
- `baseline-ui-admission.json`: actual pre-repair UI cannot create a conversation because of shared busy admission.
- `before-alias-fix-ui.json`: after admission repair, manual deployment rejected at candidate evaluation with zero provider calls.
- `catalog-parameter-evidence.json`: public live catalog metadata advertising canonical output-cap keyword only.
- `direct-nvidia-isolated.json`: actual bounded NVIDIA calls after model checks have stopped; timeout and listed alternate 404.
- `verified-ui-streaming.json/png`: real provider, streaming events, final assistant DOM and screenshot; combined trace includes all 12 lifecycle boundaries.
- `verified-ui-nonstreaming.json/png`: real JSON completion, no fabricated deltas/TTFT, final assistant DOM and screenshot.
- `verified-multi-turn.json/png`: real ORBITAL continuity, per-turn backend traces and timestamped actual final assistant observations.
- `failure-fallback-admission.json`: deterministic mocked-provider G/H and active model-check regression in the actual UI. These are not real LiteLLM/provider proof.

Backend traces deliberately stop before persistence/rendering. For C/D/E the diagnostic-level `stages` adds the actual DOM observation after the backend trace. G/H retain backend traces and separate frontend observations. Missing post-failure stages are unreachable rather than implicitly successful; see [request flow](../PROVIDER_REQUEST_FLOW.md). Generation/content captured is limited to the public test markers. Model reasoning and arbitrary returned text are not exported.
