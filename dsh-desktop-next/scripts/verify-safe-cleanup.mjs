/** Exercise the actual Electron filesystem implementation without opening windows. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

if (!process.versions.electron) {
  const electron = createRequire(import.meta.url)('electron')
  const child = spawnSync(electron, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true,
    stdio: 'inherit', timeout: 30_000,
  })
  if (child.error) throw child.error
  assert.equal(child.status, 0, 'Electron safe-home cleanup verification failed')
} else {
  const { NextDesktopRuntime } = await import('../lib/desktop-runtime.js')
  for (const action of ['close', 'normal-mode']) {
    const root = mkdtempSync(join(tmpdir(), 'next-electron-safe-cleanup-'))
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    const runtime = new NextDesktopRuntime({ home: join(root, 'home'), root, executable: process.execPath,
      addresses: () => [], certificate: async () => { throw new Error('Unexpected certificate request') },
      onFailure() {}, onChange() {}, onRestart() {}, onTerminal() {}, onNotification() {},
    })
    // Exercise real runtime preparation and cleanup, without spawning a backend.
    runtime.backend.start = async prepare => { await prepare() }
    try {
      runtime.safeMode = true
      await runtime.start()
      const safeHome = runtime.terminalTarget().homeDir
      const sentinel = join(root, 'keep.txt')
      writeFileSync(sentinel, 'outside safe home')
      chmodSync(sentinel, 0o444)
      const readonly = join(safeHome, 'readonly.txt')
      writeFileSync(readonly, 'temporary')
      chmodSync(readonly, 0o444)
      // Development homes live under the bundle targeted by the Profile junction.
      symlinkSync(root, join(safeHome, 'bundle-fallback'), 'junction')
      if (action === 'close') await runtime.close()
      else await runtime.restart(() => { runtime.safeMode = false })
      assert.equal(existsSync(safeHome), false, `${action}: safe home must actually be deleted`)
      assert.equal(readFileSync(sentinel, 'utf8'), 'outside safe home', 'Junction target must remain untouched')
      assert.doesNotMatch(runtime.diagnostics.snapshot(), /cleanup failed/)
    } finally {
      await runtime.close()
      await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }
  console.log(`Electron ${process.versions.electron} / Node ${process.versions.node}: safe-home close and restart preserve junction targets and remove read-only temporary files.`)
}
