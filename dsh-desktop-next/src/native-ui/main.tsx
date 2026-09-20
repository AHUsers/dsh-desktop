/** Existing Desktop utility pages; Next supplies only state and native actions. */
import { CSPProvider } from '@base-ui/react/csp-provider'
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import { RecoveryApp, type RecoveryState } from '../../../dsh-plugin-desktop-beta/src/native-ui/recovery/App.tsx'
import { ProfileCreateApp } from '../../../dsh-plugin-desktop-beta/src/native-ui/profile-create/App.tsx'
import { ProfileSelectorApp } from '../../../dsh-plugin-desktop-beta/src/native-ui/profile-selector/App.tsx'
import { DesktopFrame } from '../../../dsh-plugin-desktop-beta/src/native-ui/shared/DesktopFrame.tsx'
import { Alert, AlertDescription } from '../../../dsh-plugin-desktop-beta/src/native-ui/components/ui/alert.tsx'
import { desktopRecoveryCopy } from '../../../dsh-plugin-desktop-beta/src/recovery-copy.ts'
import { installDesktopSettingsStyles } from '../../../dsh-plugin-desktop-beta/src/client/desktop-settings-styles.ts'
import { NextDesktopActions, NextDesktopSettings, useDesktopState } from '../client/settings.tsx'
import { NextSettingsAdapter } from '../client/settings-adapter.ts'
import type { DesktopCommand } from '../desktop-contract.ts'
import './theme.css'

function App() {
  const adapter = useMemo(() => window.desktopNext ? new NextSettingsAdapter(window.desktopNext) : undefined, [])
  if (!adapter) return <Alert variant="destructive"><AlertDescription>Desktop controls could not load. Restart DSH Desktop Next.</AlertDescription></Alert>
  return <NativePages adapter={adapter} />
}

function NativePages({ adapter }: { adapter: NextSettingsAdapter }) {
  const state = useDesktopState(adapter)
  const locale = new URLSearchParams(location.search).get('locale') === 'zh' ? 'zh' : 'en'
  const t = (cn: string, en: string) => locale === 'zh' ? cn : en
  const [page, setPage] = useState(location.hash.slice(1) || 'general')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const change = () => setPage(location.hash.slice(1)); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change) }, [])
  useEffect(installDesktopSettingsStyles, [])
  const perform = async (command: DesktopCommand): Promise<void> => {
    if (busy) return
    setFailure(''); setBusy(true)
    try { await adapter.command(command) } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) } finally { setBusy(false) }
  }
  useEffect(() => {
    const navigate = (event: MouseEvent): void => {
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]')
      if (!anchor) return
      const url = new URL(anchor.href)
      if (!['dsh-recovery:', 'dsh-profile-selector:'].includes(url.protocol)) return
      event.preventDefault()
      if (busy) return
      const actions: Record<string, DesktopCommand> = {
        restart: { type: 'restart' }, quit: { type: 'quit' }, cancel: { type: 'close-controls' },
        'enter-safe-mode': { type: 'safe-mode' }, 'normal-mode': { type: 'normal-mode' },
        'export-diagnostics': { type: 'diagnostics' }, 'show-diagnostics': { type: 'diagnostics' },
        'open-terminal': { type: 'terminal' }, 'open-profile-directory': { type: 'open-profile' },
        'open-profile-creator': { type: 'controls', page: 'create-profile' }, create: { type: 'controls', page: 'create-profile' },
        'open-checkpoint': { type: 'open-backups' }, 'preview-checkpoint': { type: 'rollback' },
        recover: { type: 'recover' }, 'repair-global': { type: 'repair-global' },
        'open-home': { type: 'open-home' }, 'open-logs': { type: 'open-logs' },
      }
      const command = url.hostname === 'switch-profile' || url.hostname === 'switch'
        ? { type: 'switch' as const, name: url.searchParams.get('name') ?? '' } : actions[url.hostname]
      if (command) void perform(command)
    }
    document.addEventListener('click', navigate)
    return () => document.removeEventListener('click', navigate)
  }, [adapter, busy])
  if (!state) return <><DesktopFrame /><main className="dshNativeContent p-6"><Alert><AlertDescription>{t('正在读取桌面状态…', 'Loading Desktop state…')}</AlertDescription></Alert></main></>
  if (page === 'create-profile') return <ProfileCreateApp onCancel={() => { void perform({ type: 'close-controls' }) }} onCreate={async name => {
    await adapter.command({ type: 'create', name })
    await adapter.command({ type: 'switch', name })
    const updated = await adapter.refresh()
    if (updated.selected === name) await adapter.command({ type: 'close-controls' })
    else await adapter.command({ type: 'controls', page: 'profiles' })
  }} />
  const notice = failure ? { tone: 'error' as const, title: t('操作未完成', 'Action failed'), body: failure } : undefined
  const profiles = state.profiles.map(name => ({ name, current: name === state.selected, selectable: !state.unavailableProfiles.includes(name) }))
  if (page === 'profiles') return <ProfileSelectorApp state={{ locale, profiles, busy: busy || state.busy, restartReady: false, ...(notice ? { notice } : {}) }} />
  if (page === 'recovery') {
    const copy = { ...desktopRecoveryCopy(locale),
      quickRecoveryBody: t('选择适合当前问题的恢复方式。可以尝试安全模式，修复或回滚配置，或切换 Profile。', 'Try safe mode, repair or restore the configuration, or switch Profiles.'),
      safeModeBody: t('使用独立的临时环境，不载入原环境的插件、补丁和凭据。退出后移除临时数据，返回原 Profile。', 'Use a temporary environment without the original plugins, patches or credentials. Leaving removes temporary data and returns to the original Profile.'),
      rollbackGuideBody: t('将当前 Profile 的配置恢复到最近一次成功启动的状态。', 'Restore this Profile to its last successful-start configuration.'),
      rollbackBody: t('还原最近成功启动时的 Profile 配置，不回滚插件版本或共享数据。', 'Restore the Profile configuration from the last successful startup, without reverting plugin versions or shared data.'),
      restart: t('启动或重试', 'Start or retry'),
    }
    const recovery: RecoveryState = {
      locale, failureStage: 'host-boot', failureDetail: state.failure, requested: !state.failure,
      snapshot: { profileName: state.selected, bundles: [], checkpoints: [{ slotId: 'slot-1', status: state.checkpoint ? 'available' : 'empty', ...(state.checkpoint ? { capturedAt: state.checkpoint.created } : {}) }] },
      busy: busy || state.busy, restartReady: true, activeTab: 'quick', configurationAvailable: false,
      diagnostics: { status: 'idle' }, logs: state.logs.slice(-24_000), profiles, profileActionToken: 'next', profileCreatorAvailable: true,
      terminalAvailable: state.platform === 'darwin' || state.platform === 'win32', safeModeAvailable: !state.safeMode, safeModeActive: state.safeMode,
      availableTabs: ['quick', 'rollback', 'profiles', 'diagnostics'], ...(notice ? { notice } : {}),
      quickActions: [
        ...(state.safeMode ? [{ action: 'normal-mode', title: t('返回原 Profile', 'Return to the original Profile'), body: copy.safeModeBody, label: t('退出安全模式', 'Leave safe mode') }] : []),
        { action: 'recover', title: t('修复当前 Profile', 'Repair current Profile'), body: t('先备份配置，再恢复内置 bundle 并停用第三方插件。会话和凭据保留。', 'Back up the configuration, restore bundled plugins and disable third-party plugins. Sessions and credentials are retained.'), label: t('修复 Profile', 'Repair Profile') },
        { action: 'repair-global', title: t('停用全局补丁', 'Disable global patch'), body: t('单独备份并停用全局 cordis.patch.yml，影响所有 Next Profile。', 'Back up and disable the global cordis.patch.yml for all Next Profiles.'), label: t('停用全局补丁', 'Disable global patch') },
      ],
    }
    return <RecoveryApp state={recovery} copy={copy} />
  }
  return <><DesktopFrame /><main className="dshNativeContent h-screen overflow-auto p-6"><div className="mx-auto max-w-3xl space-y-4"><NextDesktopActions adapter={adapter} language={locale} /><NextDesktopSettings adapter={adapter} language={locale} /></div></main></>
}

createRoot(document.getElementById('root')!).render(<CSPProvider disableStyleElements><App /></CSPProvider>)
