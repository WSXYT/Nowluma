#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE=docker
MODE_SELECTED=0
RELEASE_DIR="$SCRIPT_DIR/../dist"
LANGUAGE=''
TEMPORARY=''
DOCKER=(docker)
SUDO_MANAGE=0

msg() {
    local format=$1
    [[ $LANGUAGE != en ]] || format=$2
    shift 2
    printf "$format\n" "$@"
}
prompt() {
    msg "$1" "$2" >&2
    case "$3" in y) printf '[Y/n]: ' >&2 ;; n) printf '[y/N]: ' >&2 ;; *) printf '[%s]: ' "$3" >&2 ;; esac
    if ! read -r ANSWER; then msg '输入已结束，安装取消。' 'Input ended; installation cancelled.' >&2; exit 1; fi
    ANSWER=${ANSWER:-$3}
}
confirm() {
    while true; do
        prompt "$1" "$2" y
        case "$ANSWER" in y|Y|yes|YES) return 0 ;; n|N|no|NO) return 1 ;; esac
        msg '请输入 y 或 n。' 'Enter y or n.' >&2
    done
}
fail() { msg "$1" "$2" >&2; exit 1; }
root_run() {
    if [[ $(id -u) == 0 ]]; then "$@";
    else command -v sudo >/dev/null || fail '需要 root 或 sudo。' 'Root or sudo is required.'; sudo "$@"; fi
}
cleanup() { [[ -z $TEMPORARY ]] || rm -rf -- "$TEMPORARY"; }
trap cleanup EXIT

while [[ $# -gt 0 ]]; do
    case "$1" in
        --docker|--native)
            [[ $MODE_SELECTED == 0 ]] || { echo 'Choose only one mode: --docker or --native' >&2; exit 2; }
            MODE=${1#--}; MODE_SELECTED=1; shift ;;
        --directory) [[ $# -ge 2 ]] || { echo '--directory requires a path' >&2; exit 2; }; RELEASE_DIR=$2; shift 2 ;;
        --lang) [[ $# -ge 2 && $2 =~ ^(zh|en)$ ]] || { echo '--lang zh|en' >&2; exit 2; }; LANGUAGE=$2; shift 2 ;;
        -h|--help) printf '%s\n' 'Nowluma: bash install.sh [--docker | --native --directory PATH] [--lang zh|en]'; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
    esac
done
if [[ -z $LANGUAGE ]]; then
    printf '\nNowluma — 1. 简体中文  2. English\n' >&2
    while true; do
        printf 'Language / 语言 [1]: ' >&2
        read -r ANSWER || exit 1
        case "${ANSWER:-1}" in 1|zh|zh-CN) LANGUAGE=zh; break ;; 2|en) LANGUAGE=en; break ;; esac
    done
fi
msg '\nNowluma 安装向导' '\nNowluma installation wizard'
[[ $(uname -s) == Linux ]] || fail '此安装脚本用于 Linux。Windows 请使用一键运行 exe。' 'This installer is for Linux. Use the one-click exe on Windows.'

if [[ $MODE == native ]]; then
    [[ -f "$RELEASE_DIR/index.mjs" && -f "$RELEASE_DIR/launcher.sh" ]] || fail '请用 --directory 指定解压后的 Linux 发行目录。' 'Use --directory to select an extracted Linux release.'
    cd "$RELEASE_DIR"
    node_bin=$(command -v node || true)
    [[ ! -x ./node ]] || node_bin=./node
    [[ -n $node_bin ]] || fail '需要随包 Node，或 Node.js 24.22.1 / 26.12.1 以上。' 'Bundled Node or Node.js 24.22.1 / 26.12.1+ is required.'
    "$node_bin" ./check-node-version.cjs
    "$node_bin" -e "const fs=require('node:fs'); const r=JSON.parse(fs.readFileSync('release.json','utf8')); if(r.target!=='linux-'+process.arch) throw new Error('Release platform mismatch');"
    msg '请在 QQ 窗口登录并勾选自动登录。正在启动控制台……' 'Sign in using QQ and enable automatic login. Starting the console…'
    exec bash ./launcher.sh
fi

if ! command -v docker >/dev/null 2>&1; then
    msg '未检测到 Docker。' 'Docker was not found.'
    prompt '是否使用第三方 LinuxMirrors 安装脚本并配置 Docker 镜像源？y=使用，n=官方安装。' 'Use the third-party LinuxMirrors installer and configure registry mirrors? y=mirrors, n=official installer.' n
    case "$ANSWER" in
        y|Y|yes|YES)
            msg '将执行第三方脚本，镜像源等选项由你在该脚本中选择：' 'This is a third-party script. Choose its mirror/options yourself:'
            msg '该脚本也可能询问关闭防火墙/SELinux；这不是 Nowluma 的要求，请按需选择。' 'It may also ask to disable the firewall/SELinux; Nowluma does not require that. Choose as needed.'
            printf '%s\n' 'bash <(curl -sSL https://linuxmirrors.cn/docker.sh)'
            confirm '是否继续执行？' 'Run this command?' || { msg '已取消安装。' 'Installation cancelled.'; exit 0; }
            root_run bash -c 'bash <(curl -sSL https://linuxmirrors.cn/docker.sh)'
            ;;
        n|N|no|NO)
            msg '将执行 Docker 官方安装脚本，不额外配置镜像源：' 'The official Docker installer will run without an added registry mirror:'
            printf '%s\n' 'curl -fsSL https://get.docker.com | bash -s docker'
            confirm '是否继续执行？' 'Run this command?' || { msg '已取消安装。' 'Installation cancelled.'; exit 0; }
            curl -fsSL https://get.docker.com | root_run bash -s docker
            ;;
        *) fail '请输入 y 或 n，重新运行安装脚本。' 'Enter y or n and rerun the installer.' ;;
    esac
    command -v docker >/dev/null || fail 'Docker 安装未完成，请查看上面的安装输出。' 'Docker installation did not complete. Check the output above.'
else
    msg '已检测到 Docker，保留已有 Docker 和镜像源设置。' 'Docker detected; keeping its existing configuration and mirrors.'
fi

if ! docker compose version >/dev/null 2>&1; then
    confirm '缺少 Docker Compose v2，是否安装插件？' 'Docker Compose v2 is missing. Install the plugin?' || exit 0
    if command -v apt-get >/dev/null; then root_run apt-get update; root_run apt-get install -y docker-compose-plugin || root_run apt-get install -y docker-compose-v2
    elif command -v dnf >/dev/null; then root_run dnf install -y docker-compose-plugin
    elif command -v yum >/dev/null; then root_run yum install -y docker-compose-plugin
    elif command -v apk >/dev/null; then root_run apk add docker-cli-compose
    elif command -v pacman >/dev/null; then root_run pacman -S --needed --noconfirm docker-compose
    elif command -v zypper >/dev/null; then root_run zypper --non-interactive install docker-compose
    else fail '请安装 Docker Compose v2 后重新运行。' 'Install Docker Compose v2 and rerun the installer.'; fi
    docker compose version >/dev/null 2>&1 || fail 'Compose v2 仍不可用，请查看安装输出。' 'Compose v2 is still unavailable. Check the installation output.'
fi
if ! docker info >/dev/null 2>&1; then
    if [[ $(id -u) != 0 ]] && command -v sudo >/dev/null && sudo docker info >/dev/null 2>&1; then
        DOCKER=(sudo docker); SUDO_MANAGE=1
    else
        command -v systemctl >/dev/null || fail 'Docker 服务不可用，请先启动 Docker。' 'Docker is unavailable; start its daemon first.'
        confirm 'Docker 服务未运行，是否启动并设置开机启动？' 'Docker is not running. Start it and enable it on boot?' || exit 0
        root_run systemctl enable --now docker
        if ! docker info >/dev/null 2>&1; then DOCKER=(sudo docker); SUDO_MANAGE=1; fi
        "${DOCKER[@]}" info >/dev/null || fail 'Docker 服务仍不可用。' 'Docker is still unavailable.'
    fi
fi

# A curl/process-substitution launch has no checkout; fetch into a user-selected directory.
if [[ ! -f "$SCRIPT_DIR/docker-compose.yml" ]]; then
    prompt 'Nowluma 安装目录（已有安装将复用）：' 'Nowluma installation directory (existing installations are reused):' "$HOME/Nowluma"
    install_dir=$ANSWER
    if [[ ! -f "$install_dir/deploy/docker-compose.yml" ]]; then
        [[ ! -e $install_dir || -d $install_dir && -z $(ls -A "$install_dir") ]] || fail '目录不是空目录或 Nowluma 安装，请选择另一个目录。' 'Choose an empty directory or an existing Nowluma installation.'
        command -v curl >/dev/null || fail '需要 curl 下载源码。' 'curl is required to download the source.'
        TEMPORARY=$(mktemp -d)
        msg '正在下载 Nowluma 源码……' 'Downloading Nowluma source…'
        curl --fail --location --retry 2 https://codeload.github.com/NowLuma/NowLuma/tar.gz/refs/heads/main --output "$TEMPORARY/source.tar.gz"
        tar -tzf "$TEMPORARY/source.tar.gz" > "$TEMPORARY/files"
        if grep -Eq '(^/|(^|/)\.\.(/|$))' "$TEMPORARY/files"; then fail '源码压缩包路径无效。' 'Invalid source archive paths.'; fi
        mkdir "$TEMPORARY/source"
        tar -xzf "$TEMPORARY/source.tar.gz" --strip-components=1 -C "$TEMPORARY/source"
        [[ -f "$TEMPORARY/source/deploy/docker-compose.yml" ]] || fail '下载的源码不完整。' 'The downloaded source is incomplete.'
        mkdir -p "$install_dir"
        cp -a "$TEMPORARY/source/." "$install_dir/"
    fi
    SCRIPT_DIR="$(cd "$install_dir/deploy" && pwd)"
fi
cd "$SCRIPT_DIR"
[[ ! -L .env ]] || fail '.env 不能是符号链接。' '.env must not be a symbolic link.'
read_env() { awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); sub(/\r$/, ""); value=$0 } END { print value }' .env; }
read_port() {
    while true; do
        prompt "$1" "$2" "$3"
        if [[ $ANSWER =~ ^[1-9][0-9]{0,4}$ ]] && ((10#$ANSWER <= 65535)); then return; fi
        msg '端口必须为 1–65535。' 'Port must be 1–65535.' >&2
    done
}
if [[ ! -f .env ]]; then
    prompt '访问方式：1. 仅本机/SSH（推荐）  2. 局域网' 'Access: 1. Localhost/SSH (recommended)  2. LAN' 1
    case "$ANSWER" in 1) bind_address=127.0.0.1 ;; 2) bind_address=0.0.0.0 ;; *) fail '访问方式必须为 1 或 2。' 'Access must be 1 or 2.' ;; esac
    [[ $bind_address != 0.0.0.0 ]] || msg '局域网 HTTP 未加密；远程访问建议使用 SSH 或 HTTPS。' 'LAN HTTP is unencrypted; use SSH or HTTPS for remote access.'
    while true; do
        read_port '控制台与 QQ 桌面端口：' 'Console and QQ desktop port:' 5099; webui_port=$ANSWER
        read_port '机器人 HTTP 接口端口：' 'Bot HTTP endpoint port:' 3000; http_port=$ANSWER
        read_port '机器人 WebSocket 接口端口：' 'Bot WebSocket endpoint port:' 3001; ws_port=$ANSWER
        [[ $webui_port == "$http_port" || $webui_port == "$ws_port" || $http_port == "$ws_port" ]] || break
        msg '三个端口不能重复，请重新填写。' 'The three ports must be different. Try again.'
    done
    timezone=UTC; [[ $LANGUAGE != zh ]] || timezone=Asia/Shanghai
    prompt '时区：' 'Timezone:' "$timezone"; timezone=$ANSWER
    [[ $timezone =~ ^[A-Za-z0-9_+/-]+$ && $timezone != *..* ]] || fail '时区无效。' 'Invalid timezone.'
    printf '%s\n' "NOWLUMA_LANG=$LANGUAGE" "BIND_ADDRESS=$bind_address" "WEBUI_PORT=$webui_port" \
        "ONEBOT_HTTP_PORT=$http_port" "ONEBOT_WS_PORT=$ws_port" "TZ=$timezone" > .env
    chmod 600 .env
else
    msg '已有部署设置、账号与 QQ 用户目录将保留，不会重置密码。' 'Keeping deployment settings, accounts and QQ HOME; passwords will not be reset.'
    bind_address=$(read_env BIND_ADDRESS); bind_address=${bind_address:-127.0.0.1}
    webui_port=$(read_env WEBUI_PORT); webui_port=${webui_port:-5099}
fi

msg '首次构建会下载 Node、QQ 和依赖，请等待启动检查完成。' 'The first build downloads Node, QQ and dependencies. Please wait for the startup check.'
started_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
if [[ $SUDO_MANAGE == 1 ]]; then
    if ! sudo env NOWLUMA_LANG="$LANGUAGE" bash "$SCRIPT_DIR/manage.sh" start; then fail '启动失败，数据已保留。请运行 manage.sh logs 查看原因。' 'Startup failed; data is preserved. Run manage.sh logs for details.'; fi
else
    if ! NOWLUMA_LANG="$LANGUAGE" bash "$SCRIPT_DIR/manage.sh" start; then fail '启动失败，数据已保留。请运行 manage.sh logs 查看原因。' 'Startup failed; data is preserved. Run manage.sh logs for details.'; fi
fi
initial_password=$("${DOCKER[@]}" compose -f "$SCRIPT_DIR/docker-compose.yml" logs --no-color --since "$started_at" nowluma 2>/dev/null | sed -n 's/.*initial credentials: user=admin password=\([a-f0-9]\{16\}\).*/\1/p' | tail -1) || initial_password=''
msg '\nNowluma 已启动。' '\nNowluma is running.'
if [[ -n $initial_password ]]; then msg '控制台初始密码：%s' 'Initial console password: %s' "$initial_password";
else msg '控制台密码保持不变；首次凭据可在 manage.sh logs 中查看。' 'Your console password is unchanged; first-run credentials are available in manage.sh logs.'; fi
published_port=$("${DOCKER[@]}" compose -f "$SCRIPT_DIR/docker-compose.yml" port nowluma 5099 2>/dev/null | head -1 | awk -F: '{print $NF}') || published_port=''
[[ ! $published_port =~ ^[1-9][0-9]{0,4}$ ]] || webui_port=$published_port
host=127.0.0.1
if [[ $bind_address == 0.0.0.0 ]]; then host=$(hostname -I 2>/dev/null | awk '{print $1}') || host=''; host=${host:-SERVER_IP}; fi
[[ $host != *:* ]] || host="[$host]"
msg '控制台地址：http://%s:%s' 'Console: http://%s:%s' "$host" "$webui_port"
msg '登录控制台后完成首次设置，点“打开 QQ 桌面”扫码，不需要额外 VNC 密码。' 'Complete console setup, then click “打开 QQ 桌面” (Open QQ desktop) and scan. No extra VNC password is required.'
msg '在 QQ 设置中勾选自动登录。服务重启会保留相同 QQ 用户目录。' 'Enable automatic login in QQ. Restarts reuse the same QQ HOME.'
msg '安装目录：%s' 'Installation directory: %s' "$(dirname "$SCRIPT_DIR")"
msg '日常命令（在安装目录执行）：' 'Daily commands (from the installation directory):'
prefix=''; [[ $SUDO_MANAGE == 0 ]] || prefix='sudo '
for action in start stop restart logs doctor; do
    printf '%sbash deploy/manage.sh %s\n' "$prefix" "$action"
done
if [[ $bind_address == 127.0.0.1 ]]; then
    msg '远程服务器：在自己电脑执行以下 SSH 命令，再打开本机控制台地址。' 'Remote server: run this SSH command on your computer, then open the local console URL.'
    printf 'ssh -L %s:127.0.0.1:%s USER@SERVER\n' "$webui_port" "$webui_port"
fi
