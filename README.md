# Nowluma

<p align="center">
  <img src="assets/readme/hero.svg" alt="Nowluma" width="720" />
</p>

连接 QQ 客户端，提供 OneBot v11 接口，在一个浏览器控制台里管理账号、连接、日志和桌面。

[下载发行包](https://github.com/NowLuma/NowLuma/releases) · [中文文档](https://nowluma.github.io/NowLuma/zh/) · [English docs](https://nowluma.github.io/NowLuma/en/) · [部署指南](deploy/README.md) · [参与开发](CONTRIBUTING.md)

## 开始使用

| 环境         | 安装方式                               | 运行要求                                      |
| ------------ | -------------------------------------- | --------------------------------------------- |
| Windows x64  | 双击 `Nowluma.exe`，在浏览器进入控制台 | 已内置运行环境，无需安装 Node、.NET 或 Docker |
| Linux x64    | 解压 Lite 包，运行 `bash launcher.sh`  | Node.js `24.22.1`（24.x）或 `>=26.12.1`       |
| Linux Docker | 从源码目录运行下方安装向导             | Docker Engine 与 Compose v2，向导可协助安装   |

```bash
bash deploy/install.sh --docker
```

向导先选择中文或 English，再检查 Docker、选择安装来源，并配置访问地址、端口和时区。执行安装脚本前会展示命令。`deploy/install.sh` 位于源码仓库，不包含在 Lite 包中。

默认通过本机或 SSH 隧道访问：控制台与 QQ 桌面 **5099**、机器人 HTTP **3000**、WebSocket **3001**。

1. 打开安装结果中的控制台地址，使用初始密码完成首次设置。
2. 点击 **打开 QQ 桌面**，在 QQ 窗口登录；桌面直接使用控制台会话。
3. 在 **QQ 会话** 中选择进程并加载；第一次为该账号接入时，需要主动确认账号内核风险。
4. 在 **机器人连接** 中为账号添加 HTTP 或 WebSocket 端点，把地址与令牌填进机器人程序。

Windows 启动器可使用本机 QQ；已有可用的 Linux Docker 引擎时，也可选择容器桌面。程序文件位于 `%LOCALAPPDATA%\Nowluma`。当前 EXE 未签名，下载后可用发行页的 `SHA256SUMS` 核对文件。

## 一个控制台，照顾日常操作

- **工作台**：连接工作流、运行读数、可编辑部件与浮动主导航。
- **QQ 会话**：选择进程、接入账号、确认账号内核、打开桌面。
- **机器人连接**：按账号配置消息行为与 HTTP / WebSocket 端点。
- **运行记录**：实时日志、预设与导出，核对连接结果。
- **调试工具**：接口调用、消息构建和活动记录。
- **偏好设置**：外观、手动显示效果、无障碍、账号安全、通知、存储、服务与更新。

账号内核按真实 QQ 号保存：`兼容内核` 需要主动勾选风险确认，`重写内核` 当前显示为 `暂不可用`，不会静默回退。保存内核选择不等于接入，仍需在 **QQ 会话** 中加载或重连。

界面以稳定纸面组织内容，玻璃用于导航与短操作。动效与完整/磨砂玻璃在首次设置和外观页面分别手动选择，不按帧率自动启停；主题、强调色和现有调色板仍可调整。

发送纯文本 `#nl` 可查看版本、平台和运行时间。在 **机器人连接 → 消息行为** 中可关闭内置状态回复。

双语文档由 VitePress 构建，共 18 章。每篇教程正文上方内嵌对应的逐步操作引导，并配有实际界面截图；`/demo/` 保留为独立浏览入口。模拟器复用真实控制台组件，使用内存中的示例数据。

## 运行与数据

```bash
bash deploy/manage.sh start       # 启动
bash deploy/manage.sh restart     # 重启并检查状态
bash deploy/manage.sh stop        # 停止，保留数据
bash deploy/manage.sh logs        # 查看日志
bash deploy/manage.sh doctor      # 部署诊断
```

程序设置、消息与媒体、日志分别保存在 `config/`、`data/`、`logs/`。Docker 另外完整保留 QQ 的 `/home/nowluma` 用户目录；升级时同时保留程序数据卷和 QQ HOME 卷。

**重启不要使用 `docker compose down -v`，该命令会删除数据卷。** QQ 自动登录由 QQ 自己管理，过期或要求验证时仍需在 QQ 窗口完成。

桌面通过同源 `/desktop/` 访问，无需输入 VNC 密码，也无需额外开放桌面端口。远程访问、备份与故障恢复见[部署指南](deploy/README.md)。

容器 smoke 使用全新 HOME，验证进程发现、未确认账号的接入门禁、桌面认证和重建持久化；它不伪造账号确认，因此真实 hook 接入与真实 QQ 登录仍是单独的实机验证项，不能据此声称消息必达或重启一定免扫码。

## 使用与许可

Nowluma 是独立的第三方项目，与腾讯及 QQ 无隶属、合作、授权或背书关系。使用 QQ 客户端、账号与第三方服务时，请遵守 QQ 用户协议及适用法律。

软件按现状提供。使用者负责自己的账号、数据与操作；项目不保证自动登录、消息投递或账号不受限制。

源码采用 **GNU 通用公共许可证第 3 版（GPL-3.0-only）**：可自由使用、研究、修改与分发，包括商业用途，无需额外授权；分发时遵守 GPLv3 的源码与许可要求。根目录 [LICENSE](LICENSE) 是 GNU 发布的 GPLv3 标准全文，未作修改。随包的预编译原生组件与第三方组件不属于 GPL 源码，各自条款见 [LICENSING.md](LICENSING.md)；[使用说明](EULA.md)与[隐私说明](PRIVACY.md)分别说明运行边界与数据处理。

侵权投诉：**ws675170761@gmail.com**（仅用于侵权投诉；源码与使用问题请通过 GitHub issues 提出，不要附带个人信息）。

本项目参考了 **SnowLuma** 的实现思路。
