import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: { main: 'src/main.ts', host: 'src/host/index.ts', profiles: 'src/profiles.ts', extensions: 'src/extensions.ts', webserver: 'src/webserver.ts', 'host-process': 'src/host-process.ts' },
    outDir: 'lib', format: 'esm', platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: true,
    deps: { neverBundle: ['electron'] },
  },
  ...['preload-app', 'preload-shell'].map(name => ({
    entry: { [name]: `src/${name}.ts` },
    outDir: 'lib', format: 'cjs' as const, platform: 'node' as const, target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    deps: { neverBundle: ['electron'] },
  })),
])
