import type { SidebarBrowserBridge, SidebarBrowserCommand, SidebarBrowserState } from '../sidebar-browser-contract.ts'
import { sidebarBrowserUrl } from '../sidebar-browser-contract.ts'

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never
export class NativeBrowserTab {
  readonly id = crypto.randomUUID()
  private value: SidebarBrowserState = { id: this.id, revision: -1, url: '', title: '', loading: false,
    canGoBack: false, canGoForward: false, error: null }
  private readonly listeners = new Set<() => void>()
  private tail: Promise<unknown> = Promise.resolve()
  private opened = false
  private disposed = false
  constructor(private readonly bridge: SidebarBrowserBridge) {}
  getSnapshot = (): SidebarBrowserState => this.value
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  receive(state: SidebarBrowserState): void {
    if (this.disposed || state.revision < this.value.revision) return
    this.value = state
    for (const listener of this.listeners) listener()
  }
  open(url?: string): void {
    if (this.opened || this.disposed) return
    this.opened = true
    this.run({ type: 'open', ...(url ? { url } : {}) })
  }
  navigate(value: string): void {
    try { this.run({ type: 'navigate', url: sidebarBrowserUrl(value) }) } catch (error) { this.failed(error) }
  }
  run(command: WithoutId<SidebarBrowserCommand>): void {
    if (this.disposed) return
    this.tail = this.tail.then(() => this.bridge.command({ ...command, id: this.id } as SidebarBrowserCommand))
      .then(state => { if (state) this.receive(state) }).catch(error => { this.failed(error) })
  }
  private failed(error: unknown): void {
    this.receive({ ...this.value, loading: false, error: error instanceof Error ? error.message : 'Browser page could not load' })
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // A close cannot overtake a pending creation or bounds update.
    void this.tail.then(() => this.bridge.command({ type: 'close', id: this.id })).catch(() => {})
    this.listeners.clear()
  }
}

/** A tab occurrence owns its view; hiding/remounting a body retains its native history. */
export class NativeBrowserTabs {
  private readonly occurrences = new WeakMap<AbortSignal, NativeBrowserTab>()
  private readonly tabs = new Map<string, NativeBrowserTab>()
  constructor(private readonly bridge: SidebarBrowserBridge) {}
  start(): () => void {
    const unsubscribe = this.bridge.subscribe(state => this.tabs.get(state.id)?.receive(state))
    return () => {
      unsubscribe()
      for (const tab of this.tabs.values()) tab.dispose()
      this.tabs.clear()
    }
  }
  get(signal: AbortSignal): NativeBrowserTab {
    let tab = this.occurrences.get(signal)
    if (!tab) {
      tab = new NativeBrowserTab(this.bridge)
      this.occurrences.set(signal, tab)
      this.tabs.set(tab.id, tab)
      const created = tab
      const close = (): void => { created.dispose(); this.tabs.delete(created.id) }
      if (signal.aborted) close()
      else signal.addEventListener('abort', close, { once: true })
    }
    return tab
  }
}
