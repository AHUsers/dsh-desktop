/** Add missing macOS window controls while retaining the official frontend. */
import { createElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { IconPanelLeftOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { installWindowStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'desktop-next': 'sidebar.open'
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
    zh: { 'sidebar.open': '展开侧边栏' }, en: { 'sidebar.open': 'Open sidebar' },
  }), 'Next window control labels')
  ctx.effect(installWindowStyles, 'Next window controls and drag regions')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'desktop-next-window-controls', order: -100,
    locale: 'desktop-next', inject: () => ({ toggleSidebar: () => ctx.layout.toggleSidebar() }),
  }, WindowControls))
}
