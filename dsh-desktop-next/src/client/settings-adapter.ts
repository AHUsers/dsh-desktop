/** Adapt Next's native state to the existing Desktop settings components. */
import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopSettingsApi, DesktopSettingsView } from '../../../dsh-plugin-desktop-beta/src/client/desktop-settings-api.ts'
import type { DesktopNotificationSettings, DesktopShellSettings } from '../../../dsh-plugin-desktop-beta/src/client/DesktopSettingsSection.tsx'
import type { DesktopBridge, DesktopBrowserLinks, DesktopCommand, DesktopPreferences, DesktopState } from '../desktop-contract.ts'

const shellFields = { macosMaterial: 'macosMaterial', windowsMaterial: 'windowsMaterial', port: 'port', openBrowser: 'browserAccess', networkExposure: 'networkExposure', logLevel: 'logLevel' } as const
const notificationFields = { enabled: 'notifications', notifyOnTurnCompletion: 'turnCompleted', notifyOnTurnFailure: 'turnFailed', notifyOnJobCompletion: 'jobCompleted', notifyOnJobFailure: 'jobFailed' } as const

export function projectSettings(state: DesktopState, links: DesktopBrowserLinks = { localUrl: null, lanUrls: [] }): DesktopSettingsView {
  const enabled = !state.safeMode && state.phase === 'ready'
  const market = state.features.market ? 'community-market' : 'disabled'
  const lan = state.lan
  const lanUrls = links.lanUrls
  return {
    current: state.selected,
    profiles: state.profiles.map(name => ({ name, exists: true, webCapable: !state.unavailableProfiles.includes(name), selectable: !state.unavailableProfiles.includes(name), deletable: name !== state.selected && name !== 'default' })),
    aa: { requested: state.features.remoteControl, effective: enabled && state.features.remoteControl },
    market: { requested: market, effective: enabled ? market : 'disabled', legacyDefaulted: false },
    web: { localUrl: links.localUrl ?? '', lanUrls, lanState: lan?.state ?? 'inactive', lanError: lan?.errorCode ?? null, lanCaFingerprint: lan?.caFingerprint ?? null,
      lanCaUrls: lanUrls.map(value => new URL('/.well-known/dsh-desktop-ca.crt', value).href) },
  }
}

export class NextSettingsAdapter {
  private current: DesktopState | undefined
  private listeners = new Set<() => void>()
  private tail: Promise<unknown> = Promise.resolve()
  private reading: Promise<DesktopState> | undefined
  private shellSnapshot: SettingsScopeSnapshot<DesktopShellSettings> = this.snapshot()
  private notificationSnapshot: SettingsScopeSnapshot<DesktopNotificationSettings> = this.snapshot()
  constructor(readonly bridge: DesktopBridge) {}

  getSnapshot = (): DesktopState | undefined => this.current
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly desktopSettings = { getSnapshot: () => this.shellSnapshot, subscribe: this.subscribe, set: (field: string, value: unknown) => this.setField(shellFields, field, value) }
  readonly notificationSettings = { getSnapshot: () => this.notificationSnapshot, subscribe: this.subscribe, set: (field: string, value: unknown) => this.setField(notificationFields, field, value) }

  private snapshot<T>(value?: T, writable = false): SettingsScopeSnapshot<T> {
    return { status: value ? 'ready' : 'loading', value, base: undefined, user: undefined, revision: undefined, writable, mode: 'host' }
  }
  refresh = (): Promise<DesktopState> => this.reading ??= this.bridge.state().then(state => {
    if (JSON.stringify(state) !== JSON.stringify(this.current)) {
      this.current = state
      const p = state.preferences
      this.shellSnapshot = this.snapshot({ mode: 'compatibility', macosMaterial: p.macosMaterial, windowsMaterial: p.windowsMaterial, port: p.port, openBrowser: p.browserAccess, networkExposure: p.networkExposure, logLevel: p.logLevel }, !state.busy && !state.safeMode)
      this.notificationSnapshot = this.snapshot({ enabled: p.notifications, notifyOnTurnCompletion: p.turnCompleted, notifyOnTurnFailure: p.turnFailed, notifyOnJobCompletion: p.jobCompleted, notifyOnJobFailure: p.jobFailed }, !state.busy && state.notificationsAvailable)
      for (const listener of this.listeners) listener()
    }
    return state
  }).finally(() => { this.reading = undefined })

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => {})
    return next
  }
  private async settle(): Promise<DesktopState> {
    await this.reading?.catch(() => {})
    return this.refresh()
  }
  command = (command: DesktopCommand): Promise<void> => this.enqueue(async () => {
    try { await this.bridge.command(command) } finally { await this.settle() }
  })
  savePreferences = (patch: Partial<DesktopPreferences>): Promise<void> => this.enqueue(async () => {
    const state = await this.refresh()
    const preferences = { ...state.preferences, ...patch }
    if (!preferences.browserAccess) preferences.networkExposure = 'loopback'
    try { await this.bridge.command({ type: 'preferences', preferences }) } finally { await this.settle() }
  })
  private setField(fields: Record<string, keyof DesktopPreferences>, field: string, value: unknown): Promise<void> {
    const key = Object.hasOwn(fields, field) ? fields[field] : undefined
    if (!key) return Promise.reject(new Error('Unsupported Desktop preference'))
    return this.savePreferences({ [key]: value })
  }
  private async readSettings(): Promise<DesktopSettingsView> {
    const state = await this.refresh()
    return projectSettings(state, await this.bridge.browserLinks())
  }
  readonly api: DesktopSettingsApi = {
    read: () => this.readSettings(),
    createProfile: async name => { await this.command({ type: 'create', name }); return this.readSettings() },
    deleteProfile: async name => { await this.command({ type: 'delete', name }); return this.readSettings() },
    selectProfile: async name => { await this.command({ type: 'switch', name }); return { accepted: true, restartRequired: false } },
    selectMarket: async () => { throw new Error('Manage markets in the Plugins page') },
    openBrowser: url => this.command({ type: 'open-browser-url', url }),
    copyBrowser: url => this.command({ type: 'copy-browser-url', url }),
    openTerminal: () => this.command({ type: 'terminal' }),
    restart: () => this.command({ type: 'restart-app' }),
    restartToRecovery: () => this.command({ type: 'restart-recovery' }),
    reloadRenderer: () => this.command({ type: 'reload' }),
    toggleDeveloperTools: () => this.command({ type: 'devtools' }),
    checkForUpdates: async () => { throw new Error('Updates are unavailable in Next') },
    exportDiagnostics: () => this.command({ type: 'diagnostics' }),
  }
}
