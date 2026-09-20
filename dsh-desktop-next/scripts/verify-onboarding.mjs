/** Render the shipped native wizard headlessly: no Electron launch, Host, network or user data. */
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { serveWebDocument } from '../lib/web-document.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const screenshots = join(root, '.desktop-next/verification')
mkdirSync(screenshots, { recursive: true })
const browser = await chromium.launch({ headless: true,
  ...(process.env.DSH_NEXT_TEST_BROWSER_CHANNEL ? { channel: process.env.DSH_NEXT_TEST_BROWSER_CHANNEL } : {}),
})
const context = await browser.newContext({ viewport: { width: 1040, height: 720 }, locale: 'zh-CN', colorScheme: 'dark' })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
let rejectSave = false
const commands = []
const state = {
  selected: 'desktop', profiles: ['desktop'], unavailableProfiles: [], features: { market: true, remoteControl: false },
  preferences: {}, phase: 'starting', busy: false, failure: '', safeMode: false, onboarding: true, logs: '',
}
await page.exposeFunction('__state', () => structuredClone(state))
await page.exposeFunction('__command', command => {
  if (rejectSave) { rejectSave = false; throw new Error('Fixture: could not save Profile') }
  commands.push(command)
})
await page.addInitScript(() => { window.desktopNext = { state: () => window.__state(), command: value => window.__command(value) } })
await page.route('http://next-onboarding.test/**', async route => {
  const response = await serveWebDocument(new Request(route.request().url()), join(root, 'lib/native-ui'), false)
  response.headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'none'")
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
})
const open = async (locale = 'zh') => {
  await page.goto('about:blank')
  await page.goto(`http://next-onboarding.test/?locale=${locale}&platform=darwin&frame=true#onboarding`)
  await page.locator('[data-page="0"]').waitFor()
}
const next = async number => {
  await page.getByRole('button', { name: /下一步|Continue/, exact: true }).click()
  await page.locator(`[data-page="${number}"]`).waitFor()
}
const capture = name => page.screenshot({ path: join(screenshots, `onboarding-${name}.png`), animations: 'disabled' })
try {
  await open()
  assert.equal(await page.getByRole('button', { name: '上一步', exact: true }).count(), 0)
  assert.equal(await page.locator('.next-onboarding-eyebrow, img').count(), 0)
  assert.equal(await page.locator('.next-onboarding-wordmark').innerText(), 'NEXT')
  assert.notEqual(await page.locator('.next-onboarding-whale').evaluate(mark => getComputedStyle(mark).maskImage), 'none')
  await capture('welcome')
  await next(1)
  const back = await page.getByRole('button', { name: '上一步', exact: true }).boundingBox()
  const skip = await page.getByRole('button', { name: '跳过全部', exact: true }).boundingBox()
  assert.ok(back.x < 100 && skip.x > 800 && Math.abs(back.y - skip.y) < 1)
  await page.getByRole('radio', { name: 'dsh-market', exact: true }).check()
  await capture('market')
  await next(2)
  await page.getByRole('switch', { name: '启用远程控制', exact: true }).check()
  assert.equal(await page.locator('.next-onboarding-copy [role="switch"]').count(), 1)
  assert.equal(await page.locator('.next-onboarding-panel [role="switch"]').count(), 0)
  assert.equal(await page.locator('.next-onboarding-phone img').evaluate(image => image.complete && image.naturalWidth > 0), true)
  await capture('remote')
  await page.getByRole('button', { name: '上一步', exact: true }).click()
  await page.locator('[data-page="1"]').waitFor()
  assert.equal(await page.getByRole('radio', { name: 'dsh-market', exact: true }).getAttribute('aria-checked'), 'true')
  await next(2)
  assert.equal(await page.getByRole('switch', { name: '启用远程控制', exact: true }).getAttribute('aria-checked'), 'true')
  await next(3)
  await capture('recovery')
  assert.deepEqual(commands, [])
  rejectSave = true
  await page.getByRole('button', { name: '完成并开始', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Fixture: could not save Profile' }).waitFor()
  await page.getByRole('button', { name: '完成并开始', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'true')
  assert.deepEqual(commands, [{ type: 'onboarding-complete', profile: 'desktop', features: { market: false, dshMarket: true, remoteControl: true } }])

  // Skip is available on every page and does not submit partially edited choices.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (let index = 0; index < 4; index++) {
    await open()
    for (let step = 1; step <= index; step++) await next(step)
    if (index === 1) await page.getByRole('radio', { name: '暂不开启', exact: true }).check()
    if (index === 2) await page.getByRole('switch', { name: '启用远程控制', exact: true }).check()
    assert.equal(await page.locator('.next-onboarding-slide').evaluate(element => getComputedStyle(element).animationName), 'none')
    await page.getByRole('button', { name: '跳过全部', exact: true }).click()
    assert.deepEqual(commands.at(-1), { type: 'onboarding-skip', profile: 'desktop' })
  }
  assert.equal(commands.length, 5)

  // Small windows remain scrollable; light theme and English share the same flow.
  await page.setViewportSize({ width: 680, height: 560 })
  await page.emulateMedia({ colorScheme: 'light' })
  await open('en')
  for (let step = 1; step <= 3; step++) {
    await next(step)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const button = page.getByRole('button', { name: step === 3 ? 'Finish and start' : 'Continue', exact: true })
    await button.scrollIntoViewIfNeeded()
    assert.ok(await button.isVisible())
  }
  await capture('recovery-small-light')
  // Returning to the first page also restores focus, without losing the current Profile.
  for (let step = 2; step >= 0; step--) {
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.locator(`[data-page="${step}"]`).waitFor()
    assert.equal(await page.locator('h1').evaluate(heading => document.activeElement === heading), true)
  }
  assert.deepEqual(errors, [])
  console.log('Next onboarding passed: four pages, Back and Skip all, retained choices, exclusive market selection, completion and retry, reduced motion, keyboard focus, small-window scrolling and dark/light bilingual rendering. No Host or graphical app was started.')
} catch (error) {
  await capture('failure').catch(() => {})
  console.error(await page.locator('body').innerText())
  throw error
} finally { await browser.close() }
