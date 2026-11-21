---
title: Practice demo
description: 'The /demo/ environment in the documentation site: learn the workspace using guided example data without connecting a real QQ account.'
tutorial: demo
---

# Practice demo

Every chapter has its own embedded lesson above the text. The objective, hint and progress follow that chapter; restart the lesson to practise again without repeating unrelated setup.

![Tutorial guidance alongside the actual console](/images/tutorials/simulator-guide.png)

_Figure: example data; guidance never accepts real account risks or sends real messages for you._

The documentation site includes a `/demo/` environment that renders console components with simulated data. Use it to learn the new workspace before touching a real instance.

Each embedded simulator selects that chapter's operation path. First-run lessons begin at login; other lessons can use a preloaded example account. Standalone `/demo/` remains available for free exploration, not as a substitute for chapter guidance.

## Opening it

- Select **Load simulator** above the chapter. **Collapse simulator** hides it without discarding progress; **Restart tutorial** resets the lesson. Continue only after the guide confirms the current operation.
- The simulator uses the chapter’s language. It works under the `/NowLuma/` base path and in a local HTTP preview.
- Use only the public example password and code shown on the page; no real QQ account or OneBot token is required.

## What you can practise

| Scenario                                                                              | Chapter                                                 |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Floating navigation, masthead, connection workflow, runtime readings                  | [Workspace](overview.md)                                |
| Four-stage setup: notices, access password, manual display effects and account kernel | [First run](first-run.md)                               |
| Process states and the attach confirmation                                            | [QQ sessions](qq-connection.md)                         |
| Four transport tabs and save states                                                   | [Bot connections](onebot-config.md)                     |
| Log presets, search and the TRACE warning                                             | [Run log](logs.md)                                      |
| Action testing, message composition and live activity                                 | [Debug tools](debug.md)                                 |
| Settings categories and save/restart hints                                            | [Settings: appearance and account](settings-console.md) |

The simulated data covers normal, empty and error branches, including the difference between `已保存并应用` and `已保存，下次连接时应用`.

## What it cannot prove

- `已连接` does not mean your QQ is logged in or that a bot receives messages.
- `发送成功` does not mean a real account delivered anything or that the other side will reply.
- It writes no real configuration, reads no real tokens and contacts no real service.
- It cannot verify persistence, restart, permissions, kernel risk acknowledgement or desktop authentication.
- It cannot assess account restriction risk.

## Differences from the real console

| Item    | Demo                  | Real console                                         |
| ------- | --------------------- | ---------------------------------------------------- |
| Data    | Fixed simulated data  | Your accounts, processes and connections             |
| Network | No real requests      | Reads the local service and QQ                       |
| Account | Not needed            | You must log in inside QQ                            |
| Saves   | Not persisted         | Written to config; applied or restarted as indicated |
| Kernel  | UI demonstration only | Confirmed per real UIN and persisted                 |

There is no hidden bypass in the demo. For real use, follow [First run](first-run.md) and [QQ sessions](qq-connection.md). Real behaviour must be verified with a real account and endpoint.
