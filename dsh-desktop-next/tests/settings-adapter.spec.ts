import { expect, it } from 'vitest'
import { NextSettingsAdapter, projectSettings } from '../src/client/settings-adapter.ts'
import { DEFAULT_PREFERENCES, type DesktopBridge, type DesktopCommand, type DesktopState } from '../src/desktop-contract.ts'

function fixture() {
  const state: DesktopState = {
    selected: 'default', profiles: ['default', 'work', 'broken'], unavailableProfiles: ['broken'],
    features: { market: true, remoteControl: false }, preferences: { ...DEFAULT_PREFERENCES },
    phase: 'ready', busy: false, failure: '', safeMode: false, home: '/fixture', platform: 'darwin', version: '0.1.0',
    trayAvailable: true, notificationsAvailable: true, windowsMicaSupported: false, browserUrl: null, lan: null, checkpoint: null, logs: '',
  }
  const commands: DesktopCommand[] = []
  let fail = false
  const bridge: DesktopBridge = {
    state: async () => structuredClone(state),
    command: async command => {
      commands.push(command)
      if (fail) { fail = false; throw new Error('Fixture save failure') }
      if (command.type === 'preferences') state.preferences = command.preferences
      if (command.type === 'switch') state.selected = command.name
    },
  }
  return { state, commands, bridge, rejectNext: () => { fail = true }, adapter: new NextSettingsAdapter(bridge) }
}

it('shares stable subscription snapshots and serializes independent preference writes', async () => {
  const { adapter, state } = fixture()
  await adapter.refresh()
  const original = adapter.desktopSettings.getSnapshot()
  await adapter.refresh()
  expect(adapter.desktopSettings.getSnapshot()).toBe(original)
  await Promise.all([
    adapter.notificationSettings.set('enabled', false),
    adapter.savePreferences({ closeToTray: false, port: 12345 }),
  ])
  expect(state.preferences).toMatchObject({ notifications: false, closeToTray: false, port: 12345 })
  expect(adapter.notificationSettings.getSnapshot().value?.enabled).toBe(false)
  expect(adapter.desktopSettings.getSnapshot().value?.port).toBe(12345)
})

it('restores persisted state after rejected or cancelled writes and accepts later changes', async () => {
  const { adapter, rejectNext, bridge, state } = fixture()
  await adapter.refresh()
  rejectNext()
  await expect(adapter.notificationSettings.set('enabled', false)).rejects.toThrow('Fixture save failure')
  expect(adapter.notificationSettings.getSnapshot().value?.enabled).toBe(true)
  await adapter.desktopSettings.set('openBrowser', true)
  expect(state.preferences.browserAccess).toBe(true)
  // Native confirmation cancellation resolves without applying the requested value.
  bridge.command = async () => {}
  await adapter.desktopSettings.set('openBrowser', false)
  expect(adapter.desktopSettings.getSnapshot().value?.openBrowser).toBe(true)
  await expect(adapter.desktopSettings.set('__proto__', true)).rejects.toThrow('Unsupported')
})

it('maps only supported features and available Profiles to the shared settings API', async () => {
  const { adapter, state, commands } = fixture()
  const view = await adapter.api.read()
  expect(view.profiles.find(item => item.name === 'broken')?.selectable).toBe(false)
  expect(view.profiles.find(item => item.name === 'default')?.deletable).toBe(false)
  await expect(adapter.api.selectMarket('dsh-market')).rejects.toThrow('unavailable')
  expect(commands).toEqual([])
  state.safeMode = true
  await expect(adapter.api.selectAa!(true)).rejects.toThrow('safe mode')
  expect(projectSettings(state).market.effective).toBe('disabled')
  await adapter.api.selectProfile('work')
  expect((await adapter.api.read()).current).toBe('work')
})

it('opens credential-free browser addresses through the native launcher', async () => {
  const { state, adapter, commands } = fixture()
  state.browserUrl = 'http://127.0.0.1:1234/'
  state.lan = { state: 'ready', actualPort: 5678, addresses: ['192.168.1.20'], caFingerprint: 'fixture', errorCode: null }
  expect(projectSettings(state).web).toMatchObject({
    lanUrls: ['https://192.168.1.20:5678/'],
    lanCaUrls: ['https://192.168.1.20:5678/.well-known/dsh-desktop-ca.crt'],
  })
  await adapter.api.openBrowser!('http://127.0.0.1:1234/')
  await adapter.api.openBrowser!('https://192.168.1.20:5678/')
  await expect(adapter.api.openBrowser!('https://untrusted.test/')).rejects.toThrow('unavailable')
  expect(commands).toEqual([{ type: 'open-browser' }, { type: 'open-lan' }])
})
