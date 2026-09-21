/** Adapt the official Browser body to Electron while retaining its toolbar and store. */
import { useEffect, useRef, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { BrowserBodyProps } from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarBrowserBridge } from '../sidebar-browser-contract.ts'
import { NativeBrowserTabs } from './sidebar-browser-state.ts'
import { observeBrowserSurface } from './sidebar-browser-geometry.ts'

interface NativeSurface {
  url: string | undefined
  error: string | null
  canGoBack: boolean
  canGoForward: boolean
  navigate(value: string): void
  back(): void
  forward(): void
  reload(): void
  content: ReactNode
}
interface BrowserCarrier {
  bodyProps: BrowserBodyProps
  Body: ComponentType<BrowserBodyProps & { native: NativeSurface }>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.browser.carrier': { kind: 'single'; scope: 'session'; owner: BrowserCarrier }
  }
}

export function registerNativeSidebarBrowser(ctx: Context, bridge: SidebarBrowserBridge): void {
  const tabs = new NativeBrowserTabs(bridge)
  ctx.effect(() => tabs.start(), 'Native browser tab lifetime')
  ctx.slots.inject('sidebar.browser.carrier', () => ctx.slots.register({
    name: 'sidebar.browser.carrier', inject: () => ({ tabs }),
  }, NativeBrowserCarrier))
}

function NativeBrowserCarrier({ bodyProps: props, Body, tabs }: PropsRuntime<'sidebar.browser.carrier'> & { tabs: NativeBrowserTabs }) {
  const { tab } = props.useTabInfo()
  const saved = props.useStore(state => state.byTab[tab.id])
  const initialUrl = useRef(saved?.entries[saved.index]?.url ?? tab.navigation.params?.url)
  const browser = tabs.get(tab.signal)
  const state = useSyncExternalStore(browser.subscribe, browser.getSnapshot)
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => { browser.open(initialUrl.current) }, [browser])
  useEffect(() => {
    if (!surface.current) return
    return observeBrowserSurface(surface.current, bounds => browser.run({ type: 'bounds', bounds: state.url && !state.error ? bounds : null }))
  }, [browser, !!state.url, !!state.error])
  useEffect(() => {
    // The official title and persisted last URL continue to use its existing store.
    if (state.url) props.loadUrl(tab.id, state.url)
  }, [props.loadUrl, tab.id, state.url])
  return <Body {...props} native={{
    url: state.url || undefined, error: state.error, canGoBack: state.canGoBack, canGoForward: state.canGoForward,
    navigate: value => browser.navigate(value), back: () => browser.run({ type: 'back' }),
    forward: () => browser.run({ type: 'forward' }), reload: () => browser.run({ type: 'reload' }),
    content: <div ref={surface} data-next-browser-surface={browser.id}
      style={{ flex: '1 1 auto', minWidth: 0, minHeight: 0, position: 'relative' }}>
      {(!state.url || state.error) && <div style={{ padding: 24, textAlign: 'center', color: 'var(--dsw-alias-label-tertiary)' }}>{props.t('start')}</div>}
    </div>,
  }} />
}
