import { expect, it, vi } from 'vitest'
import type { SidebarBrowserBridge, SidebarBrowserCommand, SidebarBrowserState } from '../src/sidebar-browser-contract.ts'
import { NativeBrowserTabs } from '../src/client/sidebar-browser-state.ts'

it('retains a view across body remounts and closes it only after its pending open when the tab ends', async () => {
  let finish!: (value: SidebarBrowserState) => void
  let emit!: (state: SidebarBrowserState) => void
  const command = vi.fn((request: SidebarBrowserCommand) => request.type === 'open'
    ? new Promise<SidebarBrowserState>(resolve => { finish = resolve }) : Promise.resolve(null))
  const unsubscribe = vi.fn()
  const bridge: SidebarBrowserBridge = { command, subscribe: listener => { emit = listener; return unsubscribe } }
  const tabs = new NativeBrowserTabs(bridge)
  const dispose = tabs.start()
  const lifetime = new AbortController()
  const tab = tabs.get(lifetime.signal)
  tab.open('https://github.com/')
  expect(tabs.get(lifetime.signal)).toBe(tab)
  tabs.get(lifetime.signal).open('https://ignored.example/')
  await vi.waitFor(() => expect(command).toHaveBeenCalledOnce())
  const snapshot = { id: tab.id, revision: 4, url: 'https://github.com/new', title: '', loading: false, canGoBack: true, canGoForward: false, error: null }
  emit(snapshot)
  finish({ ...snapshot, revision: 1, url: 'https://github.com/' })
  await vi.waitFor(() => expect(tab.getSnapshot().url).toBe(snapshot.url))
  lifetime.abort()
  await vi.waitFor(() => expect(command).toHaveBeenLastCalledWith({ type: 'close', id: tab.id }))
  emit({ ...snapshot, revision: 5, url: 'https://stale.example/' })
  expect(tab.getSnapshot().url).toBe(snapshot.url)
  dispose()
  expect(unsubscribe).toHaveBeenCalledOnce()
})

it('queues bounds and navigation after creation and releases every tab when the plugin unloads', async () => {
  const requests: SidebarBrowserCommand[] = []
  const tabs = new NativeBrowserTabs({ command: async request => { requests.push(request); return null }, subscribe: () => () => {} })
  const dispose = tabs.start()
  const tab = tabs.get(new AbortController().signal)
  tab.open()
  tab.run({ type: 'bounds', bounds: { x: 10, y: 20, width: 200, height: 300 } })
  tab.navigate('localhost:3000')
  dispose()
  await vi.waitFor(() => expect(requests.map(request => request.type)).toEqual(['open', 'bounds', 'navigate', 'close']))
  expect(requests[2]).toMatchObject({ url: 'http://localhost:3000/' })
})
