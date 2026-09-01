/**
 * Desktop-owned brand overrides layered over the unmodified upstream client.
 *
 * No upstream source is touched: the sidebar brand name shadows the
 * `sidebar.brand.name` single slot (a lower priority beats the official
 * default `0` occupant), and the empty-state hero headline is removed at the
 * DOM level because upstream renders it without a replaceable slot.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/** Brand text shown in the upstream sidebar brand seat. */
const SIDEBAR_BRAND_NAME = 'EVT HARNESS'

/** Headline and preview strings the upstream hero renders per bundled locale. */
const HERO_HEADLINES = new Set(['探索未至之境', 'Into the Unknown'])
const HERO_PREVIEWS = new Set(['预览版', 'Preview'])

/**
 * Register the Desktop brand on the upstream `sidebar.brand.name` slot and
 * empty the fish logo on `sidebar.brand.mark`. Priority `-1000` outranks the
 * official `0` occupants (and any local-build fallback) for both single
 * cells, so the official wordmark and whale mark never render.
 * @param ctx - browser Cordis context.
 */
export function applyDesktopSidebarBrand(ctx: ClientContext): () => void {
  const nameDisposer = ctx.slots.inject('sidebar.brand.name', () =>
    ctx.slots.register({
      name: 'sidebar.brand.name',
      priority: -1000,
      registrant: 'dsh-plugin-desktop',
    }, () => <span className="dshDesktopSidebarBrandName">{SIDEBAR_BRAND_NAME}</span>))
  const markDisposer = ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.register({
      name: 'sidebar.brand.mark',
      priority: -1000,
      registrant: 'dsh-plugin-desktop',
    }, () => <span aria-hidden="true" />))
  return () => {
    nameDisposer()
    markDisposer()
  }
}

/**
 * Locate the empty-state hero headline block and hide it wholesale.
 *
 * The upstream `HeroShell` renders the fish logo, the headline copy and the
 * preview badge inside one grid container with CSS-module (hashed) classes,
 * so the container is found structurally: the headline text element is
 * matched by value, then we climb until an ancestor also holds a preview
 * badge. Hiding that container leaves the glow, workspace chip and composer
 * untouched.
 */
function hideHeroHeadline(): void {
  for (const node of document.querySelectorAll<HTMLElement>('span')) {
    const text = node.textContent?.trim() ?? ''
    if (!HERO_HEADLINES.has(text)) continue
    let el = node.parentElement
    for (let depth = 0; el !== null && depth < 6; el = el.parentElement, depth += 1) {
      const holdsBadge = Array.from(el.children).some(child =>
        child instanceof HTMLElement && HERO_PREVIEWS.has(child.textContent?.trim() ?? ''))
      if (holdsBadge) {
        el.style.display = 'none'
        return
      }
    }
  }
}

/**
 * Keep the hero headline hidden across empty-session mounts. Runs once at
 * install and re-checks whenever DOM content changes (a new empty session
 * remounts the hero); the observer stops after disposal.
 * @returns cleanup that disconnects the observer.
 */
export function installDesktopHeroCleanup(): () => void {
  hideHeroHeadline()
  const observer = new MutationObserver(() => { hideHeroHeadline() })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => { observer.disconnect() }
}
