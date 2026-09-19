/** Forward outcomes only. Session text and paths never enter native notifications. */
import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-jobs'
import type { DesktopPreferences, NotificationOutcome } from './desktop-contract.ts'

export function notificationEnabled(preferences: DesktopPreferences, outcome: NotificationOutcome): boolean {
  const key = { 'turn-completed': 'turnCompleted', 'turn-failed': 'turnFailed', 'job-completed': 'jobCompleted', 'job-failed': 'jobFailed' } as const
  return preferences.notifications && preferences[key[outcome]]
}

export class TurnAttention {
  private readonly open = new Map<string, { turn: number; user: boolean }>()
  constructor(private readonly notify: (outcome: NotificationOutcome) => void) {}
  event(session: Session, event: SessionEvent): void {
    if (session.header.origin === 'subagent') return
    const id = String(session.header.id)
    if (event.type === 'turn/start') { this.open.set(id, { turn: event.data.turn, user: false }); return }
    const turn = this.open.get(id)
    if (!turn) return
    if (event.type === 'user/message' && event.data.source.kind === 'user') turn.user = true
    if (event.type !== 'turn/end' || event.data.turn !== turn.turn) return
    this.open.delete(id)
    if (!turn.user) return
    const reason = event.data.reason.kind
    if (reason === 'completed') this.notify('turn-completed')
    else if (reason === 'error' || reason === 'max-tokens') this.notify('turn-failed')
  }
  dispose(session: Session): void { this.open.delete(String(session.header.id)) }
}

export function installNotifications(ctx: Context, notify: (outcome: NotificationOutcome) => void): void {
  ctx.inject(['jobs'], child => child.effect(() => child.jobs.onJobDone(snapshot => {
    if (snapshot.status === 'completed') notify('job-completed')
    else if (snapshot.status === 'failed') notify('job-failed')
  }), 'Next background task notifications'))
  ctx.inject(['sessions'], child => child.effect(() => {
    const turns = new TurnAttention(notify)
    const events = child.on('session/event', (session, event) => turns.event(session, event))
    const disposed = child.on('session/disposed', session => turns.dispose(session))
    return () => { events(); disposed() }
  }, 'Next user turn notifications'))
}
