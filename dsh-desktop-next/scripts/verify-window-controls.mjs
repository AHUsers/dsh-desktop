/** Official Desktop boot in headless Chromium; simulated IPC/platform, no native window or user profile. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { DesktopHostProcess } from '../lib/host-process.js'
import { NextProfiles } from '../lib/profiles.js'
import { authenticateWebHost, serveWebDocument } from '../lib/web-document.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const webRoot = dirname(require.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html'))
const home = mkdtempSync(join(tmpdir(), 'dsh-next-window-controls-'))
const screenshots = join(root, '.desktop-next', 'verification')
const manager = new NextProfiles(home)
manager.ensure('default')
manager.setFeatures('default', { market: false, remoteControl: false })
const host = new DesktopHostProcess(process.execPath, root, manager.directory('default'), undefined,
  { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }, undefined, undefined, 'runtime', undefined,
  join(root, 'lib', 'host.js'))
let browser
let page
const diagnostics = []
try {
  const ready = await host.start()
  const streamBaseUrl = new URL(ready.url).origin
  const cookie = await authenticateWebHost(ready.url)
  const cookieSeparator = cookie.indexOf('=')
  const documentResponse = await serveWebDocument(new Request('dsh-app://app/'), webRoot)
  assert.equal(documentResponse.status, 200)
  const desktopDocument = await documentResponse.text()
  browser = await chromium.launch({ headless: true,
    ...(process.env.DSH_NEXT_TEST_BROWSER_CHANNEL ? { channel: process.env.DSH_NEXT_TEST_BROWSER_CHANNEL } : {}),
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 840 }, locale: 'zh-CN', colorScheme: 'dark' })
  // Chromium classifies the intercepted document separately from its loopback Host.
  await context.grantPermissions(['local-network-access'], { origin: streamBaseUrl })
  await context.addCookies([{ url: streamBaseUrl, name: cookie.slice(0, cookieSeparator), value: cookie.slice(cookieSeparator + 1) }])
  // Serve the Desktop document without the browser Host's inline injections.
  // The published entry must request them through its Desktop boot contract.
  await context.route(streamBaseUrl + '/', route => route.fulfill({ contentType: 'text/html', body: desktopDocument }))
  await context.addInitScript(payload => {
    globalThis.__NEXT_TEST_BOOT__ = { calls: 0, failures: [] }
    globalThis.dshDesktop = { protocolVersion: 1 }
    globalThis.dshDesktopBoot = {
      ready: async () => { globalThis.__NEXT_TEST_BOOT__.calls++; return payload },
      failed: async message => { globalThis.__NEXT_TEST_BOOT__.failures.push(message) },
    }
    const mark = () => { document.documentElement.dataset.platform = 'darwin' }
    if (document.documentElement) mark()
    else document.addEventListener('DOMContentLoaded', mark, { once: true })
  }, { injections: ready.injections, streamBaseUrl })
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) diagnostics.push(message.text()) })
  page.on('response', response => { if (response.status() >= 400) diagnostics.push(`${response.status()} ${new URL(response.url()).pathname}`) })
  await page.goto(streamBaseUrl)
  const collapse = page.getByRole('button', { name: /^(收起侧边栏|Collapse sidebar)$/ })
  const reopen = page.locator('.dshNextSidebarOpen')
  const drag = page.locator('.dshNextWindowDrag')
  await collapse.waitFor({ state: 'visible' })
  assert.deepEqual(await page.evaluate(() => globalThis.__DSH_TRANSPORT__), { ownsHost: true, streamBaseUrl },
    'The official entry must execute its Desktop boot branch')
  assert.equal(await page.evaluate(() => globalThis.__NEXT_TEST_BOOT__.calls), 1)
  await page.getByRole('button', { name: /^(继续|Continue)$/ }).waitFor({ state: 'visible' })
  assert.equal(await drag.isVisible(), false, 'Modal surfaces must not expose window drag regions')
  await page.getByRole('button', { name: /^(继续|Continue)$/ }).click()
  await page.getByRole('button', { name: /^(稍后配置|Configure later)$/ }).click()
  await drag.waitFor({ state: 'visible' })

  const checkDrag = async () => {
    const geometry = await drag.evaluate(element => {
      const frame = element.closest('[data-shell-overlay]').parentElement
      const columns = getComputedStyle(frame).gridTemplateColumns.split(' ').map(Number.parseFloat)
      const box = element.getBoundingClientRect()
      return { left: box.left, width: box.width, height: box.height, columns,
        region: getComputedStyle(element).getPropertyValue('-webkit-app-region') }
    })
    assert.equal(geometry.region, 'drag')
    assert.ok(Math.abs(geometry.left - geometry.columns[0]) < 1, JSON.stringify(geometry))
    assert.ok(Math.abs(geometry.width - geometry.columns[1]) < 1, JSON.stringify(geometry))
    assert.equal(geometry.height, 52)
  }
  const expand = async () => {
    await reopen.waitFor({ state: 'visible' })
    assert.equal(await reopen.evaluate(element => getComputedStyle(element).getPropertyValue('-webkit-app-region')), 'no-drag')
    await reopen.click()
    await reopen.waitFor({ state: 'hidden' })
    await collapse.waitFor({ state: 'visible' })
  }
  // The first-use page has no Session header; its toggle must survive zero-width collapse.
  assert.equal(await page.locator('[data-conversation-header-leading]').count(), 0)
  await checkDrag()
  await collapse.click()
  await reopen.waitFor({ state: 'visible' })
  mkdirSync(screenshots, { recursive: true })
  await page.screenshot({ path: join(screenshots, 'new-session-collapsed.png'), animations: 'disabled' })
  await expand()

  // The independent Plugins panel needs the same escape and a drag strip above its actions.
  await page.getByRole('button', { name: /^(插件|Plugins)$/ }).click()
  await page.locator('[data-plugin-panel]').waitFor({ state: 'visible' })
  await checkDrag()
  const refresh = page.getByRole('button', { name: /^(刷新|Refresh)$/ })
  assert.ok((await refresh.boundingBox()).y >= 52)
  await refresh.click()
  await collapse.click()
  await reopen.waitFor({ state: 'visible' })
  await page.screenshot({ path: join(screenshots, 'plugins-collapsed.png'), animations: 'disabled' })
  await expand()
  // Re-entering the homepage must retain a working sidebar action after navigation.
  await page.getByRole('button', { name: /^(新建会话|New session)$/i }).last().click()
  await collapse.click()
  await expand()

  // Existing Session headers retain upstream controls; other platforms keep their own chrome.
  await page.evaluate(() => {
    const header = document.createElement('div')
    header.dataset.conversationHeaderLeading = ''
    document.querySelector('[data-shell-overlay]').parentElement.append(header)
  })
  await drag.waitFor({ state: 'hidden' })
  await page.evaluate(() => document.querySelector('[data-conversation-header-leading]').remove())
  await drag.waitFor({ state: 'visible' })
  for (const platform of ['win32', 'linux']) {
    await page.evaluate(value => { document.documentElement.dataset.platform = value }, platform)
    await drag.waitFor({ state: 'hidden' })
    await reopen.waitFor({ state: 'hidden' })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => globalThis.__NEXT_TEST_BOOT__.failures), [])
  console.log('Next window controls passed through the official alpha.2 Desktop boot branch: homepage/plugin collapse and reopen, navigation, caption geometry, clickable actions, existing-header and platform isolation. Chromium simulates the preload contract; native Electron window movement is not tested.')
  console.log(`Screenshots: ${screenshots}`)
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(diagnostics)
    mkdirSync(screenshots, { recursive: true })
    await page.screenshot({ path: join(screenshots, 'failure.png') })
    console.error(await page.evaluate(() => {
      const controls = document.querySelector('.dshNextWindowControls')
      const parents = []
      for (let node = controls; node && parents.length < 5; node = node.parentElement) {
        parents.push({ tag: node.tagName, class: node.className, display: getComputedStyle(node).display,
          columns: getComputedStyle(node).gridTemplateColumns, attributes: [...node.attributes].map(a => [a.name, a.value]) })
      }
      return { platform: document.documentElement.dataset.platform,
        headers: document.querySelectorAll('[data-conversation-header-leading]').length,
        dialogs: document.querySelectorAll('[aria-modal=true]').length, parents }
    }))
  }
  throw error
} finally {
  await browser?.close()
  await host.stop()
  rmSync(home, { recursive: true, force: true })
}
