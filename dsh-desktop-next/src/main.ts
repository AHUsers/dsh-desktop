/** Official alpha.2 Desktop transport with a Host-independent native shell. */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, Notification, protocol, safeStorage, session, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { forwardWebRequest, serveWebDocument } from './web-document.ts'
import { claimDesktopSingleInstance } from './single-instance.ts'
import { NEXT_PACKAGE, parseFeatures, profileName } from './profiles.ts'
import { APP_URL, IPC, SHELL_URL } from './ipc.ts'
import { WINDOWS_TITLEBAR_HEIGHT } from './windows-layout.ts'
import { resolveDesktopLocale } from './menu-locale.ts'
import { NextDesktopRuntime } from './desktop-runtime.ts'
import { NATIVE_ACCESS_HEADER, type DesktopCommand, type DesktopState } from './desktop-contract.ts'
import { portsChanged, parsePreferences } from './desktop-preferences.ts'
import { NativeDesktop, applyWindowMaterial } from './native-desktop.ts'
import { desktopLanAddresses } from './lan-addresses.ts'
import { createLanHttpsCertificate } from './lan-https-certificate.ts'
import { desktopTerminalStateDirectory, openDesktopTerminal } from './desktop-terminal.ts'
import { bundledPnpmEntry } from './extensions.ts'
import { auxiliaryWindowChromeOptions, auxiliaryWindowHasCustomFrame } from '../../dsh-plugin-desktop-beta/src/auxiliary-window-options.ts'
import { privateDirectory } from './private-files.ts'
import { supportsMica, windowMaterial } from './window-material.ts'
import { RECOVERY_ARGUMENT, SAFE_ARGUMENT, relaunchArguments } from './relaunch.ts'

const root = dirname(NEXT_PACKAGE)
const home = resolve(process.env.DSH_DESKTOP_NEXT_HOME ?? join(root, '.desktop-next', 'home'))
const electronData = join(home, 'electron-user-data')
privateDirectory(electronData)
app.setName('DSH Desktop Next')
app.setPath('userData', electronData)
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }])

let mainWindow: BrowserWindow | undefined
let shellWindow: BrowserWindow | undefined
let quitting = false
let relaunch: string[] | undefined
let ownsInstance = false
let windowsLanguage = 'en'
const require = createRequire(NEXT_PACKAGE)
const webRoot = dirname(require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html'))
const version = (JSON.parse(readFileSync(NEXT_PACKAGE, 'utf8')) as { version: string }).version
const t = (zh: string, en: string): string => windowsLanguage.toLowerCase().startsWith('zh') ? zh : en
const runtime = new NextDesktopRuntime({
  home, root, executable: process.execPath, addresses: () => [...desktopLanAddresses()],
  certificate: addresses => createLanHttpsCertificate(electronData, addresses, {
    available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    seal: bytes => safeStorage.encryptString(Buffer.from(bytes).toString('utf8')),
    open: bytes => Buffer.from(safeStorage.decryptString(Buffer.from(bytes)), 'utf8'),
  }),
  onFailure: () => { if (app.isReady()) openControls('recovery') },
  onChange: () => { if (app.isReady()) native.refresh() },
  onRestart: () => run({ type: 'restart' }),
  onTerminal: () => run({ type: 'terminal' }),
  onNotification: outcome => native.notify(outcome),
})
const native = new NativeDesktop({ root, language: () => windowsLanguage, state, window: () => mainWindow,
  show: openMain, run, warn: error => runtime.diagnostics.append(String(error), 'warn') })

function state(): DesktopState {
  return { ...runtime.state(), platform: process.platform, version,
    trayAvailable: native.available, notificationsAvailable: Notification.isSupported(), windowsMicaSupported: process.platform === 'win32' && supportsMica() }
}
function run(value: DesktopCommand): void { void command(value).catch(error => runtime.report(error)) }

function assertSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, owner: BrowserWindow | undefined, origin: string): void {
  if (!owner || owner.isDestroyed() || event.sender !== owner.webContents
    || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith(origin)) throw new Error('Rejected Next IPC sender')
}
function assertDesktopSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): void {
  if (event.sender === mainWindow?.webContents) assertSender(event, mainWindow, APP_URL)
  else assertSender(event, shellWindow, 'dsh-app://shell/')
}
function show(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore()
  window.show(); window.focus()
}

function createWindow(preload: string, primary = false): BrowserWindow {
  const window = new BrowserWindow({ width: 1280, height: 840, minWidth: 800, minHeight: 580,
    show: false, title: 'DSH Desktop Next',
    ...(!primary ? auxiliaryWindowChromeOptions() : {}),
    ...(process.platform === 'win32' && primary ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: { height: WINDOWS_TITLEBAR_HEIGHT, color: nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb',
        symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115' },
    } : {}),
    ...(process.platform === 'darwin' && primary ? {
      titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 18 },
      vibrancy: runtime.preferences.macosMaterial === 'transparent' ? 'sidebar' as const : undefined,
      visualEffectState: 'active' as const, backgroundColor: '#00000000',
    } : {}),
    webPreferences: { preload: join(root, 'lib', preload), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  window.once('ready-to-show', () => show(window))
  if (primary) {
    applyWindowMaterial(window, runtime.preferences)
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === ',' && (input.control || input.meta) && !input.alt) { event.preventDefault(); openControls() }
    })
    window.on('close', event => {
      if (!quitting && runtime.preferences.closeToTray && native.available) { event.preventDefault(); window.hide() }
      else if (!quitting) { event.preventDefault(); app.quit() }
    })
  }
  const openExternal = (url: string): void => {
    try { if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url).catch(error => runtime.report(error)) } catch { /* Ignore malformed external links. */ }
  }
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(primary ? APP_URL : SHELL_URL)) { event.preventDefault(); openExternal(url) }
  })
  window.webContents.on('will-redirect', (event, url) => { if (!url.startsWith(primary ? APP_URL : SHELL_URL)) event.preventDefault() })
  return window
}

function openControls(page: 'general' | 'profiles' | 'create-profile' | 'tools' | 'recovery' = 'general'): void {
  if (quitting) return
  const url = `${SHELL_URL}?locale=${windowsLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en'}&platform=${process.platform}&frame=${auxiliaryWindowHasCustomFrame()}#${page}`
  const resize = (window: BrowserWindow): void => {
    const creating = page === 'create-profile'
    window.setResizable(!creating)
    window.setMinimumSize(creating ? 420 : 680, creating ? 330 : 560)
    window.setSize(creating ? 480 : 850, creating ? 360 : 800)
  }
  if (shellWindow && !shellWindow.isDestroyed()) {
    resize(shellWindow)
    void shellWindow.loadURL(url).catch(error => runtime.diagnostics.append(String(error), 'error'))
    show(shellWindow); return
  }
  shellWindow = createWindow('preload-shell.cjs')
  resize(shellWindow)
  shellWindow.on('closed', () => { shellWindow = undefined })
  void shellWindow.loadURL(url).catch(error => runtime.diagnostics.append(String(error), 'error'))
}
function openMain(): void {
  if (quitting) return
  if (runtime.recoveryMode) { openControls('recovery'); return }
  if (mainWindow && !mainWindow.isDestroyed()) { show(mainWindow); return }
  mainWindow = createWindow('preload-app.cjs', true)
  mainWindow.on('closed', () => { mainWindow = undefined })
  mainWindow.webContents.on('render-process-gone', (_event, details) => { if (!quitting) runtime.report(new Error(`Renderer: ${details.reason}`)) })
  mainWindow.webContents.on('preload-error', (_event, _path, error) => runtime.report(error))
  mainWindow.webContents.on('did-fail-load', (_event, code, message, _url, isMain) => {
    if (isMain && code !== -3 && !quitting) runtime.report(new Error(message))
  })
  void mainWindow.loadURL(APP_URL).catch(error => runtime.report(error))
}
async function confirmed(message: string, detail = t('将停止当前 Host，正在运行的任务会被中断。', 'This stops the current Host and interrupts running tasks.')): Promise<boolean> {
  const result = await dialog.showMessageBox({ type: 'question', title: 'DSH Desktop Next', message, detail,
    buttons: [t('继续', 'Continue'), t('取消', 'Cancel')], defaultId: 1, cancelId: 1 })
  return result.response === 0 && !quitting
}
async function openPath(path: string): Promise<void> { const error = await shell.openPath(path); if (error) throw new Error(error) }

async function command(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object' || !('type' in value)) throw new Error('Invalid Next command')
  const input = value as Record<string, unknown>
  const type = input.type
  if (typeof type !== 'string') throw new Error('Invalid Next command')
  if (type === 'controls') {
    if (input.page !== undefined && (typeof input.page !== 'string' || !['general', 'profiles', 'create-profile', 'tools', 'recovery'].includes(input.page))) throw new Error('Invalid controls page')
    openControls(input.page as Parameters<typeof openControls>[0]); return
  }
  if (type === 'close-controls') { shellWindow?.close(); return }
  if (type === 'quit') { app.quit(); return }
  if (runtime.busy || quitting) throw new Error(t('另一项操作正在进行，请稍候。', 'Another operation is in progress.'))
  runtime.busy = true; native.refresh()
  try {
    if (type === 'restart-app' || type === 'restart-recovery') {
      if (!await confirmed(type === 'restart-recovery'
        ? t('重启应用并进入恢复模式？', 'Restart the application in recovery mode?')
        : t('现在重启 DSH Desktop Next？', 'Restart DSH Desktop Next now?'), type === 'restart-recovery'
        ? t('应用将先打开恢复助手，暂不加载当前 Profile 和插件。正在运行的任务会中断。', 'The recovery assistant will open before loading the current Profile and plugins. Running tasks will be interrupted.')
        : undefined)) return
      relaunch = relaunchArguments(process.argv.slice(1), type === 'restart-recovery', runtime.safeMode)
      app.quit()
      return
    }
    if (type === 'create') { runtime.profiles.create(profileName(input.name)); return }
    if (type === 'delete') {
      const name = profileName(input.name)
      if (name === runtime.selected || name === 'default') throw new Error(t('不能移除当前或默认 Profile。', 'Cannot remove the active or default Profile.'))
      if (await confirmed(t(`移除 Profile「${name}」？`, `Remove Profile “${name}”?`), t('其文件将移入恢复备份目录。共享的会话和设置会保留。', 'Its files move to recovery backups. Shared sessions and settings are retained.'))) runtime.recovery.removeProfile(name, runtime.selected)
      return
    }
    if (type === 'reload') { if (runtime.recoveryMode) return; openMain(); await mainWindow!.loadURL(APP_URL); return }
    if (type === 'devtools') { openMain(); (runtime.recoveryMode ? shellWindow : mainWindow)!.webContents.toggleDevTools(); return }
    if (type === 'terminal') {
      const profileDir = runtime.profiles.directory(runtime.selected)
      openDesktopTerminal({ platform: process.platform, appExecutable: process.execPath, dshBootstrapPath: join(root, 'lib', 'desktop-cli.js'),
        pnpmBinPath: bundledPnpmEntry(NEXT_PACKAGE), electronVersion: process.versions.electron, profileName: runtime.selected,
        productVersion: version, profileDir, homeDir: home, stateDir: desktopTerminalStateDirectory(electronData, runtime.selected),
        spawn, onLaunchError: error => runtime.report(error) })
      return
    }
    if (type === 'open-home') { await openPath(home); return }
    if (type === 'open-profile') { await openPath(runtime.profiles.directory(runtime.selected)); return }
    if (type === 'open-logs') { runtime.diagnostics.flush(); await openPath(dirname(runtime.diagnostics.file)); return }
    if (type === 'open-backups') { privateDirectory(runtime.recovery.directory); await openPath(runtime.recovery.directory); return }
    if (type === 'open-browser' || type === 'open-lan') { await shell.openExternal(runtime.browserLink(type === 'open-lan')); return }
    if (type === 'copy-browser' || type === 'copy-lan') { clipboard.writeText(runtime.browserLink(type === 'copy-lan')); return }
    if (type === 'export-ca' || type === 'diagnostics') {
      const certificate = runtime.lan?.caCertificate
      if (type === 'export-ca' && !certificate) throw new Error('LAN certificate is unavailable')
      const result = await dialog.showSaveDialog({ title: type === 'export-ca' ? t('导出局域网 CA 证书', 'Export LAN CA certificate') : t('导出诊断（分享前请检查内容）', 'Export diagnostics (review before sharing)'),
        defaultPath: type === 'export-ca' ? 'dsh-desktop-next-ca.crt' : `dsh-desktop-next-diagnostics-${Date.now()}.json`,
        filters: [{ name: type === 'export-ca' ? 'CA certificate' : 'Diagnostics', extensions: [type === 'export-ca' ? 'crt' : 'json'] }] })
      if (!result.canceled && result.filePath && !quitting) await writeFile(result.filePath, type === 'export-ca' ? certificate! : runtime.diagnostics.export(state()), { mode: 0o600 })
      return
    }
    if (type === 'preferences') {
      const preferences = parsePreferences(input.preferences)
      if (portsChanged(runtime.preferences, preferences)) {
        if (!await confirmed(t('应用访问设置并重启 Host？', 'Apply access settings and restart the Host?'), preferences.browserAccess && preferences.networkExposure === 'lan'
          ? t('开启后，同一网络中的设备可通过 HTTPS 访问。登录链接可授予访问权限，请仅与可信设备共享。正在运行的任务会被中断。', 'Devices on your network can connect over HTTPS. Login links grant access; share only with trusted devices. Running tasks will be interrupted.')
          : undefined)) return
        await runtime.restart(() => runtime.writePreferences(preferences))
        if (mainWindow) await mainWindow.loadURL(APP_URL)
      } else {
        if (preferences.browserAccess && preferences.networkExposure === 'lan'
          && (!runtime.preferences.browserAccess || runtime.preferences.networkExposure !== 'lan')
          && !await confirmed(t('允许局域网 HTTPS 访问？', 'Allow LAN access over HTTPS?'),
            t('同一网络中的设备可以连接。请仅向可信设备分享登录链接，并在设备上核对和信任 CA 证书。', 'Devices on your local network can connect. Share login links only with trusted devices, and verify and trust the CA certificate on each device.'))) return
        await runtime.applyPreferences(preferences)
      }
      if (mainWindow) applyWindowMaterial(mainWindow, preferences)
      return
    }
    if (!['switch', 'features', 'restart', 'recover', 'safe-mode', 'normal-mode', 'rollback', 'repair-global'].includes(String(type))) throw new Error('Invalid Next command')
    const next = type === 'switch' ? profileName(input.name) : runtime.selected
    if (type === 'switch' && next === runtime.selected && !runtime.safeMode && !runtime.recoveryMode && runtime.backend.state.phase === 'ready') return
    if (type === 'switch' && !runtime.profiles.selectable(next)) throw new Error('Profile is unavailable for Desktop Next')
    const features = type === 'features' ? parseFeatures(input.features) : undefined
    if (type === 'rollback' && !runtime.recovery.latest(next)) throw new Error(t('尚无成功启动的配置备份。', 'No successful-start configuration is available.'))
    const messages: Record<string, string> = {
      recover: t('备份并修复当前 Profile？将禁用第三方插件、远控和市场。', 'Back up and repair this Profile? Third-party plugins, remote control and Market will be disabled.'),
      'repair-global': t('备份并停用全局补丁？这会影响所有 Next Profile。', 'Back up and disable the global patch? This affects every Next Profile.'),
      rollback: t('恢复最近成功启动的 Profile 配置？当前配置会先备份。', 'Restore the last successful-start Profile configuration? The current configuration will be backed up first.'),
      'safe-mode': t('在独立的临时环境中进入安全模式？原有数据和配置会保留。', 'Enter safe mode in a separate temporary environment? Existing data and configuration are preserved.'),
      'normal-mode': t('退出安全模式，重新启动原 Profile？', 'Leave safe mode and restart the original Profile?'),
    }
    if (!await confirmed(messages[String(type)] ?? t('重启工作环境以应用更改？', 'Restart the environment to apply this change?'))) return
    await runtime.restart(async () => {
      if (type === 'recover') await runtime.profiles.recover(next)
      if (type === 'rollback') await runtime.recovery.restore(next)
      if (type === 'repair-global') runtime.recovery.repairGlobalPatch()
      if (features) runtime.profiles.setFeatures(next, features)
      if (type === 'safe-mode') runtime.safeMode = true
      else if (type !== 'restart') runtime.safeMode = false
      if (type === 'switch') { runtime.profiles.select(next); runtime.selected = next }
    })
    openMain()
    await mainWindow!.loadURL(APP_URL)
  } catch (error) {
    runtime.report(error)
    throw error
  } finally { runtime.busy = false; native.refresh() }
}

async function main(): Promise<void> {
  await app.whenReady()
  if (quitting) return
  windowsLanguage = app.getLocale()
  protocol.handle('dsh-app', async request => {
    const url = new URL(request.url)
    if (url.hostname === 'shell') {
      const response = await serveWebDocument(request, join(root, 'lib/native-ui'), false)
      response.headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'none'")
      return response
    }
    if (url.hostname !== 'app') return new Response(null, { status: 404 })
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
      || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) return serveWebDocument(request, webRoot)
    const auth = runtime.auth
    if (!runtime.backend.host || !auth) return new Response(null, { status: 503 })
    return forwardWebRequest(request, auth.url, auth.cookie, auth.token)
  })
  ipcMain.handle(IPC.boot, async event => {
    assertSender(event, mainWindow, APP_URL)
    await runtime.startup
    if (!runtime.backend.host || !runtime.auth) throw new Error('Next Host is unavailable')
    return { injections: runtime.auth.injections, streamBaseUrl: new URL(runtime.auth.url).origin }
  })
  ipcMain.handle(IPC.failed, (event, message: unknown) => {
    assertSender(event, mainWindow, APP_URL)
    if (typeof message !== 'string') throw new Error('Invalid boot error')
    runtime.report(new Error(message.slice(0, 4096)))
  })
  ipcMain.handle(IPC.state, event => { assertDesktopSender(event); return state() })
  ipcMain.handle(IPC.material, event => { assertSender(event, mainWindow, APP_URL); return windowMaterial(runtime.preferences) })
  ipcMain.handle(IPC.command, (event, value: unknown) => { assertDesktopSender(event); return command(value) })
  let picking: Promise<string | null> | undefined
  ipcMain.handle(IPC.directory, event => {
    assertSender(event, mainWindow, APP_URL)
    const window = mainWindow!
    show(window)
    picking ??= dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      .then(result => result.canceled ? null : result.filePaths[0] ?? null).finally(() => { picking = undefined })
    return picking
  })
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    const auth = runtime.auth
    if (!auth || details.webContentsId !== mainWindow?.webContents.id) return callback({})
    const host = new URL(auth.url)
    if (new URL(details.url).host !== host.host) return callback({})
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([key, value]) => [key.toLowerCase(), value]))
    if (headers.origin !== 'dsh-app://app') return callback({ cancel: true })
    callback({ requestHeaders: { ...headers, origin: host.origin, cookie: auth.cookie, [NATIVE_ACCESS_HEADER]: auth.token, 'sec-fetch-site': 'same-origin' } })
  })
  ipcMain.on(IPC.nativeThemeSet, (event, source: unknown) => {
    try { assertSender(event, mainWindow, APP_URL) } catch { return }
    if (source === 'light' || source === 'dark' || source === 'system') nativeTheme.themeSource = source
  })
  ipcMain.on(IPC.locale, (event, language: unknown) => {
    try { assertSender(event, mainWindow, APP_URL) } catch { return }
    if (typeof language !== 'string' || !/^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language) || language === windowsLanguage) return
    windowsLanguage = language
    native.refresh()
  })
  nativeTheme.on('updated', () => { if (mainWindow && !mainWindow.isDestroyed()) applyWindowMaterial(mainWindow, runtime.preferences) })
  runtime.safeMode = process.argv.includes(SAFE_ARGUMENT)
  runtime.recoveryMode = process.argv.includes(RECOVERY_ARGUMENT)
  runtime.initialize()
  native.createTray()
  Menu.setApplicationMenu(process.platform === 'win32' ? null : Menu.buildFromTemplate([
    { label: 'DSH Desktop Next', submenu: native.items() }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  if (process.platform === 'win32') {
    ipcMain.handle(IPC.windowsMenu, (event, name: unknown, x: unknown, y: unknown) => {
      assertSender(event, mainWindow, APP_URL)
      if ((name !== 'application' && name !== 'edit') || typeof x !== 'number' || typeof y !== 'number'
        || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) throw new Error('Invalid native menu request')
      const window = mainWindow!
      const messages = resolveDesktopLocale(windowsLanguage).messages
      const editItem = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
        label, accelerator, click: () => {
          window.webContents.focus()
          window.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
          window.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
        },
      })
      const items: MenuItemConstructorOptions[] = name === 'application' ? native.items() : [
        editItem(messages.undo, 'Z', ['control'], 'Ctrl+Z'), editItem(messages.redo, 'Y', ['control'], 'Ctrl+Y'),
        { type: 'separator' }, editItem(messages.cut, 'X', ['control'], 'Ctrl+X'), editItem(messages.copy, 'C', ['control'], 'Ctrl+C'),
        editItem(messages.paste, 'V', ['control'], 'Ctrl+V'), editItem(messages.delete, 'Delete', []),
        { type: 'separator' }, editItem(messages.selectAll, 'A', ['control'], 'Ctrl+A'),
      ]
      const zoom = window.webContents.getZoomFactor()
      return new Promise<void>(resolvePopup => { Menu.buildFromTemplate(items).popup({ window, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolvePopup }) })
    })
    ipcMain.on(IPC.windowsAppearance, (event, language: unknown, color: unknown, symbolColor: unknown) => {
      try { assertSender(event, mainWindow, APP_URL) } catch { return }
      if (typeof language === 'string' && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(language)) windowsLanguage = language
      const validColor = (value: unknown): value is string => typeof value === 'string' && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
      if (validColor(color) && validColor(symbolColor)) mainWindow!.setTitleBarOverlay({ color, symbolColor })
    })
  }
  if (runtime.recoveryMode) openControls('recovery')
  else { void runtime.start().catch(() => {}); openMain() }
  app.on('activate', openMain)
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !native.available) app.quit() })
}

app.on('before-quit', event => {
  if (quitting || !ownsInstance) return
  event.preventDefault()
  quitting = true
  native.close()
  void runtime.close().then(() => {
    if (relaunch) app.relaunch({ args: relaunch })
    app.quit()
  }, error => { console.error(error); app.exit(1) })
})
ownsInstance = claimDesktopSingleInstance(app, openMain)
if (ownsInstance) void main().catch(error => runtime.report(error))
