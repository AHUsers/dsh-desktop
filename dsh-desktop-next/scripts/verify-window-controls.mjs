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
  const loginToken = 'L'.repeat(43)
  let rejectPreference = false
  const controlState = {
    selected: 'default', profiles: ['default', 'work', 'broken'], unavailableProfiles: ['broken'], features: { market: false, remoteControl: false },
    preferences: { closeToTray: true, macosMaterial: 'transparent', windowsMaterial: 'off', browserAccess: false,
      networkExposure: 'loopback', port: 0, lanPort: 0, logLevel: 'info', notifications: true,
      turnCompleted: true, turnFailed: true, jobCompleted: false, jobFailed: false },
    phase: 'ready', busy: false, failure: '', safeMode: false, home: '[temporary test home]', platform: 'darwin',
    version: '0.1.0-dev.0', trayAvailable: true, notificationsAvailable: true, windowsMicaSupported: false, browserUrl: null, lan: null,
    checkpoint: { created: new Date().toISOString() }, logs: 'Headless UI fixture; native actions are recorded only.',
  }
  await context.exposeFunction('__nextTestState', () => structuredClone(controlState))
  const browserLinks = () => ({
    localUrl: controlState.browserUrl ? controlState.browserUrl + '?token=' + loginToken : null,
    lanUrls: controlState.browserUrl && controlState.lan?.state === 'ready'
      ? controlState.lan.addresses.map(address => `https://${address}:${controlState.lan.actualPort}/?token=${loginToken}`) : [],
  })
  await context.exposeFunction('__nextTestBrowserLinks', browserLinks)
  const permissionActions = []
  const permissionStates = { microphone: 'not-determined', screen: 'denied', accessibility: 'unknown' }
  await context.exposeFunction('__nextTestPermission', (action, permission) => {
    permissionActions.push({ action, permission })
    if (action === 'request') permissionStates[permission] = 'granted'
    const status = permissionStates[permission]
    return { permission, status, canRequest: status === 'not-determined' || status === 'unknown', canOpenSettings: true }
  })
  await context.exposeFunction('__nextTestCommand', command => {
    if (command.type === 'preferences' && rejectPreference) { rejectPreference = false; throw new Error('Fixture: preference save rejected') }
    controlCommands.push(command)
    if (command.type === 'preferences') {
      controlState.preferences = command.preferences
      controlState.browserUrl = command.preferences.browserAccess ? streamBaseUrl + '/' : null
      controlState.lan = command.preferences.networkExposure === 'lan'
        ? { state: 'ready', actualPort: 43121, addresses: ['192.168.1.20', '10.0.0.20'], caFingerprint: 'a'.repeat(64), errorCode: null }
        : null
    }
    if (command.type === 'switch') controlState.selected = command.name
    if (command.type === 'features') controlState.features = command.features
    if (command.type === 'create') controlState.profiles.push(command.name)
  })
  await context.addInitScript(() => {
    window.desktopNext = { state: () => window.__nextTestState(), browserLinks: () => window.__nextTestBrowserLinks(), command: command => window.__nextTestCommand(command) }
    window.desktopNext.permissions = {
      query: permission => window.__nextTestPermission('query', permission),
      request: permission => window.__nextTestPermission('request', permission),
      openSettings: permission => window.__nextTestPermission('openSettings', permission),
    }
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
  // Simulate multiple extension entries in the official footer seat and check real geometry.
  const footer = page.locator('[data-slot="sidebar.footer.action"]')
  await footer.evaluate(element => {
    for (const label of ['手机连接', '插件市场', '扩展入口']) {
      const button = document.createElement('button')
      button.dataset.nextFooterFixture = ''
      button.textContent = label
      button.style.cssText = 'width:calc(100% + 4px);margin:-2px;padding:12px;text-align:left;border-radius:12px'
      element.appendChild(button)
    }
  })
  const footerEntries = footer.locator('[data-next-footer-fixture]')
  const footerBoxes = await footerEntries.evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }))
  assert.equal(footerBoxes.length, 3)
  for (let i = 1; i < footerBoxes.length; i++) {
    assert.ok(footerBoxes[i].y >= footerBoxes[i - 1].y + footerBoxes[i - 1].height)
    assert.equal(footerBoxes[i].x, footerBoxes[0].x)
    assert.equal(footerBoxes[i].width, footerBoxes[0].width)
  }
  mkdirSync(screenshots, { recursive: true })
  await page.screenshot({ path: join(screenshots, 'sidebar-footer.png'), animations: 'disabled' })
  await footerEntries.evaluateAll(elements => elements.forEach(element => element.remove()))

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
  const controls = page.locator('[data-next-plugin-controls]')
  await controls.waitFor({ state: 'visible' })
  for (const name of ['dsh-community-market', 'dshmarket', '@agents-anywhere/dsh-bridge-next']) {
    assert.equal(await page.locator(`[data-plugin-package="${name}"]`).count(), 0)
  }
  assert.equal(await page.locator('[data-plugin-item="desktop-next-computer-use"]').count(), 0)
  const markets = controls.getByRole('radiogroup', { name: /插件市场|Plugin market/ })
  assert.equal(await markets.getByRole('radio').count(), 2)
  const communityChoice = markets.getByRole('radio', { name: /社区插件市场|Community Market/ })
  const dshChoice = markets.getByRole('radio', { name: /DSH Market/ })
  const waitSelected = async choice => {
    await page.waitForFunction(selector => document.querySelector(selector)?.getAttribute('aria-checked') === 'true', choice)
  }
  await communityChoice.click()
  await waitSelected('[data-next-markets] [role="radio"]:first-child')
  const marketFooter = footer.getByRole('button', { name: /插件市场|Plugin market/ })
  await marketFooter.waitFor()
  const remote = controls.getByRole('switch', { name: /启用远程控制|Enable remote control/ })
  assert.equal(await remote.isChecked(), false)
  await remote.click()
  await waitSelected('[data-next-remote-control] [role="switch"]')
  await dshChoice.focus()
  await dshChoice.press('Space')
  await waitSelected('[data-next-markets] [role="radio"]:last-child')
  assert.equal(await communityChoice.getAttribute('aria-checked'), 'false')
  assert.equal(await remote.isChecked(), true)
  await marketFooter.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: /^(设置|Settings)$/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: /^(插件市场|Plugin Market)$/ }).waitFor()
  await page.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  await communityChoice.click()
  await waitSelected('[data-next-markets] [role="radio"]:first-child')
  assert.equal(await dshChoice.getAttribute('aria-checked'), 'false')
  assert.equal(await remote.isChecked(), true)
  await marketFooter.waitFor()
  // A failed Host mutation must leave the current market visibly selected.
  await context.route('**/api/pluginManager/setBundleEnabled', async route => {
    const request = route.request().postDataJSON()
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'server-response', rpcId: request.rpcId,
      result: { ok: true, value: { changed: false, application: 'failed', stage: 'enable', target: 'dshmarket',
        error: { code: 'operation-error', diagnostic: 'Fixture: market change rejected' } } },
    }) })
  }, { times: 1 })
  await dshChoice.click()
  await controls.getByRole('alert').getByText('Fixture: market change rejected', { exact: false }).waitFor()
  assert.equal(await communityChoice.getAttribute('aria-checked'), 'true')
  await controls.getByRole('button', { name: /^(重试|Retry)$/ }).click()
  await controls.getByRole('alert').waitFor({ state: 'hidden' })
  const cuaSettings = controls.locator('[data-next-computer-use]')
  await cuaSettings.getByText(/^(已停用|Disabled)$/).waitFor()
  const cuaSwitch = cuaSettings.getByRole('switch', { name: /启用 Computer Use|Enable Computer Use/ })
  assert.equal(await cuaSwitch.isChecked(), false)
  assert.equal(await cuaSwitch.isDisabled(), false)
  const firstGroup = page.locator('[data-plugin-group]').first()
  const topBox = await controls.boundingBox()
  assert.ok(topBox.y + topBox.height <= (await firstGroup.boundingBox()).y, 'Special controls belong above ordinary plugin groups')
  const remoteBox = await controls.locator('[data-next-remote-control]').boundingBox()
  const cuaBox = await cuaSettings.boundingBox()
  assert.ok(cuaBox.y >= remoteBox.y + remoteBox.height, 'Remote control and Computer Use must be stacked vertically')
  assert.equal(cuaBox.x, remoteBox.x)
  const permissionGear = cuaSettings.getByRole('button', { name: /^(授权设置|Permissions)$/ })
  assert.equal((await permissionGear.textContent()).trim(), '', 'Permissions uses an accessible icon button without visible text')
  assert.equal(await permissionGear.locator('svg').count(), 1)
  const switchBox = await cuaSwitch.boundingBox()
  const gearBox = await permissionGear.boundingBox()
  assert.ok(Math.abs(gearBox.y + gearBox.height / 2 - switchBox.y - switchBox.height / 2) < 1)
  assert.ok(gearBox.x >= switchBox.x + switchBox.width && gearBox.x - switchBox.x - switchBox.width <= 12)
  await page.locator('[data-plugin-panel]').evaluate(element => { for (let node = element; node; node = node.parentElement) node.scrollTop = 0 })
  await page.screenshot({ path: join(screenshots, 'plugin-controls.png'), animations: 'disabled' })
  await permissionGear.click()
  const permissionDialog = page.getByRole('dialog', { name: /^(系统权限|System permissions)$/ })
  await permissionDialog.getByRole('group', { name: /屏幕录制|Screen recording/ }).getByText(/已拒绝|Denied/).waitFor()
  assert.equal(await permissionDialog.getByRole('group').count(), 3)
  assert.ok(permissionActions.every(item => item.action === 'query'), 'Opening the dialog must never prompt for permissions')
  assert.equal(await drag.isVisible(), false)
  await page.screenshot({ path: join(screenshots, 'plugin-permissions.png'), animations: 'disabled' })
  await permissionDialog.press('Escape')
  await permissionDialog.waitFor({ state: 'hidden' })
  if (process.argv.includes('--computer-use')) {
    // Explicit native SDK activation in a temporary Profile; no driver tool is called.
    await cuaSwitch.click()
    await cuaSettings.getByText(/^(运行中|Running)$/).waitFor()
    assert.equal(await cuaSwitch.isChecked(), true)
    await page.getByRole('button', { name: /^(新建会话|New session)$/i }).last().click()
    await page.getByRole('button', { name: /^(插件|Plugins)$/ }).click()
    await cuaSettings.getByText(/^(运行中|Running)$/).waitFor()
    assert.equal(await remote.isChecked(), true)
    assert.equal(await communityChoice.getAttribute('aria-checked'), 'true')
    await cuaSwitch.click()
    await cuaSettings.getByText(/^(已停用|Disabled)$/).waitFor()
    assert.equal(await cuaSwitch.isChecked(), false)
    console.log('Cua native provider independently enabled and disabled from the Plugins overview; no input, screenshots or OS permission requests sent.')
  }
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
  assert.equal(await settings.locator('#dsh-desktop-market-title, #dsh-desktop-aa-title').count(), 0)
  const closeToTray = settings.getByRole('switch', { name: /关闭窗口后保持后台运行|Keep running after closing the window/ })
  assert.equal(await closeToTray.isChecked(), true)
  await closeToTray.click()
  await page.waitForFunction(() => !document.querySelector('.dshDesktopSettingsGroup:last-child button')?.disabled)
  assert.ok(controlCommands.some(command => command.type === 'preferences' && !command.preferences.closeToTray))
  assert.equal(await settings.getByRole('heading', { name: /^(端口设置|Port settings)$/ }).count(), 0)
  assert.equal(await settings.getByRole('spinbutton').count(), 0)
  const notifications = settings.getByRole('switch', { name: /启用桌面通知|Enable Desktop notifications/ })
  assert.equal(await settings.getByRole('switch', { name: /后台任务|Background job/ }).count(), 0)
  const permissions = settings.getByRole('region', { name: /系统权限|System permissions/ })
  await permissions.getByRole('button', { name: /^(授权设置|Permissions)$/ }).click()
  const permissionSettings = page.getByRole('dialog', { name: /^(系统权限|System permissions)$/ })
  const microphone = permissionSettings.getByRole('group', { name: /麦克风|Microphone/ })
  await microphone.getByRole('button', { name: /请求授权|Request access/ }).waitFor()
  await page.screenshot({ path: join(screenshots, 'desktop-permissions.png'), animations: 'disabled' })
  assert.ok(permissionActions.every(item => item.action === 'query'), 'Rendering settings must never prompt for permissions')
  await microphone.getByRole('button', { name: /请求授权|Request access/ }).click()
  await microphone.getByText(/已允许|Allowed/).waitFor()
  const screen = permissionSettings.getByRole('group', { name: /屏幕录制|Screen recording/ })
  await screen.getByRole('button', { name: /打开系统设置|Open system settings/ }).click()
  assert.ok(permissionActions.some(item => item.action === 'openSettings' && item.permission === 'screen'))
  await screen.getByText(/已拒绝|Denied/).waitFor()
  await permissionSettings.getByRole('button', { name: /^(关闭|Close)$/ }).click()
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
  // Each local/LAN login link has its own row and native open/copy target.
  const webSettings = settings.locator('section[aria-labelledby="dsh-desktop-web-title"]')
  const browserAccess = webSettings.getByRole('switch', { name: /允许在浏览器中打开|Allow opening this Profile in a browser/ })
  const lanAccess = webSettings.getByRole('switch', { name: /局域网访问|Local-network access/ })
  const loginRows = webSettings.locator('.dshDesktopSettingsUrlRow')
  const exportCa = webSettings.getByRole('button', { name: /导出 CA 证书|Export CA certificate/ })
  assert.equal(await loginRows.count(), 0)
  assert.equal(await settings.getByRole('button', { name: /复制本机登录链接|Copy local login link|复制局域网登录链接|Copy LAN login link/ }).count(), 0)
  await browserAccess.click()
  await loginRows.first().waitFor()
  assert.equal(await loginRows.count(), 1)
  assert.equal(await exportCa.count(), 0)
  await lanAccess.click()
  await loginRows.nth(2).waitFor()
  assert.equal(await loginRows.count(), 3)
  for (const [index, url] of [browserLinks().localUrl, ...browserLinks().lanUrls].entries()) {
    const row = loginRows.nth(index)
    const link = row.getByRole('link')
    assert.equal(await link.textContent(), url)
    assert.equal(await link.getAttribute('href'), url)
    await row.getByRole('button', { name: /复制地址|Copy address/ }).click()
    await row.locator('button[title="已复制"], button[title="Copied"]').waitFor()
    assert.deepEqual(controlCommands.at(-1), { type: 'copy-browser-url', url })
    await link.click()
    assert.deepEqual(controlCommands.at(-1), { type: 'open-browser-url', url })
  }
  await exportCa.click()
  assert.deepEqual(controlCommands.at(-1), { type: 'export-ca' })
  await page.waitForFunction(() => !document.querySelector('.dshDesktopSettingsUrlCopy[title="已复制"], .dshDesktopSettingsUrlCopy[title="Copied"]'))
  await settings.getByRole('heading').first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: join(screenshots, 'desktop-settings.png'), animations: 'disabled' })
  await webSettings.evaluate(element => element.scrollIntoView({ block: 'start' }))
  await page.screenshot({ path: join(screenshots, 'desktop-access-settings.png'), animations: 'disabled' })
  await lanAccess.click()
  await loginRows.nth(1).waitFor({ state: 'hidden' })
  assert.equal(await exportCa.count(), 0)
  assert.equal(await loginRows.count(), 1)
  await browserAccess.click()
  await loginRows.first().waitFor({ state: 'hidden' })
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
  // The Host permission service opens the same official dialog in the utility window.
  const permissionActionCount = permissionActions.length
  await recoveryPage.goto('http://next-recovery.test/?locale=zh&platform=darwin&frame=true#general')
  await recoveryPage.locator('[data-next-desktop-settings]').waitFor()
  await recoveryPage.evaluate(() => { location.hash = 'permissions' })
  const nativePermissions = recoveryPage.getByRole('dialog', { name: '系统权限' })
  await nativePermissions.getByRole('group', { name: '屏幕录制' }).getByText('已拒绝').waitFor()
  assert.ok((await nativePermissions.boundingBox()).width >= 600, 'The utility window must install shared permission dialog styles')
  assert.ok(permissionActions.slice(permissionActionCount).every(item => item.action === 'query'))
  await recoveryPage.screenshot({ path: join(screenshots, 'native-permissions.png'), animations: 'disabled' })
  await nativePermissions.press('Escape')
  await recoveryPage.waitForFunction(() => location.hash === '#general')
  await recoveryPage.evaluate(() => { location.hash = 'permissions' })
  await nativePermissions.waitFor()
  await nativePermissions.getByRole('button', { name: '关闭', exact: true }).click()
  assert.deepEqual(recoveryErrors, [])
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
  assert.equal(await webPage.locator('#dsh-desktop-sidebar-footer-styles').count(), 0)
  await webPage.getByRole('button', { name: /^(关闭|Close)$/ }).click()
  await webPage.getByRole('button', { name: /^(插件|Plugins)$/ }).click()
  await webPage.locator('[data-next-plugin-controls]').waitFor()
  await webPage.locator('[data-next-computer-use]').getByRole('button', { name: /^(授权设置|Permissions)$/ }).click()
  await webPage.getByRole('dialog', { name: /^(系统权限|System permissions)$/ }).getByText(/请在运行 DSH 的桌面应用中管理系统权限/).waitFor()
  await webContext.close()
  assert.deepEqual(errors, [])
  assert.deepEqual(await page.evaluate(() => globalThis.__NEXT_TEST_BOOT__.failures), [])
  console.log('Next window controls passed through the official alpha.2 Desktop boot branch: stacked sidebar extension entries, homepage/plugin collapse and reopen, navigation, caption geometry, clickable actions, existing-header and platform isolation, official Settings header shortcuts and keyboard navigation, grouped Desktop Settings and immediate saves, per-address login URL rows with exact open/copy targets, Profile cards and tray creation, and the Host-independent recovery artifact. Chromium simulates the preload contract; native Electron window movement is not tested.')
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
