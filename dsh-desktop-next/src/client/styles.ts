/** Scoped additions for the alpha.2 pages without a conversation header. */
const STYLES = `
/* Pass the official frame's live column sizes through the overlay without
   changing its layout or any other overlay occupant. */
html[data-platform='darwin'] [data-shell-overlay],
html[data-platform='darwin'] [data-shell-overlay] > [data-slot='shell.overlay'] {
  grid-template-columns: inherit;
}
.dshNextWindowControls {
  display: none;
  position: absolute;
  inset: 0 0 auto;
  height: 52px;
  grid-template-columns: inherit;
  pointer-events: none !important;
}
/* The upstream header already owns these controls when a Session exists. */
html[data-platform='darwin'] :not(:has([data-conversation-header-leading])) > [data-shell-overlay] .dshNextWindowControls {
  display: grid;
}
.dshNextWindowDrag {
  grid-column: 2;
  -webkit-app-region: drag;
  pointer-events: auto;
}
.dshNextSidebarOpen {
  display: none;
  position: absolute;
  left: 88px;
  top: 12px;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}
[data-sidebar-collapsed] .dshNextSidebarOpen { display: inline-flex; }
.dshNextSidebarOpen:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dshNextSidebarOpen:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
/* Keep the plugin title, refresh/install buttons and detail/back controls
   below the window strip, including while the page scrolls. */
html[data-platform='darwin'] [data-plugin-panel] { padding-top: 64px; }
:has(> [data-shell-overlay]):has([data-plugin-panel]) .dshNextWindowDrag {
  background: var(--dsw-alias-bg-base);
}
/* A modal or full-screen right pane owns its own input surface. */
html:has([aria-modal='true']) .dshNextWindowControls,
[data-rightbar-fullscreen] > [data-shell-overlay] .dshNextWindowControls { visibility: hidden; }
`

export function installWindowStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-desktop-next/window-controls'
  style.textContent = STYLES
  document.head.append(style)
  return () => style.remove()
}
