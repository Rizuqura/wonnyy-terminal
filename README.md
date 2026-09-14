# Wonnyy - Amadeus 0.0.5

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
npm run format:check
```

Saving a Gemini or NVIDIA key starts sequential model checks. Saved keys are also checked once when the workspace loads. Passing models receive a star and sort to the top of their provider list, fastest first. AI Terminal shows progress, Stop checks, and Recheck all models. Scans pause on quota/authentication errors. Results are session-only, and a star proves one synthetic source check, not ongoing reliability or free access. Checks use provider quota.

The Electron smoke test uses Playwright with the installed Electron binary; it does not require downloading a separate browser. It closes its test application and deletes its temporary vault. Screenshots and test reports are written to ignored `test-results/`.

For local chat, start Ollama at `http://127.0.0.1:11434`. Set `WONNYY_OLLAMA_URL` only to another unauthenticated loopback HTTP endpoint. Install local models outside Wonnyy, then refresh models in AI Terminal.

For online chat, open **AI Terminal**, enter your Gemini API key, and choose **Save API key**. Saving discovers models and automatically checks them with a fixed synthetic source, without sending vault content. Choose **Use online** on a discovered model to enable Gemini inference. The approved source, question, and included conversation history are then sent to Google; LOCAL / ONLINE remains visible in chat. Existing conversations and source approval remain intact when switching providers. Pricing and quotas depend on your Google project, and free-tier data may be used to improve Google products; see [Google's pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing).

Keys are encrypted with Electron `safeStorage` in application data, never persisted in the renderer or vault, and never returned through IPC. Secure storage must be available; plaintext fallback is refused. Remove API key deletes the saved credential without deleting conversations. Gemini retries HTTP 500/502/503/504 at most twice before streaming, with exponential backoff under the original cancellation and timeout limits. Retry-After is respected; waits above ten seconds require explicit retry. There is no automatic provider failover. Remote timeouts and quota errors offer explicit retry. Additional providers remain deferred.

For NVIDIA, save an NVIDIA API key in **AI Terminal** and refresh models. **NVIDIA models** lists catalog candidates; **Check model** sends a fixed synthetic prompt without vault content and shows a dated pass/fail result plus session totals. Choose **Use online** to continue your approved-context conversation through NVIDIA. A catalog listing or one successful check does not guarantee ongoing availability or free access. See [the NVIDIA handoff](big-context/nvidia-provider-handoff.md) for verification and limits.

The initial vault is `C:\bank`, configurable with `WONNYY_VAULT_PATH`; Change Vault opens the native folder picker.

## Chat workflow

1. Select files or activate Station filters, then review and explicitly add the resulting files to Active Context.
2. Ask natural questions in the floating Planet chat or Workspace chat.
3. Use New Chat to start another discussion of the same approved source.
4. Changing the approved source or approving a changed version creates a clean conversation boundary.
5. Select an old conversation to view it. Resume with this source explicitly restores its unchanged source authorization.
6. Use Settings to switch installed models. Stop an active generation before changing settings.

Visual selection does not grant model access. Old chat messages remain viewable when a source changes or disappears, but the old source version cannot be resumed because source snapshots are not stored.

## CSV analysis

NVIDIA HTTP 500/502/503/504 failures are retried automatically up to twice before an answer stream is consumed, within the original request deadline. This retries the failed model request without restarting completed CSV calculations. Backoff respects Retry-After up to ten seconds; longer waits require explicit retry. Cancellation, authentication failures, rate limits and interrupted answer streams are not automatically retried.

Add CSV files to Active Context, select an installed model, and ask a dataset question. Wonnyy parses the full CSV in a cancellable worker, sends column profiles and a small sample to the model, validates its structured requests, and executes calculations locally. The final answer receives computed results and includes source/filter evidence. The run audit stores requests and results under `diagnostics.datasetAnalysis`.

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
