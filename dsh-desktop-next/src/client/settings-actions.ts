/** The existing Desktop settings-header actions, adapted to Next's native bridge. */
import { createElement as h, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopCommand, DesktopState } from '../desktop-contract.ts'

export function DesktopSettingsActions({ t }: PropsLocale<'desktop-next'>) {
  const zh = t('language') === 'zh'
  const copy = (cn: string, en: string): string => zh ? cn : en
  const [state, setState] = useState<DesktopState>()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const mounted = useRef(true)
  const id = useId()
  useEffect(() => {
    mounted.current = true
    void window.desktopNext?.state().then(value => { if (mounted.current) setState(value) }).catch(() => {})
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const run = async (type: DesktopCommand['type']): Promise<void> => {
    if (busy || !window.desktopNext) return
    setBusy(true); setOpen(false); setError('')
    try { await window.desktopNext.command({ type } as DesktopCommand) }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { if (mounted.current) setBusy(false) }
  }
  const keyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus()
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const active = items.indexOf(document.activeElement as HTMLButtonElement)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
      items[index]?.focus()
    } else if (event.key === 'Tab') setOpen(false)
  }
  const item = (type: DesktopCommand['type'], cn: string, en: string) => h('button', {
    key: type, type: 'button', role: 'menuitem', className: 'dshDesktopActionMenuItem', disabled: busy,
    onClick: () => { void run(type) },
  }, h('span', null, copy(cn, en)))
  return h('div', { ref: root, className: 'dshDesktopNativeActions dshNextNativeActions', 'data-placement': 'settings', 'data-next-settings-actions': '' },
    error ? h('span', { className: 'dshDesktopNativeActionError', role: 'alert' }, error) : null,
    state && ['darwin', 'win32'].includes(state.platform) ? h('button', { type: 'button', className: 'dshDesktopSettingsHeaderButton', disabled: busy,
      onClick: () => { void run('terminal') } }, copy('打开终端', 'Open Terminal')) : null,
    h('div', { className: 'dshDesktopNativeActionMenuAnchor' },
      h('button', { ref: trigger, type: 'button', className: 'dshDesktopSettingsHeaderButton', disabled: busy,
        'aria-expanded': open, 'aria-haspopup': 'menu', 'aria-controls': open ? id : undefined,
        onClick: () => setOpen(value => !value),
        onKeyDown: (event: KeyboardEvent) => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } },
      }, copy('重启应用', 'Restart App'), h('span', { 'aria-hidden': true }, ' ▾')),
      open ? h('div', { ref: menu, id, role: 'menu', 'aria-label': copy('重启选项', 'Restart options'), className: 'dshDesktopActionMenu', onKeyDown: keyDown },
        item('reload', '重新加载界面', 'Reload Interface'), item('restart-app', '重启应用', 'Restart App'), item('restart-recovery', '重启到恢复模式', 'Restart in Recovery Mode'),
      ) : null,
    ),
  )
}
