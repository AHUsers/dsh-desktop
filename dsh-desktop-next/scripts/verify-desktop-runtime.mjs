/** Real shell-owned Host/recovery/network lifecycle, without Electron windows or user data. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as requestHttp } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NextDesktopRuntime } from '../lib/desktop-runtime.js'
import { forwardWebRequest } from '../lib/web-document.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const home = mkdtempSync(join(tmpdir(), 'dsh-next-native-runtime-'))
let failures = 0
const runtime = new NextDesktopRuntime({ root, home, executable: process.execPath, addresses: () => [],
  certificate: async () => { throw new Error('This test must not request system key storage or expose a LAN listener') },
  onFailure: () => failures++, onChange() {}, onRestart() {}, onTerminal() {}, onNotification() {},
})
async function upgrade(origin, headers = {}, keep = false) {
  return new Promise((resolve, reject) => {
    const request = requestHttp(new URL('/api/remote.mux', origin), { headers: {
      connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13',
      'sec-websocket-key': Buffer.alloc(16, 1).toString('base64'), ...headers,
    } })
    request.setTimeout(5000, () => request.destroy(new Error('WebSocket gate test timed out')))
    request.on('response', response => { response.resume(); resolve(response.statusCode) })
    request.on('upgrade', (response, socket) => { socket.on('error', () => {}); if (keep) { socket.resume(); resolve(socket) } else { socket.destroy(); resolve(response.statusCode) } })
    request.on('error', reject)
    request.end()
  })
}
try {
  runtime.initialize()
  runtime.profiles.ensure('default')
  runtime.profiles.setFeatures('default', { market: false, remoteControl: false })
  await runtime.start()
  assert.equal(runtime.state().phase, 'ready')
  assert.ok(runtime.state().checkpoint)
  const first = runtime.auth
  const response = await fetch(new URL(first.url).origin)
  assert.equal(response.status, 403, 'Desktop-only access denies ordinary browsers even on loopback')
  await response.body?.cancel()
  const cookieBypass = await fetch(new URL(first.url).origin, { headers: { cookie: first.cookie } })
  assert.equal(cookieBypass.status, 403, 'A browser cookie alone must not bypass disabled browser access')
  await cookieBypass.body?.cancel()
  const native = await forwardWebRequest(new Request('dsh-app://app/api/no-such-route'), first.url, first.cookie, first.token)
  assert.notEqual(native.status, 403, 'Authenticated Desktop forwarding passes the native gate')
  await native.body?.cancel()
  assert.equal(await upgrade(new URL(first.url).origin, { cookie: first.cookie }), 403, 'Disabled browser access also fences WebSocket upgrades')
  assert.equal(await upgrade(new URL(first.url).origin, { cookie: first.cookie, 'x-dsh-desktop-renderer': first.token }), 101, 'The native capability and cookie permit the real Gateway stream')
  assert.throws(() => runtime.browserLink(), /unavailable/)
  const nativeStream = await upgrade(new URL(first.url).origin, { cookie: first.cookie, 'x-dsh-desktop-renderer': first.token }, true)
  await runtime.applyPreferences({ ...runtime.preferences, browserAccess: true })
  assert.equal(runtime.auth, first, 'Browser toggles retain the existing Host and its capability')
  const login = await fetch(runtime.browserLink(), { redirect: 'manual' })
  assert.equal(login.status, 303, 'Enabled browser access exchanges the login token through the real Host')
  await login.body?.cancel()
  const browserStream = await upgrade(new URL(first.url).origin, { cookie: first.cookie }, true)
  const browserClosed = new Promise(resolve => browserStream.once('close', resolve))
  await runtime.applyPreferences({ ...runtime.preferences, browserAccess: false, networkExposure: 'loopback' })
  let closeTimer
  try { await Promise.race([browserClosed, new Promise((_, reject) => { closeTimer = setTimeout(() => reject(new Error('Browser stream was not revoked')), 5000) })]) }
  finally { clearTimeout(closeTimer); browserStream.destroy() }
  assert.equal(nativeStream.destroyed, false, 'Withdrawing browser access must retain the native stream')
  const denied = await fetch(new URL(first.url).origin, { headers: { cookie: first.cookie } })
  assert.equal(denied.status, 403)
  await denied.body?.cancel()
  assert.equal(await upgrade(new URL(first.url).origin, { cookie: first.cookie }), 403)
  assert.equal(runtime.state().browserUrl, null)
  await runtime.applyPreferences({ ...runtime.preferences, browserAccess: true })
  assert.equal(runtime.auth, first)
  nativeStream.destroy()
  await runtime.restart()
  assert.notEqual(runtime.auth.token, first.token, 'An actual Host restart rotates the native capability')
  assert.equal(new URL(runtime.state().browserUrl).search, '')
  assert.equal(JSON.stringify(runtime.state()).includes(runtime.auth.token), false)
  assert.equal(JSON.stringify(runtime.state()).includes(new URL(runtime.auth.url).search), false)
  const dir = runtime.profiles.directory('default')
  await runtime.backend.stop()
  writeFileSync(join(dir, 'package.json'), '{ broken manifest')
  await assert.rejects(runtime.start())
  assert.equal(runtime.state().phase, 'error')
  assert.ok(failures)
  await runtime.restart(() => { runtime.safeMode = true })
  assert.equal(runtime.state().phase, 'ready')
  assert.equal(runtime.state().safeMode, true)
  assert.equal(runtime.state().browserUrl, null)
  assert.equal(readFileSync(join(dir, 'package.json'), 'utf8'), '{ broken manifest')
  assert.throws(() => runtime.browserLink(), /unavailable/)
  await runtime.restart(async () => { await runtime.profiles.recover('default'); runtime.safeMode = false })
  assert.equal(runtime.state().phase, 'ready')
  assert.equal(runtime.state().safeMode, false)
  assert.deepEqual(runtime.state().features, { remoteControl: false, market: false })
  // Broken global patches require their separate repair, never a silent reset.
  await runtime.backend.stop()
  writeFileSync(join(home, 'cordis.patch.yml'), '[broken: yaml')
  await assert.rejects(runtime.start())
  await runtime.restart(() => { runtime.recovery.repairGlobalPatch() })
  assert.equal(runtime.state().phase, 'ready')
  const auth = runtime.auth
  await runtime.close()
  await assert.rejects(fetch(new URL(auth.url).origin))
  console.log('Next Desktop runtime passed: native-only HTTP/WebSocket gate, hot browser enable/disable with existing browser-stream revocation and native-stream preservation, per-Host credentials, corrupt-manifest recovery, isolated safe mode, separate global repair, and full process shutdown.')
} finally {
  await runtime.close()
  rmSync(home, { recursive: true, force: true })
}
