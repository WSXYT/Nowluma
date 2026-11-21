# 发行流程

本仓库使用 `main` 与功能分支，不使用 `dev`、Promote 工作流或自动关闭 PR 的策略。
发行由推送到 `main` 的 `vX.Y.Z` tag 触发；`.github/workflows/release.yml` 先在草稿发行中
汇总并校验全部产物，最后才对外发布。

## 1. 准备版本

```bash
pnpm bump 2.5.0          # 同步根与全部 packages/*/package.json
# 在 CHANGELOG.md 写入与版本完全一致的 `## 2.5.0` 小节
git add package.json packages/*/package.json CHANGELOG.md
git commit -m "chore(release): 2.5.0"
```

- 版本必须是规范 SemVer（`2.5.0`、`2.5.0-rc.1`）。发行 tag 与容器 tag 都无法表示
  `+build` 元数据，带 `+` 的版本会在版本门禁被拒绝。带 `-` 的预发布版本不会覆盖 `latest`。
- `CHANGELOG.md` 必须有与版本完全一致的 `## 2.5.0` 小节，内容就是发行说明；缺失或为空时
  版本门禁会失败。
- 全部 `packages/*/package.json` 必须与根版本一致，部分 bump 会被拒绝。
- 把该提交合并到 `main` 后再发行；tag 只从 `main` 的提交创建。

## 2. 发行

在干净的 `main` 检出上运行：

```bash
git switch main && git pull --ff-only
pnpm install --frozen-lockfile
pnpm release 2.5.0
```

`tools/release.mjs`（`pnpm release`）依次执行：

1. 要求当前分支是 `main`、工作区干净、HEAD 与 `origin/main` 一致；
2. `node tools/check-version.mjs --tag v2.5.0` —— 与 `release.yml` 相同的版本门禁：
   tag、根与全部 `packages/*/package.json`、`CHANGELOG.md` 小节必须一致；
3. `node tools/ci-check.mjs` —— `ci.yml` `verify` 作业的同一组命令。本机缺少 `bash` 或
   `docker` 时这些门禁会明确标记 NOT RUN，它们仍由 CI 执行；
4. 创建 `v2.5.0` tag 并推送。已存在的 tag 不会被移动；中断后重跑同一命令会继续；
5. 用 `gh` 等待 `Nowluma Release` 工作流，并确认发行已发布（不是草稿）且带 `SHA256SUMS`。

参数：

- `--dry-run`：打印计划并运行只读的版本门禁；不 fetch、不建 tag、不推送。
- `--no-wait`：推送 tag 后退出，不等待也不校验工作流。

自动等待需要已登录的 `gh`；没有 `gh` 时请用 `--no-wait`，然后按下面的手工流程核对。
工作流失败时草稿保持私有，不会发布任何东西；修复后在 Actions 中重跑该 tag 的作业，或
重跑 `pnpm release 2.5.0` 继续等待（tag 不会被重建）。

手工等价流程：

```bash
node tools/check-version.mjs --tag v2.5.0
node tools/ci-check.mjs
git tag v2.5.0
git push origin refs/tags/v2.5.0
```

`tools/check-version.mjs` 不依赖已安装的工作区，所以 tag 预检在任何 checkout 中都能运行。
`tools/package-release.mjs` 只打包 `dist/` 的 linux-x64 布局，校验存档重新打开后的
`release.json` 清单、必需的 GPL 与说明文件（`LICENSE`、`LICENSING.md`、`EULA.md`、`PRIVACY.md`），并拒绝
`config/`、`data/`、`logs/` 用户数据。Windows 产物是一键 exe，由
`tools/build-windows-exe.mjs` 构建，不走这个脚本。

## 3. tag 触发的工作流

| 作业      | 作用                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `draft`   | 校验 tag/版本/CHANGELOG，用该小节创建（或刷新）草稿发行；已发布的 tag 会被拒绝重写                                                                       |
| `gates`   | 复用 `.github/workflows/ci.yml`：`verify`（类型、lint、测试、发行布局、文档与 demo）、Docker 构建与启动/重建 smoke、Windows 类型检查/exe 构建/启动器测试 |
| `linux`   | 构建 `dist/`、打包 `Nowluma-v<version>-linux-x64-lite.tar.gz`、生成构建来源证明、上传到草稿                                                              |
| `windows` | 类型检查、构建、`tools/build-windows-exe.mjs`、运行打包后的 `deploy/windows/launcher.test.cjs`、上传 exe 与 `build.json`                                 |
| `docker`  | 构建 `linux/amd64` 镜像，只推送版本 tag `ghcr.io/<owner>/<repo>:<version>`，生成镜像来源证明，上传镜像摘要                                               |
| `publish` | 下载草稿全部产物，确认齐全，生成并上传 `SHA256SUMS`，重新下载校验；稳定版在全部校验通过后把已验证摘要提升为 `:latest`；最后发布                          |

`gates` 失败时草稿保持私有，也不会推送镜像；之后的作业失败时草稿仍保持私有，但已推送的
版本化镜像 tag 可能已经可见。

Docker smoke 使用全新 HOME，验证真实 QQ 进程发现、未确认账号不会自动接入、只有按账号
选择内核后才允许接入、同源桌面认证，以及停止/重启/重建后的数据与 HOME 持久化。真实原生
hook 接入与真实 QQ 登录在该 smoke 中是 **NOT RUN**；历史 CI 通过记录不构成本次账号验收。

## 4. 产物

| 文件                                       | 说明                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `Nowluma-v<version>-linux-x64-lite.tar.gz` | Linux x64 发行包，含 `release.json` 清单与法律文件                           |
| `Nowluma-v<version>-win-x64-lite.zip`      | Windows 更新归档，不内置 Node；与更新器使用同一资产名称                      |
| `Nowluma-win32-x64-<version>.exe`          | Windows 一键启动器，内嵌同一版本 payload；自带 Node 24 与 .NET 自包含运行时；**未签名** |
| `nowluma-win32-x64-<version>-build.json`   | Windows 构建元数据：版本、目标、Node、payload/exe 的 SHA256、`signed: false` |
| `nowluma-ghcr-linux-x64-<version>.txt`     | GHCR 镜像名、版本 tag 与 `sha256:` 摘要                                      |
| `SHA256SUMS`                               | 上述全部文件的 SHA256，发布前重新下载校验                                    |

- 镜像发布到 `ghcr.io/<owner>/<repo>:<version>`。该版本 tag 由 `docker` 作业推送，因此在
  GitHub 发行仍是草稿时就已可见；稳定版的 `:latest` 只在 `publish` 作业校验完
  `SHA256SUMS` 之后才移动。
- Linux 包、Windows 产物与容器镜像都通过 `actions/attest-build-provenance` 生成构建来源证明。
- 不发布 npm 包，也不使用 Docker Hub。发行说明取自 `CHANGELOG.md` 的对应版本小节。
- Windows exe 没有代码签名，发行说明与文档都不应声称已签名。
- 归档重新打开后会校验 `release.json`、`LICENSE`、`LICENSING.md`、`EULA.md` 与 `PRIVACY.md`；更新包不能缺少这些文件。

## 5. 仓库设置

- Settings → Actions → General → Workflow permissions：允许读写，否则 `contents: write`
  与 `packages: write` 会被仓库策略降级。工作流本身已按作业最小化权限。
- 首次推送镜像后，在 Packages 中把 `nowluma` 容器包设为 public（或按需限制访问）。
  版本化 tag 在发行草稿阶段即可见，`:latest` 要等 `publish` 校验通过后才更新。
- 保护 `main`：要求 `Nowluma PR / pr-check`、`Nowluma CI / verify`、
  `Nowluma CI / docker`、`Nowluma CI / windows` 通过。
- 保护 `v*` tag，只有维护者能创建；发行作业不会移动已存在的 tag。
- 构建来源证明在公开仓库可用；私有仓库需要相应套餐才可见。

## 6. PR 检查

`.github/workflows/pr.yml` 只检出 PR 的 base 提交，并把标题与正文作为环境变量传给
`.github/scripts/pr-check.cjs`，因此 fork 不需要任何 secret，PR 也无法修改检查脚本。
它要求：

- 标题符合 Conventional Commits（`feat(webui): ...`），类型限
  `build chore ci docs feat fix perf refactor revert style test`；
- 正文包含 `## 关联 Issue`、`## 变更说明`、`## 验证`；
- `.github/pull_request_template.md` 的检查项全部勾选；
- `## 验证` 中写下实际运行的命令与结果（模板注释不算）。

模板与检查脚本的检查项由 `.github/scripts/pr-check.test.cjs` 保持一致，改动其中一处必须
同时改另一处。完整 CI 在功能分支推送、`pull_request`、`main` 推送和 `release.yml` 的
`gates` 中运行；验证作业使用只读 token。

## 7. 已知限制

- `pnpm release` 的本地 `ci-check` 在没有 `bash`/`docker` 的机器上会跳过对应门禁并明确
  标记 NOT RUN；这些门禁仍由 `release.yml` 的 `gates` 执行，未通过时不会发布。
- Windows 只跑类型检查、exe 构建与打包后的启动器测试；完整 `pnpm test` 是 Linux 作业的
  门禁，Windows 上的历史失败仍未清理，这些测试没有被静默跳过。
- 没有生成 SBOM：仓库没有固定的 SBOM 工具，发行只提供 `SHA256SUMS` 与 `build.json`。
- Docker 镜像构建需要访问固定版本的 QQ deb（校验 SHA256，失败时回退到固定镜像），
  因此发行作业需要外网。
- 归档、镜像与 exe 都只证明构建来源与内容，不证明 QQ 账号可登录、消息可投递、重启后免扫码或重写内核可用。
- 最新 Docker smoke 使用全新 HOME：真实原生 hook 接入与真实 QQ 登录是 NOT RUN。此前 CI 的历史通过记录不能写成当前版本的真实账号验收。
- 当前源码门禁和发行状态以[Actions](https://github.com/NowLuma/NowLuma/actions)与[发行页面](https://github.com/NowLuma/NowLuma/releases)对应的源码提交为准，历史成功不能替代本次验收。
- Pages 使用工作流部署，是否上线以成功部署与实际站点 HTTP 结果为准。
- 不要用构建成功、来源证明或健康检查结果声称机器人会自动回复；回复逻辑由用户的机器人程序决定。
