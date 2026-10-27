# Single-file sources for agent settings

Updated 2026-10-27 following the user's final scope: remove machine-learning training/execution and keep direct single-file selection. The experimental controls, workers, model import/export, prediction command and IPC were removed. Existing provider chat, CSV calculations, statistics, numeric answer validation and other unrelated work remain in place.

## Using a file

Open **Agent → an agent's ⋯ menu → select a node → Source method → Single file**. Search supported files in the active vault, select one and review its full extracted contents and estimated tokens. **Use reviewed file for …** stages the binding. **Save draft** keeps it inactive; **Save & apply** validates and activates it. Previewing, switching source method or cancelling review creates neither a chat nor a Context Box.

Supported types: `.md`, `.markdown`, `.csv` and text extracted from `.pdf`. Scanned images/OCR and external files outside the active vault are not added by this increment. A node holds one file or one box; attaching a reviewed replacement clears the other binding. The LLM node continues to select a provider/model.

- **Personality, Output, Skill and Workflow** files are role-specific reference guidance. A method document can guide analysis but does not install executable code, train models or grant tools. It stays outside the factual citation manifest.
- **Context** provides a default research file in the explicit new-chat picker. The operator can instead choose a box.
- **Knowledge** offers an explicitly confirmed additional research file when creating a new chat. Existing sessions never gain it automatically.

Source review renders text safely, with independent scrolling. Full contents are retained for execution within the limits: 80,000 characters per reviewed source/box and 80,000 combined guidance characters, plus the actual model token budget. This supersedes the earlier 16,000-character guidance cap. Oversized inputs fail explicitly; they are never silently truncated. UI token estimates remain approximate. Online provider disclosures include configured reference material.

## Storage and change behavior

Agent schema 1 gains optional `config.contextFile`: canonical vault path, relative file path, reviewed time, token estimate and a one-file source/hash manifest. It persists no document text. Existing Context Box bindings are unchanged. Applying validates all references against the vault and current hashes. Changed/missing guidance must be reviewed and applied again.

Applying also rechecks the selected chat's research binding so a corrected guidance reference clears a stale readiness error. Retired prototype references are ignored in memory when reading agent profiles, without rewriting their files; historical execution labels remain readable, with no execution adapter.

New direct-file research conversations use schema **4** and store `contextFile` plus the explicit creation ID, with an optional file/box Knowledge binding. They create no hidden box or library membership. All research sources are deduplicated under the existing 32-file limit, and hashes are checked before execution. A changed research file requires a newly reviewed, explicitly created chat; old messages and immutable run provenance remain readable. Box conversations continue to use schema 3 and their existing per-turn behavior. Legacy schemas 1–3 remain readable without read-time rewriting; schema 4 requires the updated application.

Explicitly switching a file-backed chat to a box removes its file and additional Knowledge bindings for future turns, preserving historical source records. History, contact previews, chat headers and details identify file-backed sessions by their file path. Direct file references and factual source manifests remain separate in immutable run diagnostics.

The additive `listConstructionFiles` and `previewConstructionFile` IPC methods retain bridge 18. Restart Electron after main/preload changes. File paths use the existing controlled Brain Scope reads; cross-vault references, missing files, folders, changed hashes and forged manifests fail closed.

## Verification

**265 deterministic tests pass**, with zero failures or skips. Coverage includes full document delivery beyond the previous 16k limit, no hidden boxes/sessions, separate guidance/evidence manifests, explicit Context/Knowledge file creation, idempotency, schema-4 history, stale/cross-vault rejection, retired-reference compatibility and source/model budgets. Strict TypeScript, formatting and production build pass with the final file-only feature.

`scripts/electron-single-file-smoke.cjs` passes all five roles through real UI review, draft/reopen/apply, cancel, source confirmation, actual request contents, no hidden boxes, file-only chat history and restart. It also verifies no provider call for stale guidance, re-review/apply recovery and removal of the experimental execution APIs. `electron-box-agents-smoke.cjs` passes the existing-box regression. Reports/screenshots are under ignored `test-results/`. Provider responses are synthetic; these checks establish transport, source boundaries and persistence rather than live-model answer quality.
