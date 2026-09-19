import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { composeEntries, loadOverlayPatches, readProfilePatches } from '@deepseek-ai/dsh-app-boot'
import { AA_PACKAGE, loadNextProfile, NEXT_PACKAGE, NextProfiles, profileName, WEB_BUNDLES } from '../src/profiles.ts'

const roots: string[] = []
function profiles() { const home = mkdtempSync(join(tmpdir(), 'dsh-next-profiles-')); roots.push(home); return new NextProfiles(home) }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it.each(['../outside', 'a/b', 'a\\b', 'node_modules', 'CON', '', 'a'.repeat(65)])('rejects invalid profile name %s', name => {
  expect(() => profileName(name)).toThrow()
})
it('isolates profile configuration and preserves existing files on ensure', () => {
  const manager = profiles()
  const first = manager.ensure('default')
  manager.create('work')
  writeFileSync(join(first, 'cordis.patch.yml'), '# user patch\n[]\n')
  manager.ensure('default')
  manager.setFeatures('work', { remoteControl: true, market: false })
  manager.select('work')
  expect(new NextProfiles(manager.home).active).toBe('work')
  expect(manager.features('default')).toEqual({ remoteControl: false, market: true })
  expect(manager.features('work')).toEqual({ remoteControl: true, market: false })
  expect(readFileSync(join(first, 'cordis.patch.yml'), 'utf8')).toBe('# user patch\n[]\n')
  expect(() => manager.create('work')).toThrow()
})
it('refuses a symlinked profile before writing outside Next home', () => {
  const manager = profiles()
  const outside = profiles()
  mkdirSync(join(manager.home, 'profiles'))
  symlinkSync(outside.home, join(manager.home, 'profiles', 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() => manager.ensure('escape')).toThrow('real directory')
})
it('recovers without parsing broken patches or deleting plugin packages and home patches', async () => {
  const manager = profiles()
  const dir = manager.ensure('default')
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  manifest.dsh.profile.bundles.push('missing-third-party-plugin')
  manifest.dependencies = { 'missing-third-party-plugin': '1.0.0' }
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  const broken = ': invalid: [yaml'
  writeFileSync(join(dir, 'cordis.patch.yml'), broken)
  writeFileSync(join(manager.home, 'cordis.patch.yml'), '# keep home patch\n[]\n')
  mkdirSync(join(dir, 'node_modules', 'missing-third-party-plugin'), { recursive: true })
  writeFileSync(join(dir, 'node_modules', 'missing-third-party-plugin', 'keep'), 'plugin')
  manager.setFeatures('default', { remoteControl: true, market: true })
  const backup = await manager.recover('default')
  expect(readFileSync(backup!, 'utf8')).toBe(broken)
  expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dsh.profile.bundles).toEqual(WEB_BUNDLES)
  expect(manager.features('default')).toEqual({ remoteControl: false, market: false })
  expect(readFileSync(join(dir, 'node_modules', 'missing-third-party-plugin', 'keep'), 'utf8')).toBe('plugin')
  expect(readFileSync(join(manager.home, 'cordis.patch.yml'), 'utf8')).toContain('keep home patch')
})
it('composes optional AA and Market while retaining the official Web layout', () => {
  const manager = profiles()
  const dir = manager.ensure('default')
  manager.setFeatures('default', { remoteControl: true, market: true })
  const profile = loadNextProfile(dir, manager.home)
  const rows = composeEntries([...profile.layers.map(layer => layer.patches), loadOverlayPatches('next', join(dir, 'desktop-next.cordis.patch.json'))])
  expect(rows.some(row => row.name === AA_PACKAGE && !row.disabled)).toBe(true)
  expect(rows.some(row => row.name === 'dsh-community-market' && !row.disabled)).toBe(true)
  expect(rows.some(row => row.id === 'ui-layout' && !row.disabled)).toBe(true)
  const reread = readProfilePatches('next', {
    name: 'default', dir, patchPath: profile.patchPath, installAnchor: NEXT_PACKAGE,
    cwd: dir, home: manager.home, startedBundles: WEB_BUNDLES, telemetryDisabledEnv: '1',
    overlays: [...loadOverlayPatches('next', fileURLToPath(new URL('../host.cordis.patch.yml', import.meta.url))),
      ...loadOverlayPatches('next', join(dir, 'desktop-next.cordis.patch.json'))],
  })
  const reconciled = composeEntries([reread])
  expect(reconciled.some(row => row.name === 'dsh-community-market' && !row.disabled)).toBe(true)
  expect(reconciled.find(row => row.id === 'webserver')?.disabled).toBe(true)
  expect(reconciled.some(row => row.name === 'dsh-desktop-next/webserver' && !row.disabled)).toBe(true)
  manager.setFeatures('default', { remoteControl: false, market: false })
  const disabled = composeEntries([...loadNextProfile(dir, manager.home).layers.map(layer => layer.patches), loadOverlayPatches('next', join(dir, 'desktop-next.cordis.patch.json'))])
  expect(disabled.some(row => !row.disabled && (row.name === AA_PACKAGE || row.name === 'dsh-community-market'))).toBe(false)
})

it('refuses to overwrite an unmanaged bundle fallback', () => {
  const manager = profiles()
  const dir = manager.ensure('default')
  mkdirSync(join(manager.home, 'profiles', 'node_modules', 'dsh-desktop-next'), { recursive: true })
  expect(() => loadNextProfile(dir, manager.home)).toThrow('unmanaged package')
})
