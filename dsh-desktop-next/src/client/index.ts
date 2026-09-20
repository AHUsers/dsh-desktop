/** Add missing macOS window controls while retaining the official frontend. */
import { createElement, useEffect, useRef, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { mountDesktopControls } from '../controls/view.ts'
import { DESKTOP_CONTROLS_CSS } from '../controls/styles.ts'
import { installWindowStyles } from './styles.ts'
import { DesktopSettingsActions } from './settings-actions.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desktop-next': 'sidebar.open' | 'settings' | 'language' | 'safeMode' | 'safeModeDetail' | 'recovery'
  }
}

export const inject = ['slots', 'layout', 'locale']

function WindowControls({ toggleSidebar, t }: PropsLocale<'desktop-next'> & { toggleSidebar(): void }) {
  return createElement('div', { className: 'dshNextWindowControls', 'data-next-window-controls': '' },
    createElement('div', { className: 'dshNextWindowDrag', 'aria-hidden': true }),
    createElement('button', {
      type: 'button', className: 'dshNextSidebarOpen',
      'aria-label': t('sidebar.open'), title: t('sidebar.open'), onClick: toggleSidebar,
    }, createElement(IconPanelLeftOutline16, { size: 16 })),
  )
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('desktop-next', {
    zh: { 'sidebar.open': '展开侧边栏', settings: '桌面', language: 'zh', safeMode: '安全模式', safeModeDetail: '这是临时环境，退出后不会保留其中的数据。', recovery: '打开恢复助手' },
    en: { 'sidebar.open': 'Open sidebar', settings: 'Desktop', language: 'en', safeMode: 'Safe mode', safeModeDetail: 'Data in this temporary environment is removed when you leave.', recovery: 'Open recovery assistant' },
  }), 'Next window control labels')
  if (window.desktopNext) {
    ctx.effect(() => {
      const style = document.createElement('style')
      style.textContent = DESKTOP_CONTROLS_CSS
      document.head.append(style)
      return () => style.remove()
    }, 'Next desktop settings styles')
    const t = ctx.locale.bind('desktop-next')
    ctx.slots.inject('settings.section', () => ctx.slots.register({
      name: 'settings.section', id: 'desktop-next', order: 100, locale: 'desktop-next', label: () => t('settings'),
    }, DesktopSettings))
    ctx.slots.inject('settings.action', () => ctx.slots.register({
      name: 'settings.action', id: 'desktop-native-actions', order: 1, locale: 'desktop-next',
    }, DesktopSettingsActions))
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay', id: 'desktop-next-safe-mode', order: 100, locale: 'desktop-next',
    }, SafeModeNotice))
  }
  ctx.effect(installWindowStyles, 'Next window controls and drag regions')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'desktop-next-window-controls', order: -100,
    locale: 'desktop-next', inject: () => ({ toggleSidebar: () => ctx.layout.toggleSidebar() }),
  }, WindowControls))
}

function SafeModeNotice({ t }: PropsLocale<'desktop-next'>) {
  const [safe, setSafe] = useState(false)
  useEffect(() => {
    let disposed = false
    void window.desktopNext?.state().then(state => { if (!disposed) setSafe(state.safeMode) }).catch(() => {})
    return () => { disposed = true }
  }, [])
  return safe ? createElement('aside', { className: 'dshNextSafeModeNotice', 'aria-label': t('safeMode') },
    createElement('strong', null, t('safeMode')), createElement('p', null, t('safeModeDetail')),
    createElement('button', { type: 'button', onClick: () => { void window.desktopNext?.command({ type: 'controls', page: 'recovery' }).catch(() => {}) } }, t('recovery')),
  ) : null
}

function DesktopSettings({ t }: PropsLocale<'desktop-next'>) {
  const root = useRef<HTMLDivElement>(null)
  const language = t('language')
  useEffect(() => {
    if (root.current && window.desktopNext) return mountDesktopControls(root.current, window.desktopNext, language)
  }, [language])
  return createElement('div', { ref: root, 'data-next-desktop-settings': '' })
}
