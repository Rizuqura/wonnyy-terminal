# Contributing

Use Node.js 22.18+ and npm, then `npm ci`, `npm run dev`. Check `AGENTS.md` and the locally installed Next.js guides before framework changes. Production is a static export consumed by Electron, not a hosted Next server.

Keep fixes scoped and maintain local-first/BYOK behavior. Use temporary synthetic vaults and isolated application profiles in tests. Never commit research documents, credentials, user profiles, installers or generated PDF.js/build output. Add meaningful regression coverage when changing runtime, storage, capability or security boundaries.

Before proposing a change run `npm test`, `npm run typecheck`, `npm run build` and relevant Electron acceptance scripts. `npm run test:release:electron` exercises fresh installation; existing legacy acceptance fixtures deliberately seed historical agents. Live provider tests are separate and may incur provider costs.

On Windows x64, `npm run package` builds/checks an unpacked app; `npm run release` builds/checks the NSIS installer. macOS/Linux packaging and signing require their own verification. Do not upload artifacts or rewrite Git history without authorization.

No project source license has been selected; package metadata is explicitly `UNLICENSED`. Public visibility alone does not grant an open-source license. A maintainer must select licensing before an open-source release. Bundled third-party components retain their own licenses/notices.
