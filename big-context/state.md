> Current model integration design: [task-model-integration-architecture.md](./task-model-integration-architecture.md). Implementation and ownership: [model-integration-handoff.md](./model-integration-handoff.md). The earlier milestone narrative below is preserved as historical context; its next-step suggestions and implementation status may be superseded.

> Verification on 2026-09-06: the restructure has 75 passing tests, a passing static build and Electron smoke, and 22 completed real Qwen3 4B turns across isolated sources, restart, and cancellation recovery. See [verification results and model-quality limits](./model-integration-verification.md). Qwen3 1.7B and Llama 3.2 3B were not installed and remain untested with real inference.

# Wonnyy V0.0.3 — Amadeus Context Checkpoint

## Release declaration

**Wonnyy V0.0.3 — Amadeus Context Checkpoint** is the current project baseline as of **2026-09-03**.

Amadeus establishes Planet View as the authoritative map of knowledge that a future model may access. V0.0.3 proves the first secured context-aware local-model path: one approved Active Context Markdown source reaches Qwen through an owned Brain Scope, and every answer preserves verified source provenance. The prototype chat is not yet connected to model execution, and no autonomous agent loop exists.

## Current milestone

**M7.5 — Initial local-model chat runtime complete (2026-09-03).**

- Planet View now defines a deterministic effective Brain Scope: Active Context overrides active Station matches, which override the universal supported vault.
- Scope preparation returns a content-free source manifest with provenance, hashes, Station membership, and token estimates. Opaque capabilities are owned by a specific run, expire after five minutes, and constrain controlled source reads in Electron.
- Invalid or stale Station identifiers now fail closed with `BRAIN_INVALID_STATIONS`; they can never fall back to Universe scope, including when Active Context exists.
- Brain Scope and source-read inputs are validated at runtime. Errors cross IPC as stable codes, messages, and structured details.
- Concurrent runs keep independent scopes instead of invalidating one another. Owner mismatches, expired scopes, unauthorized sources, missing sources, and post-scope file changes are rejected before content is returned.
- Every scope and authorized source read carries a deterministic manifest version so future model runs can bind provenance to the exact prepared source set.
- Electron now owns a local-only Ollama provider boundary at `http://127.0.0.1:11434`; remote, authenticated, and non-HTTP endpoints are rejected in this milestone.
- The isolated preload bridge exposes model status, installed-model listing, and a fixed connectivity test. The renderer still cannot send arbitrary prompts or vault content to Ollama.
- Local Ollama `0.33.2` and the installed `qwen3:4b` model completed the structured connectivity proof with `WONNYY ONLINE`. The proof carried no Brain Scope, sources, tools, or filesystem authority.
- Ollama responses and model listings receive runtime validation. Offline, missing-model, timeout, invalid-response, provider, and malformed-request cases use stable structured errors.
- A provider-neutral Electron orchestrator now mints a fresh run-owned Brain Scope, requires exactly one approved Active Context Markdown source, and reads it only through the controlled source operation.
- Prompt version `wonnyy-context-v1` keeps system policy, untrusted source data, and the user question in separate deterministic messages. Source text cannot grant permissions or alter Brain Scope.
- M7.2 rejects Universe, Station, empty, multi-source, CSV, PDF, missing, changed, expired, unauthorized, oversized, and manifest-mismatched context before Ollama is called.
- Qwen must return a validated structured answer. The orchestrator exposes only the parsed answer plus scope manifest version, source ID, relative path, and content hash.
- The live isolated-vault proof returned `25%` from the approved Markdown file while excluding a conflicting unrelated vault file.
- Answer provenance is derived only from the verified Brain Source read. Provider-supplied source claims cannot replace or add to the authoritative source list.
- Every valid context-aware execution now produces one immutable schema-versioned record under `.wonnyy/model-runs`, including structured failures.
- Run records preserve timing, scope/manifest identity, provider/model, prompt version, user question, available and actually read sources, verified hashes, response, finish reason, usage, and error metadata.
- Records use exclusive atomic publication, cannot overwrite an existing run even under concurrency, remain outside Brain Scope, and never duplicate raw source content or the constructed prompt.
- A successful answer is returned only after its audit record is durable. Validated internal read/list operations prepare history for the future chat runtime.
- The Workspace and Planet View chat surfaces now share a real conversation state and call local Qwen only through the isolated Electron `desktop.ai.chat()` bridge.
- Chat requires exactly one available Active Context Markdown source, prevents duplicate submissions, displays generation state, and resets when the selected vault changes.
- Answers display verified source links and their recorded run identity. Structured Ollama, Brain Scope, provider, and recording failures are actionable and retryable.
- Model context is sized from the approved Brain Scope within an 8K–32K bound, preventing the false unavailable response previously caused by truncating medium Markdown documents.
- The initial chat path is intentionally non-streaming. Streaming and cancellation remain follow-up runtime hardening.
- Active Stations render as separate named hubs with explicit hub-to-member lines. Shared objects connect to multiple hubs and settle between their context systems.

## Model-readiness audit

The knowledge boundary is strong enough to begin model integration, but the software is not yet safe to describe as fully model-use ready.

### Ready in Amadeus

- Local discovery, canonical path containment, and Electron process isolation.
- Explicit Brain Scope precedence and controlled in-scope source reads.
- Deterministic manifests, provenance, content hashes, and provider-neutral TypeScript contracts.
- Markdown and CSV text access plus PDF text-layer extraction.
- Visual Station networks that correspond to distinct semantic scopes.

### Remaining after initial model execution

1. Add streaming and cancellation after the first non-streaming chat path is manually validated across representative vaults.
2. Add run-history presentation and retention controls for longer research sessions.
3. Add provider-aware tokenization, context budgeting, chunking, and retrieval so large vaults and large CSV files are not read wholesale.
4. Avoid sequentially hashing and estimating every file on the Electron main path for each universal scope preparation; introduce bounded or incremental indexing.
5. Add broader size policies, OCR or an explicit unreadable status for scanned PDFs, and accurate type handling for missing sources.
6. Add secure provider configuration and secret handling before any remote provider is enabled.

## Known product boundary

“The model can read the universe” means supported sources are available through a controlled scope. It does **not** mean every source is automatically inserted into every prompt. Active Context remains the highest-priority explicit narrowing mechanism, and Station scope remains a non-mutating availability filter. Models do not receive Station write authority in Amadeus.

- Users manually create case-sensitive Stations and assign them independently to files or directories. No inheritance, inference, embeddings, or AI tagging is used.
- Each vault stores portable metadata in `.wonnyy/stations.json`. Wonnyy excludes that internal directory from discovery and writes it atomically; malformed external edits leave the vault readable and preserve the last valid Station state.
- Planet View retains its filesystem mode and gains deterministic `ANY`/`ALL` Station projections. Direct members, structural parents, ordinary selection, and Active Context have independent visual states.
- Station results remain candidates. Adding selected directories expands supported descendants into a review prompt before the user explicitly approves the files for Active Context.
- Active Context persists per vault, reports approximate token size and changed/missing sources, and can produce a provenance-rich package through the isolated Electron bridge for a future local model.
- Missing assignments remain as orphans. Content fingerprints may suggest moved files, but reattachment always requires user confirmation.

- Electron owns the session-scoped active vault. It starts at `C:\bank` (or `WONNYY_VAULT_PATH`) and supports **Change Vault** through a native folder picker.
- One recursive vault snapshot drives Explorer, Planet View, Workspace, and Status Bar. It reports file/directory counts, scan time, status, and readable scan warnings.
- Supported files are `.md`, `.markdown`, `.csv`, and `.pdf`. File reads stay inside the active vault and errors are visible; the UI never fabricates file content after a failed read.
- Explorer and Planet View share ordered multi-selection. Click selects, Ctrl/Cmd-click toggles, double-click opens files, and Explorer directory selection focuses Planet View.
- PDF reads are validated in Electron, limited to 100 MB, and rendered through a bundled local PDF.js worker. The Workspace renders one page at a time with page navigation, zoom, and selectable embedded text.
- PDF embedded text is extracted only into session memory for Explorer content search. It is cleared when the vault changes or the app closes; image-only/scanned PDFs are previewable but not OCRed or searchable.
- `npm run dev` is the development workflow. Build installers only with `npm run desktop:dist` when a distributable is needed.

## Verification at the Amadeus baseline

- `npm test`: all 52 service, Brain Scope, prompt-builder, orchestrator, run-store, Ollama provider, chat-runtime, layout, and hit-testing tests pass.
- `npm run test:m74:live`: local `qwen3:4b` returns exactly `25%` from one approved Markdown source with provenance and one successful immutable run record.
- `npm run build`: production build passes and includes the local PDF.js worker.

## Next intended milestone

Manually validate the completed M7.5 chat with a real one-file Active Context. Then select the next phase: streaming/cancellation, run-history UX, broader retrieval, or CSV analytics.
