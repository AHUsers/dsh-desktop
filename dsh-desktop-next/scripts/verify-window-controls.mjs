/** Official Desktop boot in headless Chromium; simulated IPC/platform, no native window or user profile. */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
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
let recoveryPage
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
  const controlCommands = []
  let rejectPreference = false
  const controlState = {
    selected: 'default', profiles: ['default', 'work', 'broken'], unavailableProfiles: ['broken'], features: { market: false, remoteControl: false },
    preferences: { closeToTray: true, macosMaterial: 'transparent', windowsMaterial: 'off', browserAccess: false,
      networkExposure: 'loopback', port: 0, lanPort: 0, logLevel: 'info', notifications: true,
      turnCompleted: true, turnFailed: true, jobCompleted: true, jobFailed: true },
    phase: 'ready', busy: false, failure: '', safeMode: false, home: '[temporary test home]', platform: 'darwin',
    version: '0.1.0-dev.0', trayAvailable: true, notificationsAvailable: true, windowsMicaSupported: false, browserUrl: null, lan: null,
    checkpoint: { created: new Date().toISOString() }, logs: 'Headless UI fixture; native actions are recorded only.',
  }
  await context.exposeFunction('__nextTestState', () => structuredClone(controlState))
  await context.exposeFunction('__nextTestCommand', command => {
    if (command.type === 'preferences' && rejectPreference) { rejectPreference = false; throw new Error('Fixture: preference save rejected') }
    controlCommands.push(command)
    if (command.type === 'preferences') {
      controlState.preferences = command.preferences
      controlState.browserUrl = command.preferences.browserAccess ? streamBaseUrl + '/' : null
      controlState.lan = command.preferences.networkExposure === 'lan'
        ? { state: 'ready', actualPort: 43121, addresses: ['192.168.1.20'], caFingerprint: 'a'.repeat(64), errorCode: null }
        : null
    }
    if (command.type === 'switch') controlState.selected = command.name
    if (command.type === 'features') controlState.features = command.features
    if (command.type === 'create') controlState.profiles.push(command.name)
  })
  await context.addInitScript(() => {
    window.desktopNext = { state: () => window.__nextTestState(), command: command => window.__nextTestCommand(command) }
  })
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
  await page.evaluate(() => { document.documentElement.dataset.platform = 'darwin' })
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  // Native shortcuts appear on every official Settings section, like the original Desktop.
  const actions = page.locator('.dshDesktopNativeActions[data-placement="settings"]')
  await actions.getByRole('button', { name: /^(打开 DSH 终端|Open DSH Terminal)$/ }).click()
  assert.equal(controlCommands.at(-1).type, 'terminal')
  const restartOptions = actions.getByRole('button', { name: /^(重启|Restart)$/ })
  await restartOptions.click()
  await actions.getByRole('menu').press('Escape')
  assert.equal(await actions.getByRole('menu').count(), 0)
  assert.equal(await restartOptions.evaluate(element => element === document.activeElement), true)
  await restartOptions.press('ArrowDown')
  await actions.getByRole('menuitem', { name: /^(重启到恢复模式|Restart in Recovery Mode)$/ }).click()
  assert.equal(controlCommands.at(-1).type, 'restart-recovery')
  await page.getByRole('button', { name: /^(桌面|Desktop)$/ }).click()
  const settings = page.locator('[data-next-desktop-settings]')
  await settings.getByRole('heading', { name: /^(DSH Desktop 设置|DSH Desktop Settings)$/ }).waitFor()
  assert.equal(await settings.locator('nav').count(), 0)
  assert.equal(await settings.getByRole('radio', { name: /^broken/ }).getAttribute('aria-disabled'), 'true')
  assert.equal(await settings.getByRole('radio', { name: /增强模式|扩展模式|Advanced mode|Extended mode/ }).count(), 0)
  assert.equal(await settings.getByRole('radio', { name: /dsh-market/ }).count(), 0)
  const closeToTray = settings.getByRole('switch', { name: /关闭窗口后保持后台运行|Keep running after closing the window/ })
  assert.equal(await closeToTray.isChecked(), true)
  await closeToTray.click()
  await page.waitForFunction(() => !document.querySelector('.dshDesktopSettingsGroup:last-child button')?.disabled)
  assert.ok(controlCommands.some(command => command.type === 'preferences' && !command.preferences.closeToTray))
  assert.equal(await settings.getByRole('heading', { name: /^(端口设置|Port settings)$/ }).count(), 0)
  assert.equal(await settings.getByRole('spinbutton').count(), 0)
  const notifications = settings.getByRole('switch', { name: /启用桌面通知|Enable Desktop notifications/ })
  await notifications.click()
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="dsh-desktop-notifications-title"] [role="switch"]')?.getAttribute('aria-checked') === 'false')
  assert.equal(await settings.getByRole('switch', { name: /本轮任务完成|Current turn completed/ }).isDisabled(), true)
  assert.ok(controlCommands.some(command => command.type === 'preferences' && !command.preferences.notifications && !command.preferences.closeToTray))
  rejectPreference = true
  await closeToTray.click()
  await settings.getByText('Fixture: preference save rejected').waitFor()
  assert.equal(await closeToTray.isChecked(), false)
  controlState.platform = 'win32'
  await settings.locator('.dshDesktopSettingsMaterialField select').first().locator('option[value="transparent"]').waitFor({ state: 'detached' })
  assert.equal(await settings.locator('option[value="mica"]').count(), 0)
  controlState.platform = 'linux'
  await actions.getByRole('button', { name: /打开 DSH 终端|Open DSH Terminal/ }).waitFor({ state: 'hidden' })
  controlState.platform = 'darwin'
  await actions.getByRole('button', { name: /打开 DSH 终端|Open DSH Terminal/ }).waitFor({ state: 'visible' })
  await settings.getByRole('radio', { name: /dsh-community-market/ }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="radio"]')].some(el => /dsh-community-market/.test(el.textContent) && el.getAttribute('aria-checked') === 'true'))
  assert.deepEqual(controlCommands.at(-1), { type: 'features', features: { market: true, remoteControl: false } })
  // Browser actions live beside the access addresses, with availability following the toggles.
  const webSettings = settings.locator('section[aria-labelledby="dsh-desktop-web-title"]')
  const browserAccess = webSettings.getByRole('switch', { name: /允许在浏览器中打开|Allow opening this Profile in a browser/ })
  const lanAccess = webSettings.getByRole('switch', { name: /局域网访问|Local-network access/ })
  const copyBrowser = webSettings.getByRole('button', { name: /复制本机登录链接|Copy local login link/ })
  const copyLan = webSettings.getByRole('button', { name: /复制局域网登录链接|Copy LAN login link/ })
  const exportCa = webSettings.getByRole('button', { name: /导出 CA 证书|Export CA certificate/ })
  assert.equal(await copyBrowser.count(), 0)
  await browserAccess.click()
  await copyBrowser.click()
  assert.deepEqual(controlCommands.at(-1), { type: 'copy-browser' })
  assert.equal(await copyLan.count(), 0)
  assert.equal(await exportCa.count(), 0)
  await lanAccess.click()
  await copyLan.click()
  assert.deepEqual(controlCommands.at(-1), { type: 'copy-lan' })
  await exportCa.click()
  assert.deepEqual(controlCommands.at(-1), { type: 'export-ca' })
  assert.equal(await settings.getByRole('button', { name: /复制本机登录链接|Copy local login link/ }).count(), 1)
  await settings.getByRole('heading').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(screenshots, 'desktop-settings.png'), animations: 'disabled' })
  await webSettings.evaluate(element => element.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(screenshots, 'desktop-access-settings.png'), animations: 'disabled' })
  await lanAccess.click()
  await copyLan.waitFor({ state: 'hidden' })
  assert.equal(await exportCa.count(), 0)
  assert.equal(await copyBrowser.isVisible(), true)
  await browserAccess.click()
  await copyBrowser.waitFor({ state: 'hidden' })
  await settings.locator('#dsh-desktop-notifications-title').scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(screenshots, 'desktop-notification-settings.png'), animations: 'disabled' })
  await settings.getByRole('radio', { name: /^work/ }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[role="radio"]')].some(el => el.textContent.startsWith('work') && el.getAttribute('aria-checked') === 'true'))
  assert.deepEqual(controlCommands.at(-1), { type: 'switch', name: 'work' })

  // Render the existing Desktop Recovery/Profile pages without a Host.
  recoveryPage = await context.newPage()
  const recoveryErrors = []
  recoveryPage.on('pageerror', error => { recoveryErrors.push(error.message); diagnostics.push('Recovery: ' + error.message) })
  recoveryPage.on('console', message => { if (message.type() === 'error') diagnostics.push('Recovery: ' + message.text()) })
  controlState.phase = 'error'; controlState.failure = 'Fixture: invalid Profile manifest <script>unsafe()</script>'
  await recoveryPage.route('http://next-recovery.test/**', async route => {
    const response = await serveWebDocument(new Request(route.request().url()), join(root, 'lib/native-ui'), false)
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
  })
  await recoveryPage.goto('http://next-recovery.test/?locale=zh&platform=darwin&frame=true#recovery')
  await recoveryPage.getByRole('tab', { name: '快速恢复' }).waitFor()
  assert.equal(await recoveryPage.getByText(controlState.failure, { exact: true }).textContent(), controlState.failure)
  assert.equal(await recoveryPage.locator('pre script').count(), 0)
  assert.equal(await recoveryPage.getByRole('tab').count(), 4)
  await recoveryPage.getByRole('link', { name: '进入安全模式', exact: true }).click()
  assert.equal(controlCommands.at(-1).type, 'safe-mode')
  await recoveryPage.screenshot({ path: join(screenshots, 'recovery-assistant.png'), animations: 'disabled', fullPage: true })
  await recoveryPage.getByRole('tab', { name: /诊断/ }).click()
  await recoveryPage.getByRole('link', { name: /保存诊断|导出诊断/ }).click()
  assert.equal(controlCommands.at(-1).type, 'diagnostics')
  assert.deepEqual(recoveryErrors, [])
  await recoveryPage.goto('http://next-recovery.test/?locale=zh&platform=darwin&frame=true#create-profile')
  await recoveryPage.locator('#profile-name').waitFor()
  assert.equal(await recoveryPage.locator('#profile-name').evaluate(element => element === document.activeElement), true)
  await recoveryPage.locator('#profile-name').fill('from-tray')
  await recoveryPage.getByRole('button', { name: /创建/ }).click()
  await recoveryPage.waitForFunction(() => document.querySelector('#profile-name')?.disabled === false)
  assert.deepEqual(controlCommands.slice(-3), [{ type: 'create', name: 'from-tray' }, { type: 'switch', name: 'from-tray' }, { type: 'close-controls' }])
  await recoveryPage.goto('http://next-recovery.test/?locale=zh&platform=darwin&frame=true#profiles')
  await recoveryPage.getByRole('heading', { name: '可用 Profile', exact: true }).first().waitFor()
  await recoveryPage.screenshot({ path: join(screenshots, 'profile-selector.png'), animations: 'disabled' })
  await recoveryPage.close()
  controlState.safeMode = true
  await page.reload()
  await page.locator('.dshNextSafeModeNotice').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: /^(稍后配置|Configure later)$/ }).click()
  await page.locator('.dshNextSafeModeNotice button').click()
  assert.deepEqual(controlCommands.at(-1), { type: 'controls', page: 'recovery' })
  // The marker-free Web frontend must not inherit any native Settings actions.
  const webContext = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 840 } })
  await webContext.addCookies([{ url: streamBaseUrl, name: cookie.slice(0, cookieSeparator), value: cookie.slice(cookieSeparator + 1) }])
  const webPage = await webContext.newPage()
  webPage.setDefaultTimeout(15_000)
  await webPage.goto(streamBaseUrl)
  await webPage.getByRole('button', { name: /^(稍后配置|Configure later)$/ }).click()
  await webPage.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  assert.equal(await webPage.locator('.dshDesktopNativeActions').count(), 0)
  assert.equal(await webPage.getByRole('button', { name: /^(桌面|Desktop)$/ }).count(), 0)
  assert.equal(await webPage.evaluate(() => window.desktopNext === undefined), true)
  assert.equal(await webPage.evaluate(() => globalThis.__DSH_TRANSPORT__?.ownsHost === true), false)
  assert.equal(await webPage.evaluate(() => window.dshDesktop === undefined), true)
  await webContext.close()
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => globalThis.__NEXT_TEST_BOOT__.failures), [])
  console.log('Next window controls passed through the official alpha.2 Desktop boot branch: homepage/plugin collapse and reopen, navigation, caption geometry, clickable actions, existing-header and platform isolation, official Settings header shortcuts and keyboard navigation, grouped Desktop Settings and immediate saves, browser actions beside access addresses, Profile cards and tray creation, and the Host-independent recovery artifact. Chromium simulates the preload contract; native Electron window movement is not tested.')
  console.log(`Screenshots: ${screenshots}`)
} catch (error) {
  if (recoveryPage && !recoveryPage.isClosed()) {
    await recoveryPage.screenshot({ path: join(screenshots, 'recovery-failure.png') })
    console.error(await recoveryPage.locator('body').innerText())
  }
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
