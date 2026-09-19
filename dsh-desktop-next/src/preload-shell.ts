import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from './ipc.ts'

if (location.protocol === 'dsh-app:' && location.hostname === 'shell') {
  contextBridge.exposeInMainWorld('desktopNext', {
    state: () => ipcRenderer.invoke(IPC.state),
    command: (command: unknown) => ipcRenderer.invoke(IPC.command, command),
  })
}
