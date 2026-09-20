import type { LogFileSink } from './log-files.ts'
import { maskSecrets } from './mask-secrets.ts'

/** Logger for Electron-main-scope messages that bypass Cordis `ctx.logger`. */
export interface DesktopLogger {
  /** Log an error message to the sink (and stderr for dev visibility). */
  error(message: string): void
  /** Log an unknown cause, normalizing errors/objects/strings. */
  errorCause(cause: unknown): void
}

/** Process events needed to make uncaught exceptions observable and fatal. */
export interface DesktopUncaughtExceptionProcess {
  once(event: 'uncaughtException', listener: (error: Error) => void): unknown
  off(event: 'uncaughtException', listener: (error: Error) => void): unknown
}

export interface DesktopChildProcessDetails {
  readonly type: string
  readonly reason: string
  readonly exitCode: number
  readonly serviceName?: string
  readonly name?: string
}

/** Electron app events that expose native child process failures. */
export interface DesktopChildProcessSource {
  on(event: 'child-process-gone', listener: (event: unknown, details: DesktopChildProcessDetails) => void): unknown
  off(event: 'child-process-gone', listener: (event: unknown, details: DesktopChildProcessDetails) => void): unknown
}

/** Render an error with its `cause` chain expanded, mirroring the upstream
 * `formatErrorDetails()` convention: each level appends `cause=<detail>` and
 * keeps its own `stack` so wrapped LLM/loader failures stay diagnosable (#952). */
export function formatDesktopErrorDetails(error: unknown, seen = new Set<unknown>()): string {
  if (error instanceof AggregateError) {
    const parts = error.errors.map(part => formatDesktopErrorDetails(part, seen))
    return `${error.message} [errors: ${parts.join(' | ')}]`
  }
  if (!(error instanceof Error)) return String(error)
  if (seen.has(error)) return `${error.message} [circular cause]`
  seen.add(error)
  const details = [error.stack ?? error.message]
  const cause = (error as { cause?: unknown }).cause
  if (cause !== undefined) {
    details.push(`cause=${formatDesktopErrorDetails(cause, seen)}`)
  }
  return details.join('\n')
}

/** Render signed Electron exit codes with their Windows NTSTATUS bit pattern. */
export function formatDesktopExitCode(exitCode: number): string {
  return `${String(exitCode)} / 0x${(exitCode >>> 0).toString(16).padStart(8, '0')}`
}

/** Persist unexpected utility, GPU, and other Electron child process exits. */
export function installDesktopChildProcessLogging(
  app: DesktopChildProcessSource,
  logger: DesktopLogger,
): () => void {
  const handler = (_event: unknown, details: DesktopChildProcessDetails): void => {
    const identity = [
      `type: ${details.type}`,
      ...(details.name === undefined ? [] : [`name: ${details.name}`]),
      ...(details.serviceName === undefined ? [] : [`service: ${details.serviceName}`]),
    ]
    logger.error(
      `dsh-plugin-desktop: child process gone (${identity.join(', ')}, reason: ${details.reason}, exitCode: ${formatDesktopExitCode(details.exitCode)})`,
    )
  }
  app.on('child-process-gone', handler)
  return () => { app.off('child-process-gone', handler) }
}

/** Persist the first uncaught exception before requesting a fatal exit. */
export function installDesktopUncaughtExceptionLogging(
  proc: DesktopUncaughtExceptionProcess,
  logger: DesktopLogger,
  exit: (code: number) => void,
): () => void {
  let handled = false
  const handler = (error: Error): void => {
    if (handled) return
    handled = true
    proc.off('uncaughtException', handler)
    logger.errorCause(error)
    exit(1)
  }
  proc.once('uncaughtException', handler)
  return () => { proc.off('uncaughtException', handler) }
}

/** DesktopLogger that writes to the shared sink and mirrors to process.stderr. */
export class ElectronStderrLogger implements DesktopLogger {
  constructor(private readonly sink: LogFileSink | undefined) {}

  /** Accept one fail-loud stderr diagnostic through the persistent logger. */
  write(chunk: string): boolean {
    this.error(chunk.replace(/\r?\n$/u, ''))
    return true
  }

  error(message: string): void {
    const masked = maskSecrets(message)
    try {
      this.sink?.write('error', masked)
    } catch {
      // Persistent diagnostics are best-effort; stderr must remain available.
    }
    process.stderr.write(`${masked}\n`)
  }

  errorCause(cause: unknown): void {
    this.error(formatDesktopErrorDetails(cause))
  }
}
