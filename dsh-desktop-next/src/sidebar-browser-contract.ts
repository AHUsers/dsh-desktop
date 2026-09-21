/** The app renderer can manage browser tabs, never execute code in their pages. */
export interface BrowserBounds { x: number; y: number; width: number; height: number }
export interface SidebarBrowserState {
  id: string
  revision: number
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}
export type SidebarBrowserCommand =
  | { type: 'open'; id: string; url?: string }
  | { type: 'navigate'; id: string; url: string }
  | { type: 'bounds'; id: string; bounds: BrowserBounds | null }
  | { type: 'back' | 'forward' | 'reload' | 'close'; id: string }
export interface SidebarBrowserBridge {
  command(command: SidebarBrowserCommand): Promise<SidebarBrowserState | null>
  subscribe(listener: (state: SidebarBrowserState) => void): () => void
}

/** Matches the official address bar's HTTP(S) scope, including local development servers. */
export function sidebarBrowserUrl(input: string): string {
  const text = input.trim()
  if (!text || /[\u0000-\u0020\u007f]/u.test(text)) throw new Error('Invalid browser address')
  const withScheme = /^https?:\/\//iu.test(text) ? text
    : /^(?:localhost|\[[\da-f:]+\]|[\w.-]+):\d+(?:[/?#]|$)/iu.test(text) ? `http://${text}`
      : /^[a-z][a-z\d+.-]*:/iu.test(text) ? text : `https://${text}`
  const url = new URL(withScheme)
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Only HTTP(S) browser addresses without credentials are supported')
  }
  return url.href
}
