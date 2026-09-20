/** Native materials and interactions around the official page headers. */
const STYLES = `
.dshNextSafeModeNotice{position:absolute;right:16px;bottom:16px;max-width:300px;padding:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:12px/1.5 system-ui,sans-serif;pointer-events:auto;-webkit-app-region:no-drag}
.dshNextSafeModeNotice p{margin:5px 0 8px}.dshNextSafeModeNotice button{font:inherit;border:1px solid currentColor;border-radius:5px;padding:4px 8px;background:transparent;color:inherit;cursor:pointer}

/* Respect the native-material preference without replacing official layout. */
html[data-next-material='off'][data-platform='darwin'] :has(> [data-shell-overlay]) {
  background: var(--dsw-alias-bg-base);
}
html[data-next-material='mica'][data-platform='win32'] :has(> [data-shell-overlay]) {
  background: transparent;
}
html[data-next-material='mica'][data-platform='win32'] :has(> [data-shell-overlay])::before,
html[data-next-material='mica'][data-platform='win32'] :has(> [data-shell-overlay]) > div:first-child {
  background: color-mix(in srgb, var(--dsw-specific-sidebar-fill) 60%, transparent);
}
/* The stable main column owns an invisible caption region. The official page
   and its title keep their original layout and scroll underneath it. */
html[data-platform='darwin'] :has(> [data-shell-overlay]) > :has([data-plugin-panel]) {
  position: relative;
  isolation: isolate;
}
html[data-platform='darwin'] :has(> [data-shell-overlay]) > :has([data-plugin-panel])::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 52px;
  z-index: -1;
  pointer-events: none;
  user-select: none;
  -webkit-app-region: drag;
}
html[data-platform='darwin'] [data-sidebar-collapsed] [data-plugin-header-title] { flex: 1; min-width: 0; }
html[data-platform='darwin'] [data-plugin-header-leading] { display: none; flex: none; }
html[data-platform='darwin'] [data-sidebar-collapsed] [data-plugin-header-leading] { display: flex; }
html[data-platform='darwin'] [data-plugin-header-leading] [data-sidebar-header-controls] { padding-left: max(0px, calc(88px - clamp(24px, 4vw, 48px))); }
html[data-platform='darwin'] [data-sidebar-collapsed] [data-plugin-page-header='detail'] { display: flex; align-items: center; gap: 16px; }
/* These controls remain clickable even when scrolled into the caption region. */
html[data-platform='darwin'] [data-plugin-panel] :is(button, a, input, textarea, select, label, summary, [contenteditable='true'], [role='button'], [role='switch'], [role='radio'], [role='checkbox'], [role='tab'], [role='menuitem'], [role='slider']),
html[data-platform='darwin'] [data-plugin-header-leading] { -webkit-app-region: no-drag; }
/* A modal or full-screen right pane owns its own input surface. */
html:has([aria-modal='true']) [data-conversation-title-row],
html:has([aria-modal='true']) :has(> [data-shell-overlay]) > :has([data-plugin-panel])::before,
[data-rightbar-fullscreen] [data-conversation-title-row],
[data-rightbar-fullscreen]:has(> [data-shell-overlay]) > :has([data-plugin-panel])::before { -webkit-app-region: no-drag; }
`

export function installWindowStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-desktop-next/window-controls'
  style.textContent = STYLES
  document.head.append(style)
  return () => style.remove()
}
