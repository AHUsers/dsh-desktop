/** Scoped controls styles shared by the official Settings contribution and recovery document. */
import { DESKTOP_SETTINGS_CSS } from './desktop-settings-styles.ts'
export const DESKTOP_CONTROLS_CSS = DESKTOP_SETTINGS_CSS + `
.dshNextSafeModeNotice{position:absolute;right:16px;bottom:16px;max-width:300px;padding:12px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:12px/1.5 system-ui,sans-serif;pointer-events:auto;-webkit-app-region:no-drag}
.dshNextSafeModeNotice p{margin:5px 0 8px}.dshNextSafeModeNotice button{font:inherit;border:1px solid currentColor;border-radius:5px;padding:4px 8px;background:transparent;color:inherit;cursor:pointer}
.dshNextStandalone{margin:0;color-scheme:light dark;background:Canvas;color:CanvasText;font:14px/1.6 system-ui,sans-serif}
.dshNextStandalone main{max-width:800px;margin:auto;padding:28px}
.dshNextStandalone{--dsw-alias-label-primary:CanvasText;--dsw-alias-label-secondary:color-mix(in srgb,CanvasText 65%,Canvas);--dsw-alias-label-primary-foreground:Canvas;--dsw-alias-bg-layer-1:Canvas;--dsw-alias-bg-layer-2:color-mix(in srgb,CanvasText 7%,Canvas);--dsw-alias-border-l1:color-mix(in srgb,CanvasText 15%,Canvas);--dsw-alias-border-l2:color-mix(in srgb,CanvasText 25%,Canvas);--dsw-alias-interactive-bg-hover:color-mix(in srgb,CanvasText 8%,Canvas);--dsw-alias-brand-primary:#5987d9;--dsw-alias-state-error-primary:#d83b3b}
.dshNextSettings{font:14px/1.55 system-ui,sans-serif;color:inherit;min-width:0;padding-bottom:16px}
.dshNextSettings .dshDesktopSettingsGroup{margin-top:24px}.dshNextSettings .dshDesktopSettingsGroup h3{margin:0}
.dshNextSettings .dshDesktopSettingsGroupIntro{margin:4px 0 0}.dshNextSettings .dshDesktopSettingsChoice{border-radius:10px;padding:13px 14px}
.dshNextSettings .dshDesktopSettingsChoiceTitle{margin:0}.dshNextSettings .dshDesktopSettingsChoiceBody{margin-top:3px}
.dshNextSettings .nextProfile{display:flex;align-items:center;gap:10px}.dshNextSettings .nextProfile>button:first-child{flex:1}
.dshNextSettings .nextProfile [data-command=delete]{flex-shrink:0;color:var(--dsw-alias-state-error-primary)}
.dshNextSettings .dshDesktopSettingsForm{margin:0;align-items:flex-end}.dshNextSettings .dshDesktopSettingsField{margin:0;align-items:stretch;justify-content:flex-start}
.dshNextSettings .dshDesktopSettingsField input{width:100%;max-width:none}.dshNextSettings button[aria-checked=true]:disabled{opacity:1}
.dshNextSettings .dshDesktopSettingsChoiceCopy{display:block;text-align:left}
.dshNextSettings .nextSwitch{width:36px;height:20px;appearance:none;border:0;border-radius:99px;padding:2px;background:var(--dsw-alias-border-l2);cursor:pointer;flex-shrink:0;transition:background .15s}
.dshNextSettings .nextSwitch:before{content:'';display:block;width:16px;height:16px;border-radius:50%;background:white;box-shadow:0 1px 2px #0003;transition:transform .15s}
.dshNextSettings .nextSwitch:checked{background:var(--dsw-alias-brand-primary)}.dshNextSettings .nextSwitch:checked:before{transform:translateX(16px)}
.dshNextSettings .nextSwitch:disabled{opacity:.45;cursor:default}.dshNextSettings .dshDesktopSettingsToggleRow{margin:0}
.dshNextSettings .nextPorts{display:flex;gap:12px;flex-wrap:wrap}.dshNextSettings .nextPorts label{flex:1;min-width:170px}
.dshNextSettings .nextPorts button{align-self:center}.dshNextSettings .nextFeatureChoices{display:grid;gap:8px}
.dshNextSettings input:disabled,.dshNextSettings select:disabled{opacity:.55}
.dshNextSettings[data-presentation=settings]>nav,.dshNextSettings[data-presentation=settings]>details{display:none}
.dshNextSettings [data-feature][aria-checked=true]{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}
.dshNextSettings .nextRow [data-command]{border-radius:999px;font-size:12px}
.dshNextSettings [data-saved]{color:var(--dsw-alias-label-secondary);font-size:12px}
.dshNextNativeActions{position:relative}.dshNextNativeActions [hidden]{display:none!important}
.dshNextNativeActions .dshDesktopActionMenu{top:calc(100% + 6px)!important;right:0}
.dshNextNativeActions .dshDesktopSettingsHeaderButton{white-space:nowrap}
@media(max-width:720px){.dshNextSettings .nextProfile{align-items:stretch;flex-direction:column}.dshNextNativeActions{gap:4px!important}}
.dshNextSettings *{box-sizing:border-box}.dshNextSettings [hidden]{display:none!important}
.dshNextSettings h2{font-size:23px;font-weight:650;margin:0 0 8px}.dshNextSettings h3{font-size:15px;font-weight:600;margin:24px 0 12px}
.dshNextSettings p{margin:8px 0 14px}.dshNextSettings .nextEyebrow{font-size:10px;letter-spacing:.12em;opacity:.55;margin:0 0 5px}
.dshNextSettings .nextHint{font-size:12px;opacity:.72;overflow-wrap:anywhere;white-space:pre-wrap}
.dshNextSettings nav{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent);padding:4px 0 12px;margin:12px 0}
.dshNextSettings label{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:12px 0;min-width:0}
.dshNextSettings button,.dshNextSettings select,.dshNextSettings input{font:inherit;color:inherit;border:1px solid color-mix(in srgb,currentColor 20%,transparent);background:transparent;border-radius:7px;padding:7px 10px;min-width:0}
.dshNextSettings input,.dshNextSettings select{max-width:250px}.dshNextSettings input[type=number]{width:110px}
.dshNextSettings button{cursor:pointer;min-height:34px}.dshNextSettings button:hover,.dshNextSettings button[aria-pressed=true]{background:color-mix(in srgb,currentColor 9%,transparent)}
.dshNextSettings :is(button,input,select):focus-visible{outline:2px solid #5987d9;outline-offset:2px}.dshNextSettings button:disabled{opacity:.45;cursor:default}
.dshNextSettings select option{background:Canvas;color:CanvasText}.dshNextSettings .nextCheck{justify-content:flex-start;gap:8px}.dshNextSettings .nextCheck input{accent-color:#5987d9}
.dshNextSettings .nextRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dshNextSettings .nextRow label{flex:1;min-width:200px}
.dshNextSettings .nextGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:8px}.dshNextSettings .nextGrid label{margin:3px 0}
.dshNextSettings form{margin-bottom:20px}.dshNextSettings pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;max-height:260px;overflow:auto}
.dshNextSettings .nextError{background:color-mix(in srgb,#d83b3b 12%,transparent);border-radius:8px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto}
.dshNextSettings details,.dshNextSettings footer{border-top:1px solid color-mix(in srgb,currentColor 15%,transparent);margin-top:24px;padding-top:16px}.dshNextSettings summary{cursor:pointer}
`
