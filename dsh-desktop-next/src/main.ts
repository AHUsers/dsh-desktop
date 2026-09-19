/** Upstream alpha.2 transport with Next-owned profile and feature controls. */
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, type IpcMainInvokeEvent } from 'electron'
import { DesktopBackendController } from './backend-controller.ts'
import { DesktopHostProcess } from './host-process.ts'
import { authenticateWebHost, forwardWebRequest, serveWebDocument } from './web-document.ts'
import { claimDesktopSingleInstance } from './single-instance.ts'
import { DEFAULT_FEATURES, NEXT_PACKAGE, NextProfiles, parseFeatures, profileName } from './profiles.ts'
import { APP_URL, IPC, SHELL_URL } from './ipc.ts'

const root = dirname(NEXT_PACKAGE)
const home = resolve(process.env.DSH_DESKTOP_NEXT_HOME ?? join(root, '.desktop-next', 'home'))
const electronData = join(home, 'electron-user-data')
mkdirSync(electronData, { recursive: true, mode: 0o700 })
app.setName('DSH Desktop Next')
app.setPath('userData', electronData)
protocol.registerSchemesAsPrivileged([{ scheme: 'dsh-app', privileges: {
  standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true,
} }])

let mainWindow: BrowserWindow | undefined
let shellWindow: BrowserWindow | undefined
let quitting = false
let busy = false
let startup: Promise<void> = Promise.resolve()
let hostUrl: string | undefined
let hostCookie: string | undefined
let injections: readonly unknown[] = []
const profiles = new NextProfiles(home)
let selected = 'default'
let failure = ''
const require = createRequire(NEXT_PACKAGE)
const webRoot = dirname(require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html'))

function assertSender(event: IpcMainInvokeEvent, owner: BrowserWindow | undefined, origin: string): void {
  if (!owner || owner.isDestroyed() || event.sender !== owner.webContents
    || event.senderFrame !== owner.webContents.mainFrame || !event.senderFrame.url.startsWith(origin)) {
    throw new Error('Rejected Next IPC sender')
  }
}

function createWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow({ width: 1280, height: 840, minWidth: 800, minHeight: 580,
    show: false, title: 'DSH Desktop Next', webPreferences: {
      preload: join(root, 'lib', preload), contextIsolation: true, sandbox: true, nodeIntegration: false,
    } })
  window.once('ready-to-show', () => window.show())
  const openExternal = (url: string): void => {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) void shell.openExternal(url)
  }
  window.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' } })
  window.webContents.on('will-navigate', (event, url) => {
    const owned = window === mainWindow ? APP_URL : SHELL_URL
    if (!url.startsWith(owned)) { event.preventDefault(); openExternal(url) }
  })
  window.webContents.on('will-redirect', (event, url) => {
    if (!url.startsWith(window === mainWindow ? APP_URL : SHELL_URL)) event.preventDefault()
  })
  return window
}

function openControls(): void {
  if (quitting) return
  if (shellWindow && !shellWindow.isDestroyed()) { shellWindow.show(); shellWindow.focus(); return }
  shellWindow = createWindow('preload-shell.cjs')
  shellWindow.setSize(720, 680)
  shellWindow.on('closed', () => { shellWindow = undefined })
  void shellWindow.loadURL(SHELL_URL).catch(error => console.error(error))
}

function reportFailure(error: unknown): void {
  failure = error instanceof Error ? error.message : String(error)
  console.error(error)
  openControls()
}

const backend = new DesktopBackendController(onFailure => {
  const host = new DesktopHostProcess(process.execPath, root, profiles.directory(selected), undefined,
    { ...process.env, DSH_HOME: home }, onFailure, undefined, 'runtime', undefined, join(root, 'lib', 'host.js'),
    () => { if (!quitting) void command({ type: 'restart' }).catch(reportFailure) })
  return {
    async start() {
      const ready = await host.start()
      const url = new URL(ready.url)
      if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('Next Host must use loopback HTTP')
      hostCookie = await authenticateWebHost(ready.url)
      hostUrl = ready.url
      if (!ready.injections) throw new Error('Next Host omitted Web boot injections')
      injections = ready.injections
    },
    async stop() {
      hostUrl = hostCookie = undefined
      injections = []
      await host.stop()
    },
  }
}, state => { if (state.phase === 'error' && !quitting) reportFailure(new Error(state.message)) })

function start(): Promise<void> {
  failure = ''
  startup = backend.start(async () => { profiles.ensure(selected) })
  void startup.catch(reportFailure)
  return startup
}

async function confirmed(message: string): Promise<boolean> {
  const result = await dialog.showMessageBox({ type: 'question', title: 'DSH Desktop Next', message,
    detail: '将停止当前 Host，正在运行的任务会被中断。', buttons: ['继续', '取消'], defaultId: 1, cancelId: 1 })
  return result.response === 0
}

async function command(value: unknown): Promise<void> {
  if (busy) throw new Error('另一项操作正在进行，请稍候。')
  if (!value || typeof value !== 'object' || !('type' in value)) throw new Error('Invalid Next command')
  const command = value as { type: unknown; name?: unknown; features?: unknown }
  if (command.type === 'create') { profiles.create(profileName(command.name)); return }
  if (!['switch', 'features', 'restart', 'recover'].includes(String(command.type))) throw new Error('Invalid Next command')
  const next = command.type === 'switch' ? profileName(command.name) : selected
  if (!profiles.list().includes(next)) throw new Error('Profile does not exist')
  const features = command.type === 'features' ? parseFeatures(command.features) : undefined
  busy = true
  try {
    if (!await confirmed(command.type === 'recover'
      ? '禁用当前 Profile 的第三方插件、AA 和市场，备份 Profile 补丁并重启？'
      : features?.remoteControl && !profiles.features(selected).remoteControl
        ? '启用手机远控并重启？重启后需在“手机连接”完成配置。'
        : '重启当前工作环境以应用更改？') || quitting) return
    await backend.stop()
    if (command.type === 'recover') await profiles.recover(selected)
    if (features) profiles.setFeatures(selected, features)
    profiles.select(next)
    selected = next
    const starting = start()
    void mainWindow?.loadURL(APP_URL).catch(reportFailure)
    await starting
  } finally { busy = false }
}

async function main(): Promise<void> {
  await app.whenReady()
  try { selected = profiles.active } catch (error) { reportFailure(error) }
  protocol.handle('dsh-app', async request => {
    const url = new URL(request.url)
    if (url.hostname === 'shell') {
      const file = new Map([['/index.html', 'index.html'], ['/shell.js', 'shell.js'], ['/shell.css', 'shell.css']]).get(url.pathname)
      if (!file || request.method !== 'GET') return new Response(null, { status: 404 })
      const types = { 'index.html': 'text/html', 'shell.js': 'text/javascript', 'shell.css': 'text/css' }
      return new Response(await readFile(join(root, 'renderer', file)), { headers: {
        'content-type': `${types[file as keyof typeof types]}; charset=utf-8`,
        'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-src 'none'",
      } })
    }
    if (url.hostname !== 'app') return new Response(null, { status: 404 })
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/assets/')
      || ['/favicon.svg', '/manifest.webmanifest'].includes(url.pathname)) return serveWebDocument(request, webRoot)
    if (!backend.host || !hostUrl || !hostCookie) return new Response(null, { status: 503 })
    return forwardWebRequest(request, hostUrl, hostCookie)
  })
  ipcMain.handle(IPC.boot, async event => {
    assertSender(event, mainWindow, APP_URL)
    await startup
    if (!backend.host || !hostUrl) throw new Error('Next Host is unavailable')
    return { injections, streamBaseUrl: new URL(hostUrl).origin }
  })
  ipcMain.handle(IPC.failed, (event, message: unknown) => {
    assertSender(event, mainWindow, APP_URL)
    if (typeof message !== 'string') throw new Error('Invalid boot error')
    reportFailure(new Error(message.slice(0, 4096)))
  })
  ipcMain.handle(IPC.state, event => {
    assertSender(event, shellWindow, 'dsh-app://shell/')
    let features = { ...DEFAULT_FEATURES }
    try { features = profiles.features(selected) } catch (error) { failure = String(error) }
    return { selected, profiles: profiles.list(), features, phase: backend.state.phase, failure: failure.slice(-8000), home }
  })
  ipcMain.handle(IPC.command, (event, value: unknown) => {
    assertSender(event, shellWindow, 'dsh-app://shell/')
    return command(value)
  })
  let picking: Promise<string | null> | undefined
  ipcMain.handle(IPC.directory, event => {
    assertSender(event, mainWindow, APP_URL)
    const window = mainWindow!
    if (window.isMinimized()) window.restore()
    window.show(); window.focus()
    picking ??= dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      .then(result => result.canceled ? null : result.filePaths[0] ?? null).finally(() => { picking = undefined })
    return picking
  })
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    if (!hostUrl || !hostCookie || details.webContentsId !== mainWindow?.webContents.id) return callback({})
    const host = new URL(hostUrl)
    if (new URL(details.url).host !== host.host) return callback({})
    const headers = Object.fromEntries(Object.entries(details.requestHeaders).map(([key, value]) => [key.toLowerCase(), value]))
    if (headers.origin !== 'dsh-app://app') return callback({ cancel: true })
    callback({ requestHeaders: { ...headers, origin: host.origin, cookie: hostCookie, 'sec-fetch-site': 'same-origin' } })
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'DSH Desktop Next', submenu: [
      { label: 'Profile 与附加功能…', accelerator: 'CmdOrCtrl+,', click: openControls },
      { label: '重启 Host', click: () => { void command({ type: 'restart' }).catch(reportFailure) } },
      { label: '恢复当前 Profile…', click: () => { void command({ type: 'recover' }).catch(reportFailure) } },
      { type: 'separator' }, { role: 'quit' },
    ] }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  const openMain = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); return }
    mainWindow = createWindow('preload-app.cjs')
    mainWindow.on('closed', () => { mainWindow = undefined })
    mainWindow.webContents.on('render-process-gone', (_event, details) => { if (!quitting) reportFailure(new Error(`Renderer: ${details.reason}`)) })
    mainWindow.webContents.on('preload-error', (_event, _path, error) => reportFailure(error))
    mainWindow.webContents.on('did-fail-load', (_event, code, message, _url, isMain) => {
      if (isMain && code !== -3 && !quitting) reportFailure(new Error(message))
    })
    void mainWindow.loadURL(APP_URL).catch(reportFailure)
  }
  void start()
  openMain()
  app.on('activate', openMain)
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}

app.on('before-quit', event => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void backend.close().then(() => app.quit(), error => { console.error(error); app.exit(1) })
})
if (claimDesktopSingleInstance(app, () => { mainWindow?.show(); mainWindow?.focus() })) void main().catch(reportFailure)
