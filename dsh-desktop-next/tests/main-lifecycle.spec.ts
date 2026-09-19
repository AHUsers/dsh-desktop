/** Native lifecycle contracts exercised without starting Electron or a Host. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES } from '../src/desktop-contract.ts'

const fixture = vi.hoisted(() => ({
  windows: [] as any[], trays: [] as any[], handlers: new Map<string, (...args: any[]) => any>(),
  close: vi.fn(async () => {}), start: vi.fn(async () => {}), preferences: { closeToTray: true },
}))
vi.mock('../src/desktop-runtime.ts', () => ({ NextDesktopRuntime: class {
  preferences = { ...DEFAULT_PREFERENCES }
  busy = false
  selected = 'default'
  safeMode = false
  backend = { host: undefined }
  diagnostics = { append: vi.fn(), flush: vi.fn() }
  constructor() { fixture.preferences = this.preferences }
  initialize() {}
  start = fixture.start
  close = fixture.close
  state() { return { selected: 'default', profiles: ['default'], features: { remoteControl: false, market: true },
    preferences: this.preferences, phase: 'error', busy: this.busy, failure: 'Fixture Host failure', safeMode: false,
    home: 'temporary', browserUrl: null, lan: null, checkpoint: null, logs: '' } }
  report() {}
} }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setPath() {}, getLocale: () => 'zh-CN', isReady: () => true, whenReady: async () => {},
    requestSingleInstanceLock: () => true, exit: vi.fn(), quit: vi.fn(() => app.emit('before-quit', { preventDefault() {} })),
  })
  class BrowserWindow extends EventEmitter {
    visible = false
    webContents = Object.assign(new EventEmitter(), { id: fixture.windows.length + 1,
      mainFrame: { url: '' }, setWindowOpenHandler() {}, send() {}, isDestroyed: () => false })
    constructor(readonly options: any) { super(); fixture.windows.push(this) }
    isDestroyed() { return false }
    isMinimized() { return false }
    isFocused() { return false }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() {}
    setSize() {}
    setVibrancy() {}
    setBackgroundColor() {}
    setBackgroundMaterial() {}
    async loadURL(url: string) { this.webContents.mainFrame.url = url }
  }
  class Tray extends EventEmitter {
    destroyed = false
    menu: any
    constructor() { super(); fixture.trays.push(this) }
    isDestroyed() { return this.destroyed }
    setToolTip() {}
    setContextMenu(menu: any) { this.menu = menu }
    destroy() { this.destroyed = true }
  }
  return { app, BrowserWindow, Tray,
    Notification: class { static isSupported() { return false } },
    clipboard: {}, dialog: {}, shell: {}, safeStorage: {}, nativeTheme: { shouldUseDarkColors: true, on() {} },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage() {} }) },
    Menu: { buildFromTemplate: (items: any) => items, setApplicationMenu() {} },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} } } },
    ipcMain: { handle: (name: string, action: (...args: any[]) => any) => fixture.handlers.set(name, action), on() {} },
  }
})

it('retains the Host when hiding to tray, restores the window, keeps failed-Host controls, validates IPC, and stops on explicit quit', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-main-native-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const window = fixture.windows[0]
    const tray = fixture.trays[0]
    const preventDefault = vi.fn()
    window.visible = true
    window.emit('close', { preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(window.visible).toBe(false)
    expect(fixture.close).not.toHaveBeenCalled()
    tray.emit('click')
    expect(window.visible).toBe(true)
    const state = fixture.handlers.get('dsh-next:state')!
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    expect(state(sender).phase).toBe('error')
    expect(() => state({ ...sender, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    expect(() => state({ sender: {}, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'controls' })
    expect(fixture.windows).toHaveLength(2)
    const controls = fixture.windows[1]
    expect(controls.webContents.mainFrame.url).toBe('dsh-app://shell/index.html#general')
    expect(state({ sender: controls.webContents, senderFrame: controls.webContents.mainFrame }).failure).toBe('Fixture Host failure')
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'quit' })
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce())
    expect(tray.destroyed).toBe(true)
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})
