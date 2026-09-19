import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { main: 'src/main.ts', host: 'src/host/index.ts', profiles: 'src/profiles.ts', 'host-process': 'src/host-process.ts' },
    outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: true,
    deps: { neverBundle: ['electron'] },
  },
  {
    entry: { 'preload-app': 'src/preload-app.ts', 'preload-shell': 'src/preload-shell.ts' },
    outDir: 'lib', format: 'cjs', platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    deps: { neverBundle: ['electron'] },
  },
])
