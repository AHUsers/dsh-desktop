/** Shared controls for the official Settings section and the independent recovery window. */
import type { DesktopBridge, DesktopCommand, DesktopPreferences, DesktopState } from '../desktop-contract.ts'

export function mountDesktopControls(container: HTMLElement, bridge: DesktopBridge, language: string, initialPage?: string): () => void {
  const zh = language.toLowerCase().startsWith('zh')
  const t = (cn: string, en: string): string => zh ? cn : en
  const button = (type: DesktopCommand['type'], cn: string, en: string): string => `<button type="button" data-command="${type}">${t(cn, en)}</button>`
  const checkbox = (key: keyof DesktopPreferences, cn: string, en: string): string => `<label class="nextCheck"><input type="checkbox" data-preference="${key}">${t(cn, en)}</label>`
  // All markup and translations below are application constants. Runtime values use textContent/value.
  container.innerHTML = `<div class="dshNextSettings">
    <header><p class="nextEyebrow">DSH DESKTOP NEXT</p><h2>${t('桌面设置', 'Desktop settings')}</h2><p data-status role="status"></p></header>
    <div data-failure class="nextError" role="alert" hidden></div><p data-notice class="nextHint" role="status"></p>
    <nav aria-label="${t('桌面设置分类', 'Desktop settings categories')}">
      <button type="button" data-tab="general">${t('常规', 'General')}</button><button type="button" data-tab="profiles">Profile</button>
      <button type="button" data-tab="tools">${t('工具', 'Tools')}</button><button type="button" data-tab="recovery">${t('恢复', 'Recovery')}</button>
    </nav>
    <section data-page="general">
      <form data-form="preferences">
        <h3>${t('窗口与托盘', 'Window and tray')}</h3>
        ${checkbox('closeToTray', '关闭窗口后保持运行，可从托盘重新打开', 'Keep running when the window closes; reopen from the tray')}
        <p class="nextHint" data-tray-status></p>
        <label data-platform="darwin">${t('窗口材质', 'Window material')}<select data-preference="macosMaterial"><option value="transparent">${t('透明', 'Transparent')}</option><option value="off">${t('关闭', 'Off')}</option></select></label>
        <label data-platform="win32">${t('窗口材质', 'Window material')}<select data-preference="windowsMaterial"><option value="off">${t('关闭', 'Off')}</option><option value="mica">Mica</option></select></label>
        <h3>${t('浏览器访问', 'Browser access')}</h3>
        ${checkbox('browserAccess', '允许在浏览器中访问', 'Allow browser access')}
        <label>${t('访问范围', 'Access scope')}<select data-preference="networkExposure"><option value="loopback">${t('仅本机', 'This computer only')}</option><option value="lan">${t('本机与局域网 HTTPS', 'This computer and LAN over HTTPS')}</option></select></label>
        <div class="nextRow"><label>${t('本机端口', 'Local port')}<input data-preference="port" type="number" min="0" max="65535" step="1" required></label><label>${t('局域网 HTTPS 端口', 'LAN HTTPS port')}<input data-preference="lanPort" type="number" min="0" max="65535" step="1" required></label></div>
        <p class="nextHint">${t('端口为 0 时自动分配。更改访问设置会重启 Host；局域网连接需要在其他设备信任本机 CA 证书。', 'Use 0 for an automatic port. Access changes restart the Host. LAN connections require trusting this installation’s CA certificate on the other device.')}</p>
        <h3>${t('通知', 'Notifications')}</h3>
        ${checkbox('notifications', '允许桌面通知', 'Allow desktop notifications')}
        <div class="nextGrid">${checkbox('turnCompleted', '回合完成', 'Turn completed')}${checkbox('turnFailed', '回合失败', 'Turn failed')}${checkbox('jobCompleted', '后台任务完成', 'Background job completed')}${checkbox('jobFailed', '后台任务失败', 'Background job failed')}</div>
        <p class="nextHint" data-notification-status></p>
        <label>${t('日志级别', 'Log level')}<select data-preference="logLevel"><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select></label>
        <button type="submit">${t('保存桌面设置', 'Save desktop settings')}</button>
      </form>
      <h3>${t('连接信息', 'Connection details')}</h3><pre data-network class="nextHint"></pre>
      <div class="nextRow">${button('open-browser', '在浏览器中打开', 'Open in browser')}${button('copy-browser', '复制本机登录链接', 'Copy local login link')}${button('copy-lan', '复制局域网登录链接', 'Copy LAN login link')}${button('export-ca', '导出 CA 证书', 'Export CA certificate')}</div>
      <p class="nextHint">${t('登录链接可授予访问权限，请仅与可信设备共享。证书指纹用于核对要信任的证书。', 'Login links grant access; share only with trusted devices. Use the fingerprint to verify the certificate before trusting it.')}</p>
    </section>
    <section data-page="profiles" hidden>
      <h3>${t('工作环境', 'Environment')}</h3><label>${t('Profile', 'Profile')}<select data-profiles></select></label>
      <div class="nextRow">${button('switch', '切换 Profile…', 'Switch Profile…')}${button('delete', '移除 Profile…', 'Remove Profile…')}${button('open-profile', '打开 Profile 目录', 'Open Profile directory')}</div>
      <form data-form="create"><label>${t('新建 Profile', 'New Profile')}<input name="profile" required maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" placeholder="work"></label><button type="submit">${t('创建', 'Create')}</button></form>
      <p class="nextHint">${t('Profile 分别管理插件和补丁。会话、设置和凭据在同一 Next 数据目录内共享。移除操作会将 Profile 移入恢复备份目录。', 'Profiles have separate plugins and patches. Sessions, settings and credentials are shared within one Next home. Removed Profiles move to the recovery backups directory.')}</p>
      <form data-form="features"><h3>${t('附加功能', 'Additional features')}</h3>
        <label class="nextCheck"><input type="checkbox" data-feature="market">${t('社区市场', 'Community Market')}</label>
        <label class="nextCheck"><input type="checkbox" data-feature="remoteControl">${t('手机远控', 'Remote control')}</label>
        <p class="nextHint">${t('启用远控并重启后，在主界面的“手机连接”中完成配置。远程使用时，这台电脑需要保持开机并联网。', 'After enabling remote control and restarting, finish setup in the phone connection page. This computer must stay on and connected to the network.')}</p>
        <button type="submit">${t('应用并重启 Host…', 'Apply and restart Host…')}</button>
      </form>
    </section>
    <section data-page="tools" hidden><h3>${t('桌面工具', 'Desktop tools')}</h3>
      <div class="nextGrid">${button('terminal', '打开终端', 'Open terminal')}${button('reload', '刷新界面', 'Reload interface')}${button('devtools', '开发者工具', 'Developer tools')}${button('open-home', '打开数据目录', 'Open data directory')}${button('open-logs', '打开日志目录', 'Open log directory')}${button('diagnostics', '导出诊断…', 'Export diagnostics…')}</div>
      <p class="nextHint">${t('终端自带当前 Next 的 dsh、pnpm 和 Node，默认使用原 Profile。诊断文件包含版本、运行状态和脱敏日志；日志可能含本机路径及插件输出，分享前请检查。', 'The terminal provides this Next installation’s dsh, pnpm and Node and selects the original Profile. Diagnostics include versions, runtime state and redacted logs. Logs can contain local paths and plugin output; review before sharing.')}</p>
      <h3>${t('更新', 'Updates')}</h3><p data-version></p><p class="nextHint">${t('Next 目前是开发版，尚无独立的安装包和自动更新渠道。更新代码后重新构建即可。', 'Next is a development build without its own installers or automatic update channel. Update the source and rebuild to update this installation.')}</p>
    </section>
    <section data-page="recovery" hidden><h3>${t('恢复助手', 'Recovery assistant')}</h3>
      <p>${t('此页面不依赖 Host。启动失败时，也可以重试、切换 Profile、查看日志或修复配置。', 'This page does not depend on the Host. You can retry, switch Profiles, inspect logs or repair configuration after startup fails.')}</p>
      <div class="nextRow">${button('restart', '重启 Host…', 'Restart Host…')}${button('safe-mode', '进入安全模式…', 'Enter safe mode…')}${button('normal-mode', '退出安全模式…', 'Leave safe mode…')}</div>
      <p class="nextHint">${t('安全模式在独立的临时环境中启动官方界面，关闭远控、市场和浏览器访问，不载入原环境的第三方插件、补丁和凭据。原有数据不变；退出后恢复原 Profile，临时环境会移除。', 'Safe mode opens the official interface in a separate temporary environment, with remote control, Market and browser access disabled. It does not load the original environment’s third-party plugins, patches or credentials. Existing data stays intact; leaving returns to the original Profile and removes the temporary environment.')}</p>
      <h3>${t('修复配置', 'Repair configuration')}</h3><p data-checkpoint class="nextHint"></p>
      <div class="nextGrid">${button('recover', '修复当前 Profile…', 'Repair current Profile…')}${button('rollback', '回滚 Profile 配置…', 'Restore Profile configuration…')}${button('repair-global', '停用全局补丁…', 'Disable global patch…')}${button('open-backups', '打开恢复备份', 'Open recovery backups')}</div>
      <p class="nextHint">${t('修复和回滚前会备份当前配置，不删除已安装的插件文件、会话或凭据。Profile 回滚仅还原清单、Profile 补丁及附加功能开关，不回滚插件版本。全局补丁单独备份和停用。', 'Repair and rollback first back up the current configuration. Installed plugin files, sessions and credentials stay intact. Profile rollback restores the manifest, Profile patch and feature switches; it does not roll back plugin versions. The global patch is backed up and disabled separately.')}</p>
      <div class="nextRow">${button('diagnostics', '导出诊断…', 'Export diagnostics…')}${button('quit', '退出应用', 'Quit application')}</div>
    </section>
    <details><summary>${t('近期日志', 'Recent logs')}</summary><pre data-logs></pre></details>
    <footer><p data-home class="nextHint"></p><button type="button" data-refresh>${t('刷新状态', 'Refresh state')}</button></footer>
  </div>`
  const root = container.firstElementChild as HTMLElement
  const query = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!
  let disposed = false
  let pending = false
  let loading = false
  let current: DesktopState | undefined
  let preferencesDirty = false
  let featuresDirty = false
  let first = true
  const selectPage = (name: string): void => {
    root.querySelectorAll<HTMLElement>('[data-page]').forEach(page => { page.hidden = page.dataset.page !== name })
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab => { tab.setAttribute('aria-pressed', String(tab.dataset.tab === name)) })
  }
  const updateDisabled = (): void => {
    if (!current) return
    root.querySelectorAll<HTMLButtonElement>('button').forEach(element => {
      const kind = element.dataset.command
      element.disabled = (pending || current!.busy) && !element.dataset.tab && kind !== 'quit'
      if (kind === 'terminal') element.disabled ||= !['darwin', 'win32'].includes(current!.platform)
      if (kind === 'open-browser' || kind === 'copy-browser') element.disabled ||= !current!.browserUrl
      if (kind === 'copy-lan' || kind === 'export-ca') element.disabled ||= current!.lan?.state !== 'ready'
      if (kind === 'rollback') element.disabled ||= !current!.checkpoint
      if (kind === 'safe-mode') element.disabled ||= current!.safeMode
      if (kind === 'normal-mode') element.disabled ||= !current!.safeMode
      if (kind === 'delete') element.disabled ||= ['default', current!.selected].includes(query<HTMLSelectElement>('[data-profiles]').value)
    })
  }
  const refresh = async (reset = false): Promise<void> => {
    if (loading) return
    loading = true
    try {
      const state = await bridge.state()
      if (disposed) return
      current = state
      query('[data-status]').textContent = `${state.selected} · ${state.safeMode ? t('安全模式', 'Safe mode') + ' · ' : ''}${({ starting: t('启动中', 'Starting'), ready: t('运行中', 'Running'), error: t('需要恢复', 'Recovery needed') })[state.phase]}`
      const failure = query('[data-failure]')
      failure.textContent = state.failure; failure.hidden = !state.failure
      query('[data-home]').textContent = `${t('数据目录', 'Data directory')}: ${state.home}`
      query('[data-version]').textContent = `DSH Desktop Next ${state.version}`
      query('[data-logs]').textContent = state.logs.slice(-24_000) || t('暂无日志。', 'No logs yet.')
      query('[data-checkpoint]').textContent = state.checkpoint ? `${t('最近成功启动的配置', 'Last successful-start configuration')}: ${new Date(state.checkpoint.created).toLocaleString()}` : t('尚无成功启动的配置备份。', 'No successful-start configuration is available.')
      query('[data-tray-status]').textContent = state.trayAvailable ? t('托盘可用。关闭后台运行后，关闭主窗口将退出应用。', 'Tray is available. With background running disabled, closing the main window quits the app.') : t('系统托盘不可用，关闭主窗口将退出应用。', 'The system tray is unavailable. Closing the main window quits the app.')
      query('[data-notification-status]').textContent = state.notificationsAvailable ? t('仅在主窗口未聚焦时提醒。通知不包含会话内容，系统通知权限也需开启。', 'Notifications appear while the main window is unfocused and contain no conversation text. System notification permission must also be enabled.') : t('当前系统不支持桌面通知。', 'Desktop notifications are unavailable on this system.')
      query<HTMLOptionElement>('[data-preference="windowsMaterial"] option[value="mica"]').disabled = !state.windowsMicaSupported
      query<HTMLOptionElement>('[data-preference="windowsMaterial"] option[value="mica"]').textContent = state.windowsMicaSupported ? 'Mica' : t('Mica（当前系统不支持）', 'Mica (unavailable on this system)')
      root.querySelectorAll<HTMLElement>('[data-platform]').forEach(element => { element.hidden = element.dataset.platform !== state.platform })
      const profiles = query<HTMLSelectElement>('[data-profiles]')
      const choice = !reset && profiles.value ? profiles.value : state.selected
      if (Array.from(profiles.options).map(option => option.value).join('\0') !== state.profiles.join('\0')) profiles.replaceChildren(...state.profiles.map(name => { const option = document.createElement('option'); option.value = option.textContent = name; return option }))
      profiles.value = state.profiles.includes(choice) ? choice : state.selected
      if (reset || !preferencesDirty) root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-preference]').forEach(element => {
        const value = state.preferences[element.dataset.preference as keyof DesktopPreferences]
        if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = value as boolean
        else element.value = String(value)
      })
      if (reset || !featuresDirty) root.querySelectorAll<HTMLInputElement>('[data-feature]').forEach(element => { element.checked = state.features[element.dataset.feature as keyof typeof state.features] })
      if (reset) preferencesDirty = featuresDirty = false
      const lan = state.lan
      query('[data-network]').textContent = [state.browserUrl ?? t('浏览器访问已关闭。', 'Browser access is disabled.'),
        ...(lan?.state === 'ready' ? [...lan.addresses.map(address => `https://${address}:${lan.actualPort}`), `CA SHA-256: ${lan.caFingerprint}`] : lan?.state === 'failed' ? [`LAN HTTPS: ${lan.errorCode}`] : []),
      ].join('\n')
      if (first) { selectPage(initialPage && ['general', 'profiles', 'recovery'].includes(initialPage) ? initialPage : state.failure || state.safeMode ? 'recovery' : 'general'); first = false }
      updateDisabled()
    } finally { loading = false }
  }
  const report = (error: unknown): void => { if (!disposed) query('[data-notice]').textContent = error instanceof Error ? error.message : String(error) }
  const perform = async (command: DesktopCommand): Promise<void> => {
    if (pending && command.type !== 'quit') return
    pending = true; updateDisabled(); query('[data-notice]').textContent = ''
    try {
      await bridge.command(command)
      if (disposed) return
      await refresh(['preferences', 'features', 'switch', 'recover', 'rollback', 'normal-mode', 'safe-mode'].includes(command.type))
      if (command.type === 'copy-lan' || command.type === 'copy-browser') query('[data-notice]').textContent = t('登录链接已复制。', 'Login link copied.')
    } catch (error) { report(error) }
    finally { pending = false; if (!disposed) updateDisabled() }
  }
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab => { tab.onclick = () => selectPage(tab.dataset.tab!) })
  query<HTMLSelectElement>('[data-profiles]').onchange = updateDisabled
  root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(element => { element.onclick = () => {
    const type = element.dataset.command as DesktopCommand['type']
    void perform(type === 'switch' || type === 'delete' ? { type, name: query<HTMLSelectElement>('[data-profiles]').value } : { type } as DesktopCommand)
  } })
  query<HTMLFormElement>('[data-form="preferences"]').oninput = () => { preferencesDirty = true }
  query<HTMLFormElement>('[data-form="features"]').oninput = () => { featuresDirty = true }
  query<HTMLFormElement>('[data-form="preferences"]').onsubmit = event => {
    event.preventDefault()
    if (!current) return
    const preferences = { ...current.preferences }
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-preference]').forEach(element => {
      const value = element instanceof HTMLInputElement && element.type === 'checkbox' ? element.checked : element instanceof HTMLInputElement && element.type === 'number' ? Number(element.value) : element.value
      Object.assign(preferences, { [element.dataset.preference!]: value })
    })
    void perform({ type: 'preferences', preferences })
  }
  query<HTMLFormElement>('[data-form="features"]').onsubmit = event => {
    event.preventDefault()
    void perform({ type: 'features', features: { market: query<HTMLInputElement>('[data-feature="market"]').checked, remoteControl: query<HTMLInputElement>('[data-feature="remoteControl"]').checked } })
  }
  query<HTMLFormElement>('[data-form="create"]').onsubmit = event => { event.preventDefault(); void perform({ type: 'create', name: query<HTMLInputElement>('[name="profile"]').value.trim() }) }
  query<HTMLButtonElement>('[data-refresh]').onclick = () => { void refresh().catch(report) }
  selectPage('general')
  void refresh().catch(report)
  const timer = setInterval(() => { if (!document.hidden && !pending) void refresh().catch(report) }, 2000)
  return () => { disposed = true; clearInterval(timer); container.replaceChildren() }
}
