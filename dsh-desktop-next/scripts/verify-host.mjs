/** Exercise the actual alpha.2 Host, credentials, Market routes and AA manifest without Electron UI. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DesktopHostProcess } from '../lib/host-process.js'
import { NEXT_PACKAGE, NextProfiles } from '../lib/profiles.js'
import { bundledPnpmEntry, createPackageRunner } from '../lib/extensions.js'
import { forwardWebRequest } from '../lib/web-document.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'dsh-next-host-'))
const manager = new NextProfiles(home)
const executable = process.argv.includes('--electron') ? createRequire(import.meta.url)('electron') : process.execPath
let restartRequests = 0
let host
let runner
async function boot(name) {
  host = new DesktopHostProcess(executable, root, manager.directory(name), undefined,
    { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, undefined, undefined, 'runtime', undefined,
    join(root, 'lib', 'host.js'), () => { restartRequests++ })
  let timer
  const ready = await Promise.race([
    host.start(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Next Host smoke exceeded 60 seconds')), 60_000) }),
  ]).finally(() => clearTimeout(timer))
  const url = new URL(ready.url)
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok(Number(url.port) > 0)
  assert.ok(Array.isArray(ready.injections))
  const login = await fetch(url, { redirect: 'manual' })
  assert.equal(login.status, 303)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie)
  await login.body?.cancel()
  return { origin: url.origin, cookie }
}
async function stop() { await host.stop(true); host = undefined }
try {
  const dir = manager.ensure('default')
  manager.setFeatures('default', { remoteControl: true, market: true })
  // Install only a local empty fixture. No catalog, registry or user profile is changed.
  const fixture = join(home, 'fixture-plugin')
  mkdirSync(fixture)
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'fixture-next-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(fixture, 'cordis.patch.yml'), '[]\n')
  runner = createPackageRunner({ command: executable, args: ['--expose-internals', bundledPnpmEntry(NEXT_PACKAGE)], env: {
    ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: executable,
    PATH: `${join(root, 'scripts', 'node-bin')}${delimiter}${process.env.PATH ?? ''}`,
  } }, dir)
  const install = runner.run(['add', '--offline', '--ignore-scripts', `file:${fixture}`])
  let output = ''
  install.stdout.on('data', value => { output += value }); install.stderr.on('data', value => { output += value })
  assert.equal((await install.done).exitCode, 0, output)
  await runner.dispose()
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  manifest.dsh.profile.bundles.push('fixture-next-plugin')
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  const { origin, cookie } = await boot('default')
  const denied = await fetch(`${origin}/api/community-market/state`)
  assert.equal(denied.status, 401)
  const state = await fetch(`${origin}/api/community-market/state`, { headers: { cookie } })
  assert.equal(state.status, 200, await state.clone().text())
  const stateBody = await state.json()
  assert.ok(Array.isArray(stateBody.sources))
  assert.deepEqual(stateBody.desktopActions, { openTerminal: ['darwin', 'win32'].includes(process.platform), requestRestart: true })
  const nativeToken = 'fixture-native-request'
  const call = async (path, body, expected = 200) => {
    // Match the native session marker, including an absent Origin header.
    const request = new Request(`dsh-app://app/api/community-market/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-desktop-renderer': nativeToken },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const response = await forwardWebRequest(request, origin, cookie, nativeToken)
    const result = await response.json()
    assert.equal(response.status, expected, JSON.stringify(result))
    return result
  }
  const builtIn = stateBody.builtIns[0]
  assert.ok(builtIn)
  const added = await call('sources', { action: 'add-builtin', key: builtIn.key })
  const source = added.sources.find(item => item.builtInProviderKey === builtIn.key)
  assert.ok(source)
  const selected = await call('sources', { action: 'select', sourceRecordId: source.sourceRecordId })
  assert.equal(selected.sources.find(item => item.sourceRecordId === source.sourceRecordId)?.enabled, true)
  const deleted = await call('sources', { action: 'remove', sourceRecordId: source.sourceRecordId })
  assert.equal(deleted.sources.some(item => item.sourceRecordId === source.sourceRecordId), false)
  assert.ok((await call('installations')).installations.some(item => item.packageName === 'fixture-next-plugin' && item.action === 'uninstall'))
  // This invalid mutation must reach the existing schema gate, with no installation or external requests.
  const mutation = await fetch(`${origin}/api/community-market/operations/preview`, {
    method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(mutation.status, 400, await mutation.text())
  const crossOrigin = await fetch(`${origin}/api/community-market/operations/preview`, {
    method: 'POST', headers: { cookie, origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(crossOrigin.status, 403)
  await crossOrigin.body?.cancel()
  const preview = await call('operations/preview', { action: 'uninstall', bundleId: 'fixture-next-plugin' })
  const removed = await call('operations/execute', { previewId: preview.previewId })
  assert.equal(removed.packageName, 'fixture-next-plugin')
  assert.equal((await call('installations')).installations.length, 0)
  await call('desktop/request-restart', { restartToken: removed.restartToken })
  await call('desktop/request-restart', { restartToken: removed.restartToken }, 410)
  // Await the private IPC event without asking the smoke to launch an Electron window.
  for (let attempts = 0; restartRequests === 0 && attempts < 50; attempts++) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(restartRequests, 1)
  const page = await fetch(`${origin}/`, { headers: { cookie } })
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.ok(html.includes('dsh-community-market'), 'Market client must appear in the boot manifest')
  assert.ok(html.includes('"id":"dsh-desktop-next"'), 'Next window controls must be a client boot entry')
  assert.ok(html.includes('@agents-anywhere/dsh-bridge-next'), 'AA client must appear in the boot manifest')
  await stop()
  writeFileSync(join(dir, 'cordis.patch.yml'), ': broken: [yaml')
  await manager.recover('default')
  assert.deepEqual(manager.features('default'), { remoteControl: false, market: false })
  const recovered = await boot('default')
  const recoveredPage = await fetch(`${recovered.origin}/`, { headers: { cookie: recovered.cookie } })
  assert.equal(recoveredPage.status, 200)
  const recoveredHtml = await recoveredPage.text()
  assert.equal(recoveredHtml.includes('dsh-community-market'), false)
  assert.equal(recoveredHtml.includes('@agents-anywhere/dsh-bridge-next'), false)
  assert.ok(recoveredHtml.includes('"id":"dsh-desktop-next"'), 'Recovery must retain basic window controls')
  await stop()
  manager.create('work'); manager.select('work')
  const switched = await boot(manager.active)
  assert.equal(manager.active, 'work')
  const switchedState = await fetch(`${switched.origin}/api/community-market/state`, { headers: { cookie: switched.cookie } })
  assert.equal(switchedState.status, 200)
  await switchedState.body?.cancel()
  await stop()
  console.log(`Next Host smoke passed (${process.argv.includes('--electron') ? 'Electron Node mode' : 'Node'}): authenticated alpha.2 Web, AA composition, offline pnpm, native Market sources/uninstall/restart without Origin, graceful shutdown, recovery boot and profile switch.`)
} finally {
  await runner?.dispose()
  await host?.stop()
  rmSync(home, { recursive: true, force: true })
}
