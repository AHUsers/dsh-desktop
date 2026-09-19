/** Alpha.2 boot and directory-picker contracts; no generic IPC bridge. */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import { markDocumentPlatform } from './preload-platform.ts'
import { syncNativeTheme } from './preload-theme.ts'
import { syncWindowsAppearance } from './preload-windows.ts'
import { syncWindowMaterial } from './preload-material.ts'

if (location.protocol === 'dsh-app:' && location.hostname === 'app') {
  markDocumentPlatform()
  syncNativeTheme()
  syncWindowsAppearance()
  syncWindowMaterial()
  contextBridge.exposeInMainWorld('desktopNext', {
    state: () => ipcRenderer.invoke(IPC.state),
    command: (command: unknown) => ipcRenderer.invoke(IPC.command, command),
  })
  contextBridge.exposeInMainWorld('dshDesktop', { protocolVersion: 1 })
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => ipcRenderer.invoke(IPC.boot),
    failed: (message: string) => ipcRenderer.invoke(IPC.failed, message),
  })
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', { pick: () => ipcRenderer.invoke(IPC.directory) })
}
