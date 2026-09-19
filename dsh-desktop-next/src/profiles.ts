/** Next-owned profile state. Recovery works without importing any user plugin. */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initProfile, loadProfileDirectory, PROFILE_TEMPLATES, type Profile } from '@deepseek-ai/dsh-app-boot'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { atomicJson, atomicText, readPrivateFile } from './private-files.ts'
import { NextRecovery } from './recovery.ts'

export const NEXT_PACKAGE = fileURLToPath(new URL('../package.json', import.meta.url))
export const WEB_BUNDLES = [...PROFILE_TEMPLATES.web!.bundles, 'dsh-desktop-next']
export const AA_PACKAGE = '@agents-anywhere/dsh-bridge-next'
export interface Features { remoteControl: boolean; market: boolean }
export const DEFAULT_FEATURES: Readonly<Features> = { remoteControl: false, market: true }

export function profileName(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(value)
    || /^(?:node_modules|con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(value)) {
    throw new Error('Profile 名称需为 1–64 个英文字母、数字、下划线或连字符，且不能是系统保留名称。')
  }
  return value
}

export function parseFeatures(value: unknown): Features {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid Next features')
  const features = value as Record<string, unknown>
  if (typeof features.remoteControl !== 'boolean' || typeof features.market !== 'boolean'
    || Object.keys(features).some(key => key !== 'remoteControl' && key !== 'market')) throw new Error('Invalid Next features')
  return { remoteControl: features.remoteControl, market: features.market }
}

export class NextProfiles {
  constructor(readonly home: string) {
    if (!isAbsolute(home)) throw new Error('Next home must be absolute')
  }
  directory(name: string): string {
    const root = join(this.home, 'profiles')
    const dir = join(root, profileName(name))
    for (const path of [this.home, root, dir]) {
      if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) {
        throw new Error(`Next profile path must be a real directory: ${path}`)
      }
    }
    return dir
  }
  get active(): string {
    const file = join(this.home, 'desktop-next.json')
    const text = readPrivateFile(file)
    if (text === undefined) return 'default'
    return profileName((JSON.parse(text) as { active?: unknown }).active)
  }
  select(name: string): void {
    if (!existsSync(join(this.directory(name), 'package.json'))) throw new Error('Profile does not exist')
    atomicJson(join(this.home, 'desktop-next.json'), { version: 1, active: name })
  }
  list(): string[] {
    const root = join(this.home, 'profiles')
    if (!existsSync(root)) return []
    return readdirSync(root, { withFileTypes: true }).filter(entry => {
      if (!entry.isDirectory()) return false
      try { return existsSync(join(this.directory(entry.name), 'package.json')) } catch { return false }
    }).map(entry => entry.name).sort()
  }
  ensure(name: string): string {
    const dir = this.directory(name)
    initProfile(dir, WEB_BUNDLES)
    return dir
  }
  create(name: string): string {
    const dir = this.directory(name)
    mkdirSync(dirname(dir), { recursive: true, mode: 0o700 })
    mkdirSync(dir, { mode: 0o700 })
    initProfile(dir, WEB_BUNDLES)
    return dir
  }
  features(name: string): Features {
    const file = join(this.directory(name), 'desktop-next.features.json')
    const text = readPrivateFile(file)
    return text === undefined ? { ...DEFAULT_FEATURES } : parseFeatures(JSON.parse(text))
  }
  setFeatures(name: string, value: unknown): void {
    atomicJson(join(this.directory(name), 'desktop-next.features.json'), parseFeatures(value))
  }
  /** The shell must stop this profile's Host before calling recovery. */
  async recover(name: string): Promise<string | undefined> {
    const dir = this.directory(name)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    return withFileLock(join(dir, 'lock'), async () => {
      const backup = new NextRecovery(this).backup(name, 'before-profile-repair')
      let manifest: Record<string, unknown> = { name, private: true }
      try {
        const value: unknown = JSON.parse(readPrivateFile(join(dir, 'package.json')) ?? '{}')
        if (value && typeof value === 'object' && !Array.isArray(value)) manifest = value as Record<string, unknown>
      } catch { /* The original bytes have already been backed up. */ }
      // Keep installed dependencies, but remove malformed activation metadata.
      manifest.dsh = { profile: { bundles: WEB_BUNDLES } }
      atomicJson(join(dir, 'package.json'), manifest)
      atomicText(join(dir, 'cordis.patch.yml'), '[]\n')
      this.setFeatures(name, { remoteControl: false, market: false })
      return readPrivateFile(join(backup, 'cordis.patch.yml')) === undefined ? undefined : join(backup, 'cordis.patch.yml')
    })
  }
}

/** Add product capabilities without replacing the upstream Web presentation. */
export function loadNextProfile(projectDir: string, home: string, installAnchor = NEXT_PACKAGE): Profile {
  const manager = new NextProfiles(home)
  if (manager.directory(basename(projectDir)) !== resolve(projectDir)) throw new Error('Profile must belong to Next home')
  // Upstream bundle discovery walks physical node_modules before installing its
  // runtime resolver. Project only this application's bundle, not its dependency
  // tree; the alpha.2 runtime resolver owns all other package fallbacks.
  const modules = join(home, 'profiles', 'node_modules')
  const existingModules = lstatSync(modules, { throwIfNoEntry: false })
  if (existingModules && !existingModules.isDirectory()) throw new Error('Next bundle fallback must be a real directory')
  mkdirSync(modules, { recursive: true, mode: 0o700 })
  const link = join(modules, 'dsh-desktop-next')
  const target = realpathSync(dirname(installAnchor))
  const existingLink = lstatSync(link, { throwIfNoEntry: false })
  if (existingLink && !existingLink.isSymbolicLink()) throw new Error('Next bundle fallback is occupied by an unmanaged package')
  if (existingLink && resolve(modules, readlinkSync(link)) !== target) unlinkSync(link)
  if (!lstatSync(link, { throwIfNoEntry: false })) symlinkSync(target, link, 'junction')
  const profile = loadProfileDirectory('dsh-desktop-next', projectDir, installAnchor)
  if (!profile.layers.some(layer => layer.packageName === 'dsh-desktop-next')) {
    throw new Error('Next profile is missing its required dsh-desktop-next bundle')
  }
  const features = manager.features(basename(projectDir))
  const overlay = [
    { id: 'community-market', disabled: !features.market },
    { id: 'agents-anywhere-bridge-next', disabled: !features.remoteControl, config: {
      dshHome: home, stateRoot: join(home, 'agents-anywhere', basename(projectDir)),
    } },
  ]
  // A persistent bundle also survives shared Web plugin-manager reconciliation.
  // Final overlays keep Next switches authoritative after user/home patches.
  atomicJson(join(projectDir, 'desktop-next.cordis.patch.json'), overlay)
  return profile
}
