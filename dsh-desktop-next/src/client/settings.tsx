/** Mount the existing Desktop page and controls against Next's native adapter. */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { DesktopSettingsSection, DesktopSettingsToggleRow } from '../../../dsh-plugin-desktop-beta/src/client/DesktopSettingsSection.tsx'
import { DesktopNativeActions } from '../../../dsh-plugin-desktop-beta/src/client/DesktopNativeActions.tsx'
import { en, zh, type DesktopSettingsLocaleKey } from '../../../dsh-plugin-desktop-beta/src/client/desktop-settings-locales.ts'
import type { DesktopCommand, DesktopState } from '../desktop-contract.ts'
import { NextSettingsAdapter } from './settings-adapter.ts'

export function useDesktopState(adapter: NextSettingsAdapter): DesktopState | undefined {
  const state = useSyncExternalStore(adapter.subscribe, adapter.getSnapshot)
  useEffect(() => {
    void adapter.refresh().catch(() => {})
    const timer = setInterval(() => { if (!document.hidden) void adapter.refresh().catch(() => {}) }, 2000)
    return () => clearInterval(timer)
  }, [adapter])
  return state
}

export function desktopTranslate(language: string): (key: string) => string {
  const copy = language.startsWith('zh') ? zh : en
  return key => {
    if (key === 'presentationTitle') return language.startsWith('zh') ? '窗口外观' : 'Window appearance'
    if (key === 'windowMaterialBody') return language.startsWith('zh') ? '设置窗口背景效果，更改后立即生效。' : 'Set the window background effect. Changes apply immediately.'
    if (key === 'deleteProfileWarning') return language.startsWith('zh') ? '此 Profile 将移入恢复备份目录。共享的会话和设置会保留。' : 'Move this Profile to recovery backups. Shared sessions and settings are retained.'
    if (key === 'presentationIntro') return language.startsWith('zh') ? '设置当前平台支持的窗口外观。' : 'Choose the window appearance supported on this platform.'
    if (key === 'browserCompatibilityNotice') return language.startsWith('zh') ? '开关即时生效；关闭访问会断开已有的浏览器连接。' : 'Changes take effect immediately. Disabling access disconnects existing browser connections.'
    return Object.hasOwn(copy, key) ? copy[key as DesktopSettingsLocaleKey] : key
  }
}

export function NextDesktopSettings({ adapter, language }: { adapter: NextSettingsAdapter; language: string }) {
  const state = useDesktopState(adapter)
  const t = desktopTranslate(language)
  return <div data-next-desktop-settings=""><DesktopSettingsSection
    t={t} api={adapter.api} platform={state?.platform === 'darwin' || state?.platform === 'win32' ? state.platform : 'linux'}
    initialMode="compatibility" micaSupported={state?.windowsMicaSupported ?? false}
    setMode={async () => { throw new Error('Window modes are not supported in Next') }}
    desktopSettings={adapter.desktopSettings} notificationSettings={adapter.notificationSettings}
    capabilities={{ windowModes: false, featuresReadOnly: state?.safeMode ?? true, markets: ['disabled', 'community-market'], materialRequiresRestart: false, nativeLanConfirmation: true }}
    extraSections={state && <NextDesktopOptions adapter={adapter} state={state} language={language} />}
  /></div>
}

export function NextDesktopActions({ adapter, language }: { adapter: NextSettingsAdapter; language: string }) {
  const state = useDesktopState(adapter)
  return <DesktopNativeActions api={adapter.api} t={desktopTranslate(language)} placement="settings" terminalAvailable={state?.platform === 'darwin' || state?.platform === 'win32'} />
}

/** Next-only preferences use the existing Desktop form and switch components. */
function NextDesktopOptions({ adapter, state, language }: { adapter: NextSettingsAdapter; state: DesktopState; language: string }) {
  const t = (cn: string, en: string): string => language.startsWith('zh') ? cn : en
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [ports, setPorts] = useState<{ port: number; lanPort: number }>()
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true); setFailure('')
    try { await operation() } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const action = (type: DesktopCommand['type'], cn: string, en: string) => <button key={type} type="button" className="dshDesktopSettingsButton dshDesktopSettingsButtonSecondary" disabled={busy || state.busy} onClick={() => { void run(() => adapter.command({ type } as DesktopCommand)) }}>{t(cn, en)}</button>
  return <>
    {failure && <p role="alert" className="dshDesktopSettingsError">{failure}</p>}
    <section className="dshDesktopSettingsGroup"><h3>{t('后台运行', 'Background operation')}</h3>
      <DesktopSettingsToggleRow label={t('关闭窗口后保持后台运行', 'Keep running after closing the window')} checked={state.preferences.closeToTray} disabled={busy || state.busy} onChange={closeToTray => { void run(() => adapter.savePreferences({ closeToTray })) }} />
      <p className="dshDesktopSettingsHint">{state.trayAvailable ? t('可从托盘重新打开窗口。', 'Reopen the window from the tray.') : t('系统托盘不可用，关闭主窗口将退出应用。', 'The tray is unavailable; closing the main window quits the application.')}</p>
    </section>
    <section className="dshDesktopSettingsGroup"><h3>{t('端口设置', 'Port settings')}</h3>
      <form className="dshDesktopSettingsForm" onSubmit={event => { event.preventDefault(); void run(async () => { await adapter.savePreferences(ports ?? state.preferences); setPorts(undefined) }) }}>
        {(['port', 'lanPort'] as const).map(key => <label key={key} className="dshDesktopSettingsField">{key === 'port' ? t('本机端口', 'Local port') : t('局域网 HTTPS 端口', 'LAN HTTPS port')}<input className="dshDesktopSettingsInput" type="number" min="0" max="65535" required value={(ports ?? state.preferences)[key]} disabled={busy || state.busy || state.safeMode} onChange={event => { setPorts({ port: state.preferences.port, lanPort: state.preferences.lanPort, ...ports, [key]: Number(event.currentTarget.value) }) }} /></label>)}
        <button className="dshDesktopSettingsButton" disabled={busy || state.busy || state.safeMode}>{t('保存端口', 'Save ports')}</button>
      </form><p className="dshDesktopSettingsHint">{t('0 表示自动分配。更改端口需要重启后台服务。', 'Use 0 for an automatic port. Port changes restart the background service.')}</p>
    </section>
    <section className="dshDesktopSettingsGroup"><h3>{t('桌面工具', 'Desktop tools')}</h3>
      <div className="dshDesktopSettingsDialogActions">{action('open-home', '打开数据目录', 'Open data directory')}{action('open-profile', '打开 Profile 目录', 'Open Profile directory')}{action('open-logs', '打开日志目录', 'Open log directory')}{action('devtools', '开发者工具', 'Developer Tools')}</div>
      {state.browserUrl && <div className="dshDesktopSettingsDialogActions">{action('copy-browser', '复制本机登录链接', 'Copy local login link')}{state.lan?.state === 'ready' && <>{action('copy-lan', '复制局域网登录链接', 'Copy LAN login link')}{action('export-ca', '导出 CA 证书', 'Export CA certificate')}</>}</div>}
      <label className="dshDesktopSettingsMaterialField">{t('日志级别', 'Log level')}<select className="dshDesktopSettingsSelect" value={state.preferences.logLevel} disabled={busy || state.busy} onChange={event => { const logLevel = event.currentTarget.value as DesktopState['preferences']['logLevel']; void run(() => adapter.savePreferences({ logLevel })) }}>{['debug', 'info', 'warn', 'error'].map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" className="dshDesktopSettingsButton" onClick={() => { void run(() => adapter.command({ type: 'controls', page: 'recovery' })) }}>{t('打开恢复助手', 'Open recovery assistant')}</button>
    </section>
  </>
}
