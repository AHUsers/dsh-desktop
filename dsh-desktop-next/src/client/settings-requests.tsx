/** Native settings actions reuse the official sidebar trigger and permission dialog. */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { DesktopPermissionsDialog } from './permissions.tsx'

export function SettingsRequests({ t }: PropsLocale<'desktop-next'>) {
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  useEffect(() => {
    let observer: MutationObserver | undefined
    const dispose = window.desktopNext?.onOpenSettings?.(page => {
      observer?.disconnect()
      if (page === 'permissions') {
        if (!document.querySelector('.dshNextPermissionsDialog')) setPermissionsOpen(true)
        return
      }
      setPermissionsOpen(false)
      // Target the official slot identity, independent of locale or sidebar width.
      const open = (): void => {
        const trigger = document.querySelector('[data-slot="settings.trigger"]')?.closest('button')
        if (!trigger) return
        observer?.disconnect()
        trigger.click()
      }
      observer = new MutationObserver(open)
      observer.observe(document.body, { childList: true, subtree: true })
      open()
    })
    return () => { observer?.disconnect(); dispose?.() }
  }, [])
  return <DesktopPermissionsDialog open={permissionsOpen} onClose={() => { setPermissionsOpen(false) }}
    service={window.desktopNext?.permissions} language={t('language')} />
}
