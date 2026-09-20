/** Shared by the official Plugins page and the existing native Settings window. */
const STYLES = `
.dshNextPluginControls { display: grid; gap: 22px; margin: 0 0 28px; color: var(--dsw-alias-label-primary); }
.dshNextPluginControls > .dshDesktopSettingsGroup { padding-top: 0; border-top: 0; }
.dshNextMarketChoices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.dshNextPluginSections { display: grid; gap: 22px; }
.dshNextPluginHeading { display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 14px; }
.dshNextComputerUse { display: grid; gap: 8px; }
.dshNextPluginActions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dshNextPluginHeading > .dshNextPluginActions { flex-wrap: nowrap; flex-shrink: 0; }
button.dshNextPermissionGear { width: 28px; padding: 0; }
.dshNextPluginControls p { margin: 0; }
.dshNextPermissionsDialog { width: min(620px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow-y: auto; }
.dshNextPermissionList { display: grid; gap: 0; }
.dshNextPermissionRow { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshNextPermissionRow:last-child { border-bottom: 0; }
.dshNextPermissionCopy { min-width: 0; font-size: 14px; }
.dshNextPermissionRow .dshNextPluginActions { flex-shrink: 0; justify-content: flex-end; max-width: 210px; }
.dshNextPermissionStatus { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
@media(max-width: 560px) { .dshNextMarketChoices { grid-template-columns: 1fr; } .dshNextPermissionRow { align-items: flex-start; flex-direction: column; gap: 12px; } .dshNextPermissionRow .dshNextPluginActions { max-width: none; } }
`

export function installPluginControlsStyles(): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-desktop-next/plugin-controls'
  style.textContent = STYLES
  document.head.append(style)
  return () => style.remove()
}
