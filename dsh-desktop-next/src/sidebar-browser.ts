/** Isolated native page surfaces behind the official right-sidebar Browser UI. */
import { randomUUID } from 'node:crypto'
import { WebContentsView, session, type BrowserWindow } from 'electron'
import { sidebarBrowserUrl, type BrowserBounds, type SidebarBrowserCommand, type SidebarBrowserState } from './sidebar-browser-contract.ts'

interface BrowserTab {
  view: WebContentsView
  state: SidebarBrowserState
  bounds: BrowserBounds | null
  loadSequence: number
}

export class NativeSidebarBrowser {
  private readonly tabs = new Map<string, BrowserTab>()
  constructor(private readonly window: BrowserWindow, private readonly publish: (state: SidebarBrowserState) => void,
    private readonly blockedOrigins: () => readonly string[] = () => []) {}

  private target(value: string): string {
    const url = sidebarBrowserUrl(value)
    if (this.blockedOrigins().includes(new URL(url).origin)) throw new Error('The DSH application cannot be opened inside a browser tab')
    return url
  }

  command(input: unknown): SidebarBrowserState | null {
    if (typeof input !== 'object' || input === null) throw new Error('Invalid browser command')
    const command = input as SidebarBrowserCommand
    if (typeof command.id !== 'string' || !/^[\w-]{1,128}$/u.test(command.id)) throw new Error('Invalid browser tab')
    if (!['open', 'navigate', 'bounds', 'back', 'forward', 'reload', 'close'].includes(command.type)) throw new Error('Invalid browser action')
    if (command.type === 'close') { this.close(command.id); return null }
    if (command.type === 'open') {
      const target = command.url === undefined ? undefined : this.target(command.url)
      if (!this.tabs.has(command.id)) {
        if (this.tabs.size >= 64) throw new Error('Too many native browser tabs')
        const tab = this.create(command.id)
        if (target) this.load(tab, target)
      }
    }
    const tab = this.tabs.get(command.id)
    if (!tab) throw new Error('Browser tab is closed')
    const contents = tab.view.webContents
    switch (command.type) {
      case 'navigate': this.load(tab, this.target(command.url)); break
      case 'back': if (contents.navigationHistory.canGoBack()) { tab.state.error = null; contents.navigationHistory.goBack() } break
      case 'forward': if (contents.navigationHistory.canGoForward()) { tab.state.error = null; contents.navigationHistory.goForward() } break
      case 'reload': tab.state.error = null; contents.reload(); break
      case 'bounds': {
        const bounds = command.bounds
        if (bounds !== null && (typeof bounds !== 'object' || ['x', 'y', 'width', 'height'].some(key =>
          typeof bounds[key as keyof BrowserBounds] !== 'number' || !Number.isFinite(bounds[key as keyof BrowserBounds])))) {
          throw new Error('Invalid browser bounds')
        }
        tab.bounds = bounds
        this.layout(tab)
        break
      }
    }
    return { ...tab.state }
  }

  private create(id: string): BrowserTab {
    // Each occurrence has an in-memory partition, with no app protocol or preload.
    const partition = session.fromPartition(`dsh-next-browser-${randomUUID()}`)
    partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    partition.setPermissionCheckHandler(() => false)
    partition.on('will-download', event => event.preventDefault())
    const view = new WebContentsView({ webPreferences: {
      session: partition, contextIsolation: true, sandbox: true, nodeIntegration: false,
      nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false, webviewTag: false,
      webSecurity: true, allowRunningInsecureContent: false, navigateOnDragDrop: false,
    } })
    const tab: BrowserTab = { view, bounds: null, loadSequence: 0, state: {
      id, revision: 0, url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: null,
    } }
    this.tabs.set(id, tab)
    view.setVisible(false)
    this.window.contentView.addChildView(view)
    const contents = view.webContents
    const update = (): void => this.update(tab)
    contents.on('did-start-loading', update)
    contents.on('did-stop-loading', () => this.update(tab, true))
    contents.on('did-navigate', () => this.update(tab, true))
    contents.on('did-navigate-in-page', () => this.update(tab, true))
    contents.on('page-title-updated', update)
    contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) { tab.state.error = description; update() }
    })
    contents.on('render-process-gone', () => { tab.state.error = 'Browser page stopped'; update() })
    const navigation = (event: Electron.Event, url: string): void => {
      try { this.target(url) } catch { event.preventDefault() }
    }
    contents.on('will-navigate', navigation)
    contents.on('will-redirect', navigation)
    contents.setWindowOpenHandler(({ url }) => {
      // Keep ordinary target=_blank links in this tab; never expose a native popup.
      try { this.load(tab, this.target(url)) } catch { /* Unsupported popup target. */ }
      return { action: 'deny' }
    })
    return tab
  }

  private load(tab: BrowserTab, url: string): void {
    const sequence = ++tab.loadSequence
    tab.state = { ...tab.state, url, error: null, loading: true }
    this.publishState(tab)
    void tab.view.webContents.loadURL(url).catch((error: unknown) => {
      if (this.tabs.get(tab.state.id) !== tab || tab.loadSequence !== sequence || (error as { code?: string }).code === 'ERR_ABORTED') return
      tab.state.error = error instanceof Error ? error.message : 'Browser page could not load'
      tab.state.loading = false
      this.publishState(tab)
    })
  }

  private update(tab: BrowserTab, navigated = false): void {
    const contents = tab.view.webContents
    if (contents.isDestroyed() || this.tabs.get(tab.state.id) !== tab) return
    const url = contents.getURL()
    // An error page or the initial about:blank must not replace the address bar.
    if (navigated && /^https?:\/\//u.test(url)) tab.state.url = url
    tab.state.title = contents.getTitle()
    tab.state.loading = contents.isLoading()
    tab.state.canGoBack = contents.navigationHistory.canGoBack()
    tab.state.canGoForward = contents.navigationHistory.canGoForward()
    this.publishState(tab)
  }

  private publishState(tab: BrowserTab): void {
    tab.state.revision++
    this.publish({ ...tab.state })
  }

  private layout(tab: BrowserTab): void {
    const bounds = tab.bounds
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) { tab.view.setVisible(false); return }
    const viewport = this.window.getContentBounds()
    const zoom = this.window.webContents.getZoomFactor()
    const x = Math.max(0, Math.round(bounds.x * zoom)), y = Math.max(0, Math.round(bounds.y * zoom))
    const right = Math.min(viewport.width, Math.round((bounds.x + bounds.width) * zoom))
    const bottom = Math.min(viewport.height, Math.round((bounds.y + bounds.height) * zoom))
    if (right <= x || bottom <= y) { tab.view.setVisible(false); return }
    tab.view.setBounds({ x, y, width: right - x, height: bottom - y })
    tab.view.setVisible(true)
  }

  close(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    this.tabs.delete(id)
    tab.view.setVisible(false)
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view)
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close({ waitForBeforeUnload: false })
  }
  dispose(): void { for (const id of this.tabs.keys()) this.close(id) }
}
