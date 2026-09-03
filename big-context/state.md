# Wonnyy V0.0.2 — Amadeus Preparation Checkpoint

## Release declaration

**Wonnyy V0.0.2 — Amadeus Preparation Checkpoint** is the current project baseline as of **2026-09-03**.

Amadeus establishes Planet View as the authoritative map of knowledge that a future model may access. V0.0.2 is the checkpoint immediately before full context-aware local-model integration: Brain Scope errors and authorization boundaries have been hardened, local Ollama connectivity has been proven, and application branding has been tidied. The prototype chat is not yet connected to model execution, and no autonomous agent loop exists.

## Current milestone

**M7.1 — Local Ollama connectivity complete (2026-09-03).**

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
- Provider-neutral request, response, message, source, and provider contracts are ready for a future local or remote model adapter. No provider is connected yet.
- Active Stations render as separate named hubs with explicit hub-to-member lines. Shared objects connect to multiple hubs and settle between their context systems.

## Model-readiness audit

The knowledge boundary is strong enough to begin model integration, but the software is not yet safe to describe as fully model-use ready.

### Ready in Amadeus

- Local discovery, canonical path containment, and Electron process isolation.
- Explicit Brain Scope precedence and controlled in-scope source reads.
- Deterministic manifests, provenance, content hashes, and provider-neutral TypeScript contracts.
- Markdown and CSV text access plus PDF text-layer extraction.
- Visual Station networks that correspond to distinct semantic scopes.

### Remaining before model execution

1. Implement the AI orchestrator that binds the hardened Brain Scope to the provider adapter.
2. Add prompt construction rules, source boundaries, prompt-injection handling, and auditable attribution tied to sources actually read.
3. Add provider-aware tokenization, context budgeting, chunking, and retrieval so large vaults and large CSV files are not read wholesale.
4. Avoid sequentially hashing and estimating every file on the Electron main path for each universal scope preparation; introduce bounded or incremental indexing.
5. Add chat streaming, cancellation, retry policy, and structured run lifecycle handling.
6. Add size limits for Markdown and CSV, OCR or an explicit unreadable status for scanned PDFs, and accurate type handling for missing sources.
7. Record immutable model runs containing scope identity, manifest version, sources actually read, provider/model configuration, and response provenance.
8. Add secure provider configuration and secret handling before any remote provider is enabled.

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

- `npm test`: all 23 service, Brain Scope security, Ollama provider, layout, and hit-testing tests pass.
- `npm run build`: production build passes and includes the local PDF.js worker.

## Next intended milestone

Begin **M7.2 — Context-Aware Model Request** with one explicitly approved Markdown source. Add the orchestrator and prompt-injection boundary, then prove that Qwen receives only that authorized content and returns its source identity and hash.
