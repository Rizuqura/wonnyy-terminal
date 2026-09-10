# Station context to model - 2026-09-10

Station-filtered knowledge can now be explicitly approved as a multi-source chat context. This advances part of M9-B at the user's request, ahead of named Context Window implementation. It does not implement semantic retrieval or unlimited vault memory.

## User workflow

1. Assign files or folders to Stations, then activate the required Station filters and choose ANY or ALL.
2. Click **REVIEW STATION CONTEXT**. Review all expanded file paths and the estimated size, then confirm **Add to Active Context**. The action adds these files to existing approval; clear or remove earlier context first when replacing the set is intended.
3. Select an installed/local or configured/online model and ask a question. Chat displays the approved file set; each answer retains verified source provenance.

Regular **REVIEW + ADD SELECTED** also supports multiple files. Merely selecting objects, assigning a Station, or toggling a filter does not send their content to a model. New Station members require another review. Existing Active Context remains authoritative.

## Implementation and boundaries

- Chat accepts 1-32 approved, unchanged Markdown, CSV or PDF-text sources. PDF text is extracted locally; scanned/empty PDFs cannot supply readable context. CSV is supplied as text, not executed as an analytics tool.
- The orchestrator reads every approved source through its run-owned capability and verifies scope, owner, manifest, path, type and hash. Each source gets a separate untrusted-data envelope. No unrelated vault files or newly matched Station members are added automatically.
- Context identity includes the complete sorted set of source IDs, paths and hashes. Existing one-source identities remain compatible. A changed set/version cannot continue using another context's history.
- Saved conversations can resume their entire source set only if all versions remain available. Approval replacement is atomic; one invalid source leaves the previous approval intact.
- The combined source content is limited to 80,000 characters and must also fit the configured model window with history/output reservations. Over-budget requests fail explicitly; sources are not silently dropped. History remains bounded to 12 exchanges or fewer.
- Current settings and chat headers list all approved paths. Multi-source support is shared by Ollama, Gemini and NVIDIA. The AI bridge is now version 12; reopen Electron to load matching renderer/preload/main code.
- No named Context Windows, pins, user-controlled package budget, retrieval ranking or per-window UI is delivered by this change.

## Verification

### User-verified two-Markdown workflow - 2026-09-10

The user reports that chat now works with two approved Markdown sources after **manual context sizing**. Their screenshot shows a completed comparative answer with two source references, using NVIDIA `nvidia/nemotron-nano-omni-30b-a3b-reasoning`. This is live user-reported evidence beyond the synthetic regression below; the answer's factual claims have not been independently checked against the source documents.

- Earlier screenshots showed generation settings changing from context 8,192/output 2,048 to context 16,000/output 4,096. Context 16,000/output 2,048 was subsequently suggested for debugging. The successful-run screenshot does not show saved generation settings, so **the exact successful configuration is not confirmed**.
- Sizing currently requires manual adjustment. The sidebar estimates source characters divided by four; the runtime estimates UTF-8 bytes divided by three plus message overhead, then reserves output tokens and 256 tokens. The displayed approximately 7,654 source tokens are not the full runtime prompt estimate.
- **Maximum usable capacity has not been measured or recorded.** The 32-source/80,000-character application guards and an entered context-window value do not establish the provider/model's maximum capacity or dependable task size.
- Follow-up work: unify estimation, show a pre-send source/instruction/history/output budget breakdown, and record model ID, saved settings, runtime prompt estimate, source count, latency and outcome in a controlled capacity benchmark. Keep the limit unknown until that evidence exists.

### Automated and desktop verification

Backend regression covers Station candidates requiring approval, separate Markdown/CSV prompt envelopes, exclusion of unrelated knowledge, immutable provenance, unchanged approval after new Station membership, full-set resume after service restart, changed-source rejection and atomic failed resume. PDF extraction and resumption have a separate test. Prompt tests check combined source limits.

Production build and TypeScript passed. All **118 automated tests passed**. The dedicated Electron regression passed Station multi-selection/review of Markdown and CSV together, local/online chat, Gemini/NVIDIA switching, retry/draft recovery, interactive scans and restart. Desktop transport fixtures are synthetic, so these establish integration behavior rather than live model answer quality. Local artifacts: `test-results/station-context-tests.txt` and `test-results/electron-online-smoke.json`.
