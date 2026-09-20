/** One official-component dialog for every native permission entry point. */
import { useEffect, useRef, useState } from 'react'
import { Button, IconSettingsOutline16, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopPermission, DesktopPermissionSnapshot, DesktopPermissions } from '../permissions.ts'

export function DesktopPermissionsSection({ service, language }: { service: DesktopPermissions; language: string }) {
  const zh = language.startsWith('zh')
  return <section className="dshDesktopSettingsGroup" aria-label={zh ? '系统权限' : 'System permissions'}>
    <h3>{zh ? '系统权限' : 'System permissions'}</h3>
    <DesktopPermissionsButton service={service} language={language} initialOpen={location.hash === '#permissions'} />
  </section>
}

export function DesktopPermissionsButton({ service, language, initialOpen = false, iconOnly = false }: { service?: DesktopPermissions; language: string; initialOpen?: boolean; iconOnly?: boolean }) {
  const [open, setOpen] = useState(initialOpen)
  useEffect(() => { if (initialOpen) setOpen(true) }, [initialOpen])
  const zh = language.startsWith('zh')
  const label = zh ? '授权设置' : 'Permissions'
  const close = (): void => {
    setOpen(false)
    if (initialOpen && location.hash === '#permissions') location.hash = 'general'
  }
  return <>
    <Button variant={iconOnly ? 'ghost' : 'outline'} size="sm" aria-label={label} title={label}
      className={iconOnly ? 'dshNextPermissionGear' : undefined} icon={iconOnly ? <IconSettingsOutline16 /> : undefined}
      onClick={() => { setOpen(true) }}>{iconOnly ? null : label}</Button>
    <Modal open={open} onClose={close} title={zh ? '系统权限' : 'System permissions'}
      closeLabel={zh ? '关闭' : 'Close'} className="dshNextPermissionsDialog"
      description={zh ? '按需授权。更改系统权限后，可能需要重启应用。' : 'Grant access when needed. You may need to restart the app after changing system permissions.'}>
      {open && (service ? <PermissionDetails service={service} language={language} />
        : <p role="status">{zh ? '请在运行 DSH 的桌面应用中管理系统权限。' : 'Manage system permissions in the desktop app running DSH.'}</p>)}
    </Modal>
  </>
}

function PermissionDetails({ service, language }: { service: DesktopPermissions; language: string }) {
  const t = (zh: string, en: string): string => language.startsWith('zh') ? zh : en
  const [snapshots, setSnapshots] = useState<DesktopPermissionSnapshot[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const pending = useRef(false)
  const revision = useRef(0)
  useEffect(() => {
    let disposed = false
    const refresh = (): void => {
      if (pending.current) return
      const current = ++revision.current
      void Promise.all([service.query('microphone'), service.query('screen'), service.query('accessibility')]).then(values => {
        if (!disposed && current === revision.current) { setSnapshots(values); setFailure('') }
      }).catch(error => { if (!disposed && current === revision.current) setFailure(String(error)) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { disposed = true; window.removeEventListener('focus', refresh) }
  }, [service])
  const perform = async (permission: DesktopPermission, action: 'request' | 'openSettings'): Promise<void> => {
    if (pending.current) return
    pending.current = true
    revision.current++
    setBusy(true); setFailure('')
    try {
      await service[action](permission)
      const snapshot = await service.query(permission)
      setSnapshots(values => values.map(value => value.permission === permission ? snapshot : value))
    } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { pending.current = false; setBusy(false) }
  }
  const labels = {
    granted: t('已允许', 'Allowed'), denied: t('已拒绝', 'Denied'), restricted: t('受系统限制', 'Restricted'),
    'not-determined': t('尚未授权', 'Not requested'), unknown: t('由系统管理', 'Managed by the system'),
  }
  const descriptions = {
    screen: t('用于截图，让 AI 读取屏幕内容。', 'Take screenshots so AI can read what is on screen.'),
    accessibility: t('允许 Computer Use 操作鼠标和键盘。', 'Allow Computer Use to control the mouse and keyboard.'),
    microphone: t('允许需要录音的功能使用麦克风。', 'Allow features that record audio to use the microphone.'),
  }
  return <div className="dshNextPermissionList">
    {failure && <p role="alert" className="dshDesktopSettingsError">{failure}</p>}
    {(['screen', 'accessibility', 'microphone'] as const).map(permission => {
      const snapshot = snapshots.find(value => value.permission === permission)
      const label = { microphone: t('麦克风', 'Microphone'), screen: t('屏幕录制', 'Screen recording'), accessibility: t('辅助功能', 'Accessibility') }[permission]
      return <div key={permission} className="dshNextPermissionRow" role="group" aria-label={label}>
        <div className="dshNextPermissionCopy"><strong>{label}</strong><p className="dshDesktopSettingsHint">{descriptions[permission]}</p>
          <span className="dshNextPermissionStatus" role="status"><StateDot state={snapshot?.status === 'granted' ? 'done' : snapshot?.status === 'denied' || snapshot?.status === 'restricted' ? 'error' : 'idle'} />{snapshot ? labels[snapshot.status] : t('正在读取…', 'Loading…')}</span></div>
        <div className="dshNextPluginActions">
          {snapshot?.canRequest && <Button variant="primary" size="sm" disabled={busy} onClick={() => { void perform(permission, 'request') }}>{t('请求授权', 'Request access')}</Button>}
          {snapshot?.canOpenSettings && <Button variant="outline" size="sm" disabled={busy} onClick={() => { void perform(permission, 'openSettings') }}>{t('打开系统设置', 'Open system settings')}</Button>}
        </div>
      </div>
    })}
  </div>
}
