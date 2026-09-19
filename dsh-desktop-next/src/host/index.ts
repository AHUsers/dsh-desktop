/** Alpha.2 shared Web profile runner, hosted by an Electron Node-mode child. */
import { basename, delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { loadNextProfile, NEXT_PACKAGE } from '../profiles.ts'
import { bundledPnpmEntry } from '../extensions.ts'

export async function main(): Promise<void> {
  const runtimeDir = process.argv[2]
  const projectDir = process.argv[3]
  const home = process.env.DSH_HOME
  if (!runtimeDir || !projectDir || !home || !process.send) throw new Error('Next Host requires runtime, profile, home and IPC')
  const profile = loadNextProfile(projectDir, home)
  const application = runProfile({
    environment: loadLayeredEnv('dsh-desktop-next'), profile: basename(projectDir),
    resolutionMode: 'runtime', resolvedProfile: { profile, installAnchor: NEXT_PACKAGE },
    patchFiles: [join(runtimeDir, 'host.cordis.patch.yml'), join(projectDir, 'desktop-next.cordis.patch.json')], args: ['--no-open', '--port', '0'],
    packageManager: {
      command: process.execPath, args: ['--expose-internals', bundledPnpmEntry(NEXT_PACKAGE)],
      env: {
        DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        PATH: `${join(runtimeDir, 'scripts', 'node-bin')}${delimiter}${process.env.PATH ?? ''}`,
      },
    },
  })
  const send = (value: object): Promise<void> => new Promise((resolveSend, reject) => {
    if (!process.connected || !process.send) return resolveSend()
    process.send(value, error => error ? reject(error) : resolveSend())
  })
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => stopping ??= (async () => {
    const running = await application.catch(() => undefined)
    await running?.shutdown.shutdown(0)
    await send({ type: 'shutdown-complete' })
    if (process.connected) process.disconnect()
  })()
  process.on('message', (value: unknown) => {
    if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'shutdown') void stop().catch(fatal)
  })
  process.once('disconnect', () => { void stop().catch(fatal) })
  const { ctx } = await application
  await send({ type: 'ready', url: ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`),
    injections: ctx.webServer.collectIndexInjections() })
}

function fatal(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (process.connected) process.send?.({ type: 'fatal', message }, () => { if (process.connected) process.disconnect() })
  console.error(error)
  process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void main().catch(fatal)
