/** Exercise the actual alpha.2 Host, credentials, Market routes and AA manifest without Electron UI. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  manager.setFeatures('default', { remoteControl: true, market: true, dshMarket: true })
  // Install only a local empty fixture. No catalog, registry or user profile is changed.
  const fixture = join(home, 'fixture-plugin')
  mkdirSync(fixture)
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'fixture-next-plugin', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(fixture, 'cordis.patch.yml'), '[]\n')
  runner = createPackageRunner({ command: executable, args: ['--expose-internals', bundledPnpmEntry(NEXT_PACKAGE)], env: {
    ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: executable,
    PATH: `${join(root, 'scripts', 'node-bin')}${delimiter}${process.env.PATH ?? ''}`,
  } }, dir)
  const { createDesktopPluginRuntime } = await import(new URL('./lib/dsh-cli.js', pathToFileURL(createRequire(import.meta.url).resolve('dshmarket/package.json'))))
  const marketRuntime = createDesktopPluginRuntime(runner, dir, home)
  const installed = await marketRuntime.runPlugin('default', ['add', '--offline', '--ignore-scripts', `file:${fixture}`])
  assert.equal(installed.exitCode, 0, JSON.stringify(installed))
  const install = runner.run(['list'])
  let output = ''
  install.stdout.on('data', value => { output += value }); install.stderr.on('data', value => { output += value })
  assert.equal((await install.done).exitCode, 0, output)
  await runner.dispose()
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  assert.ok(manifest.dsh.profile.bundles.includes('fixture-next-plugin'), 'Official plugin operations must activate the bundle')
  let { origin, cookie } = await boot('default')
  const rpc = async (method, args = {}) => {
    const rpcId = crypto.randomUUID()
    const response = await fetch(`${origin}/api/pluginManager/${method}`, {
      method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: `pluginManager/${method}`, payload: { args } }),
    })
    const reply = await response.json()
    assert.equal(reply.result.ok, true, JSON.stringify(reply))
    return reply.result.value
  }
  const packages = ['dsh-community-market', 'dshmarket', '@agents-anywhere/dsh-bridge-next']
  for (const name of packages) {
    const bundle = (await rpc('listBundles')).find(row => row.name === name)
    assert.equal(bundle?.enabled, true, JSON.stringify(bundle))
    assert.equal(bundle.optional, true)
    assert.equal(bundle.removable, false)
    const result = await rpc('setBundleEnabled', { name, enabled: false })
    assert.equal(result.application, 'applied', JSON.stringify(result))
    assert.equal((await rpc('listBundles')).find(row => row.name === name)?.enabled, false)
    await rpc('setBundleEnabled', { name, enabled: true })
  }
  await rpc('setBundleEnabled', { name: packages[2], enabled: false })
  await stop()
  ;({ origin, cookie } = await boot('default'))
  assert.deepEqual(manager.features('default'), { market: true, remoteControl: false, dshMarket: true })
  assert.equal((await rpc('listPlugins')).some(row => row.moduleName === packages[2] && row.enabled), false)
  await rpc('setBundleEnabled', { name: packages[2], enabled: true })
  for (const name of packages) {
    const row = (await rpc('listPlugins')).find(row => row.moduleName === name)
    assert.equal(row?.fiberPhase, 'active', JSON.stringify(row))
    assert.equal(row?.enabled, true, JSON.stringify(row))
  }
  const aaRow = (await rpc('listPlugins')).find(row => row.moduleName === packages[2])
  const disabledRow = await rpc('setPluginEnabled', { id: aaRow.entryId, enabled: false })
  assert.equal(disabledRow.application, 'applied', JSON.stringify(disabledRow))
  assert.equal((await rpc('listPlugins')).find(row => row.moduleName === packages[2])?.enabled, false)
  const enabledRow = await rpc('setPluginEnabled', { id: aaRow.entryId, enabled: true })
  assert.equal(enabledRow.application, 'applied', JSON.stringify(enabledRow))
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
  // Probe the real dshmarket update gate without updating or fetching a package.
  for (const originHeader of [undefined, 'dsh-app://app']) {
    const request = new Request('dsh-app://app/dsh-market/update', {
      method: 'POST', body: JSON.stringify({ name: 'fixture-not-installed' }),
      headers: { 'content-type': 'application/json', 'x-dsh-desktop-renderer': nativeToken,
        ...(originHeader ? { origin: originHeader } : {}) },
    })
    const response = await forwardWebRequest(request, origin, cookie, nativeToken)
    const payload = await response.json()
    assert.equal(response.status, 400, JSON.stringify(payload))
    assert.equal(payload.error, 'plugin is not installed')
  }
  const untrustedUpdate = await fetch(`${origin}/dsh-market/update`, {
    method: 'POST', headers: { cookie, origin: 'https://example.invalid', 'content-type': 'application/json' }, body: '{}',
  })
  assert.equal(untrustedUpdate.status, 403)
  await untrustedUpdate.body?.cancel()
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
  assert.ok(html.includes('dshmarket'), 'dshmarket client must coexist with Community Market and AA')
  const installedAgain = await rpc('installBundle', { spec: fixture })
  assert.equal(installedAgain.application, 'applied', JSON.stringify(installedAgain))
  assert.ok((await rpc('listBundles')).some(row => row.name === 'fixture-next-plugin' && row.installed && row.enabled && row.removable))
  await rpc('setBundleEnabled', { name: 'fixture-next-plugin', enabled: false })
  assert.equal((await rpc('listBundles')).find(row => row.name === 'fixture-next-plugin')?.enabled, false)
  const uninstalled = await rpc('removeBundle', { name: 'fixture-next-plugin' })
  assert.equal(uninstalled.application, 'applied', JSON.stringify(uninstalled))
  assert.equal((await rpc('listBundles')).some(row => row.name === 'fixture-next-plugin'), false)
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
  if (process.argv.includes('--computer-use')) {
    const cua = manager.create('computer-use')
    manager.setFeatures('computer-use', { remoteControl: false, market: false })
    writeFileSync(join(cua, 'cordis.patch.yml'), '- id: computer-use-cua-driver-native\n  disabled: false\n')
    const enabled = await boot('computer-use')
    const rpcId = crypto.randomUUID()
    const response = await fetch(`${enabled.origin}/api/pluginManager/listPlugins`, {
      method: 'POST', headers: { cookie: enabled.cookie, origin: enabled.origin, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId, method: 'pluginManager/listPlugins', payload: { args: {} } }),
    })
    assert.equal(response.status, 200)
    const reply = await response.json()
    assert.equal(reply.rpcId, rpcId)
    assert.equal(reply.result.ok, true, JSON.stringify(reply))
    const provider = reply.result.value.find(row => row.moduleName === '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native')
    assert.equal(provider?.enabled, true)
    assert.equal(provider?.fiberPhase, 'active', JSON.stringify(provider))
    await stop()
    console.log('Opt-in Cua native provider activation and teardown passed without capturing screens, sending input or prompting for OS permissions.')
  }
  console.log(`Next Host smoke passed (${process.argv.includes('--electron') ? 'Electron Node mode' : 'Node'}): authenticated alpha.2 Web, both markets and AA independently managed and persisted, official row toggles, dshmarket offline install and cross-market removal, native dshmarket update origin gate, graceful shutdown, recovery boot and profile switch.`)
} finally {
  await runner?.dispose()
  await host?.stop()
  rmSync(home, { recursive: true, force: true })
}
