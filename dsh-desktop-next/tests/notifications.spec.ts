import { expect, it, vi } from 'vitest'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { DEFAULT_PREFERENCES } from '../src/desktop-contract.ts'
import { notificationEnabled, TurnAttention } from '../src/notifications.ts'

it('notifies for the initiating user turn, not subagents, automation, or duplicate endings', () => {
  const notify = vi.fn()
  const tracker = new TurnAttention(notify)
  const session = { header: { id: 'main', origin: 'user' } } as unknown as Session
  const event = (type: string, data: object) => ({ type, data }) as SessionEvent
  tracker.event(session, event('turn/start', { turn: 1 }))
  tracker.event(session, event('user/message', { source: { kind: 'user' } }))
  tracker.event(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  tracker.event(session, event('turn/end', { turn: 1, reason: { kind: 'completed' } }))
  tracker.event(session, event('turn/start', { turn: 2 }))
  tracker.event(session, event('turn/end', { turn: 2, reason: { kind: 'completed' } }))
  const child = { header: { id: 'child', origin: 'subagent' } } as unknown as Session
  tracker.event(child, event('turn/start', { turn: 1 }))
  tracker.event(child, event('user/message', { source: { kind: 'user' } }))
  tracker.event(child, event('turn/end', { turn: 1, reason: { kind: 'error' } }))
  expect(notify.mock.calls).toEqual([['turn-completed']])
  expect(notificationEnabled({ ...DEFAULT_PREFERENCES, notifications: false }, 'job-failed')).toBe(false)
  expect(notificationEnabled({ ...DEFAULT_PREFERENCES, turnFailed: false }, 'turn-failed')).toBe(false)
  expect(notificationEnabled({ ...DEFAULT_PREFERENCES }, 'job-completed')).toBe(true)
})
