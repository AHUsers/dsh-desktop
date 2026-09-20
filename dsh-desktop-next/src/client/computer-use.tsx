/** Configure the shipped provider through the official Plugins slot and manager. */
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginInfo } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'

const PROVIDER = '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'

export function registerComputerUse(ctx: Context): void {
  ctx.inject(['remote', 'remote.pluginManager'], inner => {
    inner.slots.inject('plugins.item', () => inner.slots.register({
      name: 'plugins.item', id: 'desktop-next-computer-use', order: 50,
      label: () => 'Computer Use', locale: 'desktop-next', inject: () => ({ context: inner }),
    }, ComputerUseCard))
  })
}

function ComputerUseCard(props: PropsRuntime<'plugins.item'> & PropsLocale<'desktop-next'> & { context: Context }) {
  const zh = props.t('language') === 'zh'
  if (props.view === 'summary') return zh ? '让 AI 查看屏幕、操作鼠标和键盘。' : 'Let AI view the screen and control the mouse and keyboard.'
  return <ComputerUseSettings context={props.context} zh={zh} />
}

function ComputerUseSettings({ context, zh }: { context: Context; zh: boolean }) {
  const t = (chinese: string, english: string): string => zh ? chinese : english
  const [revision, refresh] = useState(0)
  const [row, setRow] = useState<PluginInfo>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const reload = (): void => { refresh(value => value + 1) }
    const off = context.remote.$on('plugin-manager/changed', reload)
    const reset = context.on('connection/reset', reload)
    window.addEventListener('focus', reload)
    return () => { off(); reset(); window.removeEventListener('focus', reload) }
  }, [context])
  useEffect(() => {
    let disposed = false
    setLoading(true)
    void context.remote.pluginManager.listPlugins().then(result => {
      if (disposed) return
      if (!result.ok) throw new Error(result.error.message)
      const rows = result.value.filter(item => item.moduleName === PROVIDER)
      setRow(rows.length === 1 ? rows[0] : undefined)
    }).catch(failure => { if (!disposed) { setRow(undefined); setError(String(failure)) } })
      .finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true }
  }, [context, revision])
  const change = async (enabled: boolean): Promise<void> => {
    if (!row || busy || loading) return
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await context.remote.pluginManager.setPluginEnabled(row.entryId, enabled)
      if (!result.ok) throw new Error(result.error.message)
      const change = result.value
      if (change.application === 'failed') throw new Error(change.error?.diagnostic ?? t('无法更改插件状态。', 'Could not change the plugin state.'))
      if (change.application === 'restart-required') setNotice(t('已保存，请重启后台服务以应用。', 'Saved. Restart the background service to apply.'))
      if (change.application === 'overridden') setNotice(t('已保存，但当前配置覆盖了此开关。', 'Saved, but another configuration overrides this switch.'))
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)) }
    finally { setBusy(false); refresh(value => value + 1) }
  }
  const status = loading ? t('正在读取…', 'Loading…') : !row ? t('当前 Profile 中不可用', 'Unavailable in this Profile')
    : !row.enabled ? t('已停用', 'Disabled') : row.fiberPhase === 'active' ? t('运行中', 'Running')
      : row.fiberPhase === 'failed' ? t('加载失败', 'Failed to load') : t('等待加载', 'Waiting to load')
  return <section className="dshDesktopSettingsGroup" data-next-computer-use>
    <p className="dshDesktopSettingsHint">{t('通过 Cua 操作运行 DSH 的这台电脑。启用后，AI 可以在会话中调用电脑操作工具。', 'Use Cua to control the computer running DSH. Once enabled, AI can call computer tools from conversations.')}</p>
    <div className="dshDesktopSettingsMaterialField">
      <span>{t('启用 Computer Use', 'Enable Computer Use')}</span>
      <Switch label={t('启用 Computer Use', 'Enable Computer Use')} checked={row?.enabled ?? false}
        disabled={loading || busy || !row || row.readOnlyReason !== undefined} onChange={enabled => { void change(enabled) }} />
    </div>
    <p role="status">{status}</p>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert" className="dshDesktopSettingsError">{error}</p>}
    <p className="dshDesktopSettingsHint">{t('截图理解需要支持图片输入的模型。macOS 需要屏幕录制和辅助功能权限。', 'Understanding screenshots requires a model with image input. macOS needs Screen Recording and Accessibility permissions.')}</p>
    <div className="dshDesktopSettingsDialogActions">
      <Button variant="outline" onClick={() => { setError(''); refresh(value => value + 1) }}>{t('刷新状态', 'Refresh status')}</Button>
      <Button variant="outline" onClick={() => {
        void window.desktopNext?.command({ type: 'controls', page: 'permissions' }).catch(failure => { setError(String(failure)) })
      }}>{t('管理系统权限', 'Manage system permissions')}</Button>
    </div>
  </section>
}
