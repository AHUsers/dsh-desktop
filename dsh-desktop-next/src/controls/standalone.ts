/** This document has no dependency on Host injections or remote client modules. */
import { mountDesktopControls } from './view.ts'
const root = document.querySelector<HTMLElement>('main')!
const language = new URLSearchParams(location.search).get('lang') ?? navigator.language
if (window.desktopNext) {
  let dispose = mountDesktopControls(root, window.desktopNext, language, location.hash.slice(1))
  window.addEventListener('hashchange', () => {
    dispose()
    dispose = mountDesktopControls(root, window.desktopNext!, language, location.hash.slice(1))
  })
}
else root.textContent = 'Desktop controls could not load. Restart DSH Desktop Next.'
