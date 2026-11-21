---
title: Development
description: Nowluma's GPL-3.0-only licensing, repository layout, local validation, documentation, change boundaries and release flow.
tutorial: developing
---

# Development

Use the tutorial above to understand the operation before editing its owning module. Developer replay previews the flow without changing real credentials, risk acceptance or preferences.

![Debug workspace for reproducible action inspection](/images/tutorials/debug.png)

_Figure: sample API controls for replaying an operation and inspecting its result._

Nowluma is released under GPL-3.0-only. Follow GPLv3 when modifying and distributing source. Bundled native and third-party components follow their own terms in `LICENSING.md`.

## Licence

- Source may be used, studied, modified and redistributed, **including commercially**, with no extra non-commercial condition.
- When distributing a modified version, provide the corresponding source and licence notices under GPLv3 and add no further restrictions.
- Root `LICENSE` is the verbatim GNU GPLv3 text; `LICENSING.md` records native/third-party boundaries; `EULA.md` and `PRIVACY.md` describe use and privacy and do not reduce GPL rights.
- `ws675170761@gmail.com` is only for infringement complaints; it is not general, commercial or privacy contact.

## Layout

| Path                          | Responsibility                                                           |
| ----------------------------- | ------------------------------------------------------------------------ |
| `packages/bridge`             | QQ process discovery, account detection, native transport lifecycle      |
| `packages/core`               | Per-account orchestration, WebUI backend, startup/update assembly        |
| `packages/onebot`             | Actions, event conversion, account storage, HTTP/WebSocket transports    |
| `packages/protocol`           | Packet parsing, identity mapping, protocol/media requests                |
| `packages/common`             | Leaf utilities; browser imports must not pull in Node filesystem modules |
| `packages/webui`              | React console                                                            |
| `packages/runtime`            | Release scaffold and original prebuilt files                             |
| `packages/sdk` / `mcp` / `ui` | Consumer APIs and tools                                                  |
| `deploy`                      | Docker, installation, supervision, persistence and smoke                 |
| `tools`                       | Build, checks, release and documentation scripts                         |

Read every caller and neighbouring test before changing a shared function. Preserve per-account identity, message/media history, signed non-zero int32 message IDs, teardown order and in-flight work.

## Local validation

Use the pinned Node and pnpm versions; do not change dependencies or the lockfile to bypass a failure.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm run build:all
node tools/check-release-layout.mjs dist
node tools/check-identity.mjs
node --test deploy/docker/healthcheck.test.cjs
```

Focused tests:

```bash
pnpm --filter @nowluma/<package> test
```

The frontend package is `webui`. Native coverage is separate:

```bash
pnpm test:native
```

A missing native artifact or target is NOT_RUN, not permission to skip validation.

`pnpm dev` tries to attach to a real local QQ; use it only for real runtime testing. Prefer isolated fakes or the Docker smoke.

## Documentation

Documentation lives in `docs/content/{zh,en}` with 18 chapters per language and a shared feature map at `docs/content/coverage.json`.

```bash
pnpm docs:dev          # Start both docs and the embedded simulator
pnpm docs:build:all    # Build and validate the complete site
pnpm docs:preview     # Preview the built site
node --test tools/docs.test.mjs
```

- Keep chapter links valid under `/NowLuma/`; use `pnpm docs:dev` or a built HTTP preview rather than `file://` for interactive features.
- Update every cross-chapter link when renaming a heading; never weaken `tools/check-docs.mjs` to pass.
- Quote the actual localized UI labels; keep tutorial targets independent of the language of the label.
- No pixel coordinates, unverified screenshots or FPS promises.

## Change boundaries

- Fix a shared problem once in its owning module; do not duplicate it across callers.
- Parse input separately from effects; validate trust boundaries; retain error details; never turn failure into success.
- Keep desired persisted config distinct from applied runtime config; make environment overrides visible.
- Do not overwrite corrupt credentials/config with defaults or delete durable user data automatically.
- Media sends await validated upload completion; do not retry uncertain writes blindly.
- HTTP/WS listeners retain configured binding, authentication, TLS failure handling and bounded buffering.
- OneBot action/catalog changes update tests, SDK contracts and the generated MCP catalog: `pnpm --filter @nowluma/mcp gen`.
- Proton transformations use the production implementation in tests; do not substitute a test-only duplicate.
- Never commit real passwords, account databases, tokens, user HOME or unredacted traffic.

## PRs

- Branch from `main` and target this repository's `main`.
- Use Conventional Commits, for example `feat(webui): ...`.
- Include the linked issue, change description and actual validation commands/results in the PR body.
- Report actual exit statuses and gates not run; do not mark work complete while code or required verification is incomplete.
- Submit issues through the repository web template; do not paste private account data or full logs.

## Release flow

Releases are triggered by a `vX.Y.Z` tag pushed to `main`:

```bash
pnpm bump 2.5.0
# add a matching ## 2.5.0 section to CHANGELOG.md
pnpm release 2.5.0
```

- Tag, root and every `packages/*/package.json`, and the CHANGELOG section must match.
- The workflow creates a draft, gathers and verifies artifacts, and only then publishes; a failed draft stays private.
- `gates` reuses CI verify, Docker start/recreate smoke and Windows checks.
- Artifacts include the Linux Lite archive, Windows update archive, unsigned exe, image digest and `SHA256SUMS`.
- The current Docker smoke uses a fresh HOME and verifies process discovery, no auto-attach before account confirmation, desktop authentication and persistence across recreation; real QQ login and hook attach are NOT RUN.
- Archives, images and the exe prove build origin and content, not account login or long-term availability.

Detailed version, tag and workflow steps are in `docs/releasing.md`.
