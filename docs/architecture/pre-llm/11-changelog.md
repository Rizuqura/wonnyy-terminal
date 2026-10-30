# Front-office implementation changelog

2026-10-30:

- Added the audit and normal-agent passive baseline metrics, preserving the existing provider selection, retry and context behavior.
- Added opt-in experimental text chat in Settings with no injected system/persona/context/skills/RAG/tools/memory inputs.
- Added strict intake/configuration contracts, deterministic requirements, full-history rejection budgets and safe JSON validation.
- Added a cached capability registry with pricing/provenance/unknowns, local overrides, favorites, benchmark evidence and accessible filtering/sorting/inspection.
- Added manual per-session pins and opt-in deterministic auto routing with visible rationale and hard eligibility.
- Added optional authenticated loopback LiteLLM HTTP transport, exact service pin/example setup and scoped license/security review. No Python runtime is bundled or launched.
- Added one bounded retry/deadline/circuit controller, cumulative estimated caps and separate cross-provider/model-switch authorization; no retry after partial text.
- Added normalized incremental events, actual usage/finish/model observations, content-free metrics retention and JSON/CSV exports.
- Reused the existing stores with explicit schema-5 experiment conversations and schema-3 runs, idempotency and recovery. Older application builds require preserving these newer files before rollback.
- Added a controlled 40-case A/B/C evaluation harness, mock/live evidence separation, unscored human rubrics, sample sizes/uncertainty and importable live evidence records.
- Added unit/integration/Electron acceptance, fixture benchmark artifacts, screenshots, README and Indonesian tuning instructions.

Live provider/model quality and actual LiteLLM performance are unverified prerequisites, not release claims. Experimental mode, auto routing, provider fallback and gateway use remain off until explicitly enabled. No commits, publishing, account synchronization or external telemetry were performed.
