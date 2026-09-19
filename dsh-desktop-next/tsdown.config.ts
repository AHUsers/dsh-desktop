import { defineConfig } from 'tsdown'

export default defineConfig([
  { entry: { shell: 'src/controls/standalone.ts' }, outDir: 'lib', format: 'iife', platform: 'browser', target: 'es2022', fixedExtension: false, dts: false, clean: false, outputOptions: { entryFileNames: 'shell.js' } },
  {
    entry: { 'desktop-cli': 'src/desktop-cli.ts', 'desktop-runtime': 'src/desktop-runtime.ts', 'controls-styles': 'src/controls/styles.ts', main: 'src/main.ts', host: 'src/host/index.ts', profiles: 'src/profiles.ts', extensions: 'src/extensions.ts', webserver: 'src/webserver.ts', 'host-process': 'src/host-process.ts', 'web-document': 'src/web-document.ts' },
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
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib', format: 'cjs', platform: 'browser', target: 'es2022',
    fixedExtension: false, dts: false, clean: false,
    deps: { neverBundle: ['react', '@deepseek-ai/dsh-client-ui-primitives'] },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-desktop-next", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
