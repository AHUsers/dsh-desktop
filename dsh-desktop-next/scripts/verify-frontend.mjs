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
    runInNewContext(readFileSync(join(root, 'lib', entry), 'utf8'), {
      require: name => {
        assert.equal(name, 'electron', 'Sandboxed preloads may not require local chunks or Node modules')
        return { contextBridge: { exposeInMainWorld: (name, api) => exposed.set(name, api) }, ipcRenderer: { invoke: (...args) => { invocations.push(args) }, send() {} } }
      },
      process: { platform }, location: { protocol: 'dsh-app:', hostname },
      document: { readyState: 'loading', documentElement: { dataset, style: { setProperty() {} } } },
      window: { addEventListener() {} }, console,
      navigator: { userActivation },
    }, { filename: entry })
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
