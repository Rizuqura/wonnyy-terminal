# Wonnyy 0.0.5 - Amadeus project state

Updated: **2026-09-10**. Release checkpoint: **0.0.5**, tag **`v0.0.5-amadeus`**. Previous baseline: `80ffb5e` / `v0.0.4-amadeus`.

## Latest implementation update - Station context can reach models

**User verification (2026-09-10):** chat worked with two approved Markdown files after manually adjusting generation context sizing. The screenshot shows a completed answer and both source references. This confirms one real two-source workflow, not sustained reliability or the named ContextWindow feature. Automatic sizing is not implemented; the sidebar and runtime use different token estimates. The exact saved settings for the successful run and the maximum usable context capacity have not been recorded/verified. The configured window size and application limits are not measured model capacity. See [the verification note](./station-model-context-handoff.md#user-verified-two-markdown-workflow---2026-09-10).

At the user's request, part of model consumption has moved forward ahead of the planned M9-A completion. **REVIEW STATION CONTEXT** now expands active ANY/ALL Station matches for explicit approval, and chat accepts **1-32 approved Markdown, CSV or extracted-PDF-text sources**. Multiple approved sources are packaged separately, retain full-set provenance and can be resumed together if unchanged. Combined source content must stay within 80,000 characters and the selected model's context budget. The bridge is version **12**; reopen Electron after this update.

This supersedes the single-Markdown-only limits and M9-B sequencing described in the earlier status sections below. Named reusable Context Windows, pins, window-specific budgets and semantic retrieval remain unfinished. See [Station model context handoff](./station-model-context-handoff.md) for the exact workflow, boundaries and verification. This work is included in the 0.0.5 checkpoint; the 0.0.4 tag remains on the previous baseline.

Wonnyy now integrates local Ollama and online Gemini/NVIDIA models into a shared, persistent, single-source chat runtime. Model switching, secure online credentials, streaming, cancellation, and restart recovery are implemented. The full research-workspace MVP is still in development: natural conversation quality needs sustained acceptance, and multi-source context plus several reading/search requirements remain unfinished.

Product principle: **AI models should be replaceable. Knowledge should be permanent.**

Current product priority: **make context building, inspection, refinement and reuse comfortable and easy inside Wonnyy.** The [Context Engineering specification](./context-engineering-experience.md) sets the order: **M8 Chat Reliability → M9 Context Windows + Station Grouping → M9.5 Semantic Retrieval → M10 CSV / Analytics Tools → M11 Tool-Using Agent**. M8 acceptance remains pending; M9 is planned, not implemented.

M9 introduces a persistent, named, versioned `ContextWindow` with authorized objects/Stations, pinned sources and a token budget. **Selected, Authorized, Pinned and Used must remain distinct.** Current Active Context and one-source chat do not yet implement this object or its complete interaction model.

Latest scope decision: **start M9-A with working, comfortable context controls, without model consumption.** M8 acceptance remains unresolved but does not block this independent work. M9-A covers persistence, review/authorization, grouping, pinning, approximate budgets and reuse. It must not alter existing chat authorization or mark sources Used. M9-B connects windows to execution after the controls are accepted. See [the controls-first specification](./context-engineering-experience.md#5-immediate-execution-scope---controls-before-model-consumption).

This file is the current status summary. The [September 10 audit](./project-audit-2026-09-10.md) cross-checks the original tasks against code and evidence. Earlier milestone descriptions and dated verification remain historical; their old next-step lists do not override this state.

## Completed foundations

### Vault, navigation and Stations

- Electron owns local filesystem access and the active vault. Users can change vaults, scan/rescan supported files, and inspect counts, scan status and errors.
- One vault snapshot drives Explorer, Planet View and Workspace. Explorer and Planet View share selection; selecting an object does not silently approve it for AI use.
- Manual Stations, file/directory assignments, ANY/ALL filtering, structural parent visibility, named Station hubs and deterministic orbital layouts are implemented. Stations do not reorganize the actual filesystem.
- Context review supports approved items, directory expansion, removal and clearing. Station metadata and Active Context persist under the vault's `.wonnyy` directory.
- Workspace reads Markdown and CSV, and previews PDFs with page navigation and selectable embedded text. PDF text extraction supports session-local content search.
- Workspace chat can be resized horizontally. Planet/chat event isolation and context-dialog focus fixes have desktop regression evidence.

### Model execution and chat

- Ollama, Gemini and NVIDIA adapters share backend-owned settings, model discovery/selection, conversation handling and source authorization. Switching providers or models changes future execution without changing the vault, Stations or approved source.
- Workspace and Planet chat use the same runtime. Natural input, streaming, cancellation, explicit retry, duplicate-request prevention and actionable errors are implemented.
- Conversations persist under `.wonnyy/conversations`; history UI supports viewing, new conversations, renaming, deletion and explicit source resumption. Restart reconciliation handles interrupted turns without automatically replaying model requests.
- Immutable records under `.wonnyy/model-runs` preserve actual provider/model identity, verified source hashes, timing, usage and execution diagnostics. Deleting a conversation retains separate audit records, as disclosed in the UI.
- History is assembled by the backend from completed exchanges. Settings and AI Terminal expose model readiness, execution location and generation controls.
- AI Terminal saves Gemini/NVIDIA credentials using OS-backed encryption in Electron. Raw keys are not stored in renderer persistence or exposed through a key-reading bridge method.
- Gemini/NVIDIA candidate checks start after saving a key or loading saved credentials. Passing synthetic samples receive stars and appear at the top of AI Terminal. Progress, stop and recheck controls are visible; settings/model actions can interrupt a scan without leaving the interface locked.

### Authorization and runtime boundaries

- Brain Scope precedence remains Active Context, then active Station matches, then the supported vault. This describes available sources; it does not automatically insert them into a prompt.
- Actual chat accepts **exactly one explicitly approved, available, unchanged Markdown source**. Empty, Station-only, Universe, multiple-source, CSV and PDF chat contexts are not supported.
- Source reads require owned, expiring capabilities and matching content hashes. Invalid Station IDs, changed/missing files and unauthorized reads fail closed. Concurrent scopes retain independent ownership.
- Model output cannot grant filesystem access, change source approval or replace verified provenance. Providers receive the constructed prompt, approved source and budgeted history, not general vault access.
- Remote execution is disclosed in the UI. There is no automatic provider failover. Gemini has bounded retries for selected pre-stream server failures; NVIDIA transport failures require explicit retry.
- Desktop AI bridge version is **11**. Backend/preload changes require reopening Electron. Ollama repair thinking is currently disabled; older thinking-enabled repair results describe a previous implementation.

## Remaining product gaps

M9-A now explicitly includes **multi-selection and bulk context arrangement**: add several selected objects to a named window in one review, then authorize, pin/unpin and remove groups with clear counts and undo. Planet View now implements rectangular drag selection, additive Ctrl/Shift dragging, Escape cancellation, and a Pan mode/Alt-drag alternative. Selection feeds the existing shared Explorer/Station assignment controls. Five hit-testing tests and the production build pass; interactive desktop acceptance of this new gesture remains pending. The Context Window bulk workflow is still planned and has not been implemented.

| Area | Current limit / unfinished work |
| --- | --- |
| Natural chat reliability | Sustained, useful follow-ups and acceptable latency still need current live acceptance. Passing transport or unit tests does not prove answer quality. |
| Multi-source research | The context-management layer can hold multiple objects, but chat accepts one Markdown source. File comparisons, folder chat and whole-Station chat remain unavailable. |
| Conversation memory | At most 12 recent completed exchanges are included, fewer under token pressure. The UI explains this and can show omitted-exchange counts. Saved history is not unlimited inference memory. |
| Evolving sources | Old conversations remain viewable after source changes, but their original source version cannot be resumed. Reapproval creates a new context boundary; snapshots and branching are absent. |
| Markdown reading | The reader displays raw text rather than rendered Markdown headings, tables, links and lists. |
| Multiple documents | Only one document is open at a time; the visual tab strip is not a multiple-document tab system. |
| Search | Filename/path and extracted PDF text search exist. Markdown and CSV content search are missing. |
| CSV ingestion | Basic table parsing exists; multiline quoted fields and malformed-input reporting need work. |
| Larger knowledge sets | Token estimation is heuristic. Chunking, retrieval, incremental indexing improvements and representative large-vault performance acceptance remain outstanding. |
| Planet/Station experience | Core implementation and layout tests exist; mature context-building usability and all proposed spatial/semantic-zoom behaviors are not fully accepted. |

Model-check stars are **session-only evidence of one short synthetic answer**, not certification of sustained usability or free access. Checks use fixed sample settings, can time out, and pause on authentication or quota errors; a scan may leave candidates untested.

PDF preview does not imply PDF model context. Scanned-PDF OCR, DOCX, CSV/PDF inference, Groq and OpenRouter adapters, Python/Pandas tools, autonomous agents, model-written vault changes and cloud synchronization remain unimplemented or deferred. They are not the immediate acceptance milestone.

## Verification and its limits

| Evidence | Result and scope |
| --- | --- |
| September 10 automated suite | **115 tests passed, zero failures** in the audit. |
| September 10 TypeScript check | Passed. |
| September 9 online Electron regression | Passed credential setup, switching, streaming, retry/draft retention, restart and choosing a model during a stalled scan. Uses synthetic provider transports with the actual desktop bridge and encryption. |
| September 8 local Electron regression | Passed context review/focus, source isolation, chat interactions, restart, history controls, vault change and PDF character maps. |
| September 9 build verification | Production build passed during the AI Terminal fix. No new build was run for the September 10 documentation audit. |
| September 9 hosted NVIDIA samples | Short summary/follow-up samples passed on Nemotron Super and MiniMax; other tested models failed longer tasks despite passing a short fact check. These are dated samples, not current availability guarantees. |
| September 6/7 local Qwen verification | Historical multi-turn and recovery evidence exists, with instruction-following and latency limitations. Later implementation changes have not received a fresh full live acceptance benchmark. |

The old `test-results/chat-electron-failure.txt` predates later successful desktop reports. Neither an old failure artifact nor a mock success report establishes present hosted-model quality. See [local verification](./model-integration-verification.md), [Gemini handoff](./online-integration-handoff.md), and [NVIDIA handoff](./nvidia-provider-handoff.md) for dated evidence and limitations.

## Execution order: context controls first; chat acceptance remains open

**Immediate implementation:** M9-A window persistence and management, followed by source/Station review, authorization, pinning, budget feedback and UI comfort/recovery checks. Model readability is not an acceptance requirement for this phase. The M8 checks below remain an open reliability track; model-connected M9 work follows M9-A acceptance.

1. Run at least ten natural turns on source A and ten on source B with the chosen real model. Review actual answers for relevance, grounding, instruction following and latency.
2. Return explicitly to A, restart, switch models, exceed the 12-exchange memory window, update a source, and cancel/recover. Confirm understandable boundaries and no source contamination.
3. Fix reproduced failures before expanding the provider catalog further. Agree on acceptable response quality and latency rather than equating completion with acceptance.
4. **M9:** define and persist Context Windows, then connect Planet/Station discovery to explicit authorization and pinning, budget preview, execution against a window version, and inspection of sources actually used. Extend source identity, budgets, provenance and isolation together. Decide format support and migration explicitly.
5. Improve reading/search where it supports that context-building workflow: rendered Markdown, multiple documents, Markdown/CSV content search and robust CSV parsing. Accept context refinement, continuation and reuse through the UI before advancing to **M9.5 semantic retrieval**, **M10 analytics**, then **M11 tool-using agents**.

Provider integration has advanced ahead of the full research experience. The next work should make human-controlled context engineering the core workflow, using the existing providers as replaceable execution engines later. The [current task sequence](./task.md#current-execution-order) separates immediate M9-A controls from deferred M9-B model consumption.

## Planning references

- [Product principle](./product.md) and [broader MVP goal](./goal.md).
- [Original task inventory](./task.md) and [Stations/context goals](./task-1.md).
- [Chat architecture target](./task-model-integration-architecture.md) and [implementation ownership](./model-integration-handoff.md).
- [Online integration plan](./model-integration-online.md) and [NVIDIA implementation](./nvidia-provider-handoff.md).
- [September 10 progress audit](./project-audit-2026-09-10.md), including superseded proposals and documentation discrepancies.

The older task checkboxes and handoff details still need reconciliation where the audit identifies stale claims. This state summary records the current position without declaring those broader acceptance criteria complete.
