/** General renderer state omits credentials; browser login links use a separate native operation. */
import type { Features } from './profiles.ts'
import type { DesktopLanHttpsRuntimeSnapshot } from './lan-https-runtime.ts'

export const NATIVE_ACCESS_HEADER = 'x-dsh-desktop-renderer'
export const NOTIFICATION_OUTCOMES = ['turn-completed', 'turn-failed', 'job-completed', 'job-failed'] as const
export type NotificationOutcome = typeof NOTIFICATION_OUTCOMES[number]

export interface DesktopPreferences {
  closeToTray: boolean
  macosMaterial: 'off' | 'transparent'
  windowsMaterial: 'off' | 'mica'
  browserAccess: boolean
  networkExposure: 'loopback' | 'lan'
  port: number
  lanPort: number
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  notifications: boolean
  turnCompleted: boolean
  turnFailed: boolean
  jobCompleted: boolean
  jobFailed: boolean
}

export const DEFAULT_PREFERENCES: Readonly<DesktopPreferences> = Object.freeze({
  closeToTray: true, macosMaterial: 'transparent', windowsMaterial: 'off',
  browserAccess: false, networkExposure: 'loopback', port: 0, lanPort: 0, logLevel: 'info',
  notifications: true, turnCompleted: true, turnFailed: true, jobCompleted: true, jobFailed: true,
})

export interface DesktopState {
  selected: string
  profiles: string[]
  unavailableProfiles: string[]
  features: Features
  preferences: DesktopPreferences
  phase: 'starting' | 'ready' | 'error' | 'recovery'
  busy: boolean
  failure: string
  safeMode: boolean
  home: string
  platform: string
  version: string
  trayAvailable: boolean
  notificationsAvailable: boolean
  windowsMicaSupported: boolean
  browserUrl: string | null
  lan: DesktopLanHttpsRuntimeSnapshot | null
  checkpoint: { created: string } | null
  logs: string
}

/** Login links fetched explicitly by the native settings page, outside general state/diagnostics. */
export interface DesktopBrowserLinks {
  localUrl: string | null
  lanUrls: string[]
}

export type DesktopCommand =
  | { type: 'open-browser-url' | 'copy-browser-url'; url: string }
  | { type: 'create' | 'switch' | 'delete'; name: string }
  | { type: 'features'; features: Features }
  | { type: 'preferences'; preferences: DesktopPreferences }
  | { type: 'controls'; page?: 'general' | 'profiles' | 'create-profile' | 'tools' | 'recovery' }
  | { type: 'restart-app' | 'restart-recovery' | 'close-controls' }
  | { type: 'restart' | 'recover' | 'safe-mode' | 'normal-mode' | 'rollback' | 'repair-global'
    | 'reload' | 'devtools' | 'terminal' | 'open-home' | 'open-profile' | 'open-logs' | 'open-backups'
    | 'diagnostics' | 'open-browser' | 'open-lan' | 'copy-browser' | 'copy-lan' | 'export-ca' | 'quit' }

export interface DesktopBridge {
  state(): Promise<DesktopState>
  browserLinks(): Promise<DesktopBrowserLinks>
  command(command: DesktopCommand): Promise<void>
}

declare global { interface Window { desktopNext?: DesktopBridge } }
