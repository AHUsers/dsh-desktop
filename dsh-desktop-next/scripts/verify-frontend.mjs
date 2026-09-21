/** Check the real official Web entry and sandboxed preload bundles without a GUI. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { serveWebDocument } from '../lib/web-document.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const webRoot = dirname(require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html'))
const official = readFileSync(join(webRoot, 'index.html'), 'utf8')
const local = await serveWebDocument(new Request('dsh-app://app/'), webRoot)
const html = await local.text()
assert.equal(local.status, 200)
assert.equal(html.replace('<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script>', ''), official)
assert.ok(html.includes('/assets/'), 'Official production frontend must carry built assets')

for (const platform of ['darwin', 'win32', 'linux']) {
  const exposed = new Map()
  const dataset = {}
  const invocations = []
  const userActivation = { isActive: false }
  for (const [entry, hostname] of [['preload-app.cjs', 'app'], ['preload-shell.cjs', 'shell']]) {
    const listeners = new Map()
    let requestedPage = 'general'
    runInNewContext(readFileSync(join(root, 'lib', entry), 'utf8'), {
      require: name => {
        assert.equal(name, 'electron', 'Sandboxed preloads may not require local chunks or Node modules')
        return { contextBridge: { exposeInMainWorld: (name, api) => exposed.set(name, api) }, ipcRenderer: {
          invoke: (...args) => { invocations.push(args); return Promise.resolve(args[0] === 'dsh-next:settings-take' ? requestedPage : undefined) }, send() {},
          on: (channel, listener) => listeners.set(channel, listener), removeListener: channel => listeners.delete(channel),
        } }
      },
      process: { platform }, location: { protocol: 'dsh-app:', hostname },
      document: { readyState: 'loading', documentElement: { dataset, style: { setProperty() {} } } },
      window: { addEventListener() {} }, console,
      navigator: { userActivation },
    }, { filename: entry })
    if (hostname === 'app') {
      const sidebar = exposed.get('desktopNext').sidebarBrowser
      await sidebar.command({ type: 'open', id: 'smoke' })
      assert.equal(invocations.at(-1)[0], 'dsh-next:sidebar-browser')
      const browserStates = []
      const stopBrowser = sidebar.subscribe((...args) => browserStates.push(args))
      const state = { id: 'smoke', revision: 1, url: 'https://example.com/' }
      listeners.get('dsh-next:sidebar-browser-state')({ privilegedEvent: true }, state)
      assert.equal(browserStates[0].length, 1, 'The Electron event must never cross the bridge')
      assert.equal(browserStates[0][0], state)
      stopBrowser()
      assert.equal(listeners.has('dsh-next:sidebar-browser-state'), false)
      const received = []
      const stop = exposed.get('desktopNext').onOpenSettings(page => received.push(page))
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.deepEqual(received, ['general'], 'A request made before the client mounts must be delivered')
      requestedPage = 'permissions'
      listeners.get('dsh-next:settings-open')()
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.deepEqual(received, ['general', 'permissions'])
      requestedPage = 'unsupported'
      listeners.get('dsh-next:settings-open')()
      await new Promise(resolve => setTimeout(resolve, 0))
      assert.deepEqual(received, ['general', 'permissions'])
      stop()
      assert.equal(listeners.has('dsh-next:settings-open'), false)
    } else {
      assert.equal(exposed.get('desktopNext').onOpenSettings, undefined)
      assert.equal(exposed.get('desktopNext').sidebarBrowser, undefined)
    }
  }
  assert.equal(dataset.platform, platform)
  assert.equal(exposed.get('dshDesktop')?.protocolVersion, 1)
  assert.equal(typeof exposed.get('dshDesktopBoot')?.ready, 'function')
  assert.equal(typeof exposed.get('__DSH_DIRECTORY_PICKER__')?.pick, 'function')
  assert.equal(typeof exposed.get('desktopNext')?.command, 'function')
  assert.equal(typeof exposed.get('desktopNext')?.browserLinks, 'function')
  const permissions = exposed.get('desktopNext').permissions
  await permissions.query('microphone')
  assert.equal(invocations.at(-1)[0], 'dsh-next:permission-query')
  await assert.rejects(permissions.request('microphone'), /user gesture/)
  userActivation.isActive = true
  await permissions.request('microphone')
  assert.deepEqual([...invocations.at(-1)], ['dsh-next:permission-request', 'microphone'])
  await permissions.openSettings('screen')
  assert.deepEqual([...invocations.at(-1)], ['dsh-next:permission-settings', 'screen'])
}
console.log('Next frontend check passed: official alpha.2 entry and independent sandboxed preloads for macOS, Windows and Linux.')
