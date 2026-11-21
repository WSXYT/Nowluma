---
title: Planned and unverified
description: The real status of the rewrite kernel, platforms, release artifacts, documentation site and performance effects; what is NOT RUN.
tutorial: planned
---

# Planned and unverified

Use the lesson above to inspect kernel availability and the version entry. An unavailable option is not a hidden feature; neither the simulator nor a successful build proves platform support.

![Available and unavailable choices in the kernel dialog](/images/tutorials/account-kernel.png)

_Figure: example account selection. The rewrite kernel remains unavailable._

This page states only what can currently be confirmed. Plans, successful builds and old CI history are not real-account acceptance.

| Item                        | Status                                                                            | What you can say                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Account kernel choice       | Implemented; compatibility selectable                                             | Persisted per real UIN; risk acknowledgement required                                                              |
| Rewrite kernel              | Visible as `暂不可用`                                                             | Unverified on this platform; no automatic fallback                                                                 |
| Six original prebuilt files | Used by the current release                                                       | Internal bytes and required old socket ABI unchanged                                                               |
| External rewrite attempt    | Incomplete, not shipped                                                           | Not the current access kernel                                                                                      |
| Windows exe                 | Built, unsigned                                                                   | Bundled Node 24 and self-contained .NET; real account unverified                                                   |
| Docker arm64                | Build inputs exist                                                                | Not actually verified                                                                                              |
| Display effects             | Implemented                                                                       | Motion and glass quality are manual; no FPS or power claims                                                        |
| QQ desktop entry            | Decided by runtime server capability                                              | Shown only on a Linux server with the same-origin gateway; not on Windows native or old servers                    |
| Auto-attach                 | Implemented                                                                       | Local QQ login, recognized real UIN and a current-risk-version acknowledgement; manual unload does not auto-resume |
| Documentation and tutorials | VitePress bilingual chapters with on-demand guided lessons                          | Check the [public site](https://nowluma.github.io/NowLuma/) and its matching Pages deployment                     |
| Real QQ login/delivery      | Needs your account                                                                | CI does not prove QR-free login, delivery or long-term stability                                                   |
| Releases and signing        | x64 RC, checksums and versioned GHCR image are published; Windows exe is unsigned | Only claim assets actually present on the release page; provenance is not account acceptance                       |

## Rewrite kernel

The attach dialog shows `重写内核` with `暂不可用` and a reason. It cannot be selected and has no hidden switch:

- Choosing compatibility does not silently “upgrade” to the rewrite kernel.
- A saved rewrite choice is not forcibly changed to compatibility; the choice cannot be submitted at all in this phase.
- The external rewrite attempt is incomplete and unshipped; experimental repository code does not make it usable.
- If it is enabled later, it will still require an active per-account acknowledgement and a fresh risk decision, with no pre-checked or silent fallback.

The compatibility kernel uses bundled native components and carries account, data-security and legal risks. Acknowledgement does not remove liabilities that cannot legally be waived, and does not change the GPL source licence.

## Platforms

- **Linux Docker amd64**: automated build and fresh-HOME smoke cover process discovery, no auto-attach before account confirmation, desktop authentication and persistence across recreation. Real hook attach and real QQ login are NOT RUN in the latest smoke.
- **Docker arm64**: build inputs only; unverified. Do not label it tested.
- **Linux Lite**: launcher, Node baseline and release-layout checks exist; real native attach must be verified on your desktop.
- **Windows x64**: exe built, unsigned; real injection, login and long sessions unverified. The OOBE-style installation/configuration tutorial is deferred; first run still completes notice reading and password setup in the console, and account kernel choice remains a real attach step, not an extra platform-chooser wizard.

Platform support does not guarantee an account works; QQ server sessions, permissions, desktop environment and network all affect the result.

Each delivery follows its [source CI](https://github.com/NowLuma/NowLuma/actions) and [release artifacts](https://github.com/NowLuma/NowLuma/releases). Historical success does not replace current account-login, desktop or delivery verification.

## Releases and updates

- Linux runtime package: `Nowluma-v<version>-linux-x64-lite.tar.gz`.
- Windows runtime update archive: `Nowluma-v<version>-win-x64-lite.zip`, no bundled Node.
- Windows launcher: `Nowluma-win32-x64-<version>.exe`, unsigned, with Node 24 and self-contained .NET.
- Releases include `LICENSE`, `LICENSING.md`, `EULA.md`, `PRIVACY.md` and `SHA256SUMS`.
- Update sources can auto-switch, use GitHub directly or a mirror; reachability is not download speed.
- No npm package and no Docker Hub; image tags follow the actual release record.

A successful build, provenance attestation or checksum proves origin and integrity, not QQ login, bot replies or long-term stability.

## Documentation site

- 18 chapters per language, static build with the `/NowLuma/` base path and relative `/demo/`.
- The [public documentation](https://nowluma.github.io/NowLuma/) is served by the project’s Pages deployment.
- `/demo/` exists only when the build includes the simulator and uses simulated data; it does not connect to QQ.

## Performance and appearance

- Motion is manually enabled or disabled in first setup and Appearance; no continuous FPS detector runs. Legacy automatic quality becomes full glass while saved motion preferences remain.
- Frosted glass skips displacement without changing motion; full glass attempts genuine backdrop refraction in supported Chromium.
- High contrast, reduced transparency and host overlays retain readable solid/host surfaces; OS reduced motion still constrains movement.
- Verification separates optical pixels, interrupted interactions, device frame rates and real accounts; unit tests do not prove GPU cost or power savings.

## Verify yourself

| Item                     | How                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| QQ auto-login            | Restart and watch the QQ desktop; see [manual verification](data-backup.md#qq-persistence-and-manual-verification) |
| Bot replies              | Real account + real endpoint + the bot's own log                                                                   |
| Message delivery         | What the receiving side actually gets                                                                              |
| Long-term stability      | Record version, time and observations                                                                              |
| Account restriction risk | No probability is offered                                                                                          |
| arm64                    | Build and run on that machine                                                                                      |
