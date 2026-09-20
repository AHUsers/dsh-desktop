/** Reuse the Desktop settings cards for the shared native permission service. */
import { useEffect, useState } from 'react'
import type { DesktopPermission, DesktopPermissionSnapshot, DesktopPermissions } from '../permissions.ts'

export function DesktopPermissionsSection({ service, language }: { service: DesktopPermissions; language: string }) {
  const t = (zh: string, en: string): string => language.startsWith('zh') ? zh : en
  const [snapshots, setSnapshots] = useState<DesktopPermissionSnapshot[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  useEffect(() => {
    let disposed = false
    const refresh = (): void => {
      void Promise.all([service.query('microphone'), service.query('screen'), service.query('accessibility')]).then(values => {
        if (!disposed) setSnapshots(values)
      }).catch(error => { if (!disposed) setFailure(String(error)) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { disposed = true; window.removeEventListener('focus', refresh) }
  }, [service])
  const perform = async (permission: DesktopPermission, action: 'request' | 'openSettings'): Promise<void> => {
    setBusy(true); setFailure('')
    try {
      await service[action](permission)
      const snapshot = await service.query(permission)
      setSnapshots(values => values.map(value => value.permission === permission ? snapshot : value))
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  const labels = {
    granted: t('已允许', 'Allowed'), denied: t('已拒绝', 'Denied'), restricted: t('受系统限制', 'Restricted'),
    'not-determined': t('尚未授权', 'Not requested'), unknown: t('由系统管理', 'Managed by the system'),
  }
  return <section className="dshDesktopSettingsGroup" aria-label={t('系统权限', 'System permissions')}>
    <h3>{t('系统权限', 'System permissions')}</h3>
    <p className="dshDesktopSettingsHint">{t('在使用录音、屏幕共享或电脑操作时请求授权。更改系统权限后，可能需要重启应用。', 'Permission is requested when using recording, screen sharing or computer control. You may need to restart the app after changing system permissions.')}</p>
    {failure && <p role="alert" className="dshDesktopSettingsError">{failure}</p>}
    {(['microphone', 'screen', 'accessibility'] as const).map(permission => {
      const snapshot = snapshots.find(value => value.permission === permission)
      const label = { microphone: t('麦克风', 'Microphone'), screen: t('屏幕录制', 'Screen recording'), accessibility: t('辅助功能', 'Accessibility') }[permission]
      return <div key={permission} className="dshDesktopSettingsMaterialField" role="group" aria-label={label}>
        <span>{label}<small className="dshDesktopSettingsHint"> · {snapshot ? labels[snapshot.status] : t('正在读取…', 'Loading…')}</small></span>
        <div className="dshDesktopSettingsDialogActions">
          {snapshot?.canRequest && <button type="button" className="dshDesktopSettingsButton dshDesktopSettingsButtonSecondary" disabled={busy} onClick={() => { void perform(permission, 'request') }}>{t('请求授权', 'Request access')}</button>}
          {snapshot?.canOpenSettings && <button type="button" className="dshDesktopSettingsButton dshDesktopSettingsButtonSecondary" disabled={busy} onClick={() => { void perform(permission, 'openSettings') }}>{t('打开系统设置', 'Open system settings')}</button>}
        </div>
      </div>
    })}
  </section>
}
