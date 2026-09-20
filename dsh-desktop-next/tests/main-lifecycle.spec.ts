/** Native lifecycle contracts exercised without starting Electron or a Host. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, it, vi } from 'vitest'
import { DEFAULT_PREFERENCES } from '../src/desktop-contract.ts'
import type { NextDesktopRuntime } from '../src/desktop-runtime.ts'
import { NextProfiles } from '../src/profiles.ts'

const fixture = vi.hoisted(() => ({
  windows: [] as any[], trays: [] as any[], handlers: new Map<string, (...args: any[]) => any>(),
  close: vi.fn(async () => {}), start: vi.fn(async () => {}), preferences: { closeToTray: true },
  phase: 'ready' as 'ready' | 'error',
  needsOnboarding: false, corruptProfile: false, restart: vi.fn(),
  onPermission: undefined as ConstructorParameters<typeof NextDesktopRuntime>[0]['onPermission'],
}))
vi.mock('../src/desktop-runtime.ts', async () => { const { NextProfiles } = await import('../src/profiles.ts'); return { NextDesktopRuntime: class {
  preferences = { ...DEFAULT_PREFERENCES }
  busy = false
  selected = 'desktop'
  safeMode = false
  recoveryMode = false
  backend = { host: undefined, get state() { return { phase: fixture.phase } } }
  profiles: NextProfiles
  diagnostics = { append: vi.fn(), flush: vi.fn() }
  constructor(options: ConstructorParameters<typeof NextDesktopRuntime>[0]) {
    fixture.preferences = this.preferences; fixture.onPermission = options.onPermission
    this.profiles = new NextProfiles(options.home)
    this.profiles.ensure('desktop')
    if (!fixture.needsOnboarding) this.profiles.finishOnboarding('desktop')
    if (fixture.corruptProfile) writeFileSync(join(this.profiles.directory('desktop'), 'package.json'), '{broken')
  }
  initialize() {}
  start = fixture.start
  close = fixture.close
  restart = fixture.restart
  browserLinks() { return { localUrl: null, lanUrls: [] } }
  state() { return { selected: 'desktop', profiles: ['desktop'], unavailableProfiles: [], features: fixture.corruptProfile ? { remoteControl: false, market: true } : this.profiles.features(this.selected),
    preferences: this.preferences, phase: this.recoveryMode ? 'recovery' : fixture.phase, busy: this.busy, failure: 'Fixture Host failure', safeMode: this.safeMode,
    home: 'temporary', browserUrl: null, lan: null, checkpoint: null, logs: '' } }
  report() {}
} } })
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setPath() {}, getLocale: () => 'en-US', getPreferredSystemLanguages: () => ['zh-Hans-CN', 'en-US'], isReady: () => true, whenReady: async () => {},
    requestSingleInstanceLock: () => true, exit: vi.fn(), relaunch: vi.fn(), quit: vi.fn(() => app.emit('before-quit', { preventDefault() {} })),
  })
  class BrowserWindow extends EventEmitter {
    visible = false
    loadedUrls: string[] = []
    webContents = Object.assign(new EventEmitter(), { id: fixture.windows.length + 1,
      mainFrame: { url: '' }, getURL: () => this.webContents.mainFrame.url, setWindowOpenHandler() {}, send: vi.fn(), isDestroyed: () => false,
      isFocused: () => true, executeJavaScript: vi.fn(async () => true) })
    constructor(readonly options: any) { super(); fixture.windows.push(this) }
    isDestroyed() { return false }
    isMinimized() { return false }
    isFocused() { return false }
    show() { this.visible = true }
    hide() { this.visible = false }
    focus() {}
    setSize() {}
    setResizable() {}
    setMinimumSize() {}
    close() { this.emit('closed') }
    setVibrancy() {}
    setBackgroundColor() {}
    setBackgroundMaterial() {}
    async loadURL(url: string) { this.webContents.mainFrame.url = url; this.loadedUrls.push(url) }
  }
  class Tray extends EventEmitter {
    destroyed = false
    menu: any
    tooltip = ''
    constructor() { super(); fixture.trays.push(this) }
    isDestroyed() { return this.destroyed }
    setToolTip(value: string) { this.tooltip = value }
    setContextMenu(menu: any) { this.menu = menu }
    destroy() { this.destroyed = true }
  }
  return { app, BrowserWindow, Tray,
    Notification: class { static isSupported() { return false } },
    clipboard: {}, dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })) }, shell: {}, safeStorage: {}, nativeTheme: { shouldUseDarkColors: true, on() {} },
    nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage() {} }) },
    Menu: { buildFromTemplate: (items: any) => items, setApplicationMenu() {} },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} },
    session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} }, setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, setDisplayMediaRequestHandler() {} } },
    systemPreferences: { getMediaAccessStatus: () => 'not-determined', askForMediaAccess: vi.fn(async () => false), isTrustedAccessibilityClient: () => false },
    desktopCapturer: { getSources: vi.fn(async () => []) },
    ipcMain: { handle: (name: string, action: (...args: any[]) => any) => fixture.handlers.set(name, action), on: (name: string, action: (...args: any[]) => any) => fixture.handlers.set(name, action) },
  }
})

beforeEach(async () => {
  vi.resetModules()
  fixture.windows.length = 0; fixture.trays.length = 0; fixture.handlers.clear()
  fixture.phase = 'ready'
  fixture.needsOnboarding = false; fixture.corruptProfile = false; fixture.restart.mockReset()
  fixture.start.mockClear(); fixture.close.mockReset().mockResolvedValue(undefined)
  const { app } = await import('electron')
  app.removeAllListeners()
  vi.mocked(app.relaunch).mockClear()
  vi.mocked(app.quit).mockClear()
})

it('retains the Host when hiding to tray, restores the window, keeps failed-Host controls, validates IPC, and stops on explicit quit', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-main-native-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const window = fixture.windows[0]
    const tray = fixture.trays[0]
    expect(tray.menu[0].label).toBe('打开 DSH Desktop Next')
    expect(tray.menu.at(-1).accelerator).toBe('CmdOrCtrl+Q')
    expect(tray.menu.some((item: any) => item.accelerator === 'CmdOrCtrl+,')).toBe(true)
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
    expect(state(sender).phase).toBe('ready')
    expect(() => state({ ...sender, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    expect(() => state({ sender: {}, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    const browserLinks = fixture.handlers.get('dsh-next:browser-links')!
    const permissionQuery = fixture.handlers.get('dsh-next:permission-query')!
    expect(permissionQuery(sender, 'microphone').permission).toBe('microphone')
    expect(() => permissionQuery(sender, 'camera')).toThrow('Unsupported')
    expect(() => permissionQuery({ ...sender, senderFrame: {} }, 'screen')).toThrow('Rejected')
    const permissionRequest = fixture.handlers.get('dsh-next:permission-request')!
    window.webContents.executeJavaScript.mockResolvedValueOnce(false)
    await expect(permissionRequest(sender, 'microphone')).rejects.toThrow('user gesture')
    expect(browserLinks(sender)).toEqual({ localUrl: null, lanUrls: [] })
    expect(() => browserLinks({ ...sender, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    expect(() => browserLinks({ sender: {}, senderFrame: { url: 'dsh-app://app/' } })).toThrow('Rejected')
    await expect(fixture.handlers.get('dsh-next:command')!(sender, { type: ['restart'] })).rejects.toThrow('Invalid Next command')
    await expect(fixture.handlers.get('dsh-next:command')!(sender, { type: 'controls', page: ['general'] })).rejects.toThrow('Invalid controls page')
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'controls' })
    expect(fixture.windows).toHaveLength(1)
    expect(window.visible).toBe(true)
    expect(window.webContents.send).toHaveBeenCalledWith('dsh-next:settings-open')
    const takeSettings = fixture.handlers.get('dsh-next:settings-take')!
    expect(() => takeSettings({ ...sender, senderFrame: {} })).toThrow('Rejected')
    expect(takeSettings(sender)).toBe('general')
    expect(takeSettings(sender)).toBeUndefined()
    tray.menu.find((item: any) => item.accelerator === 'CmdOrCtrl+,').click()
    expect(takeSettings(sender)).toBe('general')
    window.webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: ',', meta: true })
    expect(takeSettings(sender)).toBe('general')
    expect(fixture.windows).toHaveLength(1)
    fixture.phase = 'error'
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'controls' })
    expect(fixture.windows).toHaveLength(2)
    const controls = fixture.windows[1]
    expect(controls.webContents.mainFrame.url).toBe(`dsh-app://shell/index.html?locale=zh&platform=${process.platform}&frame=${process.platform !== 'linux'}#recovery`)
    expect(state({ sender: controls.webContents, senderFrame: controls.webContents.mainFrame }).failure).toBe('Fixture Host failure')
    expect(() => takeSettings({ sender: controls.webContents, senderFrame: controls.webContents.mainFrame })).toThrow('Rejected')
    fixture.phase = 'ready'
    fixture.handlers.get('dsh-next:locale')!({ ...sender, senderFrame: {} }, 'en')
    expect(tray.menu[0].label).toBe('打开 DSH Desktop Next')
    fixture.handlers.get('dsh-next:locale')!(sender, 'en')
    expect(tray.menu[0].label).toBe('Open DSH Desktop Next')
    const { app, dialog, systemPreferences, desktopCapturer } = await import('electron')
    const previousUrl = controls.webContents.mainFrame.url
    expect((await fixture.onPermission!('query', 'screen')).status).not.toBe('granted')
    expect(controls.webContents.mainFrame.url).toBe(previousUrl)
    expect(takeSettings(sender)).toBeUndefined()
    await fixture.onPermission!('request', 'screen')
    expect(takeSettings(sender)).toBe('permissions')
    await fixture.onPermission!('open-settings', 'microphone')
    expect(takeSettings(sender)).toBe('permissions')
    expect(controls.webContents.mainFrame.url).toBe(previousUrl)
    expect(fixture.windows).toHaveLength(2)
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled()
    expect(desktopCapturer.getSources).not.toHaveBeenCalled()
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false })
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'restart-recovery' })
    expect(fixture.close).not.toHaveBeenCalled()
    let finishClose!: () => void
    fixture.close.mockImplementationOnce(() => {
      expect(fixture.windows.every(window => !window.visible)).toBe(true)
      return new Promise<void>(resolve => { finishClose = resolve })
    })
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'restart-recovery' })
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(tray.destroyed).toBe(true)
    window.emit('ready-to-show')
    controls.emit('ready-to-show')
    app.emit('activate')
    expect(fixture.windows.every(window => !window.visible)).toBe(true)
    finishClose()
    await vi.waitFor(() => expect(app.relaunch).toHaveBeenCalledWith({ args: expect.arrayContaining(['--next-recovery']) }))
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})


it('boots recovery in the preferred OS language even when the app locale is English, without starting a Host', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-recovery-boot-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  const argv = [...process.argv]
  process.argv.push('--next-recovery')
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const controls = fixture.windows[0]
    expect(controls.webContents.mainFrame.url).toBe(`dsh-app://shell/index.html?locale=zh&platform=${process.platform}&frame=${process.platform !== 'linux'}#recovery`)
    const sender = { sender: controls.webContents, senderFrame: controls.webContents.mainFrame }
    expect(fixture.handlers.get('dsh-next:state')!(sender).phase).toBe('recovery')
    expect(fixture.trays[0].tooltip).toContain('recovery')
    expect(fixture.start).not.toHaveBeenCalled()
    fixture.trays[0].menu[0].click()
    expect(fixture.windows).toHaveLength(1)
    expect(fixture.start).not.toHaveBeenCalled()
    controls.visible = true
    fixture.close.mockImplementationOnce(async () => { expect(controls.visible).toBe(false) })
    await fixture.handlers.get('dsh-next:command')!(sender, { type: 'quit' })
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce())
  } finally { process.argv.splice(0, process.argv.length, ...argv); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it('persists a Profile switch and relaunches the app only after hiding windows and closing its Host', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-profile-switch-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const manager = new NextProfiles(home)
    manager.create('work')
    const window = fixture.windows[0]
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const command = fixture.handlers.get('dsh-next:command')!
    const { app, dialog } = await import('electron')
    await command(sender, { type: 'switch', name: 'desktop' })
    expect(app.quit).not.toHaveBeenCalled()
    await expect(command(sender, { type: 'switch', name: 'missing' })).rejects.toThrow('unavailable')
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false })
    await command(sender, { type: 'switch', name: 'work' })
    expect(manager.active).toBe('desktop')
    expect(app.quit).not.toHaveBeenCalled()
    window.visible = true
    let finishClose!: () => void
    fixture.close.mockImplementationOnce(() => {
      expect(window.visible).toBe(false)
      expect(new NextProfiles(home).active).toBe('work')
      return new Promise<void>(resolve => { finishClose = resolve })
    })
    await command(sender, { type: 'switch', name: 'work' })
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(fixture.restart).not.toHaveBeenCalled()
    expect(fixture.start).toHaveBeenCalledOnce()
    expect(window.loadedUrls).toEqual(['dsh-app://app/'])
    expect(app.relaunch).not.toHaveBeenCalled()
    finishClose()
    await vi.waitFor(() => expect(app.relaunch).toHaveBeenCalledWith({ args: expect.any(Array) }))
    expect(vi.mocked(app.relaunch).mock.calls[0]![0]!.args).not.toContain('--next-recovery')
    expect(vi.mocked(app.relaunch).mock.calls[0]![0]!.args).not.toContain('--next-safe-mode')
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it.each(['complete', 'skip'] as const)('shows first-run onboarding without a Host and saves before starting it on %s', async outcome => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  fixture.needsOnboarding = true
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const window = fixture.windows[0]
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const command = fixture.handlers.get('dsh-next:command')!
    const manager = new NextProfiles(home)
    expect(window.webContents.mainFrame.url).toContain('locale=zh')
    expect(window.webContents.mainFrame.url).toMatch(/#onboarding$/)
    expect(fixture.start).not.toHaveBeenCalled()
    fixture.trays[0].emit('click')
    await command(sender, { type: 'controls' })
    expect(window.loadedUrls).toHaveLength(1)
    expect(fixture.handlers.get('dsh-next:state')!(sender).onboarding).toBe(true)
    expect(fixture.handlers.get('dsh-next:state')!(sender).onboardingComputerUse).toBe(false)
    await expect(command(sender, { type: 'onboarding-skip', profile: 'other' })).rejects.toThrow('unavailable')
    await expect(command(sender, { type: 'onboarding-complete', profile: 'desktop', features: { market: true, dshMarket: true, remoteControl: true } })).rejects.toThrow('only one')
    await expect(command(sender, { type: 'onboarding-complete', profile: 'desktop', features: { market: false, remoteControl: false }, computerUse: 'yes' })).rejects.toThrow('Computer Use')
    expect(manager.onboardingRequired('desktop')).toBe(true)
    expect(fixture.start).not.toHaveBeenCalled()
    expect(window.loadedUrls).toHaveLength(1)
    fixture.start.mockImplementationOnce(async () => {
      expect(manager.onboardingRequired('desktop')).toBe(false)
      expect(manager.features('desktop')).toEqual(outcome === 'skip'
        ? { market: true, remoteControl: false } : { market: false, dshMarket: true, remoteControl: true })
      expect(manager.computerUseEnabled('desktop')).toBe(outcome === 'complete')
      expect(window.visible).toBe(false)
    })
    await command(sender, outcome === 'skip' ? { type: 'onboarding-skip', profile: 'desktop' }
      : { type: 'onboarding-complete', profile: 'desktop', features: { market: false, dshMarket: true, remoteControl: true }, computerUse: true })
    expect(fixture.start).toHaveBeenCalledOnce()
    expect(fixture.windows).toHaveLength(2)
    expect(fixture.windows[1].webContents.mainFrame.url).toBe('dsh-app://app/')
    const appSender = { sender: fixture.windows[1].webContents, senderFrame: fixture.windows[1].webContents.mainFrame }
    await expect(command(appSender, { type: 'onboarding-skip', profile: 'desktop' })).rejects.toThrow('unavailable')
    expect(fixture.start).toHaveBeenCalledOnce()
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it('reopens setup through a confirmed relaunch without resetting the Profile or stopping the Host before hiding windows', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-relaunch-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const window = fixture.windows[0]
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const command = fixture.handlers.get('dsh-next:command')!
    const manager = new NextProfiles(home)
    manager.finishOnboarding('desktop', { features: { market: false, dshMarket: true, remoteControl: true }, computerUse: true })
    const { app, dialog } = await import('electron')
    window.visible = true
    vi.mocked(dialog.showMessageBox).mockResolvedValueOnce({ response: 1, checkboxChecked: false })
    await command(sender, { type: 'restart-onboarding' })
    expect(app.quit).not.toHaveBeenCalled()
    expect(window.visible).toBe(true)
    expect(fixture.close).not.toHaveBeenCalled()
    let finishClose!: () => void
    fixture.close.mockImplementationOnce(() => {
      expect(window.visible).toBe(false)
      return new Promise<void>(resolve => { finishClose = resolve })
    })
    await command(sender, { type: 'restart-onboarding' })
    expect(fixture.close).toHaveBeenCalledOnce()
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(manager.onboardingRequired('desktop')).toBe(false)
    expect(manager.features('desktop')).toEqual({ market: false, dshMarket: true, remoteControl: true })
    expect(manager.computerUseEnabled('desktop')).toBe(true)
    finishClose()
    await vi.waitFor(() => expect(app.relaunch).toHaveBeenCalledWith({ args: expect.arrayContaining(['--next-onboarding']) }))
    expect(fixture.start).toHaveBeenCalledOnce()
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it.each(['complete', 'skip', 'close'] as const)('reopens a completed Profile with its saved choices and handles %s', async outcome => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-reopen-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  const argv = [...process.argv]
  process.argv.push('--next-onboarding')
  try {
    const manager = new NextProfiles(home)
    manager.ensure('desktop')
    const features = { market: false, dshMarket: true, remoteControl: true }
    manager.finishOnboarding('desktop', { features, computerUse: true })
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const window = fixture.windows[0]
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    const command = fixture.handlers.get('dsh-next:command')!
    expect(window.webContents.mainFrame.url).toMatch(/#onboarding$/)
    expect(fixture.start).not.toHaveBeenCalled()
    expect(fixture.handlers.get('dsh-next:state')!(sender)).toMatchObject({ onboarding: true, onboardingComputerUse: true, features })
    // Reopening is a launch mode, not a deletion of the completion record.
    expect(manager.onboardingRequired('desktop')).toBe(false)
    if (outcome === 'close') {
      window.close()
      expect(fixture.start).not.toHaveBeenCalled()
    } else {
      await command(sender, outcome === 'skip' ? { type: 'onboarding-skip', profile: 'desktop' }
        : { type: 'onboarding-complete', profile: 'desktop', features: { market: true, remoteControl: false }, computerUse: false })
      expect(fixture.start).toHaveBeenCalledOnce()
      expect(fixture.windows[1].webContents.mainFrame.url).toBe('dsh-app://app/')
    }
    expect(manager.features('desktop')).toEqual(outcome === 'complete' ? { market: true, remoteControl: false } : features)
    expect(manager.computerUseEnabled('desktop')).toBe(outcome !== 'complete')
    expect(manager.onboardingRequired('desktop')).toBe(false)
    if (outcome !== 'close') {
      const { app } = await import('electron')
      const main = fixture.windows[1]
      await command({ sender: main.webContents, senderFrame: main.webContents.mainFrame }, { type: 'restart-app' })
      await vi.waitFor(() => expect(app.relaunch).toHaveBeenCalled())
      expect(vi.mocked(app.relaunch).mock.calls[0]![0]!.args).not.toContain('--next-onboarding')
    }
  } finally { process.argv.splice(0, process.argv.length, ...argv); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it.each(['--next-recovery', '--next-safe-mode'])('keeps %s independent of onboarding and clears its flag when switching Profiles', async mode => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-bypass-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  fixture.needsOnboarding = true
  const argv = [...process.argv]
  process.argv.push(mode, '--next-onboarding')
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    const manager = new NextProfiles(home)
    const window = fixture.windows[0]
    const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
    expect(window.webContents.mainFrame.url).not.toContain('#onboarding')
    expect(manager.onboardingRequired('desktop')).toBe(true)
    expect(fixture.handlers.get('dsh-next:state')!(sender).onboarding).toBe(false)
    const command = fixture.handlers.get('dsh-next:command')!
    await expect(command(sender, { type: 'onboarding-skip', profile: 'desktop' })).rejects.toThrow('unavailable')
    await expect(command(sender, { type: 'restart-onboarding' })).rejects.toThrow('unavailable')
    manager.create('work')
    await command(sender, { type: 'switch', name: 'work' })
    const { app } = await import('electron')
    await vi.waitFor(() => expect(app.relaunch).toHaveBeenCalled())
    expect(vi.mocked(app.relaunch).mock.calls[0]![0]!.args).not.toContain(mode)
    expect(vi.mocked(app.relaunch).mock.calls[0]![0]!.args).not.toContain('--next-onboarding')
    expect(manager.active).toBe('work')
  } finally { process.argv.splice(0, process.argv.length, ...argv); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it('opens recovery instead of onboarding when a Profile manifest is broken', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-broken-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  fixture.needsOnboarding = true; fixture.corruptProfile = true
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    expect(fixture.windows[0].webContents.mainFrame.url).toMatch(/#recovery$/)
    expect(fixture.start).not.toHaveBeenCalled()
    expect(fixture.trays).toHaveLength(1)
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})

it('does not mark an unfinished flow complete when its window closes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'next-onboarding-close-'))
  vi.stubEnv('DSH_DESKTOP_NEXT_HOME', home)
  fixture.needsOnboarding = true
  try {
    await import('../src/main.ts')
    await vi.waitFor(() => expect(fixture.windows).toHaveLength(1))
    fixture.windows[0].close()
    expect(new NextProfiles(home).onboardingRequired('desktop')).toBe(true)
    const { app } = await import('electron')
    app.emit('activate')
    expect(fixture.windows).toHaveLength(2)
    expect(fixture.windows[1].webContents.mainFrame.url).toMatch(/#onboarding$/)
    expect(fixture.start).not.toHaveBeenCalled()
  } finally { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }) }
})
