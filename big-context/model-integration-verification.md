# Model integration verification - 2026-09-06

This record accompanies the [implemented architecture and ownership notes](./model-integration-handoff.md). Earlier progress and design documents are preserved. The current implementation passes the engineering regression checks and the available real-model workflow. Qwen output quality and the unavailable model comparisons remain explicit limitations.

## Engineering checks

### Repeated-summary follow-up — 2026-09-07

The reported five-facts follow-up repeated an earlier source summary. Prompt v4 prioritizes the last user message and numbered source facts; final validation rejects substantial exact duplicates of historical answers to different questions and uses one bounded correction. Tests preserve short factual answers, identical questions, and explicit repeat requests, verify one corrected turn without duplicate history, and reject a second copied answer.

All 87 automated tests, typecheck, and integration formatting passed. Local `qwen3:4b` reproduced the copying behavior with a fictional five-fact source and supplied summary history. A non-thinking correction also copied the summary. The existing capability-gated thinking repair then returned exactly five numbered facts with all fixture facts intact. Initial generation took 16.7 seconds and repair 152.5 seconds. This confirms recovery on the small fixture, not acceptable latency for all tasks. The actual Minddump.md source and full live benchmark were not rerun. Similar paraphrases are outside the exact-duplicate heuristic, and provisional text can appear before final validation.

### Context approval input-lock follow-up

The previous chat-switch test bypassed the actual context review dialog by calling IPC directly. The user still reported an uneditable textbox after context changes. Review identified `window.confirm` on that path, consistent with [Electron's confirmed Windows input-lock reports](https://github.com/electron/electron/issues/40212); the exact native failure was not reproduced independently. Browser confirmations/alerts have now been replaced with asynchronous in-app HTML dialogs or inline notices throughout context, chat-history, and Station flows.

The revised desktop smoke passed real Review + Add Selected flows for two sources, Cancel and Escape without approval, confirmation, and click-then-keyboard typing after each dismissal. It rejects any unexpected native browser dialog and also passed history deletion/clearing, conversation switching, restart, and AI Terminal checks. All 85 automated tests, the production build with TypeScript, and integration formatting passed. This verifies the revised UI path without asserting that all possible Windows input failures are eliminated.

### AI Terminal setup tab

AI Terminal now opens dedicated model setup rather than the Workspace chat. Desktop smoke passed active-tab selection, absence of the chat composer on setup, offline and missing-model indicators, missing-context and ready states, model switching, saved output limits, and the existing chat/context/restart regressions. The model checks use the isolated mock Ollama service. All 85 automated tests, the production build with TypeScript, and integration formatting passed. The setup screenshot is `test-results/ai-terminal.png`; real-model performance was not retested for this UI change.

### Chat-switch keyboard follow-up

Reproduced a focus regression on the preceding production build: keyboard typing after selecting another context's conversation left the composer empty. Explicit focus restoration now follows history selection, New Chat, and source resumption. The extended Electron smoke passed keyboard-input and draft-preservation checks in the floating and AI Terminal chat surfaces, along with source isolation and restart checks. All 85 automated tests, production build (including TypeScript), and integration formatting passed. This verifies the reproduced focus-loss case; it does not establish a cause for a separate Windows-level input freeze after clicking directly into the textbox.

### Timeout recovery follow-up

The timeout fix separates first-data prompt processing from inter-chunk inactivity, keeps transport streaming active when progressive display is off, and automatically retries one timeout within the same ChatService deadline and turn. The retry budget is shared with model preparation and answer correction; cancellation and non-timeout failures do not replay requests.

Validation: the full suite passed 84 tests, followed by an additional passing stalled-stream regression (six provider stream tests passing). Typecheck, integration formatting, and production build passed. The sandboxed Electron smoke target crashed; rerunning outside the sandbox passed all smoke checks. Small real-Qwen structured-answer checks returned the correct `25%` in both display modes: 4.6 seconds with visible streaming and 2.0 seconds with it disabled. An earlier unstructured transport probe produced planning text and its second request reached the probe's shared 120-second cancellation deadline; this is not evidence of improved model answer quality. The full multi-source live acceptance benchmark was not rerun for this fix. Existing results below describe the earlier full workflow.

| Check | Result |
| --- | --- |
| `npm test` | 75 passing tests, zero failures |
| `npm run typecheck` | Passed |
| `npm run format:check` | Passed for integration modules |
| `npm run build` | Passed; Next.js static production export |
| Hidden Electron smoke | Passed against the production export with the real sandboxed preload and a mock Ollama server |
| Real Ollama acceptance | 22 completed Qwen3 4B turns plus a cancelled streaming run and immediate recovery |

The Electron harness checks both chat surfaces, actionable missing context, visual selection independence, follow-up history across IPC, drag/resize/minimize/restore, keyboard focus, wheel isolation, model switching, context switching, explicit source resumption, cancellation, application restart, and rename/delete/clear with retained audits.

The deterministic suite additionally covers authorization failures, source changes, incompatible bridge versions, duplicate submissions, retry without duplicate questions, pending-turn reconciliation, recording failures, corrupt snapshots, legacy audits, whole-exchange budgeting, malformed/truncated streams, split UTF-8 and JSON strings, hidden thinking, and bounded correction. A final regression verifies that correction instructions cannot exceed the configured prompt allowance.

## Real-model workflow

The completed run used isolated `alpha.md` and `beta.md` sources, separate temporary settings, and the installed `qwen3:4b` model. The harness unloaded the model before its first request to exercise cold preparation.

1. Ten consecutive source-A turns exercised summaries, prior-answer references, thesis, evidence, risk, unsupported claims, contradictions, simplification, and a three-point outline.
2. Ten source-B turns exercised the same tasks with checks excluding source-A identifiers and allocation facts.
3. A new ChatService instance restored the saved conversations. Explicit resumption of source A then recovered its allocation and risk correctly.
4. A long streaming response was cancelled. The immediate next request returned the original source's `25%` allocation successfully.

The live run covered backend service restart; the Electron smoke separately covered actual application process restart. Real model switching/comparison was unavailable because only Qwen3 4B was installed. Model switching was verified with normalized mock descriptors across the service and Electron UI boundaries.

| Candidate | Real-model result |
| --- | --- |
| Qwen3 4B | Workflow passed; answer-quality limits below |
| Qwen3 1.7B | Not installed; untested |
| Llama 3.2 3B | Not installed; untested |

## Observed performance and quality

The live workflow ran from 06:43:52 to 06:52:20 WIB on 2026-09-06, about 509 seconds including cancellation. Median completed-turn latency was 5.4 seconds. Cold model preparation took 10.3 seconds; the first complete response took 28.4 seconds. The source-A outline initially echoed the task and required the single allowed correction, taking 278.9 seconds overall. Other completed turns took about 3-32 seconds.

Ollama reported approximately 3.62 GiB resident model memory, zero VRAM, and an 8,192-token context. Node reported about 7.40 GiB total system memory. These are local observations with other applications running, not a hardware benchmark or a universal latency estimate.

Manual answer review found remaining model weaknesses: a source-B summary rendered `2025` as `2:2025`, its follow-up repeated the summary instead of explaining only point two, and contradiction answers ignored the one-sentence request. Subsequent thesis, evidence, outline, and resumed-source answers preserved the relevant facts. Structural validation does not prove factual accuracy or full instruction adherence. Do not describe this model as fully reliable for unattended research.

The correction-budget regression and late-error session guards were added after the long live workflow. They passed the subsequent deterministic suite, type check, build, and Electron smoke. The correction's source/history selection is unchanged for the small live fixtures; a second full live run was not performed for those final guards.

## Reproduction and artifacts

Run `npm run test:chat:electron` and `npm run test:chat:live` from the repository root. The live command requires local Ollama and `qwen3:4b`; it compares the other candidate models only when installed. Both harnesses use temporary vaults and remove their fixtures afterward. The Electron harness closes its application processes.

Detailed local artifacts are ignored by Git: `test-results/chat-live-acceptance.json` contains questions, actual answers, stage diagnostics, timing, and memory observations; `test-results/electron-chat-smoke.json` contains UI checks; `test-results/chat-electron.png` captures the chat surface. Keep this concise record in the repository so the results and limitations remain available without generated artifacts.
