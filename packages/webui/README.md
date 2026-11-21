# Nowluma WebUI

Nowluma's browser console is a Vite + React application for managing runtime
status, OneBot configuration, logs, storage, and server settings.

## Default appearance

New installations and appearance resets use a neutral white accent; light mode
uses dark ink for readable labels. Existing saved accents and custom colors are
preserved. Named palettes and the original colored accent options remain
available in Settings.

With the default palette, page, card, input, popover and sidebar surfaces remain
neutral. Text stays neutral for readability. Sidebar-only accents tint only the
sidebar; OLED keeps a true-black canvas. Named palettes, custom CSS variables and
host appearance overlays retain control of their own surfaces.

Keep the shared defaults in `packages/common/src/webui-appearance.ts`, their backend
and frontend consumers, and the pre-mount tokens in `src/index.css` aligned when
changing the default accent.

The browser favicon, home-screen icon and in-app logo use the single monochrome
mark in [`src/assets/nowluma-mark.svg`](src/assets/nowluma-mark.svg),
imported through `src/brand.ts` so Vite applies the deployment base. The Apple
touch fallback is exported at 180 px from the same mark; do not add a second
master or redraw the mark per size.

Reading blocks and forms use a stable paper/ink hierarchy with quiet hairlines.
Only navigation, search and short menus use optical chrome. Login and first setup
share a portrait field sampled from the canonical mark: source brightness chooses
four discrete vertical stroke widths, rather than masking an ordinary logo over
a column-weighted lattice. The source raster is cached once and rendered as four
SVG paths; no canvas runs per animation frame. See [the design contract](DESIGN.md)
for material, motion and layout boundaries.
Background strokes stay subdued so the sampled mark is readable in both themes;
decorative lenses never cover it. Pointer glints keep spring-driven position and
opacity through entry, exit and rapid reversal, without resetting their coordinates.

Motion and full/frosted glass are manual choices shared by first setup and
Settings. The `disableMotion` preference is the single on/off owner; OS/manual
accessibility reduction remains independent. No FPS sampling changes the UI.
Older `auto` quality preferences become full glass without overwriting saved
motion, theme, layout or other settings. OOBE has four stages: notices, access
password, display effects and account kernel; previews restore the underlying
appearance on exit, and developer replay never persists it.

## Host appearance integration

`NOWLUMA_WEBUI_TARGET=maibot` opts a deployment into a reversible millennium
appearance overlay. Standalone defaults are unchanged. Hosts drive live light/dark
updates without saving over personal preferences or adding another selector.
See [the integration contract and extension guide](INTEGRATIONS.md) before changing
target startup, theme ownership, host messaging or scoped styles.

## Interaction conventions

- Destructive actions and second confirmations stay in modal dialogs.
- Operations that may take time show a running state; completed and failed operations
  show result notices with a visible countdown.
- First setup hosts this same viewport inside the document so notices cannot cover
  its primary actions. Outside setup it floats at the bottom right. Moving the owned
  portal preserves countdowns, dismissal, keyboard focus and in-flight feedback.
- Routine, high-frequency adjustments should not generate a notice for every
  intermediate edit.
- Foreground polling pauses in hidden tabs and waits for each request to finish
  before scheduling the next. Connection-state polling runs only while SSE clients
  are subscribed.
- Data-backed surfaces use the Interior Skeleton Swap defaults (120 ms delay,
  380 ms minimum visibility) so fast local responses do not flash a placeholder.
  Submission, upload, and other explicit operation progress keeps its spinner.
- Variable-height content must release the skeleton's reserved box after it is
  ready; do not introduce a second scrolling region inside the page.
- The single primary dock owns route navigation; workspace management remains a
  secondary sheet and returns keyboard focus to its session trigger on close.
- Failures must remain visible in the affected control and in the operation
  result; do not convert failed responses into successful feedback.
- JSON endpoints must return an object. Malformed or non-object responses are
  reported as errors rather than displayed as empty lists or default settings.
- Configuration responses include `config`; saves also report `saved`, `applied`,
  `online`, `errors`, and `message`. The UI uses these fields without legacy aliases
  or a second request after saving.
- Password change flows use floating labels and inline validation consistently.
- Password strength details appear only while the new-password field has focus
  and leave with the same motion language when focus moves away.
- The first-run wizard keeps agreement text as the primary reading surface and
  aligns each step's actions inside one responsive footer. Settings includes a
  visible developer page for safely replaying this wizard and exercising the
  page-level crash screen; replayed consent and passwords are never persisted.

## Authentication behind a reverse proxy

Authenticated WebUI requests send the session token in `X-Nowluma-Token`, leaving
`Authorization` available for the reverse proxy's HTTP authentication (such as
Nginx Basic Auth). Forward `X-Nowluma-Token` unchanged if the proxy filters
request headers. The backend still accepts `Authorization: Bearer <token>` for
existing clients when the dedicated header is absent. Both layers still require
their own valid credentials.

Late authentication failures from an old session do not sign out a newer session.
Live streams release subscriptions on disconnect and pause with the page.
Malformed stream data is reported; a debug stream invocation fails instead of silently succeeding.

## Authenticated QQ desktop

Docker serves noVNC at `/desktop/` on the console's origin. The browser uses an
HttpOnly, Strict, path-scoped session cookie; it never receives the private VNC
password. The gateway authenticates to loopback VNC before bridging binary RFB.
Both HTTP assets and WebSocket upgrades enforce the real session, consent and
password gates. Upgrades require a matching Origin/Host; revoked sessions cannot
send input or receive new frames, and idle connections are closed.

Keep `/desktop/` and Host (including a non-default port) intact in reverse proxies.
Do not publish backend VNC or restore the legacy unauthenticated 6080 listener.
External desktop URLs remain operator-managed and are not given console cookies.

## First-run guidance panel

The overview page renders `GettingStartedPanel` at a fixed position above the grid.
It is not a layout widget, so hiding every card or switching to the mobile layout
never removes it.

The panel consumes only data the page already has (`processList`, `qqList`,
`connections`, `resources`, `processOps`). Adding a backend endpoint for it is a
regression, not a feature.

- All step logic lives in the pure `nextStep()` in `src/lib/next-step.ts`; the
  component only renders it. New states need a table-driven test there.
- An unready resource is not an empty one. Do not turn a pending initial read into
  "QQ is not running".
- Any read error wins over stale data: never show a success step while an error is
  present.
- `account !== null` is a locally detected identity, not a completed login. Advance
  only on a confirmed process status.
- Multiple processes require an explicit choice; never load them all, and never
  silently switch away from a selection that disappeared.
- Adapter `ok` proves listening or connected, not that the operator's bot replies.
  The final step must not claim the bot is working.
- Errors stay visible in the affected step (`role="alert"`), not only in a
  transient toast.
- Copy stays free of implementation terms (注入 / 管道 / OneBot).

## Process account detection

Process cards use QQ's local account data before injection and the hook's confirmed
identity after login. Missing local data means the account is unknown. It does not
prove that QQ is signed out, and local detection alone never marks a bridge online.
The manual login probe and `/api/processes/:pid/probe-login` endpoint are removed.

Linux resolves data roots from each QQ process's `XDG_CONFIG_HOME` or `HOME`.
Windows uses the bundled addon’s `getFileHoldersAsync` to find the process holding
each account database. Query failures are reported instead of treated as no login.

## Account notification templates

Webhook bodies and email subjects/bodies support `{uin}`, `{nickname}`, `{event}`
(`offline` or `online`), `{time}`, `{status}` (Hook process state), `{pid}`, and
`{error}` (Hook process error). New webhook and email channels include process
status in their default body; existing saved templates are preserved.
JSON templates escape substituted strings, including quotes, line breaks and control characters.

Process facts are resolved when the notification is dispatched, after any offline
debounce. Each transition carries its process PID, including the final PID detached
when an account goes offline. Facts are looked up for that PID and UIN without
substituting another process. Missing facts render empty and mean unknown, not
proof that QQ exited. Hook status alone does not identify the cause of a QQ login
failure. Notifications for one account are delivered in transition order; a slow
account does not delay other accounts.

## Local development

Packaged installations offer download and restart controls in Settings → About.
Downloads are verified and staged; files are applied before the application starts.
Restart confirmation uses the shared modal, and download results use action feedback.

On Windows, the native API logs the process token and EXE integrity label once
at startup. A Low (or lower) token triggers a WebUI warning; file labels and
query failures alone do not. “临时关闭” lasts for the tab session, including
reloads; “永久关闭” persists in this browser's site storage. Neither suppresses
startup logs. Failed queries and preference writes remain visible.

From the repository root:

```bash
pnpm --filter webui dev
pnpm --filter webui typecheck
pnpm --filter webui lint
pnpm --filter webui test
pnpm --filter webui build
```

The VitePress site offers chapter-specific lessons above the prose. The simulator
does not load until activated, and collapsing it preserves the current lesson.
`pnpm docs:dev` starts both servers; `pnpm docs:build:all` builds the complete
static site and simulator. Tutorial options are strictly allowlisted document
query parameters; `src/demo/history.ts` keeps them separate from hash-route search
parameters. Operational steps require accepted API state or rendered results,
not click delivery. The same-origin, fixed section-message map allows only
user-requested jumps within the current chapter and preserves the active iframe.

The simulator keeps storage and transport effects isolated to page memory. It
does not import saved credentials or pre-accept account kernel risks; restarting
a chapter restores its declared example baseline, and reloading discards edits.

The chapter fixes both the guide and console language. In the production console,
the masthead language button switches English and Simplified Chinese without
resetting the active session or form. The preference is local to the browser.
Application-owned copy is translated; logs, account names, diagnostics, and
canonical notices keep their original content.
