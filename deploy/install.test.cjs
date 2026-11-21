const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const posix = (value) =>
  value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const source = __dirname;
function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-install-test-'));
  const deploy = path.join(root, 'checkout with spaces', 'deploy');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(deploy, { recursive: true });
  fs.mkdirSync(bin);
  for (const file of ['install.sh', 'manage.sh', 'docker-compose.yml'])
    fs.copyFileSync(path.join(source, file), path.join(deploy, file));
  const log = path.join(root, 'calls');
  const missing = path.join(root, 'docker-missing');
  const composeMissing = path.join(root, 'compose-missing');
  const daemonStopped = path.join(root, 'daemon-stopped');
  if (options.daemonStopped) fs.writeFileSync(daemonStopped, '');
  if (options.missing) fs.writeFileSync(missing, '');
  if (options.composeMissing) fs.writeFileSync(composeMissing, '');
  function script(name, content) {
    fs.writeFileSync(path.join(bin, name), `#!/bin/bash\nset -e\n${content}\n`, { mode: 0o755 });
  }
  script('uname', 'echo Linux');
  script(
    'id',
    'if [[ $NON_ROOT == 1 && ${SUDO_TEST_ROOT:-0} != 1 ]]; then echo 1000; else echo 0; fi',
  );
  script('sudo', 'printf "sudo %s\\n" "$*" >> "$TEST_LOG"; export SUDO_TEST_ROOT=1; exec "$@"');
  script('systemctl', 'printf "systemctl %s\\n" "$*" >> "$TEST_LOG"; rm -f -- "$DAEMON_STOPPED"');
  script('hostname', 'echo 192.0.2.10');
  script(
    'docker',
    `printf 'docker %s\\n' "$*" >> "$TEST_LOG"
if [[ $1 == info && ( -f $DAEMON_STOPPED || $NON_ROOT == 1 && \${SUDO_TEST_ROOT:-0} != 1 ) ]]; then exit 1; fi
if [[ $1 == compose && $2 == version && -f $COMPOSE_MISSING ]]; then exit 1; fi
if [[ $* == *' up '* && $FAIL_START == 1 ]]; then exit 1; fi
if [[ $* == *' logs '* && $* != *--follow* && $NO_INITIAL != 1 ]]; then echo 'initial credentials: user=admin password=0123456789abcdef'; fi
if [[ $* == *' port '* ]]; then
  port=$(awk -F= '$1 == "WEBUI_PORT" { value=$2 } END { print value }' .env)
  echo "127.0.0.1:\${port:-5099}"
fi`,
  );
  script(
    'curl',
    `printf 'curl %s\\n' "$*" >> "$TEST_LOG"
if [[ $* == *get.docker.com* || $* == *linuxmirrors.cn/docker.sh* ]]; then
  printf 'rm -f -- "%s"\\n' "$DOCKER_MISSING"
else
  while [[ $# -gt 0 ]]; do if [[ $1 == --output ]]; then cp "$SOURCE_ARCHIVE" "$2"; exit 0; fi; shift; done
  exit 1
fi`,
  );
  script('apt-get', 'printf "apt-get %s\\n" "$*" >> "$TEST_LOG"; rm -f -- "$COMPOSE_MISSING"');
  const runner = path.join(root, 'run.sh');
  fs.writeFileSync(
    runner,
    `#!/bin/bash
export PATH="$TEST_BIN:/usr/bin:/bin"
command() {
  if [[ $1 == -v && $2 == docker && -f $DOCKER_MISSING ]]; then return 1; fi
  builtin command "$@"
}
installer=$1
shift
source "$installer" "$@"
`,
  );
  const env = {
    ...process.env,
    PATH: `${posix(bin)}:/usr/bin:/bin`,
    HOME: posix(path.join(root, 'home')),
    TEST_BIN: posix(bin),
    TEST_LOG: posix(log),
    DOCKER_MISSING: posix(missing),
    COMPOSE_MISSING: posix(composeMissing),
    FAIL_START: options.failStart ? '1' : '0',
    SOURCE_ARCHIVE: '',
    NON_ROOT: options.nonRoot ? '1' : '0',
    NO_INITIAL: options.noInitial ? '1' : '0',
    DAEMON_STOPPED: posix(daemonStopped),
  };
  const run = (input, args = []) => {
    const result = spawnSync(
      bash,
      [posix(runner), posix(path.join(deploy, 'install.sh')), ...args],
      { input, env, encoding: 'utf8', timeout: 20000 },
    );
    if (result.error) throw result.error;
    return { ...result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  };
  return {
    root,
    deploy,
    bin,
    env,
    run,
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
function using(options, body) {
  const f = fixture(options);
  try {
    body(f);
  } finally {
    f.dispose();
  }
}

test('asks language first, reuses Docker and writes default English setup with no VNC secret', () =>
  using({}, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /^\s*Nowluma — 1\. 简体中文 {2}2\. English/);
    assert.match(result.stdout, /Docker detected/);
    assert.match(result.stdout, /Initial console password: 0123456789abcdef/);
    assert.match(result.stdout, /No extra VNC password/);
    const config = fs.readFileSync(path.join(f.deploy, '.env'), 'utf8');
    assert.match(config, /NOWLUMA_LANG=en/);
    assert.match(config, /TZ=UTC/);
    assert.match(config, /WEBUI_PORT=5099/);
    assert.doesNotMatch(config, /VNC_|PASSWORD/);
    assert.doesNotMatch(result.calls, /curl |down -v/);
  }));

test('official Docker install is selected without mirrors and Enter confirms y', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /curl -fsSL https:\/\/get\.docker\.com \| bash -s docker/);
    assert.match(result.calls, /curl -fsSL https:\/\/get\.docker\.com/);
    assert.doesNotMatch(result.calls, /linuxmirrors/);
  }));

test('mirror installer is clearly third-party and runs only when selected', () =>
  using({ missing: true }, (f) => {
    const result = f.run('1\ny\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /将执行第三方脚本/);
    assert.match(result.calls, /curl -sSL https:\/\/linuxmirrors\.cn\/docker\.sh/);
    assert.doesNotMatch(result.calls, /get\.docker\.com/);
    assert.match(fs.readFileSync(path.join(f.deploy, '.env'), 'utf8'), /TZ=Asia\/Shanghai/);
  }));

test('n declines Docker installation without changing settings', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\nn\nn\n');
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Installation cancelled/);
    assert.doesNotMatch(result.calls, /curl /);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('EOF is not an Enter confirmation and never runs the remote installer', () =>
  using({ missing: true }, (f) => {
    const result = f.run('2\nn\n');
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.calls, /curl /);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), false);
  }));

test('checks and installs missing Compose v2 using the package manager', () =>
  using({ composeMissing: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /apt-get install -y docker-compose-plugin/);
  }));

test('validates ports, supports LAN/custom values and keeps the selected console address', () =>
  using({}, (f) => {
    const result = f.run('2\n2\ninvalid\n6099\n3800\n3801\nUTC\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stderr, /Port must be 1–65535/);
    const config = fs.readFileSync(path.join(f.deploy, '.env'), 'utf8');
    assert.match(config, /BIND_ADDRESS=0.0.0.0/);
    assert.match(config, /WEBUI_PORT=6099/);
    assert.match(config, /ONEBOT_HTTP_PORT=3800/);
    assert.match(config, /ONEBOT_WS_PORT=3801/);
    assert.match(result.stdout, /http:\/\/192\.0\.2\.10:6099/);
  }));

test('a repeated install preserves existing .env byte-for-byte and uses its port', () =>
  using({ noInitial: true }, (f) => {
    const config =
      'BIND_ADDRESS=127.0.0.1\nWEBUI_PORT=6099\nONEBOT_HTTP_PORT=3800\nCUSTOM=do-not-touch\n';
    fs.writeFileSync(path.join(f.deploy, '.env'), config);
    const result = f.run('2\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(fs.readFileSync(path.join(f.deploy, '.env'), 'utf8'), config);
    assert.match(result.stdout, /http:\/\/127\.0\.0\.1:6099/);
    assert.match(result.stdout, /Your console password is unchanged/);
    assert.doesNotMatch(result.stdout, /Initial console password:/);
  }));

test('startup errors stay failures and preserve generated settings', () =>
  using({ failStart: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Startup failed; data is preserved/);
    assert.doesNotMatch(result.stdout, /Nowluma is running/);
    assert.equal(fs.existsSync(path.join(f.deploy, '.env')), true);
  }));

test('non-root Docker access uses sudo and reports working daily commands', () =>
  using({ nonRoot: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /sudo docker info/);
    assert.match(result.stdout, /sudo bash deploy\/manage.sh/);
  }));

test('asks before starting a stopped Docker daemon and checks it again', () =>
  using({ daemonStopped: true }, (f) => {
    const result = f.run('2\n\n\n\n\n\n\n');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.calls, /systemctl enable --now docker/);
  }));

test('a standalone downloaded installer fetches the source into the chosen directory', () =>
  using({}, (f) => {
    const archive = path.join(f.root, 'source.tar.gz');
    const pack = spawnSync(
      bash,
      ['-c', 'tar -czf "$1" -C "$2" "checkout with spaces"', 'tar', posix(archive), posix(f.root)],
      { env: f.env, encoding: 'utf8' },
    );
    assert.equal(pack.status, 0, pack.stderr);
    f.env.SOURCE_ARCHIVE = posix(archive);
    fs.rmSync(path.join(f.deploy, 'docker-compose.yml'));
    const target = path.join(f.root, 'downloaded install');
    const result = f.run(`2\n${posix(target)}\n\n\n\n\n\n`);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(fs.existsSync(path.join(target, 'deploy', '.env')), true);
    assert.match(
      result.calls,
      /^curl .+ https:\/\/codeload\.github\.com\/NowLuma\/NowLuma\/tar\.gz\/refs\/heads\/main /m,
    );
  }));
