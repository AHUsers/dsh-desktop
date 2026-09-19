/** One localized command tree shared by the tray and native application menu. */
import type { MenuItemConstructorOptions } from 'electron'
import type { DesktopCommand, DesktopState } from './desktop-contract.ts'

export function desktopMenu(state: DesktopState, language: string, show: () => void, run: (command: DesktopCommand) => void): MenuItemConstructorOptions[] {
  const t = (zh: string, en: string): string => language.startsWith('zh') ? zh : en
  const action = (label: string, type: DesktopCommand['type'], enabled = true): MenuItemConstructorOptions => ({
    label, enabled: enabled && (!state.busy || type === 'controls'), click: () => run({ type } as DesktopCommand),
  })
  return [
    { label: t('打开 DSH Desktop Next', 'Open DSH Desktop Next'), click: show },
    { label: state.safeMode ? t('安全模式', 'Safe mode') : `${t('当前 Profile', 'Current Profile')}: ${state.selected}`, enabled: false },
    { type: 'separator' },
    action(t('桌面设置…', 'Desktop settings…'), 'controls'),
    { label: 'Profile', submenu: [
      ...state.profiles.map(name => ({ label: name, type: 'radio' as const, checked: name === state.selected,
        enabled: !state.busy, click: () => run({ type: 'switch', name }) })),
      { type: 'separator' }, { label: t('管理 Profile…', 'Manage Profiles…'), click: () => run({ type: 'controls', page: 'profiles' }) },
    ] },
    action(t('刷新界面', 'Reload interface'), 'reload', state.phase === 'ready'),
    action(t('打开终端', 'Open terminal'), 'terminal', ['darwin', 'win32'].includes(state.platform)),
    action(t('在浏览器中打开', 'Open in browser'), 'open-browser', !!state.browserUrl),
    { label: t('诊断与恢复', 'Diagnostics and recovery'), submenu: [
      { label: t('恢复助手…', 'Recovery assistant…'), click: () => run({ type: 'controls', page: 'recovery' }) },
      action(t('重启 Host…', 'Restart Host…'), 'restart'),
      action(state.safeMode ? t('退出安全模式…', 'Leave safe mode…') : t('进入安全模式…', 'Enter safe mode…'), state.safeMode ? 'normal-mode' : 'safe-mode'),
      action(t('查看日志', 'Open logs'), 'open-logs'),
      action(t('导出诊断…', 'Export diagnostics…'), 'diagnostics'),
    ] },
    { type: 'separator' },
    { label: `Next ${state.version} · ${t('开发版，暂无自动更新', 'Development build; no update channel')}`, enabled: false },
    { label: t('退出', 'Quit'), click: () => run({ type: 'quit' }) },
  ]
}
