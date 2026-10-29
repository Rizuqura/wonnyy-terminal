# QTerminal v1.0.0 — Victoria Beta

Draft first public beta: a local-first AI research workspace with optional BYOK providers.

- Workspace file reading and Planet View navigation over a user-owned vault.
- Reviewed, named Context Boxes with source identities, token estimates and explicit chat binding.
- User-created configurable agents, per-agent construction and profile/chat appearance.
- Streaming chat, cancellation, explicit retry, history and immutable local run provenance.
- Local CSV calculations, PDF text extraction and Windows image/scanned-PDF OCR.
- Ollama integration plus optional Gemini, NVIDIA NIM and OpenRouter configuration.
- Empty fresh-install agents, chats, Context Boxes, keys and research vault; existing profiles are preserved.
- Reduced packaging scope: no Next development server, tests, research data or source maps in the distributed application.
- Updated desktop/build dependencies and hardened renderer/IPC boundaries.

Beta limitations: model responses can be wrong; citation checks do not establish factual correctness. Context windows and provider quotas still apply. OCR is Windows-only and may misread content. CSV calculations are bounded, not arbitrary Python/code execution. No bundled models, accounts, hosted credits, cloud sync or advanced memory backend. Windows x64 is the validated packaging target; other platforms need independent testing. Installer signing and project-source licensing must be addressed before claiming a signed open-source release.

See [the measured release audit](docs/release-audit.md) for readiness, security findings, test evidence and remaining gaps. This draft does not publish a GitHub release.
