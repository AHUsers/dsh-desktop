import type { BrowserBounds } from '../sidebar-browser-contract.ts'

/** Native views sit above DOM content, so hide them whenever an overlay owns input. */
export function browserSurfaceBounds(element: HTMLElement): BrowserBounds | null {
  if (!element.isConnected || document.hidden || !element.getClientRects().length) return null
  const box = element.getBoundingClientRect()
  let left = Math.max(0, box.left), top = Math.max(0, box.top)
  let right = Math.min(innerWidth, box.right), bottom = Math.min(innerHeight, box.bottom)
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return null
    const clip = node.getBoundingClientRect()
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right) }
    if (/(auto|scroll|hidden|clip)/u.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom) }
  }
  // Native views cannot overlap the DOM resize handles along a pane's edges.
  for (const handle of document.querySelectorAll('[data-side="rightbar"], [data-dockkit-float-resize]')) {
    const rect = handle.getBoundingClientRect()
    if (!rect.width || !rect.height || rect.right <= left || rect.left >= right || rect.bottom <= top || rect.top >= bottom) continue
    if (handle.hasAttribute('data-dockkit-float-resize')) bottom = Math.min(bottom, rect.top)
    else if (rect.left <= left) left = Math.max(left, rect.right)
    else if (rect.right >= right) right = Math.min(right, rect.left)
  }
  if (right - left < 1 || bottom - top < 1) return null
  for (const overlay of document.querySelectorAll('[aria-modal="true"], [role="menu"], [role="listbox"], [role="tooltip"]')) {
    const rect = overlay.getBoundingClientRect()
    if (!rect.width || !rect.height || getComputedStyle(overlay).visibility === 'hidden') continue
    if (overlay.getAttribute('aria-modal') === 'true'
      || rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom) return null
  }
  for (const pane of document.querySelectorAll('[data-dockkit-float], [data-next-browser-surface]')) {
    if (pane === element || pane.contains(element)) continue
    const rect = pane.getBoundingClientRect()
    const x1 = Math.max(left, rect.left), x2 = Math.min(right, rect.right)
    const y1 = Math.max(top, rect.top), y2 = Math.min(bottom, rect.bottom)
    if (x1 < x2 && y1 < y2) {
      const hit = document.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2)
      if (hit && !element.contains(hit)) return null
    }
  }
  for (const [x, y] of [[left + 1, top + 1], [right - 1, top + 1], [(left + right) / 2, (top + bottom) / 2], [left + 1, bottom - 1], [right - 1, bottom - 1]]) {
    const hit = document.elementFromPoint(x!, y!)
    if (hit && !element.contains(hit)) return null
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function observeBrowserSurface(element: HTMLElement, update: (bounds: BrowserBounds | null) => void): () => void {
  let frame = 0, previous = ''
  const measure = (): void => {
    frame = 0
    const bounds = browserSurfaceBounds(element)
    const key = JSON.stringify(bounds)
    if (key !== previous) { previous = key; update(bounds) }
  }
  const schedule = (): void => { if (!frame) frame = requestAnimationFrame(measure) }
  const resize = new ResizeObserver(schedule)
  for (let node: HTMLElement | null = element; node; node = node.parentElement) resize.observe(node)
  const mutations = new MutationObserver(schedule)
  mutations.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-modal', 'data-state'] })
  window.addEventListener('resize', schedule)
  document.addEventListener('scroll', schedule, true)
  document.addEventListener('visibilitychange', schedule)
  measure()
  return () => {
    cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect()
    window.removeEventListener('resize', schedule)
    document.removeEventListener('scroll', schedule, true)
    document.removeEventListener('visibilitychange', schedule)
    update(null)
  }
}
