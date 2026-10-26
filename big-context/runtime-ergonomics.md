# Runtime ergonomics pass — 2026-09-24

Desktop bridge version is **13**. Reopen Electron after updating.

## Runtime ownership

The existing ChatState reducer remains authoritative for each renderer request. RuntimeStatus adds stage messages, elapsed start time, actual source-read counts and approximate token counts. ChatService still reserves one request synchronously and owns cancellation, conversation identity and immutable audit publication. Late events cannot revive cancelled turns. Cancellation and context insufficiency have neutral terminal states.

The shell renders immediately and displays scanning activity without invented percentages. Scan warnings are inspectable independently of readiness; scan failures remain separate from model failures. Brain Scope and controlled reads reuse the latest explicit vault scan, including canonical Windows path aliases. File reads, hashes, capability ownership, expiry and source-change checks remain mandatory. PDF extraction is reused when metadata is unchanged; an authorized PDF read checks current metadata before using indexed text. Explicit rescans and context review continue to refresh discovery.

## Local models

Download is an explicit action in chat or AI Terminal, using Ollama's native streaming [pull endpoint](https://docs.ollama.com/api/pull). Backend ModelPullService owns one active operation per normalized model name and bounds concurrent downloads to one. Subscribers receive the same operation, including after a UI remount. Ask never pulls a missing model. An active download is visible across workspace views; its owner can cancel it. Closing its originating window aborts the client operation.

Byte progress describes the **current layer**, not an invented whole-model total. Missing totals display provider status only. Download completion means installed, not loaded. The existing preparation endpoint and keep-alive configuration handle memory loading and warmth. Warmup and generation remain separate phases.

## Retry and grounding boundaries

Provider transports perform one attempt. The orchestrator allows at most one automatic recovery across preparation and generation for an Ollama pre-generation timeout or a rejected remote server request. It honors cancellation and the original deadline, uses a bounded server backoff, and does not retry after generation activity. Other errors, rate limits, missing models, malformed requests, scope failures and cancellation require user action. The existing one-time answer-format correction is retained, but cannot follow an automatic infrastructure retry.

Empty readable context is detected deterministically before model loading and recorded as a completed insufficient result with `modelExecuted: false`. For nonempty sources, explicit `CONTEXT INSUFFICIENT` and `LIMITED CONTEXT` model abstentions are retained and surfaced without retry. The grounding prompt forbids outside-knowledge substitution and invented source support.

**Limit:** this pass does not add semantic retrieval or prove that a nonempty source answers an arbitrary question. Broader missing/partial evidence is model-reported, not a deterministic semantic verdict. General chat without approved context remains outside the existing execution contract. Source hashes prove which content was read; they do not certify every model claim.

Source IDs, content hashes, run IDs, immutable records, context precedence and sandboxed renderer boundaries remain intact. Source-read timings accumulate across files; first-token timing is attached to run diagnostics. No credentials, prompts or full source contents are added to timing records.

## Verification

Run `npm test`, `npm run build`, and `node scripts/electron-chat-smoke.cjs`. The desktop script uses an isolated vault and synthetic Ollama transport, including download progress, duplicate pull requests, cancellation and explicit retry. These checks validate lifecycle behavior, not real-model speed, download throughput or semantic answer quality.
