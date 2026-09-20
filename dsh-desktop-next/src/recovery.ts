/** Back up configuration without importing user packages or touching conversations. */
import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { withFileLock } from '@deepseek-ai/dsh-atomic-write'
import { atomicJson, atomicText, privateDirectory, readPrivateFile } from './private-files.ts'
import { NextProfiles, profileName } from './profiles.ts'
import { DEFAULT_PROFILE } from './desktop-contract.ts'

const FILES = ['package.json', 'cordis.patch.yml', 'desktop-next.features.json'] as const
type ConfigFile = typeof FILES[number]
interface Snapshot {
  version: 1
  profile: string
  created: string
  reason: string
  healthy: boolean
  files: Record<ConfigFile, { sha256: string } | null>
}
const digest = (text: string): string => createHash('sha256').update(text).digest('hex')

export class NextRecovery {
  readonly directory: string
  constructor(readonly profiles: NextProfiles) { this.directory = join(profiles.home, 'recovery') }

  backup(name: string, reason: string, healthy = false): string {
    const dir = this.profiles.directory(name)
    const contents = Object.fromEntries(FILES.map(file => [file, readPrivateFile(join(dir, file))])) as Record<ConfigFile, string | undefined>
    privateDirectory(this.directory)
    const target = join(this.directory, `${Date.now()}-${randomUUID()}`)
    privateDirectory(target)
    const files = Object.fromEntries(FILES.map(file => {
      const text = contents[file]
      if (text !== undefined) atomicText(join(target, file), text)
      return [file, text === undefined ? null : { sha256: digest(text) }]
    })) as Snapshot['files']
    atomicJson(join(target, 'snapshot.json'), { version: 1, profile: name, created: new Date().toISOString(), reason, healthy, files } satisfies Snapshot)
    return target
  }

  latest(name: string): { directory: string; created: string } | null {
    profileName(name)
    if (!lstatSync(this.directory, { throwIfNoEntry: false })) return null
    privateDirectory(this.directory)
    const entries = readdirSync(this.directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort().reverse()
    for (const entry of entries) {
      const directory = join(this.directory, entry)
      try {
        const snapshot = this.readSnapshot(directory, name)
        if (snapshot.healthy) return { directory, created: snapshot.created }
      } catch { /* A partial or corrupt backup cannot become a restore target. */ }
    }
    return null
  }

  checkpoint(name: string): void {
    const latest = this.latest(name)
    if (latest) {
      const previous = this.readSnapshot(latest.directory, name)
      if (FILES.every(file => {
        const text = readPrivateFile(join(this.profiles.directory(name), file))
        return text === undefined ? previous.files[file] === null : previous.files[file]?.sha256 === digest(text)
      })) return
    }
    this.backup(name, 'successful-start', true)
  }

  async restore(name: string): Promise<void> {
    const latest = this.latest(name)
    if (!latest) throw new Error('No successful-start configuration is available')
    const dir = this.profiles.directory(name)
    await withFileLock(join(dir, 'lock'), async () => {
      const snapshot = this.readSnapshot(latest.directory, name)
      // Verify the complete snapshot before making any change.
      const contents = FILES.map(file => {
        const text = readPrivateFile(join(latest.directory, file))
        const saved = snapshot.files[file]
        if (saved === null ? text !== undefined : text === undefined || digest(text) !== saved.sha256) throw new Error('Recovery backup checksum mismatch')
        return [file, text] as const
      })
      this.backup(name, 'before-rollback')
      for (const [file, text] of contents) {
        const path = join(dir, file)
        if (text !== undefined) atomicText(path, text)
        else if (readPrivateFile(path) !== undefined) unlinkSync(path)
      }
    })
  }

  repairGlobalPatch(): void {
    const path = join(this.profiles.home, 'cordis.patch.yml')
    const text = readPrivateFile(path)
    if (text === undefined) return
    privateDirectory(this.directory)
    const backup = join(this.directory, `global-patch-${Date.now()}-${randomUUID()}.yml`)
    atomicText(backup, text)
    atomicText(path, '[]\n')
  }

  removeProfile(name: string, active: string): void {
    if (name === active || name === DEFAULT_PROFILE) throw new Error('The active and default Profiles cannot be removed')
    const source = this.profiles.directory(name)
    if (!this.profiles.list().includes(name)) throw new Error('Profile does not exist')
    privateDirectory(this.directory)
    const removed = join(this.directory, 'removed-profiles')
    privateDirectory(removed)
    renameSync(source, join(removed, `${name}-${Date.now()}-${randomUUID()}`))
  }

  private readSnapshot(directory: string, name: string): Snapshot {
    const value = JSON.parse(readPrivateFile(join(directory, 'snapshot.json'), 16_384) ?? 'null') as Snapshot | null
    if (!value || value.version !== 1 || value.profile !== name || typeof value.healthy !== 'boolean'
      || typeof value.created !== 'string' || !Number.isFinite(Date.parse(value.created)) || !value.files
      || Object.keys(value.files).length !== FILES.length || FILES.some(file => value.files[file] !== null
        && (typeof value.files[file]?.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(value.files[file]!.sha256)))) {
      throw new Error('Invalid recovery backup')
    }
    return value
  }
}
