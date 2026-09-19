/** Narrow Host capabilities consumed by the existing Community Market. */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { readProfilePlugins, type ProfilePnpmInvocation } from '@deepseek-ai/dsh-app-boot'

export const name = 'desktop-next-capabilities'
export const inject = ['profileContext']

export function apply(ctx: Context): void {
  const profile = ctx.profileContext
  const invocation = profile.packageManager
  if (!invocation) throw new Error('Next requires its bundled pnpm invocation')
  const runner = createPackageRunner(invocation, profile.dir)
  ctx.provide('desktopProfiles', { current: { name: profile.name, dir: profile.dir } })
  ctx.provide('desktopPnpm', runner)
  const shipped = JSON.parse(readFileSync(profile.installAnchor, 'utf8')) as { name: string; dependencies: Record<string, string> }
  ctx.provide('desktopPlugins', {
    list: () => readProfilePlugins({ binName: 'dsh-desktop-next', profileDir: profile.dir, installAnchor: profile.installAnchor })
      .dependencies.filter(item => item.bundle).map(item => {
        const mutable = item.name !== shipped.name && !Object.hasOwn(shipped.dependencies, item.name)
          && !item.name.startsWith('@deepseek-ai/')
        return { bundleId: item.name, packageName: item.name, mutable, uninstallable: mutable,
          status: item.enabled && profile.startedBundles.includes(item.name) ? 'active' : 'disabled' }
      }),
  })
  if (process.send) ctx.provide('desktopActions', {
    requestRestart: () => new Promise<void>((resolve, reject) => {
      if (!process.connected || !process.send) { reject(new Error('Next shell is unavailable')); return }
      process.send({ type: 'desktop-action', action: 'restart' }, error => error ? reject(error) : resolve())
    }),
  })
  ctx.effect(() => () => runner.dispose(), 'Next package process disposal')
}

/** Own each process handle so a stale cancellation cannot kill its successor. */
export function createPackageRunner(invocation: ProfilePnpmInvocation, directory: string) {
  let active: { cancel(): void; done: Promise<unknown> } | undefined
  let disposed = false
  return {
    run(argv: readonly string[], signal?: AbortSignal) {
      if (disposed) throw new Error('Package runner has been disposed')
      if (active) throw new Error('A profile package operation is already active')
      if (signal?.aborted) throw signal.reason ?? new Error('Package operation cancelled')
      if (!argv.length || argv.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Invalid pnpm arguments')
      const child = spawn(invocation.command, [...invocation.args, ...argv, '--config.minimumReleaseAge=0'], {
        cwd: directory, env: { ...process.env, ...invocation.env },
        windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      })
      let settled = false
      let killTimer: NodeJS.Timeout | undefined
      const kill = (kind: NodeJS.Signals): void => {
        if (settled || !child.pid) return
        if (process.platform === 'win32') {
          const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
          killer.on('error', () => { if (!settled) child.kill(kind) })
        } else {
          try { process.kill(-child.pid, kind) } catch { child.kill(kind) }
        }
      }
      const cancel = (): void => {
        if (settled || killTimer) return
        kill('SIGTERM')
        killTimer = setTimeout(() => kill('SIGKILL'), 2_000)
        killTimer.unref()
      }
      const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (exitCode, exitSignal) => { resolve({ exitCode, signal: exitSignal }) })
      }).finally(() => {
        settled = true
        clearTimeout(killTimer)
        signal?.removeEventListener('abort', cancel)
        if (active?.done === done) active = undefined
      })
      active = { cancel, done }
      void done.catch(() => {})
      signal?.addEventListener('abort', cancel, { once: true })
      return { stdout: child.stdout!, stderr: child.stderr!, done, cancel }
    },
    async dispose(): Promise<void> {
      disposed = true
      const current = active
      current?.cancel()
      await current?.done.catch(() => {})
    },
  }
}

export function bundledPnpmEntry(anchor: string): string {
  const require = createRequire(anchor)
  return join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs')
}
