---
title: First run
description: From the splash and console password through 2FA, the notices step and setting a new password, to the first account entry point.
tutorial: first-run
---

# First run

Select **Load simulator** above and use its public example credentials to practise all four setup stages. Never enter a real password in the tutorial.

![First-run notices and the unchecked confirmation control](/images/tutorials/first-run.png)

_Figure: sample notices. A real instance serves its own versioned documents._

The first visit checks the console password, then completes four browser-based stages: notices, password, display effects and account kernel.

During first setup, running and result feedback occupies a dedicated row in the document rather than covering confirmation/save controls. After setup, the same viewport returns to the workspace's bottom-right position, preserving in-flight operations, notification countdowns and keyboard focus.

## Splash

The centre shows a **Starting…** screen with skeleton placeholders while the app checks the local session and backend.

If it never leaves this screen: confirm the service is running (`bash deploy/manage.sh logs` in Docker), the port is free, and a reverse proxy preserves `/api/`. See [Troubleshooting](troubleshooting.md).

## Login

On **Sign in to the workspace**, enter the **console access password** (not the QQ password) in **Access password**, then select **Open workspace**. The eye button toggles **Show password** and **Hide password**.

- A wrong password keeps you on the sign-in screen with an error.
- Motion and glass quality are selected manually during first setup and under Settings → Appearance. Login uses the saved choices; no frame-rate detector turns motion off. System accessibility preferences still take precedence.
- Network errors or a required second factor leave you on the login page with the error preserved.

The installer or startup log prints the initial password. It is only for the first entry; after onboarding, use the password you chose.

## Two-factor authentication

When 2FA is enabled, a correct password also needs a one-time code:

| Control                             | Use                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------- |
| **Verification code**               | Six-digit authenticator code; paste the whole code into any cell        |
| **Use a recovery code**             | Switch to a one-time recovery code; hyphens are ignored                 |
| **Use a verification code instead** | Switch back to the six-digit code                                       |
| **Recovery code**                   | Each code works once; check the remaining count under account settings. |

If a second factor is rejected, correct the incorrect character without clearing the rest of the input.

## Link login

Append `?token=<access password>` to the console URL to skip manual entry. The page removes the parameter from the address bar and browser history immediately so it does not leak through Referer or screenshots.

This is a one-shot convenience, not a long-lived token. Do not share the link; use an [SSH tunnel or HTTPS](access-network.md) for remote access.

## Reading notices and setting a password

After login, **Complete first-time setup** guides you through the notices, a new access password, display effects and the account kernel.

**Choose a connection kernel** is a pre-connection step for saving a detected QQ account's kernel choice. If no account is detected, select **Continue** and choose later after signing into QQ.

### Reading the notices

- Switch between the Usage Notice and Privacy Notice under **Notices**. Each shows its **Version** and **Effective** date.
- **Confirm and continue** becomes available only after you select **I have read the Usage Notice and Privacy Notice**.
- **Exit** returns to sign-in without recording an acknowledgement. If the notices fail to load, refresh and try again; if submission fails, the screen stays open with the error.

This is an acknowledgement that you read the notices, not consent to an extra commercial contract. It does not change the GPL licence or add obligations.

### Setting the access password

- Under **Set a new access password**, enter the new password in both **New password** and **Confirm new password**. The current password is the one you just used to sign in; you do not enter it again.
- Use at least 10 characters, including lowercase, uppercase and a special character, with no spaces.
- **Save and continue** invalidates other sessions. Choose your display effects and the account kernel next.
- Reopening the wizard under developer settings is a rehearsal. **Finish rehearsal** does not change the password or notice record.

### Display effects

Choose **Motion** (**On** or **Off**) and **Glass material** (**Full glass** or **Frosted glass**), then select **Save and continue**. Neither choice is preselected. The preview changes immediately; the next stage opens only after the server confirms the save.

Motion-off retains static glass. Frosted quality reduces refraction cost without changing motion. System reduced-motion, reduced-transparency and high-contrast settings remain accessibility constraints. Developer replay previews locally, restores the previous presentation on exit, and never saves appearance.

## What happens next

1. The workspace connection workflow asks you to open or log in to QQ.
2. In **QQ sessions**, select a process and press **Load**.
3. On the first connection for that account, **Choose a connection kernel** opens. Select the option that uses the bundled native components, check the risk acknowledgement, and press **Confirm and connect**. See [QQ sessions](qq-connection.md).
4. Once the account is online, add an HTTP or WebSocket endpoint in **Bot connections**.

Use **Open QQ desktop** when the server provides a same-origin desktop. It reuses the current console session without asking for a separate VNC password. This control is not available on native Windows.

## Forgot password or lost 2FA

There is one local account and no email recovery. Reset only when you genuinely cannot sign in: this removes 2FA and existing sessions. Leave other configuration and QQ HOME intact.

For **Docker installations**, configuration lives in a named volume, not the repository's `config/` directory. Stop the service from its installation directory, then mount the same volume with the original Compose configuration and retain the authentication file:

```bash
bash deploy/manage.sh stop
docker compose --env-file deploy/.env -f deploy/docker-compose.yml run --rm --no-deps \
  --user 1000:1000 --entrypoint bash nowluma -lc '
    set -eu
    cd /app/config
    backup="webui.json.recovery-$(date -u +%Y%m%dT%H%M%SZ)"
    test -f webui.json
    test ! -e "$backup"
    mv -- webui.json "$backup"
  '
bash deploy/manage.sh start
bash deploy/manage.sh logs
```

For a **native runtime**, stop Nowluma with Ctrl+C. In the actual runtime directory containing `index.mjs`, rename `config/webui.json` to an unused backup name, then start normally. The Windows executable's runtime is under `%LOCALAPPDATA%\Nowluma`; do not edit an unused copy in Downloads.

Read the startup log for the new initial password and complete first-run setup. Keep the old file. To roll back, stop the service before restoring its original name; its old password, 2FA and sessions return too. `NOWLUMA_WEBUI_BOOTSTRAP_PASSWORD` only supplies an initial password when `webui.json` is absent; it does not override existing authentication.

## Notice status failed to load

If the page says **Could not load agreement status**, the console cannot confirm the notice state. It refuses entry rather than bypassing the required acknowledgement.

- **Reload** retries.
- **Sign out** returns to sign-in.
- Check `/api/agreements`, reverse-proxy path rewriting, and server time.

## Save and restart

| Action                 | Stored in                          | Restart?                  |
| ---------------------- | ---------------------------------- | ------------------------- |
| Notice acknowledgement | Server config                      | No                        |
| Password change        | scrypt hash in `config/webui.json` | No; other sessions expire |
| Enable/disable 2FA     | `config/webui.json`                | No                        |
| Log out                | Current browser session only       | No                        |
