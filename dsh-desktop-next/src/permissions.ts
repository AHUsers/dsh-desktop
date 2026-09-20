/** Public, Electron-free contract for native Desktop client plugins. */
import type {} from '@deepseek-ai/cordis'

export type DesktopPermission = 'microphone' | 'screen' | 'accessibility'
export type DesktopPermissionStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

export interface DesktopPermissionSnapshot {
  readonly permission: DesktopPermission
  readonly status: DesktopPermissionStatus
  /** The OS supports asking for this permission and has not permanently denied it. */
  readonly canRequest: boolean
  readonly canOpenSettings: boolean
}

export interface DesktopPermissions {
  /** Reads current OS state without prompting. Unknown does not imply a grant. */
  query(permission: DesktopPermission): Promise<DesktopPermissionSnapshot>
  /** Call from a user gesture. Requests OS consent without starting recording. */
  request(permission: DesktopPermission): Promise<DesktopPermissionSnapshot>
  /** Call from a user gesture. Opens the fixed OS privacy pane for this permission. */
  openSettings(permission: DesktopPermission): Promise<void>
}

export function desktopPermission(value: unknown): DesktopPermission {
  if (value !== 'microphone' && value !== 'screen' && value !== 'accessibility') throw new Error('Unsupported Desktop permission')
  return value
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Native Next renderer only; absent in the Host and ordinary browsers. */
    desktopPermissions: DesktopPermissions
  }
}
