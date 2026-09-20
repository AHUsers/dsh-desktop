/** Alpha.2 boot and directory-picker contracts; no generic IPC bridge. */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'
import { markDocumentPlatform } from './preload-platform.ts'
import { syncNativeTheme } from './preload-theme.ts'
import { syncWindowsAppearance } from './preload-windows.ts'
import { syncWindowMaterial } from './preload-material.ts'
import { syncNativeLocale } from './preload-locale.ts'
import { permissionBridge } from './preload-permissions.ts'
import { onOpenSettings } from './preload-settings.ts'
import { sidebarBrowserBridge } from './preload-sidebar-browser.ts'

if (location.protocol === 'dsh-app:' && location.hostname === 'app') {
  markDocumentPlatform()
  syncNativeTheme()
  syncNativeLocale()
  syncWindowsAppearance()
  syncWindowMaterial()
  contextBridge.exposeInMainWorld('desktopNext', {
    permissions: permissionBridge(),
    sidebarBrowser: sidebarBrowserBridge(),
    onOpenSettings,
    state: () => ipcRenderer.invoke(IPC.state),
    browserLinks: () => ipcRenderer.invoke(IPC.browserLinks),
    command: (command: unknown) => ipcRenderer.invoke(IPC.command, command),
  })
  contextBridge.exposeInMainWorld('dshDesktop', { protocolVersion: 1 })
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => ipcRenderer.invoke(IPC.boot),
    failed: (message: string) => ipcRenderer.invoke(IPC.failed, message),
  })
  contextBridge.exposeInMainWorld('__DSH_DIRECTORY_PICKER__', { pick: () => ipcRenderer.invoke(IPC.directory) })
}
