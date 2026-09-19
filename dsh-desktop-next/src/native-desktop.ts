/** Electron-only tray, materials, and privacy-safe notifications. */
import { join } from 'node:path'
import { Menu, nativeImage, nativeTheme, Notification, Tray, type BrowserWindow } from 'electron'
import { desktopMenu } from './desktop-menu.ts'
import { notificationEnabled } from './notifications.ts'
import type { DesktopCommand, DesktopPreferences, DesktopState, NotificationOutcome } from './desktop-contract.ts'
import { windowMaterial } from './window-material.ts'
import { IPC } from './ipc.ts'

export function applyWindowMaterial(window: BrowserWindow, preferences: DesktopPreferences): void {
  const material = windowMaterial(preferences)
  if (process.platform === 'darwin') window.setVibrancy(material === 'transparent' ? 'sidebar' : null)
  if (process.platform === 'win32') window.setBackgroundMaterial(material === 'mica' ? 'mica' : 'none')
  window.setBackgroundColor(material === 'off' ? nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb' : '#00000000')
  window.webContents.send(IPC.material, material)
}

export class NativeDesktop {
  private tray: Tray | undefined
  private readonly notifications = new Set<Notification>()
  constructor(private readonly options: {
    root: string; language(): string; state(): DesktopState; window(): BrowserWindow | undefined
    show(): void; run(command: DesktopCommand): void; warn(error: unknown): void
  }) {}
  get available(): boolean { return !!this.tray && !this.tray.isDestroyed() }
  createTray(): void {
    try {
      const icon = nativeImage.createFromPath(join(this.options.root, 'assets', process.platform === 'darwin' ? 'tray-iconTemplate.png' : 'tray-icon-blue.png'))
      if (icon.isEmpty()) throw new Error('Tray icon is unavailable')
      if (process.platform === 'darwin') icon.setTemplateImage(true)
      this.tray = new Tray(icon)
      this.tray.on('click', this.options.show)
      this.tray.on('double-click', this.options.show)
      this.refresh()
    } catch (error) { this.options.warn(error) }
  }
  items() { return desktopMenu(this.options.state(), this.options.language(), this.options.show, this.options.run) }
  refresh(): void {
    if (process.platform !== 'win32') Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'DSH Desktop Next', submenu: this.items() }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]))
    if (!this.available) return
    const state = this.options.state()
    this.tray!.setToolTip(`DSH Desktop Next · ${state.selected} · ${state.phase}`)
    this.tray!.setContextMenu(Menu.buildFromTemplate(this.items()))
  }
  notify(outcome: NotificationOutcome): void {
    const state = this.options.state()
    const window = this.options.window()
    if (!Notification.isSupported() || !notificationEnabled(state.preferences, outcome) || window?.isFocused()) return
    const zh = this.options.language().startsWith('zh')
    const copy = {
      'turn-completed': [zh ? '回合已完成' : 'Turn completed', zh ? '你发起的回合已完成。' : 'A turn you started has finished.'],
      'turn-failed': [zh ? '回合未能完成' : 'Turn could not finish', zh ? '打开 DSH Desktop Next 查看详情。' : 'Open DSH Desktop Next for details.'],
      'job-completed': [zh ? '后台任务已完成' : 'Background job completed', zh ? '一个后台任务已结束。' : 'A background job has finished.'],
      'job-failed': [zh ? '后台任务失败' : 'Background job failed', zh ? '打开 DSH Desktop Next 查看详情。' : 'Open DSH Desktop Next for details.'],
    }[outcome]
    const notification = new Notification({ title: copy[0], body: copy[1] })
    this.notifications.add(notification)
    notification.once('click', this.options.show)
    notification.once('close', () => this.notifications.delete(notification))
    notification.once('failed', (_event, error) => { this.notifications.delete(notification); this.options.warn(error) })
    notification.show()
    if (this.notifications.size > 10) { const oldest = this.notifications.values().next().value!; oldest.close(); this.notifications.delete(oldest) }
  }
  close(): void {
    this.tray?.destroy(); this.tray = undefined
    for (const item of this.notifications) item.close()
    this.notifications.clear()
  }
}
