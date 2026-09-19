# DSH Desktop Next

English | [中文](README.zh.md)

A separate experimental package based on DeepSeek Harness **0.1.6-alpha.2**. The main window loads the official published `@deepseek-ai/dsh-web-frontend`, sharing the official Web application, plugin manager, and basic Desktop presentation. Next adds Profiles, recovery, Agents Anywhere remote control, and Community Market.

## Development and verification

Run from the outer repository root with Node.js `^22.19.0` or `>=24.0.0` and Corepack's Yarn 4.18.0:

```sh
git submodule update --init --recursive
corepack yarn install --immutable
corepack yarn check:next
corepack yarn dev:next
```

`check:next` builds Market and Next, runs typechecks, unit tests, official-frontend and sandboxed-preload checks, and a real Host smoke in a temporary home. It never opens a graphical application. The smoke uses an offline local fixture plugin to exercise pnpm, Market removal and restart requests, authentication, profile switching, and recovery boot, then cleans up its processes and files.

`dev:next` explicitly launches the graphical application. Use `corepack yarn start:next` with an existing build. An uncached Electron binary is downloaded on first use. To additionally exercise the real Electron executable in Node mode, build first and run:

```sh
corepack yarn workspace dsh-desktop-next verify:host:electron
```

This check opens no Electron window. Window presentation, native dialogs, and a real phone connection still require manual acceptance.

## Usage

The application menu's “Profile 与附加功能…” entry, also available through `CmdOrCtrl+,`, creates and switches Profiles and controls Market and remote access. Switching or applying feature settings stops the current Host before starting its replacement, interrupting active tasks.

- **Profiles** have separate plugin dependencies, activation lists, patches, and Next feature settings. Sessions, settings, credentials, and other product data follow upstream rules and are shared within one Next home; Profiles do not isolate accounts or data.
- **Community Market** is enabled by default and retains its existing discovery, source management, installation preview, confirmation, and removal flows. Package operations use pnpm installed with the application dependencies. Completed operations can request a restart. Next does not yet expose Market's terminal action.
- **Remote control** is disabled by default. After enabling it and restarting, configure it through the phone connection page in the official main interface. Connector state is scoped by Profile within Next home. A profile switch stops the old Host and its remote connection.
- **Recovery** remains accessible through the application menu when the Host or a third-party plugin fails to start. It backs up `cordis.patch.yml`, restores the built-in bundle list, and disables AA and Market. Installed plugin files, sessions, settings, and home-level patches remain. This is not a complete file rollback and does not automatically repair a corrupt `package.json` or home-level patch.

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

Alpha.2 replaced alpha.1's portless pipes with WebServer. This package uses the real upstream WebServer rather than simulating HTTP routes. The server binds only to an OS-assigned `127.0.0.1` port so other editions can run concurrently. Main retains Host credentials and applies the same authentication to Market routes; Market mutations retain their origin checks.

The main interface consumes official frontend artifacts without copying chat, settings, or plugin-manager pages. macOS window material, platform markers, the Windows caption menu, and native theme synchronization follow the official implementation. Next's small control window only manages the added Profiles, feature switches, and recovery, and remains accessible when the main Host fails.

Next is a profile bundle so shared plugin-manager reconciliation retains its capabilities. Development startup creates one managed link for Next itself under `home/profiles/node_modules`; alpha.2 runtime resolution owns all other dependency fallbacks. All upstream runtime dependencies come from published packages, without source links into or edits to `deepseek-harness/`.

[upstream-reference.json](upstream-reference.json) records the reference commit and original hashes of copied files; [LICENSE.upstream](LICENSE.upstream) retains the original license.

## Current limits

This is a runnable development package without signed installers, automatic updates, or Stable/Beta data migration. The official distribution's offline Python/Office runtime and skill payloads are not yet integrated. Our enhanced windows, tray integration, and related features remain for later migration. Headless Node/Electron checks do not qualify cross-platform installers or visual behavior.
