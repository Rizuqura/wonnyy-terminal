# QTerminal 1.0.0 Victoria

Wonnyy's policy now uses a versioned **canonical policy → compact runtime kernel → on-demand guidance** pipeline. The known v1.1 policy is compiled by content hash for ordinary research; policy-document questions keep the full text. Existing source bindings and ordinary agent guidance are preserved. See the [runtime policy handoff](big-context/feature/runtime-context-handoff.md), `npm run report:runtime-kernel` and `npm run test:runtime-kernel:electron`.

Agent construction now accepts **Single file** as well as **Context Box** for each non-LLM node. In an agent's **⋯** settings, select a node, choose the source method, review the full vault file and its estimated tokens, then **Use reviewed file → Save & apply**. Supported files are Markdown, CSV and extracted PDF text. Context/Knowledge files are explicitly confirmed when creating a chat. See the [single-file handoff](big-context/feature/single-file-agent-handoff.md) and `npm run test:single-file:electron`.

Use **Agent → + Add agent** to create your own agent. Each starts like an unconfigured CHronoZ: no profile image, custom instructions, skills or bound Context Boxes. A letter placeholder identifies the contact until you upload a PFP. Open its **⋯** menu to configure construction, Context Boxes and appearance; chats and drafts stay separate by agent. See the [Add agent handoff](big-context/feature/add-agent-handoff.md) and `npm run test:add-agent:electron`.

Build agents from your reviewed Context Boxes through **Agent → an agent's three-dot menu → select a construction node**. Attach separate boxes for Personality, Output, Skill or Workflow guidance; set a default research Context and optional Knowledge sources for new chats. Review the full source text before attaching, then **Save & apply**. Drafts stay inactive, and Knowledge inclusion is confirmed in the new-chat picker. Applies to Wonnyy, CHronoZ and future default agents. See the [Context-built agents handoff](big-context/feature/context-built-agents-handoff.md) and `npm run test:box-agents:electron`.

Agent profiles now support local banners and chat wallpapers, dimming and message text size through the floating editor's **Profile banner & chat appearance** section. Chat bubbles render readable Markdown including bold, lists, code and tables. See the [appearance handoff](big-context/feature/agent-appearance-handoff.md) and `npm run test:appearance:electron`.

**Agent → an agent's three-dot menu** opens its floating Agent Construction editor for Wonnyy, CHronoZ and future default agents. Customize identity/PFP, personality, instructions and a per-agent model; save drafts separately from the active runtime configuration. Global Settings remains for vault/providers/models. See the [Studio handoff](big-context/feature/agent-construction-handoff.md). Run `npm run test:construction:electron` for isolated interaction/runtime/restart verification.

Victoria adds comfortable Workspace and Planet View chat surfaces, readable document typography, and explicit file-to-context review while retaining retro Context Box and Station tools. See the [Victoria handoff](big-context/feature/victoria-workspace-handoff.md).

The **Wonnyy Agent** chat workflow uses saved named Context Boxes and explicitly created sessions. See the [refactor handoff](big-context/feature/wonnyy-agent-handoff.md) for source binding, legacy history behavior and desktop verification.

Planet View includes a collapsible **OpenRouter usage monitor** for verified key allowance in USD and separately scoped local input/output tokens. Wallet credits stay unavailable without management access; no weekly budget is assumed. See the [usage handoff](big-context/feature/openrouter-usage-handoff.md). Run `npm run test:usage:electron` for isolated UI acceptance.

Wonnyy Agent and **CHronoZ** share the chat engine with separate histories and preferences. CHronoZ starts with no custom instructions, skills or profile image. Planet View offers wider orbital spacing, larger picking assistance and **Focus canvas** to hide panels/minimize chat. See the [CHronoZ and Planet handoff](big-context/feature/chronoz-planet-handoff.md).

The **AGENT** tab uses a minimal Settings-style view: Wonnyy appears as a contact with a searchable chat-history dropdown, resizable panes and optional bound-source details. Individual agent settings retain custom instructions and a local profile picture. Static surfaces avoid animations and blur. See the [Agent workspace handoff](big-context/feature/agent-workspace-handoff.md). Desktop bridge **18** requires restarting Electron after updating. Run `npm run test:agent:workspace:electron` for its isolated UI acceptance checks.

Wonnyy is a local-first Electron research workspace. Explorer, Planet View, and the document reader share a user-owned vault. Chat uses up to 32 explicitly approved Markdown, CSV or extracted-PDF-text sources through a controlled Electron boundary. Station matches can be reviewed and added to Active Context. Context sizing is manual; maximum usable model capacity remains unmeasured.

The model-integration design is governed by [the current architecture](big-context/task-model-integration-architecture.md). Read [the engineering handoff](big-context/model-integration-handoff.md) for implementation ownership, storage, failure handling, and verification.

## Develop and verify

Use Node.js 24 or newer and the checked-in package lock. On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

```text
npm install
npm run dev                 # Next.js + Electron
npm test                    # deterministic unit/service/contract tests
npm run typecheck
npm run build               # static production export
npm run test:chat:electron   # build + hidden Electron smoke with mock Ollama
npm run test:chat:live       # real local Qwen acceptance, isolated sources
npm run test:dataset:live    # real local CSV analysis + follow-ups, 16,000 rows
npm run test:dataset:electron # build + hidden Electron CSV/IPC test, 20,000 rows
npm run test:chat:online     # real Gemini acceptance; requires key + model env vars
npm run test:chat:online:electron # hidden Electron online smoke, synthetic provider
npm run test:chat:openrouter:electron # OpenRouter setup, streaming and restart, synthetic transport
npm run format:check
```

Saving a Gemini or NVIDIA key starts sequential model checks. Saved keys are also checked once when the workspace loads. Passing models receive a star and sort to the top of their provider list, fastest first. Settings shows progress, Stop checks, and Recheck all models. Scans pause on quota/authentication errors. Results are session-only, and a star proves one synthetic source check, not ongoing reliability or free access. Checks use provider quota.

The Electron smoke test uses Playwright with the installed Electron binary; it does not require downloading a separate browser. It closes its test application and deletes its temporary vault. Screenshots and test reports are written to ignored `test-results/`.

For local chat, start Ollama at `http://127.0.0.1:11434`. Set `WONNYY_OLLAMA_URL` only to another unauthenticated loopback HTTP endpoint. Install local models outside Wonnyy, then refresh models in Settings.

For online chat, open **Settings**, select **Gemini**, enter your API key, and choose **Save key**. Saving discovers models and automatically checks them with a fixed synthetic source, without sending vault content. Choose **Use online** on a discovered model to enable Gemini inference. The approved source, question, and included conversation history are then sent to Google; LOCAL / ONLINE remains visible in chat. Existing conversations and source approval remain intact when switching providers. Pricing and quotas depend on your Google project, and free-tier data may be used to improve Google products; see [Google's pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing).

Keys are encrypted with Electron `safeStorage` in application data, never persisted in the renderer or vault, and never returned through IPC. Secure storage must be available; plaintext fallback is refused. Remove API key deletes the saved credential without deleting conversations. Gemini retries HTTP 500/502/503/504 at most twice before streaming, with exponential backoff under the original cancellation and timeout limits. Retry-After is respected; waits above ten seconds require explicit retry. There is no automatic provider failover. Remote timeouts and quota errors offer explicit retry. OpenRouter is also available; see the setup below.

For NVIDIA, save an NVIDIA API key in **Settings** and refresh models. **NVIDIA models** lists catalog candidates; **Check model** sends a fixed synthetic prompt without vault content and shows a dated pass/fail result plus session totals. Choose **Use online** to continue your approved-context conversation through NVIDIA. A catalog listing or one successful check does not guarantee ongoing availability or free access. See [the NVIDIA handoff](big-context/nvidia-provider-handoff.md) for verification and limits.

For OpenRouter, select **OpenRouter** in **Settings**, save your key, search the catalog and choose **Use online**. OpenRouter checks are explicit; saving a key only discovers models. Keys use the same encrypted OS storage as other providers. Attached context and included history are sent to OpenRouter and its model providers. See [the OpenRouter and Settings handoff](big-context/openrouter-handoff.md) for setup, transport details and verification. Restart Electron for bridge **18**.

The initial vault is `C:\bank`, configurable with `WONNYY_VAULT_PATH`; Change Vault opens the native folder picker.

## Chat workflow

1. Select files in Explorer or Planet View (Ctrl/Cmd adds to the selection). In Planet View’s context manager, choose **Open Context Box library**, then **Add to Context Box…** or **Create Context Box from Selection…**. The vault sidebar contains files only.
2. Review the expanded file list, deselect unwanted files, choose an existing box or name a new one, and save. Unsupported selections and duplicates are disclosed. Opening, cancelling or saving this setup never creates a chat.
3. Choose **+ New Chat**, select a saved Context Box, and confirm **Create Chat**. Cancelling leaves history unchanged.
4. Ask questions in the floating Planet panel or docked Workspace panel. Each turn reads the latest files in its attached box and records their hashes. Box details provide source links, rename, remove, relink and confirmed deletion. **Attach to Wonnyy Agent** preselects a box without starting a chat.
5. Use **History** to search/open prior chats. Rename chats and Context Boxes independently.
6. Global selection and Active Context changes do not rebind existing chats. Use the agent's Context Box selector and confirm a switch for future turns. Old answers retain their original evidence; exchanges from other boxes/source versions are excluded from model memory.
7. Legacy conversations without a Context Box remain readable. Choose **Create bound chat**, or explicitly attach a box using the selector. Empty boxes can be saved for later; missing/unreadable files block sending until removed or relinked.
8. Use Settings to switch providers/models; stop an active generation before changing settings.

Source snapshots are not stored. Historical source hashes identify the version used, while source links open the current file. The floating panel supports all eight resize directions, keyboard arrow resizing, Reset, minimize and close/reopen. Workspace retains its width divider and an Undock action.

Existing reviewed Active Context remains available through **Save Active Context as box**. Folder selections are expanded only during explicit review; later Station matches or new folder files never expand a saved box automatically. Chats support 1–32 readable Markdown, CSV or text PDF files, subject to the existing source and model budgets. Restart Electron for bridge version 16.

## CSV analysis

Numeric answer checks now allow precision-aware rounding, equivalent percentages and compact scales. Basic arithmetic shown as a complete equation is recomputed locally against supported inputs; verified derivations are recorded with the run. Unsupported values or incorrect equations still receive one bounded correction before an actionable error. See the [numeric evidence rule](big-context/feature/numeric-evidence-handoff.md) for limits and verification.

NVIDIA HTTP 500/502/503/504 failures are retried automatically up to twice before an answer stream is consumed, within the original request deadline. This retries the failed model request without restarting completed CSV calculations. Backoff respects Retry-After up to ten seconds; longer waits require explicit retry. Cancellation, authentication failures, rate limits and interrupted answer streams are not automatically retried.

Add CSV files to a Context Box, explicitly create or attach a chat, select an available model, and ask a dataset question. Wonnyy parses the full CSV in a cancellable worker, sends column profiles and a small sample to the model, validates its structured requests, and executes calculations locally. The final answer receives computed results and includes source/filter evidence. The run audit stores requests and results under `diagnostics.datasetAnalysis`.

Follow-ups can also receive results from the last two successful analyses. Their queries are rerun against the same approved source version, bounded to 6,000 characters of analytical history, and recorded under `diagnostics.datasetHistory`. The source footer identifies these recomputed earlier analyses.

Supported operations include column and missing-value inspection, row retrieval, AND filters, sorting, pagination, counts, sums, averages, minimum/maximum, grouped comparisons, ISO date trends, and percentage growth between periods. Aggregations run over all matching rows before output pagination. Each turn can request up to six operations. Follow-ups use conversation history and re-read the approved source version. With a remote model, profiles, samples and computed results are sent to that provider.

CSV input supports commas, semicolons, tabs and pipes, UTF-8 BOM, escaped quotes and multiline cells. Headers must be unique and non-empty. Limits are 50 MB of combined CSV input and 200 columns per file; returned rows are capped at 100 per query. Large results must be narrowed or aggregated. Markdown/PDF text and returned evidence still need to fit the model context window. Numeric operations use double precision; blank numeric cells are excluded and counted. Currency symbols, thousands separators, percentages and ambiguous date formats require cleaning. Dates use ISO calendar dates as written; growth with an absent period or zero baseline returns null. Arbitrary code, SQL, joins, forecasting and automatic data cleaning are not supported.

Malformed files and invalid requests fail explicitly. Request schemas constrain filenames and columns to the approved dataset. A short task statement resolves conversation references before queries are produced. One request correction is allowed; a model that still cannot produce a valid request returns an error. CSV answers are checked before display for numeric values absent from the supplied evidence, with one answer correction allowed. This check does not prove that a model interpreted the question correctly; inspect the source/filter evidence for that. `test:dataset:live` verifies the default `qwen3:4b` model against isolated known-answer data and writes `test-results/dataset-live.json`. Set `WONNYY_DATASET_MODEL` to validate another installed model.

## Project ownership

- `app/`: static Next.js entry and global theme.
- `components/`: application composition, knowledge navigation, document reader, Planet View.
- `features/chat/`: renderer state reducer, runtime hook, chat/history presentation, scoped styles.
- `features/model-settings/`: local/online model selection, credential entry, privacy disclosure, and generation controls.
- `electron/ai/`: authoritative conversations, context identity, history budget, orchestration, provider, run records, registry, and versioned IPC.
- `electron/station-service.cjs`: explicit knowledge approvals and Brain Scope capabilities.
- `electron/vault-service.cjs`: controlled filesystem access.
- `types/`: shared domain types and isolated desktop bridge declarations.

The renderer has no direct filesystem or provider API access. Production uses Next.js static output loaded by Electron; it does not require a Next.js server.

## Stored state

Vault metadata remains under `.wonnyy/`, excluded from knowledge discovery:

- `stations.json`: Stations and Active Context.
- `context-boxes.json`: named boxes and stable file memberships; source contents remain in the vault.
- `conversations/<id>.json`: messages, context hashes, and run references.
- `model-runs/<id>.json`: immutable success, failure, and cancellation audits.

Model settings live in Electron's application data directory, independently of the vault. Deleting a conversation retains separate audit records, including their questions and answers; the UI explains this before deletion.

Chat displays a maximum 12-exchange model memory policy. Older messages remain saved even when excluded from inference. Run diagnostics record included/dropped exchanges and execution location; assistant messages retain provider/model identity.

For a real online benchmark, set `GEMINI_API_KEY` and `WONNYY_GEMINI_MODEL` in your process environment, then run `npm run test:chat:online`. Use a model ID returned by discovery. Add `-- --switch-local` to also verify switching to local `qwen3:4b` and back (requires Ollama and that installed model). The script sends only its synthetic temporary sources and conversation, stores no credential, and writes answers/timing to ignored `test-results/chat-online-acceptance.json`. This performs real API calls subject to your project quota/billing. The desktop smoke uses synthetic transports and actual OS credential encryption; it does not send requests to Google.

## Troubleshooting

- **Restart required:** close the old Electron process and restart after bridge/backend changes. Renderer hot reload cannot update preload or main.
- **Context needed / source changed:** approve one Markdown source, or explicitly approve its updated version.
- **Offline / missing model:** start Ollama and refresh models in Settings.
- **Context too large:** increase the selected context limit within model capabilities, or use a smaller source. Source text is never silently truncated.
- **Storage error:** repair/restore the indicated metadata file. Corrupt state is not silently overwritten.
- **Interrupted response:** restart recovery retains the question; Retry starts a new recorded attempt.

Earlier product ideas and completed milestones are preserved in `big-context/`. The [original README](big-context/archive/readme-v0.0.1.md) is archived for historical context.

## Persistent knowledge proposals

Completed Wonnyy answers now offer **Create knowledge proposal**. Structured observations are staged in a separate app-owned outbox, not the Bank Vault. Independent operator approval creates immutable reviewed Markdown; previews retrieve only relevant approved knowledge whose source hashes match the chat. CHronoZ has no consolidation skill. `/loop` is not installed in this repository; automatic loop extraction and prompt loading remain unimplemented. See [the architecture, schema, approval commands and acceptance gaps](big-context/feature/knowledge-consolidation-handoff.md). Run `npm run test:knowledge:electron` for the isolated UI/IPC/CLI/restart check.
