# Wonnyy - Amadeus 0.0.4

Wonnyy is a local-first Electron research workspace. Explorer, Planet View, and the document reader share a user-owned vault. Chat uses one explicitly approved Markdown source through a controlled Electron boundary.

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
npm run format:check
```

The Electron smoke test uses Playwright with the installed Electron binary; it does not require downloading a separate browser. It closes its test application and deletes its temporary vault. Screenshots and test reports are written to ignored `test-results/`.

Ollama must be running for real chat. Its default endpoint is `http://127.0.0.1:11434`. Set `WONNYY_OLLAMA_URL` only to another unauthenticated loopback HTTP endpoint. Install models outside Wonnyy, then refresh Local Models in Settings. No remote inference or automatic model download is implemented.

The initial vault is `C:\bank`, configurable with `WONNYY_VAULT_PATH`; Change Vault opens the native folder picker.

## Chat workflow

1. Select a Markdown file and explicitly add it to Active Context.
2. Ask natural questions in the floating Planet chat or Workspace chat.
3. Use New Chat to start another discussion of the same approved source.
4. Changing the approved source or approving a changed version creates a clean conversation boundary.
5. Select an old conversation to view it. Resume with this source explicitly restores its unchanged source authorization.
6. Use Settings to switch installed models. Stop an active generation before changing settings.

Visual selection does not grant model access. Old chat messages remain viewable when a source changes or disappears, but the old source version cannot be resumed because source snapshots are not stored.

## Project ownership

- `app/`: static Next.js entry and global theme.
- `components/`: application composition, knowledge navigation, document reader, Planet View.
- `features/chat/`: renderer state reducer, runtime hook, chat/history presentation, scoped styles.
- `features/model-settings/`: local model selection and generation controls.
- `electron/ai/`: authoritative conversations, context identity, history budget, orchestration, provider, run records, registry, and versioned IPC.
- `electron/station-service.cjs`: explicit knowledge approvals and Brain Scope capabilities.
- `electron/vault-service.cjs`: controlled filesystem access.
- `types/`: shared domain types and isolated desktop bridge declarations.

The renderer has no direct filesystem or Ollama access. Production uses Next.js static output loaded by Electron; it does not require a Next.js server.

## Stored state

Vault metadata remains under `.wonnyy/`, excluded from knowledge discovery:

- `stations.json`: Stations and Active Context.
- `conversations/<id>.json`: messages, context hashes, and run references.
- `model-runs/<id>.json`: immutable success, failure, and cancellation audits.

Model settings live in Electron's application data directory, independently of the vault. Deleting a conversation retains separate audit records, including their questions and answers; the UI explains this before deletion.

## Troubleshooting

- **Restart required:** close the old Electron process and restart after bridge/backend changes. Renderer hot reload cannot update preload or main.
- **Context needed / source changed:** approve one Markdown source, or explicitly approve its updated version.
- **Offline / missing model:** start Ollama and refresh models in Settings.
- **Context too large:** increase the selected context limit within model capabilities, or use a smaller source. Source text is never silently truncated.
- **Storage error:** repair/restore the indicated metadata file. Corrupt state is not silently overwritten.
- **Interrupted response:** restart recovery retains the question; Retry starts a new recorded attempt.

Earlier product ideas and completed milestones are preserved in `big-context/`. The [original README](big-context/archive/readme-v0.0.1.md) is archived for historical context.
