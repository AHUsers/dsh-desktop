import { ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import type { SidebarBrowserBridge, SidebarBrowserState } from './sidebar-browser-contract.ts'

export function sidebarBrowserBridge(): SidebarBrowserBridge {
  return {
    command: command => ipcRenderer.invoke(IPC.sidebarBrowser, command),
    subscribe: listener => {
      const handler = (_event: Electron.IpcRendererEvent, state: SidebarBrowserState): void => listener(state)
      ipcRenderer.on(IPC.sidebarBrowserState, handler)
      return () => { ipcRenderer.removeListener(IPC.sidebarBrowserState, handler) }
    },
  }
}
