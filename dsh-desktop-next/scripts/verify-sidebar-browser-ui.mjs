/** Drive the official toolbar with a recorded native bridge; no external site or GUI is opened. */
import assert from 'node:assert/strict'

export async function browserFixture(context) {
  const states = new Map()
  const requests = []
  await context.exposeFunction('__nextBrowserCommand', request => {
    requests.push(structuredClone(request))
    if (request.type === 'close') { states.delete(request.id); return null }
    if (!states.has(request.id)) states.set(request.id, { id: request.id, revision: 0, url: '', title: '', loading: false,
      canGoBack: false, canGoForward: false, error: null, entries: [], index: -1, bounds: null })
    const state = states.get(request.id)
    if (request.type === 'open' && request.url || request.type === 'navigate') {
      state.entries = [...state.entries.slice(0, state.index + 1), request.url]; state.index++
    }
    if (request.type === 'back' && state.index > 0) state.index--
    if (request.type === 'forward' && state.index < state.entries.length - 1) state.index++
    if (request.type === 'bounds') state.bounds = request.bounds
    state.url = state.entries[state.index] ?? ''
    state.canGoBack = state.index > 0; state.canGoForward = state.index < state.entries.length - 1
    state.revision++
    return structuredClone(state)
  })
  return { states, requests }
}

export async function verifySidebarBrowser(page, fixture, screenshots) {
  await page.getByRole('button', { name: /^(打开右侧边栏|Open right sidebar)$/ }).click()
  await page.locator('[data-sidebar-right-guide-entry="browser"]').click()
  const surface = page.locator('[data-next-browser-surface]')
  await surface.waitFor()
  assert.equal(await page.locator('[data-sidebar-browser-frame]').count(), 0, 'Desktop must not load websites in the iframe fallback')
  const id = await surface.getAttribute('data-next-browser-surface')
  const address = page.getByRole('textbox', { name: /^(输入 HTTP\(S\) 地址|Enter an HTTP\(S\) address)$/ })
  await address.fill('https://github.com/jie023/workbuddy-acp-bridge')
  await address.press('Enter')
  await wait(() => fixture.states.get(id)?.url === 'https://github.com/jie023/workbuddy-acp-bridge' && fixture.states.get(id)?.bounds).catch(async error => {
    console.error('Browser fixture:', fixture.states.get(id), fixture.requests.slice(-8))
    console.error(await surface.evaluate(element => {
      const box = element.getBoundingClientRect()
      const points = [[box.left + 1, box.top + 1], [box.right - 1, box.top + 1], [(box.left + box.right) / 2, (box.top + box.bottom) / 2], [box.left + 1, box.bottom - 1], [box.right - 1, box.bottom - 1]]
      const parents = []
      for (let node = element; node; node = node.parentElement) parents.push({ tag: node.tagName, class: node.className, rect: node.getBoundingClientRect().toJSON(), overflow: getComputedStyle(node).overflow, opacity: getComputedStyle(node).opacity })
      return { points: points.map(([x, y]) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 400)), parents }
    }))
    throw error
  })
  const rect = await surface.boundingBox()
  const bounds = fixture.states.get(id).bounds
  assert.ok(bounds.x >= rect.x && bounds.x - rect.x <= 8 && Math.abs(rect.x + rect.width - bounds.x - bounds.width) < 1,
    'The native surface fills the body while leaving its DOM resize handle clickable')
  await address.fill('https://github.com/next')
  await address.press('Enter')
  await wait(() => fixture.states.get(id)?.canGoBack)
  await page.getByRole('button', { name: /^(后退|Back)$/ }).click()
  await wait(() => fixture.states.get(id)?.url.endsWith('/workbuddy-acp-bridge'))
  await page.getByRole('button', { name: /^(前进|Forward)$/ }).click()
  await wait(() => fixture.states.get(id)?.url.endsWith('/next'))
  const reported = fixture.states.get(id)
  reported.url = 'https://github.com/observed-navigation'; reported.revision++
  reported.entries[reported.index] = reported.url
  await page.evaluate(state => window.__nextBrowserEmit(state), reported)
  await page.waitForFunction(() => document.querySelector('input[aria-label="输入 HTTP(S) 地址"]')?.value.endsWith('/observed-navigation'))
  // A native view must get out of the way of the official modal and return after it closes.
  await page.evaluate(() => window.__nextTestOpenSettings('general'))
  await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).waitFor()
  await wait(() => fixture.states.get(id)?.bounds === null)
  await page.getByRole('dialog', { name: /^(设置|Settings)$/ }).press('Escape')
  await wait(() => fixture.states.get(id)?.bounds !== null)
  await page.setViewportSize({ width: 1450, height: 900 })
  await wait(() => Math.abs((fixture.states.get(id)?.bounds?.x ?? -999) + (fixture.states.get(id)?.bounds?.width ?? 0) - 1450) < 5)
  const handle = await page.locator('[data-side="rightbar"]').boundingBox()
  const widthBeforeDrag = fixture.states.get(id).bounds.width
  await page.mouse.move(handle.x + handle.width / 2, 250)
  await page.mouse.down()
  await page.mouse.move(handle.x - 80, 250, { steps: 5 })
  await page.mouse.up()
  await wait(() => fixture.states.get(id)?.bounds?.width > widthBeforeDrag + 40)
  await page.screenshot({ path: `${screenshots}/sidebar-native-browser.png`, animations: 'disabled' })
  await page.getByRole('button', { name: /^(收起右侧边栏|Collapse right sidebar)$/ }).click()
  await wait(() => fixture.states.get(id)?.bounds === null)
  await page.getByRole('button', { name: /^(打开右侧边栏|Open right sidebar)$/ }).click()
  await wait(() => fixture.states.get(id)?.bounds !== null)
  assert.equal(await address.inputValue(), reported.url, 'Layout updates must retain the actual native address')
  assert.equal(fixture.requests.filter(request => request.type === 'open' && request.id === id).length, 1)
  // Switching away hides the view, and returning keeps the same occurrence/history.
  await page.locator('[data-dockkit-add-tab]').click()
  await page.locator('[data-sidebar-right-guide-entry="browser"]').click()
  await surface.waitFor()
  const secondId = await surface.getAttribute('data-next-browser-surface')
  assert.notEqual(secondId, id)
  await wait(() => fixture.states.has(secondId) && fixture.states.get(id)?.bounds === null)
  await page.getByRole('tab', { name: /github\.com/ }).click()
  await wait(() => fixture.states.get(id)?.bounds !== null)
  assert.equal(await surface.getAttribute('data-next-browser-surface'), id)
  await page.locator('[data-dockkit-tab][aria-selected="true"] [data-dockkit-tab-close]').click()
  await wait(() => !fixture.states.has(id))
  await page.locator('[data-dockkit-tab][aria-selected="true"] [data-dockkit-tab-close]').click()
  await wait(() => !fixture.states.has(secondId))
  const collapse = page.getByRole('button', { name: /^(收起右侧边栏|Collapse right sidebar)$/ })
  if (await collapse.isVisible()) await collapse.click()
  await page.setViewportSize({ width: 1280, height: 840 })
  return id
}

export async function verifyWebBrowserFallback(page) {
  await page.getByRole('button', { name: /^(新建会话|New session)$/i }).last().click()
  const workspace = page.getByRole('button', { name: /^(选择工作区|Select workspace)$/ })
  if (await workspace.isVisible()) await workspace.click()
  await page.getByRole('button', { name: /^(打开右侧边栏|Open right sidebar)$/ }).click()
  await page.locator('[data-sidebar-right-guide-entry="browser"]').click()
  await page.route('https://sidebar-browser.test/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Web iframe fixture</p>' }))
  const address = page.getByRole('textbox', { name: /^(输入 HTTP\(S\) 地址|Enter an HTTP\(S\) address)$/ })
  await address.fill('https://sidebar-browser.test/')
  await address.press('Enter')
  await page.frameLocator('[data-sidebar-browser-frame]').getByText('Web iframe fixture').waitFor()
  assert.equal(await page.locator('[data-next-browser-surface]').count(), 0)
  assert.ok(await page.locator('[data-sidebar-browser-frame]').getAttribute('sandbox'))
}

async function wait(condition) {
  const end = Date.now() + 10_000
  while (!condition()) {
    if (Date.now() >= end) throw new Error('Native Browser UI state did not settle')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}
