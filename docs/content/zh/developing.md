---
title: 参与开发
description: Nowluma 的 GPL-3.0-only 许可、仓库结构、本地验证、文档构建、变更边界与发行流程。
tutorial: developing
---

# 参与开发

先用上方教学控制台理解真实操作，再修改对应的拥有者模块。开发者演练只预览，不应修改真实密码、风险确认或外观配置。

![开发和排障共用的调试工具页面](/images/tutorials/debug.png)

_图：示例接口调试入口，便于复现操作与核对结果。_

Nowluma 以 GPL-3.0-only 发布。修改和分发源码时遵守 GPLv3；随包原生组件与第三方组件按 `LICENSING.md` 的各自条款处理。

## 许可

- 源码可以自由使用、研究、修改和分发，**包括商业用途**，没有额外的非商业限制。
- 分发修改版时按 GPLv3 提供对应源码与许可文本，不添加额外限制。
- 根目录 `LICENSE` 是 GNU GPLv3 标准全文；`LICENSING.md` 记录原生组件与第三方边界；`EULA.md` 与 `PRIVACY.md` 是使用与隐私说明，不改变 GPL 权利。
- 只有侵权投诉使用 `ws675170761@gmail.com`；它不是通用、商业合作或隐私联系邮箱。

## 目录

| 路径                          | 负责                                           |
| ----------------------------- | ---------------------------------------------- |
| `packages/bridge`             | QQ 进程发现、账号识别、原生传输生命周期        |
| `packages/core`               | 每账号编排、WebUI 后端、启动与更新组装         |
| `packages/onebot`             | 动作、事件转换、账号存储、HTTP/WebSocket 传输  |
| `packages/protocol`           | 数据包解析、身份映射、协议与媒体请求           |
| `packages/common`             | 叶子工具；浏览器导入不得拉入 Node 文件系统模块 |
| `packages/webui`              | React 控制台                                   |
| `packages/runtime`            | 发行脚手架与原始预编译文件                     |
| `packages/sdk` / `mcp` / `ui` | 消费端 API 与工具                              |
| `deploy`                      | Docker、安装、进程监督、持久化与 smoke         |
| `tools`                       | 构建、检查、发行与文档脚本                     |

改动共享函数前先读所有调用方与相邻测试。新增或修改功能时，保持每账号身份、消息历史、非零有符号 int32 消息 ID、teardown 顺序与在途工作不变。

## 本地验证

使用仓库固定的 Node 与 pnpm 版本，不要改依赖或锁文件来绕过失败。

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

聚焦测试：

```bash
pnpm --filter @nowluma/<package> test
```

前端包名是 `webui`。原生测试单独运行：

```bash
pnpm test:native
```

缺少原生产物或目标平台是 NOT_RUN，不是跳过验证的理由。

`pnpm dev` 会尝试连接本机真实 QQ；只在确实要进行真实运行测试时使用。日常开发优先用隔离 fake 或 Docker smoke。

## 文档

文档在 `docs/content/{zh,en}`，每语言 18 章，共用 `docs/content/coverage.json` 的功能映射。

```bash
pnpm docs:dev          # 同时启动文档与内嵌模拟器
pnpm docs:build:all    # 构建并检查完整站点
pnpm docs:preview     # 预览已构建的站点
node --test tools/docs.test.mjs
```

- 章节链接保持 `/NowLuma/` 基路径；本地用 `pnpm docs:dev` 或构建后的 HTTP 预览，不依赖 `file://` 执行交互。
- 改标题时同时更新所有跨章链接；不要为了通过检查而放宽 `tools/check-docs.mjs`。
- 引用对应语言的真实界面标签；引导定位不依赖翻译文案。
- 不写像素坐标、未经验证的截图或帧率承诺。

## 变更边界

- 修复共享问题一次改在拥有者模块，不复制到多个调用方。
- 输入解析与副作用分开；信任边界要校验；失败保留错误详情，不把失败转成成功。
- 持久化配置与已应用运行配置保持区分；环境变量覆盖要可见。
- 不要用默认值覆盖损坏的凭据或配置，不要自动删除用户数据。
- 媒体发送等待上传确认；不确定的写入不要盲目重试。
- HTTP/WS 监听保留绑定、认证、TLS 失败处理和有限缓冲。
- OneBot 动作/目录变化要更新测试、SDK 契约和 MCP 生成目录：`pnpm --filter @nowluma/mcp gen`。
- Proton 转换在测试中使用生产实现，不复制一份测试专用实现。
- 不提交真实密码、账号数据库、令牌、用户 HOME 或未脱敏流量。

## 提交与 PR

- 从 `main` 开功能分支，目标也是当前仓库的 `main`。
- 标题使用 Conventional Commits，例如 `feat(webui): ...`。
- PR 正文包含关联 Issue、变更说明与实际验证命令/结果。
- 记录实际退出状态与未运行的门禁；代码或验证未完成时不要把任务标成完成。
- 问题通过仓库网页模板提交；不要粘贴私密账号数据或完整日志。

## 发行流程

发行由推送到 `main` 的 `vX.Y.Z` tag 触发：

```bash
pnpm bump 2.5.0
# 在 CHANGELOG.md 写入一致的 ## 2.5.0
pnpm release 2.5.0
```

- tag、根与全部 `packages/*/package.json`、CHANGELOG 小节必须一致。
- 工作流先创建草稿，汇总并校验产物后才发布；失败的草稿保持私有。
- `gates` 复用 CI 的 verify、Docker 启动/重建 smoke 与 Windows 检查。
- 产物包括 Linux Lite 归档、Windows 更新归档、未签名 exe、镜像摘要与 `SHA256SUMS`。
- 当前 Docker smoke 使用全新 HOME，验证进程发现、未确认账号不自动接入、桌面认证和重建持久化；真实 QQ 登录与 hook 接入是 NOT RUN。
- 归档、镜像与 exe 只证明构建来源与内容，不证明账号能登录或长期可用。

更细的版本、tag 与工作流步骤见 `docs/releasing.md`。
