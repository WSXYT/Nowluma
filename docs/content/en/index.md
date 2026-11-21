---
title: Nowluma documentation
description: 'Complete English guide to the new workspace, account kernel and GPL licensing: install, first run, six pages, settings, deployment, data and recovery.'
tutorial: index
---

# Nowluma documentation

Select **Load simulator** above this chapter to follow the navigation lesson, then choose a reading path below. Practice uses sample data, not your QQ account.

![Workspace and main navigation with example data](/images/tutorials/overview.png)

_Figure: console access, an online QQ account and a healthy bot endpoint are different states._

Nowluma connects to a running QQ client, exposes the account through OneBot v11, and provides a browser workspace. It does not log in to QQ and never stores your QQ password.

## Reading paths

| Your situation                       | Start here                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| First Linux Docker deployment        | [Docker install](install-docker.md) → [First run](first-run.md) → [QQ sessions](qq-connection.md) |
| Console works, want to connect a bot | [Bot connections](onebot-config.md) → [Run log](logs.md)                                          |
| Want the concepts first              | [What Nowluma is](introduction.md) → [Access and network](access-network.md)                      |
| Troubleshooting for someone else     | [Troubleshooting](troubleshooting.md) → [Run log](logs.md)                                        |
| Just want to explore the UI          | [Practice demo](demo.md)                                                                          |
| Contributing code                    | [Development](developing.md)                                                                      |

## Chapters

| Chapter                                                 | Contents                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| [What Nowluma is](introduction.md)                      | Components, connection states, save semantics, account kernel and licence |
| [Docker install](install-docker.md)                     | Linux wizard, ports, volumes, daily commands                              |
| [Native install](install-native.md)                     | Linux Lite, Windows exe, running from source                              |
| [First run](first-run.md)                               | Login, 2FA, reading the notices, setting a password                       |
| [Workspace](overview.md)                                | Masthead, floating navigation, workflow, layout, widgets, kiosk           |
| [QQ sessions](qq-connection.md)                         | Process states, attach, kernel choice, unload, desktop                    |
| [Bot connections](onebot-config.md)                     | Per-account message behaviour and four transports                         |
| [Run log](logs.md)                                      | Live log, presets, levels, TRACE, export                                  |
| [Debug tools](debug.md)                                 | Action tester, message composer, live activity, API library               |
| [Settings: appearance and account](settings-console.md) | Theme, performance mode, accessibility, password, 2FA                     |
| [Settings: runtime and services](settings-runtime.md)   | Global config, storage, notifications, services, updates                  |
| [Access and network](access-network.md)                 | SSH, LAN, reverse proxy, TLS, desktop auth                                |
| [Data, backup and updates](data-backup.md)              | Locations, backup, restore, cleanup, QQ persistence                       |
| [Troubleshooting](troubleshooting.md)                   | From symptom to safe recovery                                             |
| [Practice demo](demo.md)                                | What `/demo/` can and cannot prove                                        |
| [Planned and unverified](planned.md)                    | Rewrite kernel, platforms and release status                              |
| [Development](developing.md)                            | GPL, layout, validation, PRs and release                                  |

## Conventions

- Use the console’s language button to switch between English and Simplified Chinese. The simulator in an English chapter uses English; some quoted labels and figures show the equivalent Chinese interface.
- Process states: `可加载`, `加载中`, `等待连接`, `等待登录`, `已在线`, `错误`, `已断开`. Endpoint states: `正常`, `注意`, `异常`, `应用失败`, `未启用`.
- External addresses are examples: `http://127.0.0.1:5700`, `https://bot.example.invalid`, `admin@example.invalid`.
- “Saved”, “applied” and “connected” are different; see [Three kinds of save result](introduction.md#three-kinds-of-save-result).
- Figures show the actually rendered example console and current control labels; they do not establish real QQ account acceptance.
- Interactive lessons require an HTTP preview or the [published documentation](https://nowluma.github.io/NowLuma/); search and the simulator are unavailable under `file://`.

## What this documentation does not promise

- That QQ's servers will always accept a saved session; re-verification may still be required in QQ.
- That an account will not be restricted; no ban/risk probability is offered.
- That an endpoint showing `正常` means a bot will reply. It only means listening or connected.
- That unreleased capabilities, signed binaries, image tags or performance benchmarks exist. See [Planned and unverified](planned.md).
