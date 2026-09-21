/** Real native pages with anti-framing headers; Linux Xvfb only, never opens the user's desktop. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { NativeSidebarBrowser } from '../lib/sidebar-browser.js'

if (process.platform !== 'linux' || !process.env.DISPLAY) {
  console.error('Run this native Browser check on Linux under xvfb-run; portable checks do not start Electron.')
  app.exit(1)
} else { void verify() }

async function verify() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-native-browser-'))
  app.setPath('userData', home)
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html')
    if (request.url === '/embed') {
      response.end('<iframe src="/first"></iframe>')
      return
    }
    response.setHeader('content-security-policy', "default-src 'self'; frame-ancestors 'none'; script-src 'unsafe-inline'")
    response.setHeader('x-frame-options', 'DENY')
    response.end(`<title>${request.url}</title><p id="native-proof">Loaded native page</p><a href="/second">Second</a>`)
  })
  let window, browser
  let code = 0
  const deadline = setTimeout(() => { console.error('Native Browser check timed out'); app.exit(1) }, 45_000)
  try {
    await app.whenReady()
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await window.webContents.session.cookies.set({ url: origin, name: 'app-secret', value: 'app-only' })
    await window.loadURL(`${origin}/embed`)
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('iframe').contentDocument?.querySelector('#native-proof')?.textContent ?? null"), null,
      'The fixture must actually refuse iframe embedding')
    const states = new Map()
    browser = new NativeSidebarBrowser(window, state => states.set(state.id, state))
    browser.command({ type: 'open', id: 'one', url: `${origin}/first` })
    const nativeView = window.contentView.children.at(-1)
    const contents = nativeView.webContents
    await wait(() => states.get('one')?.title === '/first' && !states.get('one')?.loading)
    assert.equal(await contents.executeJavaScript("document.querySelector('#native-proof').textContent"), 'Loaded native page')
    assert.deepEqual(await contents.executeJavaScript("[typeof window.desktopNext, typeof require, typeof process]"), ['undefined', 'undefined', 'undefined'])
    assert.equal((await contents.session.cookies.get({ url: origin })).some(cookie => cookie.name === 'app-secret'), false)
    assert.equal(contents.getLastWebPreferences().webSecurity, true)
    assert.equal(contents.getLastWebPreferences().sandbox, true)
    browser.command({ type: 'bounds', id: 'one', bounds: { x: 400, y: 80, width: 300, height: 400 } })
    assert.equal(nativeView.getVisible(), true)
    await contents.executeJavaScript("document.querySelector('a').click()")
    await wait(() => states.get('one')?.url.endsWith('/second') && states.get('one')?.canGoBack)
    browser.command({ type: 'back', id: 'one' })
    await wait(() => states.get('one')?.url.endsWith('/first') && states.get('one')?.canGoForward)
    browser.command({ type: 'forward', id: 'one' })
    await wait(() => states.get('one')?.url.endsWith('/second') && !states.get('one')?.loading)
    await contents.executeJavaScript("history.pushState({}, '', '/third')")
    await wait(() => states.get('one')?.url.endsWith('/third'))
    browser.command({ type: 'bounds', id: 'one', bounds: null })
    assert.equal(nativeView.getVisible(), false)
    browser.command({ type: 'open', id: 'two', url: `${origin}/first` })
    const second = window.contentView.children.at(-1).webContents
    assert.notEqual(contents.session, second.session)
    browser.dispose()
    await wait(() => contents.isDestroyed() && second.isDestroyed())
    console.log('Native sidebar Browser passed: CSP/X-Frame-Options retained, top-level page loaded, isolated session/preload, native history and SPA URL, hide/show and teardown.')
  } catch (error) {
    code = 1; console.error(error)
  } finally {
    clearTimeout(deadline)
    browser?.dispose()
    window?.destroy()
    await new Promise(resolve => server.close(resolve))
    rmSync(home, { recursive: true, force: true })
    app.exit(code)
  }
}
async function wait(condition) {
  const end = Date.now() + 10_000
  while (!condition()) {
    if (Date.now() >= end) throw new Error('Native Browser state did not settle')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
