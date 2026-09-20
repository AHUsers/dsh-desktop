# DSH Desktop Next

English | [中文](README.zh.md)

A separate experimental package based on DeepSeek Harness **0.1.6-alpha.2**. The main window loads the official published `@deepseek-ai/dsh-web-frontend`, sharing the official Web application, plugin manager, and basic Desktop presentation. Next adds the system tray, desktop preferences and tools, Profiles, recovery, Agents Anywhere remote control, and Community Market.

## Development and verification

Run from the outer repository root with Node.js `^22.19.0` or `>=24.0.0` and Corepack's Yarn 4.18.0:

```sh
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn check:next
corepack yarn dev:next
```

`check:next` builds Market and Next, runs typechecks, unit tests, official-frontend and sandboxed-preload checks, and a real Host smoke in a temporary home. It never opens a graphical application. The smoke uses an offline local fixture plugin to exercise pnpm, Market removal and restart requests, authentication, profile switching, and recovery boot, then cleans up its processes and files. An additional real-runtime smoke exercises the native-only HTTP/WebSocket gate, browser access changes, corrupt manifests, isolated safe mode, global-patch repair, and process teardown.

`dev:next` explicitly launches the graphical application. Use `corepack yarn start:next` with an existing build. An uncached Electron binary is downloaded on first use. To additionally exercise the real Electron executable in Node mode, build first and run:

```sh
corepack yarn workspace dsh-desktop-next verify:host:electron
```

This check opens no Electron window. Window presentation, native dialogs, and a real phone connection still require manual acceptance.

The macOS sidebar and titlebar regression runs the official frontend's Desktop boot branch in headless Chromium with a temporary home. It serves the same entry document as Next, supplies real Host injections through a simulated preload contract, and asserts that Desktop transport is active. It checks reopening the sidebar from the homepage and plugin manager, drag-region geometry, and clickable page actions. It also opens the Desktop section inside the official Settings dialog, verifies preference and Profile commands, and renders the exact standalone recovery artifact with no Host dependency. Native IPC is simulated for these browser checks. After building, install the test browser once and run:

```sh
corepack yarn workspace dsh-desktop-next exec playwright install chromium
corepack yarn workspace dsh-desktop-next verify:window-controls
```

Set `DSH_NEXT_TEST_BROWSER_CHANNEL=chrome` to use an installed Google Chrome instead. Screenshots are saved under `dsh-desktop-next/.desktop-next/verification/`. Native macOS window movement still needs manual verification. These additive controls use official layout actions and do not modify the upstream frontend.

## Usage

Use **Settings → Desktop** in the official frontend, the tray’s **Desktop settings…** entry, or `CmdOrCtrl+,`. The tray and independent control window remain available if the Host fails. Profile switches, feature changes, and port changes stop the current Host before starting its replacement, interrupting active tasks. Browser and LAN access toggles apply immediately without restarting.

- **Tray and background operation:** retain the original Desktop ordering: open the main window, reload the interface, open DSH Terminal, export diagnostics, enter/exit safe mode, then select or create a Profile. Desktop settings and the recovery assistant remain directly accessible. Native menus follow the in-app language. Closing the main window keeps the Host and remote connection running when background operation is enabled and a tray is available. Explicit Quit stops the HTTPS edge and Host. Without a usable tray, closing the main window quits rather than leaving an inaccessible process.
- **Desktop preferences:** background operation, macOS transparency, supported Windows Mica, local/LAN access and ports, log level, and separate notifications for completed/failed user turns and background jobs. The page reuses the existing Desktop grouped cards, Profile choices and notification toggles. Toggles and materials save immediately; ports have a separate save action. The official Settings header provides terminal and restart shortcuts, including reload, application restart and restart into recovery. Acrylic stays disabled, as in the existing Desktop; Mica requires Windows build 22621 or newer. The OS must also allow notifications. Notifications contain generic outcomes and only appear while the main window is unfocused.
- **Profiles:** create, switch, open, or remove an inactive Profile. New Profile from the tray focuses the name and offers creation followed by switching. Malformed manifests and Profiles missing the Next bundle are marked unavailable; selecting the already-active Profile does not restart it. Removed Profiles move into recovery backups; the active and default Profiles cannot be removed. Profiles have separate plugin dependencies, activation lists, patches, and feature switches. Sessions, settings and credentials follow upstream rules and are shared within one Next home; Profiles do not isolate accounts or data.
- **Community Market:** enabled by default, retaining discovery, sources, installation previews, confirmation and removal. Package operations use the bundled pnpm. Completed operations can request a restart; the terminal action is available on macOS and Windows.
- **Remote control:** disabled by default. After enabling it and restarting, configure it through the phone connection page in the official main interface. Connector state is scoped by Profile within Next home. Switching Profiles stops the previous Host and its remote connection.
- **Desktop tools:** open the data/Profile/log directories, reload the interface, open developer tools, export diagnostics, and open a macOS/Windows terminal with this installation’s `dsh`, `pnpm` and Electron-backed `node`. The terminal selects the original Profile even while the main app is in safe mode.

### Browser and LAN access

Browser access is disabled by default. Enabling local access provides an authenticated loopback login link; enabling LAN access adds an HTTPS/WSS edge while the Host stays bound to `127.0.0.1`. Ports default to `0` (automatic). Access toggles do not restart the Host. Disabling browser access also disconnects existing browser WebSockets while preserving native streams and running tasks. Port changes require a Host restart. LAN addresses are sampled at startup; restart after a network change.

The settings page can copy login links and export the installation’s public CA certificate. Trust that certificate on the other device after comparing its SHA-256 fingerprint. Login links grant access and should only be shared with trusted devices. The CA private key is sealed with OS-backed storage; if secure storage or a suitable LAN address is unavailable, LAN HTTPS stays closed and the UI shows the failure. Native renderer credentials are never copied into these links and are stripped at the LAN edge.

### Recovery

The independent recovery assistant shows the startup error and recent logs even if no Host is running. It offers retry, Profile switching, diagnostics, safe mode, repair, rollback and Quit. Restart in Recovery Mode from the Settings header fully stops the background service before relaunching directly into this assistant. The current Profile and plugins are not loaded until Start or retry is selected.

- **Safe mode** starts the official interface in a separate temporary home with only shipped bundles, no original credentials, and remote control, Market and browser access disabled. Original data and configuration remain untouched. Leaving safe mode returns to the original Profile and removes the temporary home; work created in that temporary environment is not retained.
- **Profile repair** backs up the manifest, Profile patch and feature switches before restoring built-in bundles and disabling third-party activation, remote control and Market. A malformed `package.json` can be repaired. Installed plugin files, shared sessions and credentials are retained.
- **Profile rollback** restores the most recent successful Host-start configuration after backing up the current files and verifying the backup checksums. It covers `package.json`, `cordis.patch.yml` and Next feature switches, not installed plugin versions or shared data.
- **Global patch repair** separately backs up and disables the home-level `cordis.patch.yml`; this affects all Next Profiles. Profile repair never silently changes that patch.

Backups stay under `home/recovery/`. Diagnostics export a bounded JSON report with versions, state and redacted logs, without reading session or credential files. Logs can still contain local paths and plugin output; inspect the report before sharing. Local desktop logs are bounded to 128 KiB at `home/logs/desktop-next.log`. Desktop preferences live independently of Host settings in `home/desktop-preferences.json`.

The default data directory is `.desktop-next/home` inside this package, including Electron state. Set `DSH_DESKTOP_NEXT_HOME` to an absolute path to choose a dedicated directory. Next does not select its home from the existing `DSH_HOME`. First launch does not migrate Stable/Beta data.

## Architecture and provenance

```text
Official Web frontend + official basic Desktop presentation
                        |  dsh-app://app
                 Next Electron main
                        |  authenticated HTTP / WebSocket
                 Electron Node-mode Host
                        |  upstream shared runProfile
                 Official Web bundles + Next bundle
                        |- Community Market
                        `- Agents Anywhere bridge
```

Alpha.2 replaced alpha.1's portless pipes with WebServer. This package uses the real upstream WebServer rather than simulating HTTP routes. The Host binds only to `127.0.0.1`, with an OS-assigned port by default so other editions can run concurrently. A separate optional TLS edge owns LAN ingress. Main retains Host cookies and a fresh native capability for each Host generation; ordinary HTTP and WebSocket requests are denied while browser access is off. Market requests also require Host authentication, and mutations retain their origin checks.

The main interface consumes official frontend artifacts without copying chat, settings, or plugin-manager pages. macOS window material, platform markers, the Windows caption menu, and native theme synchronization follow the official implementation. Next contributes its Desktop section through `settings.section` and header shortcuts through `settings.action`. The Desktop section shows all settings groups, while the independent control/recovery window retains category navigation. Both share one settings implementation, and narrow sender-validated IPC exposes only named native actions. Ordinary browsers receive no native Desktop bridge.

Next is a profile bundle so shared plugin-manager reconciliation retains its capabilities. Development startup creates one managed link for Next itself under `home/profiles/node_modules`; alpha.2 runtime resolution owns all other dependency fallbacks. All upstream runtime dependencies come from published packages, without source links into or edits to `deepseek-harness/`.

[upstream-reference.json](upstream-reference.json) records the reference commit and original hashes of copied files; [LICENSE.upstream](LICENSE.upstream) retains the original license.

## Current limits

This is a runnable development package without signed installers, automatic updates, or Stable/Beta data migration. The official distribution's offline Python/Office runtime and skill payloads are not yet integrated. Our enhanced/extended window modes remain deferred. Unavailable update channels, other market adapters and window modes have no placeholder actions; Next never installs a Stable/Beta package. Headless Node/Electron checks do not qualify cross-platform installers or visual behavior.
