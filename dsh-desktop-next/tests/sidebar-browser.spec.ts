import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeSidebarBrowser } from '../src/sidebar-browser.ts'
import { sidebarBrowserUrl, type SidebarBrowserState } from '../src/sidebar-browser-contract.ts'

const fixture = vi.hoisted(() => ({ views: [] as any[], sessions: [] as any[] }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    session: { fromPartition: vi.fn((name: string) => {
      const partition = Object.assign(new EventEmitter(), {
        name, setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
      })
      fixture.sessions.push(partition)
      return partition
    }) },
    WebContentsView: class {
      setBounds = vi.fn()
      setVisible = vi.fn()
      webContents = Object.assign(new EventEmitter(), {
        url: '', title: '', loading: false, destroyed: false,
        loadURL: vi.fn(async (_url: string) => {}), reload: vi.fn(),
        navigationHistory: { canGoBack: vi.fn(() => false), canGoForward: vi.fn(() => false), goBack: vi.fn(), goForward: vi.fn() },
        setWindowOpenHandler: vi.fn(), close: vi.fn(),
        isDestroyed: () => this.webContents.destroyed, getURL: () => this.webContents.url,
        getTitle: () => this.webContents.title, isLoading: () => this.webContents.loading,
      })
      constructor(readonly options: unknown) { fixture.views.push(this) }
    },
  }
})

const owner = { contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  webContents: { getZoomFactor: () => 1.25 }, getContentBounds: () => ({ width: 1000, height: 700 }), isDestroyed: () => false }
let updates: SidebarBrowserState[]
let browser: NativeSidebarBrowser
beforeEach(() => {
  fixture.views.length = 0; fixture.sessions.length = 0
  updates = []
  browser = new NativeSidebarBrowser(owner as unknown as BrowserWindow, state => updates.push(state), () => ['http://127.0.0.1:12345'])
})

it('loads a real top-level URL in a sandboxed session isolated from the DSH renderer and other tabs', () => {
  browser.command({ type: 'open', id: 'a', url: 'https://github.com/jie023/workbuddy-acp-bridge' })
  browser.command({ type: 'open', id: 'b' })
  expect(fixture.views[0].webContents.loadURL).toHaveBeenCalledWith('https://github.com/jie023/workbuddy-acp-bridge')
  const options = fixture.views[0].options.webPreferences
  expect(options).toMatchObject({ nodeIntegration: false, sandbox: true, contextIsolation: true,
    webSecurity: true, webviewTag: false, allowRunningInsecureContent: false })
  expect(options.preload).toBeUndefined()
  expect(options.session).toBe(fixture.sessions[0])
  expect(fixture.sessions[0].name).not.toBe(fixture.sessions[1].name)
  expect(fixture.sessions.every(partition => !partition.name.startsWith('persist:'))).toBe(true)
  const request = vi.fn()
  fixture.sessions[0].setPermissionRequestHandler.mock.calls[0][0](null, 'media', request)
  expect(request).toHaveBeenCalledWith(false)
  expect(fixture.sessions[0].setPermissionCheckHandler.mock.calls[0][0]()).toBe(false)
})

it('reports actual page and History API navigation and drives native back/forward', () => {
  browser.command({ type: 'open', id: 'a', url: 'https://github.com/' })
  const contents = fixture.views[0].webContents
  contents.url = 'https://github.com/jie023/workbuddy-acp-bridge'; contents.title = 'WorkBuddy bridge'
  contents.navigationHistory.canGoBack.mockReturnValue(true)
  contents.emit('did-navigate-in-page')
  expect(updates.at(-1)).toMatchObject({ url: contents.url, title: contents.title, canGoBack: true })
  browser.command({ type: 'back', id: 'a' })
  expect(contents.navigationHistory.goBack).toHaveBeenCalledOnce()
  browser.command({ type: 'forward', id: 'a' })
  expect(contents.navigationHistory.goForward).not.toHaveBeenCalled()
  contents.navigationHistory.canGoForward.mockReturnValue(true)
  browser.command({ type: 'forward', id: 'a' })
  expect(contents.navigationHistory.goForward).toHaveBeenCalledOnce()
})

it('scales and clips surface bounds, hides covered tabs and disposes views without beforeunload prompts', () => {
  browser.command({ type: 'open', id: 'a' })
  const view = fixture.views[0]
  browser.command({ type: 'bounds', id: 'a', bounds: { x: 400, y: 200, width: 500, height: 300 } })
  expect(view.setBounds).toHaveBeenLastCalledWith({ x: 500, y: 250, width: 500, height: 375 })
  expect(view.setVisible).toHaveBeenLastCalledWith(true)
  browser.command({ type: 'bounds', id: 'a', bounds: null })
  expect(view.setVisible).toHaveBeenLastCalledWith(false)
  expect(() => browser.command({ type: 'bounds', id: 'a', bounds: { x: NaN, y: 0, width: 2, height: 2 } })).toThrow('bounds')
  browser.dispose()
  expect(view.webContents.close).toHaveBeenCalledWith({ waitForBeforeUnload: false })
  expect(() => browser.command({ type: 'reload', id: 'a' })).toThrow('closed')
})

it('blocks application origins and non-web navigation, including redirects and popup targets', () => {
  browser.command({ type: 'open', id: 'a', url: 'https://github.com/' })
  const contents = fixture.views[0].webContents
  for (const url of ['dsh-app://app/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:password@example.com/', 'http://127.0.0.1:12345/']) {
    expect(() => browser.command({ type: 'navigate', id: 'a', url })).toThrow()
    for (const event of ['will-navigate', 'will-redirect']) {
      const preventDefault = vi.fn()
      contents.emit(event, { preventDefault }, url)
      expect(preventDefault).toHaveBeenCalledOnce()
    }
  }
  const popup = contents.setWindowOpenHandler.mock.calls[0][0]
  expect(popup({ url: 'https://github.com/new' })).toEqual({ action: 'deny' })
  expect(contents.loadURL).toHaveBeenLastCalledWith('https://github.com/new')
  popup({ url: 'file:///etc/passwd' })
  expect(contents.loadURL).toHaveBeenCalledTimes(2)
})

it('surfaces main-frame loading failures, ignores canceled/subframe loads and permits retry', () => {
  browser.command({ type: 'open', id: 'a', url: 'https://github.com/' })
  const contents = fixture.views[0].webContents
  contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', '', true)
  contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', false)
  expect(updates.at(-1)?.error).toBeNull()
  contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', true)
  expect(updates.at(-1)?.error).toBe('ERR_NAME_NOT_RESOLVED')
  expect(browser.command({ type: 'reload', id: 'a' })?.error).toBeNull()
  expect(contents.reload).toHaveBeenCalledOnce()
})

describe('addresses', () => {
  it.each([['github.com/path', 'https://github.com/path'], ['localhost:3000', 'http://localhost:3000/'],
    ['[::1]:3000', 'http://[::1]:3000/'], ['https://example.com/a?q=1#b', 'https://example.com/a?q=1#b']])('normalizes %s', (input, expected) => {
    expect(sidebarBrowserUrl(input)).toBe(expected)
  })
  it.each(['', 'data:text/html,x', 'about:blank', 'file:///tmp/a', 'https://a:b@example.com', 'https://example.com/\nsecret'])('rejects %s', input => {
    expect(() => sidebarBrowserUrl(input)).toThrow()
  })
})
