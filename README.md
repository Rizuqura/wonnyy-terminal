# QTerminal

A local-first AI research workspace and agent environment.

**v1.0.0 Victoria Beta** · Version: 1.0.0 · Codename: Victoria · Status: Beta

## What QTerminal is

QTerminal brings a user-owned file vault, Planet View, reviewed Context Boxes and configurable agents into a desktop workspace. Model access is optional: connect a local Ollama model or bring your own key for a supported external provider. There is no required QTerminal account, subscription, hosted database or cloud sync.

Fresh installations start with **no agents, chats, Context Boxes, API keys or research files**. An empty `Documents/QTerminal Vault` folder is created. Choose another folder in Settings, or add your own files, then create an agent. Existing profiles and explicitly chosen vaults are preserved when upgrading.

## Current capabilities

- Workspace explorer/document reader and Planet View, with local Stations and source selection.
- Named Context Boxes built through explicit source review, token estimates and stable source identities.
- **Agent → + Add agent**: blank agents without photos or custom knowledge. Their **⋯** menu opens construction, model, personality, guidance and appearance settings.
- Context Box or single reviewed file bindings for agent nodes; explicit research selection when creating chats.
- Streaming Markdown chat, cancellation, retry, searchable history, message deletion and local run provenance.
- Markdown, CSV and PDF text reading; PNG/JPG/JPEG and scanned-PDF OCR on Windows with an installed OCR language.
- Bounded local CSV inspection, filtering, grouping, aggregation, date trends and basic statistics. No arbitrary Python or user-code execution.
- Ollama, Gemini, NVIDIA NIM and OpenRouter; manual context/output budgets and provider usage information where available.

## Installation

Windows x64 is the currently validated release target. When a verified Victoria Beta release is available, use its `QTerminal-1.0.0-Victoria-Beta-win-x64.exe` installer. This repository's release notes are a draft; the audit does not automatically publish a release. Unsigned beta installers may trigger Windows reputation warnings; verify the published SHA-256 before installing.

To build from source, use Node.js **22.18 or newer** and npm on Windows:

```powershell
git clone https://github.com/Rizuqura/wonnyy-terminal.git
cd wonnyy-terminal
npm ci
npm run build
npm start
```

No Python, model weights or Ollama service is bundled. Install Ollama separately only if using local models. Remote providers require an internet connection, your own key and provider allowance. Windows OCR needs an installed Windows OCR language.

## Development

```powershell
npm run dev          # Next development renderer + Electron
npm test             # Deterministic synthetic tests
npm run typecheck
npm run build        # Static export, local PDF resources and production CSP
npm run package      # Windows x64 unpacked application + package audit
npm run release      # Windows x64 NSIS installer + package audit
npm run audit:size   # Measured logical disk-size report
npm run test:release:electron
```

Commit `package-lock.json`; use `npm ci` for repeatable dependency installation. Packaging requires standard Electron/electron-builder download access. Production uses local static files and does not run a Next.js web server. `build/` contains required source icons, not generated installers. Outputs go to ignored `dist/`.

## First research workflow

1. Choose a vault in Settings or add files to the empty default vault and rescan.
2. Select files, review sources and choose **Create Context Box**. Saving a box does not create a chat.
3. Open **Agent → + Add agent**, then its **⋯** settings to configure identity, model and optional reviewed knowledge/guidance.
4. Configure a model in Settings. Choose **+ New Chat**, confirm the research source and start the conversation.
5. Inspect source links, filters and calculations. Retry a failed turn explicitly; sources are never silently shortened to fit a budget.

## BYOK

Enter keys in **Settings → provider → API key**. Keys are encrypted with Electron safeStorage in your OS user profile; they are not embedded in the renderer or research files. Secure storage must be available; there is no plaintext fallback. No key is included in source or release defaults. Provider prices, token limits, availability and billing remain the provider's responsibility. Remote models are discovered through the provider, not assumed from a fixed catalog.

## Privacy and storage

Research files remain in your chosen vault. `.wonnyy/` inside that vault stores local Stations, Context Boxes, chat history and immutable model-run records. The Electron profile stores settings, agents, managed images and encrypted credentials; Chromium stores UI preferences/caches there. The selected vault path persists in `vault-settings.json`. Upgrades can reuse historical QTerminal/Wonnyy profiles to preserve existing encrypted keys.

With a remote provider, the request includes reviewed research/guidance text, questions and included history; CSV requests can include column profiles, samples and computed results. That provider's policies apply. Ollama communicates with a separately running loopback service. Model discovery/usage checks may contact configured providers. There is no mandatory QTerminal telemetry or cloud storage.

Run records can retain questions, answers and analysis evidence after chat deletion. Source hashes identify historical versions, but complete source snapshots are not retained; source links open current files. Protect and back up both your vault and application profile. Do not use the app as a guarantee of confidentiality or factual accuracy.

## Known limitations

- Beta software: answers, inferred conclusions and OCR can be wrong. Citation IDs and numeric checks validate constrained structure/evidence, not semantic correctness.
- Full document/guidance content must fit the selected model window. The displayed estimator is conservative; configure a larger supported cloud window or smaller boxes. Local Ollama retains a 32K application ceiling.
- CSV analysis is bounded JavaScript computation, not general SQL, joins, forecasting, training or an executable skill marketplace.
- Image reading supplies OCR text, not general visual chart/photo understanding. OCR is currently Windows-only.
- Windows x64 packaging is tested here. macOS/Linux, signing and live-model grounding need separate verification.
- Legacy Wonnyy/CHronoZ profiles may remain visible on upgraded installations; a clean installation has no seeded agent.

## Project structure

`app/`, `components/`, `features/` and `lib/` implement the static renderer. `electron/` owns controlled filesystem access, providers, workers, storage and IPC. `types/` declares the desktop contract. `scripts/` holds reproducible build/audit and synthetic acceptance tooling. `big-context/` preserves design/handoff history and is not packaged.

See [release notes](RELEASE_NOTES.md), [audit and measurements](docs/release-audit.md), [security](SECURITY.md) and [contributing](CONTRIBUTING.md). No project-source license has been selected (`UNLICENSED`); public visibility does not imply an open-source license. Third-party notices remain applicable.

## Roadmap

Future possibilities include a stronger local memory boundary, model capability/routing intelligence and runtime improvements. Hosted services, paid credits, accounts and synchronization are future decisions, not Victoria Beta dependencies or current capabilities.
