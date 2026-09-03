# Wonnyy V0.0.1 — Amadeus

## Release declaration

**Wonnyy V0.0.1 — Amadeus** is the current project baseline as of **2026-09-03**.

Amadeus establishes Planet View as the authoritative map of knowledge that a future model may access. It is a **model-addressable knowledge environment**, not yet a model-executing or agent-ready release. No local model, hosted provider, chat runtime, or autonomous agent loop is connected in V0.0.1.

## Current milestone

**M6 — Planet View Brain Scope and provider-neutral knowledge boundary complete.**

- Planet View now defines a deterministic effective Brain Scope: Active Context overrides active Station matches, which override the universal supported vault.
- Scope preparation returns a content-free source manifest with provenance, hashes, Station membership, and token estimates. Opaque scope capabilities constrain controlled source reads in Electron; replacement scopes invalidate earlier capabilities.
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

### Required before model execution

1. Prevent invalid or stale Station identifiers from falling back to universal scope; an invalid narrowing request must fail closed.
2. Implement an executable provider adapter and orchestration service rather than relying on TypeScript interfaces alone.
3. Add prompt construction rules, source boundaries, prompt-injection handling, and auditable attribution tied to sources actually read.
4. Add provider-aware tokenization, context budgeting, chunking, and retrieval so large vaults and large CSV files are not read wholesale.
5. Avoid sequentially hashing and estimating every file on the Electron main path for each universal scope preparation; introduce bounded or incremental indexing.
6. Add runtime schema validation at IPC and provider boundaries, plus streaming, cancellation, timeouts, retry policy, and structured error handling.
7. Give scope capabilities run ownership and expiry so concurrent model requests cannot invalidate one another globally.
8. Add size limits for Markdown and CSV, OCR or an explicit unreadable status for scanned PDFs, and accurate type handling for missing sources.
9. Record immutable model runs containing scope identity, manifest version, sources actually read, provider/model configuration, and response provenance.
10. Add secure provider configuration and secret handling before any remote provider is enabled.

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

- `npm test`: recursive scan, PDF text extraction/search, binary reads, PDF size limits, and vault-boundary tests pass.
- `npm run build`: production build passes and includes the local PDF.js worker.

## Next intended milestone

Close the model-readiness audit findings, beginning with fail-closed scope resolution and an auditable provider-neutral orchestration layer. Then connect a replaceable local model adapter without weakening vault boundaries or granting model-side Station mutation.
