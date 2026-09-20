/** Existing Desktop settings presentation backed by Next's Host-independent controls. */
import type { DesktopBridge, DesktopCommand, DesktopPreferences, DesktopState } from '../desktop-contract.ts'
import type { Features } from '../profiles.ts'

export function mountDesktopControls(container: HTMLElement, bridge: DesktopBridge, language: string, initialPage?: string): () => void {
  const t = (cn: string, en: string): string => language.toLowerCase().startsWith('zh') ? cn : en
  const embedded = initialPage === undefined
  const button = (type: DesktopCommand['type'], cn: string, en: string): string => `<button type="button" data-command="${type}">${t(cn, en)}</button>`
  const toggle = (key: keyof DesktopPreferences, cn: string, en: string): string => `<label class="dshDesktopSettingsToggleRow"><span class="dshDesktopSettingsChoiceTitle">${t(cn, en)}</span><input type="checkbox" role="switch" class="nextSwitch" data-preference="${key}"></label>`
  const choice = (key: keyof Features, value: boolean, title: string, body: string): string => `<button type="button" role="radio" aria-checked="false" class="dshDesktopSettingsChoice" data-feature="${key}" data-value="${value}"><span class="dshDesktopSettingsChoiceCopy"><span class="dshDesktopSettingsChoiceTitle">${title}</span><span class="dshDesktopSettingsChoiceBody">${body}</span></span></button>`
  // Markup contains application constants only. Runtime values always use textContent/value.
  container.innerHTML = `<div class="dshNextSettings" data-presentation="${embedded ? 'settings' : 'standalone'}">
    <header class="dshDesktopSettingsHeader"><h2>${t('桌面设置', 'Desktop settings')}</h2><p>${t('管理 Profile、桌面外观、浏览器访问和通知。', 'Manage Profiles, desktop appearance, browser access and notifications.')}</p><p data-status role="status"></p></header>
    <div data-failure class="nextError" role="alert" hidden></div><p data-notice class="nextHint" role="status"></p>
    <nav aria-label="${t('桌面设置分类', 'Desktop settings categories')}"><button type="button" data-tab="general">${t('常规', 'General')}</button><button type="button" data-tab="profiles">Profile</button><button type="button" data-tab="tools">${t('工具', 'Tools')}</button><button type="button" data-tab="recovery">${t('恢复', 'Recovery')}</button></nav>
    <section data-page="profiles">
      <section class="dshDesktopSettingsGroup"><div><h3>Profile</h3><p class="dshDesktopSettingsGroupIntro">${t('为不同用途分别配置插件和补丁。切换后重新启动工作环境。', 'Keep separate plugin and patch configurations for different uses. Switching restarts the environment.')}</p></div>
        <div data-profiles class="dshDesktopSettingsList" role="radiogroup" aria-label="Profile"></div>
        <form data-form="create" class="dshDesktopSettingsForm"><label class="dshDesktopSettingsField">${t('新建 Profile', 'New Profile')}<input name="profile" required maxlength="64" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" autocomplete="off" placeholder="work"></label><button type="submit">${initialPage === 'create-profile' ? t('创建并切换', 'Create and switch') : t('创建', 'Create')}</button></form>
        <div class="nextRow">${button('open-profile', '打开当前 Profile 目录', 'Open current Profile directory')}</div>
        <p class="nextHint">${t('会话、设置和凭据在同一 Next 数据目录内共享。移除 Profile 时，其文件会移入恢复备份目录。', 'Sessions, settings and credentials are shared within one Next home. Removed Profiles move to the recovery backups directory.')}</p>
      </section>
      <section class="dshDesktopSettingsGroup"><div><h3>${t('插件市场', 'Plugin Market')}</h3><p class="dshDesktopSettingsGroupIntro">${t('选择是否在当前 Profile 中启用社区市场。', 'Choose whether to enable Community Market in this Profile.')}</p></div>
        <div class="nextFeatureChoices" role="radiogroup" aria-label="${t('插件市场', 'Plugin Market')}">${choice('market', false, t('关闭', 'Off'), t('不加载社区市场。已有插件保持不变。', 'Do not load Community Market. Existing plugins stay installed.'))}${choice('market', true, t('社区市场', 'Community Market'), t('浏览、安装和管理社区插件。', 'Browse, install and manage community plugins.'))}</div>
      </section>
      <section class="dshDesktopSettingsGroup"><div><h3>${t('手机远控', 'Remote control')}</h3><p class="dshDesktopSettingsGroupIntro">${t('通过 Agents Anywhere，在手机或其他设备上继续使用当前电脑。', 'Use Agents Anywhere to continue from your phone or another device.')}</p></div>
        <div class="nextFeatureChoices" role="radiogroup" aria-label="${t('手机远控', 'Remote control')}">${choice('remoteControl', false, t('关闭', 'Off'), t('不加载手机远控。', 'Do not load remote control.'))}${choice('remoteControl', true, 'Agents Anywhere', t('启用后，在“手机连接”中完成配置。这台电脑需要保持开机并联网。', 'Finish setup in Phone connection after enabling. This computer must stay on and connected.'))}</div>
      </section>
    </section>
    <section data-page="general">
      <section class="dshDesktopSettingsGroup"><div><h3>${t('窗口与托盘', 'Window and tray')}</h3><p class="dshDesktopSettingsGroupIntro">${t('选择关闭窗口后的行为和窗口材质。', 'Choose window appearance and what happens when you close the window.')}</p></div>
        ${toggle('closeToTray', '关闭窗口后保持后台运行', 'Keep running after closing the window')}
        <p class="nextHint" data-tray-status></p>
        <label class="dshDesktopSettingsMaterialField" data-platform="darwin"><span>${t('窗口材质', 'Window material')}</span><select data-preference="macosMaterial"><option value="transparent">${t('透明', 'Transparent')}</option><option value="off">${t('关闭', 'Off')}</option></select></label>
        <label class="dshDesktopSettingsMaterialField" data-platform="win32"><span>${t('窗口材质', 'Window material')}</span><select data-preference="windowsMaterial"><option value="off">${t('关闭', 'Off')}</option><option value="mica">Mica</option></select></label>
      </section>
      <section class="dshDesktopSettingsGroup"><div><h3>${t('浏览器访问', 'Browser access')}</h3><p class="dshDesktopSettingsGroupIntro">${t('在本机或局域网内的其他设备上使用浏览器连接。', 'Connect from a browser on this computer or another device on your local network.')}</p></div>
        ${toggle('browserAccess', '允许浏览器访问', 'Allow browser access')}
        <label class="dshDesktopSettingsToggleRow"><span>${t('允许局域网 HTTPS 访问', 'Allow LAN access over HTTPS')}</span><input type="checkbox" role="switch" class="nextSwitch" data-lan-access></label>
        <div data-network-panel><pre data-network class="nextHint"></pre><div class="nextRow">${button('open-browser', '在浏览器中打开', 'Open in browser')}${button('copy-browser', '复制本机登录链接', 'Copy local login link')}${button('copy-lan', '复制局域网登录链接', 'Copy LAN login link')}${button('export-ca', '导出 CA 证书', 'Export CA certificate')}</div><p class="nextHint">${t('登录链接可授予访问权限，请仅与可信设备共享。局域网连接需在其他设备信任本机 CA 证书，并核对证书指纹。', 'Login links grant access; share only with trusted devices. For LAN access, trust this installation’s CA certificate on the other device and verify its fingerprint.')}</p></div>
        <details><summary>${t('端口设置', 'Port settings')}</summary><form class="nextPorts" data-form="ports"><label>${t('本机端口', 'Local port')}<input data-preference="port" type="number" min="0" max="65535" step="1" required></label><label>${t('局域网 HTTPS 端口', 'LAN HTTPS port')}<input data-preference="lanPort" type="number" min="0" max="65535" step="1" required></label><button type="submit">${t('保存端口', 'Save ports')}</button></form><p class="nextHint">${t('0 表示自动分配。更改访问设置需要重启后台服务。', 'Use 0 for an automatic port. Access changes restart the background service.')}</p></details>
      </section>
      <section class="dshDesktopSettingsGroup"><div><h3>${t('通知', 'Notifications')}</h3><p data-notification-status class="dshDesktopSettingsGroupIntro"></p></div>
        ${toggle('notifications', '允许桌面通知', 'Allow desktop notifications')}
        <div class="dshDesktopSettingsDetails">${toggle('turnCompleted', '回合完成', 'Turn completed')}${toggle('turnFailed', '回合失败', 'Turn failed')}${toggle('jobCompleted', '后台任务完成', 'Background job completed')}${toggle('jobFailed', '后台任务失败', 'Background job failed')}</div>
      </section>
    </section>
    <section data-page="tools"><section class="dshDesktopSettingsGroup"><div><h3>${t('桌面工具', 'Desktop tools')}</h3><p class="dshDesktopSettingsGroupIntro">${t('打开终端、查看日志，或导出诊断信息。', 'Open a terminal, inspect logs or export diagnostics.')}</p></div>
      <div class="nextRow">${button('terminal', '打开 DSH 终端', 'Open DSH Terminal')}${button('reload', '重新加载界面', 'Reload Interface')}${button('devtools', '开发者工具', 'Developer Tools')}${button('open-home', '打开数据目录', 'Open data directory')}${button('open-logs', '打开日志目录', 'Open log directory')}${button('diagnostics', '导出诊断信息…', 'Export Diagnostics…')}</div>
      <label class="dshDesktopSettingsMaterialField">${t('日志级别', 'Log level')}<select data-preference="logLevel"><option value="debug">Debug</option><option value="info">Info</option><option value="warn">Warning</option><option value="error">Error</option></select></label>
      <p class="nextHint">${t('终端自带当前 Next 的 dsh、pnpm 和 Node，默认使用原 Profile。诊断文件包含运行状态和脱敏日志；分享前请检查其中的本机路径及插件输出。', 'The terminal provides this installation’s dsh, pnpm and Node and selects the original Profile. Diagnostics include runtime state and redacted logs; review local paths and plugin output before sharing.')}</p>
      <div class="nextRow">${button('restart-app', '重启应用…', 'Restart application…')}${button('restart-recovery', '重启到恢复模式…', 'Restart in recovery mode…')}<button type="button" data-open-recovery>${t('打开恢复助手', 'Open recovery assistant')}</button></div>
    </section></section>
    <section data-page="recovery"><section class="dshDesktopSettingsGroup"><h3>${t('恢复助手', 'Recovery assistant')}</h3>
      <p>${t('启动失败时，可以重试、切换 Profile、查看日志或修复配置。', 'Retry, switch Profiles, inspect logs or repair configuration after startup fails.')}</p>
      <div class="nextRow">${button('restart', '启动或重试', 'Start or retry')}${button('safe-mode', '进入安全模式…', 'Enter safe mode…')}${button('normal-mode', '退出安全模式…', 'Leave safe mode…')}</div>
      <p class="nextHint">${t('安全模式使用独立的临时环境，不载入原环境的第三方插件、补丁和凭据，并关闭远控、市场和浏览器访问。原有数据不变；退出后恢复原 Profile，临时环境会移除。', 'Safe mode uses a separate temporary environment, without the original third-party plugins, patches or credentials. Remote control, Market and browser access are disabled. Leaving restores the original Profile and removes the temporary environment.')}</p>
      <h3>${t('修复配置', 'Repair configuration')}</h3><p data-checkpoint class="nextHint"></p><div class="nextRow">${button('recover', '修复当前 Profile…', 'Repair current Profile…')}${button('rollback', '回滚 Profile 配置…', 'Restore Profile configuration…')}${button('repair-global', '停用全局补丁…', 'Disable global patch…')}${button('open-backups', '打开恢复备份', 'Open recovery backups')}</div>
      <p class="nextHint">${t('修复和回滚前会备份当前配置，保留已安装的插件文件、会话和凭据。Profile 回滚仅还原清单、Profile 补丁及附加功能开关，不回滚插件版本。全局补丁单独备份和停用。', 'Repair and rollback first back up the configuration and retain installed plugin files, sessions and credentials. Profile rollback restores the manifest, Profile patch and feature switches, not plugin versions. Global patches are backed up and disabled separately.')}</p>
      <div class="nextRow">${button('diagnostics', '导出诊断信息…', 'Export Diagnostics…')}${button('quit', '退出应用', 'Quit application')}</div>
    </section></section>
    <details><summary>${t('近期日志', 'Recent logs')}</summary><pre data-logs></pre></details>
    <footer><p data-version class="nextHint"></p><p data-home class="nextHint"></p><button type="button" data-refresh>${t('刷新状态', 'Refresh state')}</button></footer>
  </div>`
  const root = container.firstElementChild as HTMLElement
  const query = <T extends HTMLElement>(selector: string): T => root.querySelector<T>(selector)!
  let disposed = false
  let pending = false
  let current: DesktopState | undefined
  let portDraft = false
  let first = true
  let profileKey = ''
  let reading: Promise<void> | undefined
  const selectPage = (name: string): void => {
    root.querySelectorAll<HTMLElement>('[data-page]').forEach(page => { page.hidden = embedded ? page.dataset.page === 'recovery' : page.dataset.page !== name })
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab => { tab.setAttribute('aria-pressed', String(tab.dataset.tab === name)) })
  }
  const updateDisabled = (): void => {
    if (!current) return
    const state = current
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button,input,select').forEach(element => {
      const kind = element.dataset.command
      element.disabled = (pending || state.busy) && !element.dataset.tab && kind !== 'quit'
      if (kind === 'terminal') element.hidden = !['darwin', 'win32'].includes(state.platform)
      if (kind === 'reload') element.disabled ||= state.phase !== 'ready'
      if (kind === 'open-browser' || kind === 'copy-browser') element.disabled ||= !state.browserUrl
      if (kind === 'copy-lan' || kind === 'export-ca') element.hidden = state.lan?.state !== 'ready'
      if (kind === 'rollback') element.disabled ||= !state.checkpoint
      if (kind === 'safe-mode') element.disabled ||= state.safeMode
      if (kind === 'normal-mode') element.hidden = !state.safeMode
      if (kind === 'switch') element.disabled ||= state.unavailableProfiles.includes(element.dataset.name!) || element.dataset.name === state.selected && state.phase === 'ready' && !state.safeMode
      if (element.dataset.feature) element.disabled ||= state.safeMode
      if (element.hasAttribute('data-lan-access')) element.disabled ||= state.safeMode || !state.preferences.browserAccess
      const preference = element.dataset.preference
      if (preference && ['browserAccess', 'port', 'lanPort'].includes(preference)) element.disabled ||= state.safeMode
      if (preference === 'notifications') element.disabled ||= !state.notificationsAvailable
      if (preference && ['turnCompleted', 'turnFailed', 'jobCompleted', 'jobFailed'].includes(preference)) element.disabled ||= !state.notificationsAvailable || !state.preferences.notifications
    })
  }
  const render = (state: DesktopState): void => {
    current = state
    query('[data-status]').textContent = `${state.selected} · ${state.safeMode ? t('安全模式', 'Safe mode') + ' · ' : ''}${({ starting: t('启动中', 'Starting'), ready: t('运行中', 'Running'), error: t('需要恢复', 'Recovery needed'), recovery: t('恢复模式 · 工作环境尚未启动', 'Recovery mode · environment not started') })[state.phase]}`
    const failure = query('[data-failure]'); failure.textContent = state.failure; failure.hidden = !state.failure
    query('[data-home]').textContent = `${t('数据目录', 'Data directory')}: ${state.home}`
    query('[data-version]').textContent = `DSH Desktop Next ${state.version}`
    query('[data-logs]').textContent = state.logs.slice(-24_000) || t('暂无日志。', 'No logs yet.')
    query('[data-checkpoint]').textContent = state.checkpoint ? `${t('最近成功启动的配置', 'Last successful-start configuration')}: ${new Date(state.checkpoint.created).toLocaleString()}` : t('尚无成功启动的配置备份。', 'No successful-start configuration is available.')
    query('[data-tray-status]').textContent = state.trayAvailable ? t('可从托盘重新打开窗口。关闭此项后，关闭主窗口将退出应用。', 'Reopen the window from the tray. With this option off, closing the main window quits the app.') : t('系统托盘不可用，关闭主窗口将退出应用。', 'The system tray is unavailable. Closing the main window quits the app.')
    query('[data-notification-status]').textContent = state.notificationsAvailable ? t('仅在主窗口未聚焦时提醒，不包含会话内容。系统通知权限也需开启。', 'Notify while the main window is unfocused, without conversation text. System notification permission must also be enabled.') : t('当前系统不支持桌面通知。', 'Desktop notifications are unavailable on this system.')
    const mica = query<HTMLOptionElement>('[data-preference="windowsMaterial"] option[value="mica"]'); mica.disabled = mica.hidden = !state.windowsMicaSupported
    root.querySelectorAll<HTMLElement>('[data-platform]').forEach(element => { element.hidden = element.dataset.platform !== state.platform })
    const nextProfileKey = JSON.stringify([state.profiles, state.selected, state.unavailableProfiles])
    if (profileKey !== nextProfileKey) {
      profileKey = nextProfileKey
      query('[data-profiles]').replaceChildren(...state.profiles.map(name => {
        const row = document.createElement('div'); row.className = 'nextProfile'
        const select = document.createElement('button'); select.type = 'button'; select.className = 'dshDesktopSettingsChoice'; select.dataset.command = 'switch'; select.dataset.name = name
        select.setAttribute('role', 'radio'); select.setAttribute('aria-checked', String(name === state.selected)); select.dataset.selected = String(name === state.selected)
        const title = document.createElement('span'); title.className = 'dshDesktopSettingsChoiceTitle'; title.textContent = name
        if (name === state.selected) { const badge = document.createElement('span'); badge.className = 'dshDesktopSettingsBadge'; badge.textContent = t('当前使用', 'Active'); title.append(badge) }
        if (state.unavailableProfiles.includes(name)) { const badge = document.createElement('span'); badge.className = 'dshDesktopSettingsBadge'; badge.textContent = t('配置需要修复', 'Configuration needs repair'); title.append(badge) }
        select.append(title); row.append(select)
        if (name !== 'default' && name !== state.selected) { const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = t('移除', 'Remove'); remove.dataset.command = 'delete'; remove.dataset.name = name; remove.setAttribute('aria-label', t(`移除 Profile ${name}`, `Remove Profile ${name}`)); row.append(remove) }
        return row
      }))
    }
    root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-preference]').forEach(element => {
      if (portDraft && ['port', 'lanPort'].includes(element.dataset.preference!)) return
      const value = state.preferences[element.dataset.preference as keyof DesktopPreferences]
      if (element instanceof HTMLInputElement && element.type === 'checkbox') element.checked = value as boolean
      else element.value = String(value)
    })
    query<HTMLInputElement>('[data-lan-access]').checked = state.preferences.networkExposure === 'lan'
    root.querySelectorAll<HTMLButtonElement>('[data-feature]').forEach(element => { element.setAttribute('aria-checked', String(state.features[element.dataset.feature as keyof Features] === (element.dataset.value === 'true'))) })
    const lan = state.lan
    query('[data-network-panel]').hidden = !state.preferences.browserAccess || state.safeMode
    query('[data-network]').textContent = [state.browserUrl ?? t('浏览器服务尚未就绪。', 'Browser access is not ready.'), ...(lan?.state === 'ready' ? [...lan.addresses.map(address => `https://${address}:${lan.actualPort}`), `CA SHA-256: ${lan.caFingerprint}`] : lan?.state === 'failed' ? [`LAN HTTPS: ${lan.errorCode}`] : [])].join('\n')
    if (first) {
      selectPage(initialPage === 'create-profile' ? 'profiles' : initialPage && ['general', 'profiles', 'tools', 'recovery'].includes(initialPage) ? initialPage : state.failure || state.safeMode || state.phase === 'recovery' ? 'recovery' : 'general')
      first = false
      if (initialPage === 'create-profile') query<HTMLInputElement>('[name="profile"]').focus()
    }
    updateDisabled()
  }
  const refresh = (): Promise<void> => reading ??= bridge.state().then(state => { if (!disposed) render(state) }).finally(() => { reading = undefined })
  const report = (error: unknown): void => { if (!disposed) query('[data-notice]').textContent = error instanceof Error ? error.message : String(error) }
  const perform = async (command: DesktopCommand): Promise<boolean> => {
    if (disposed || pending && command.type !== 'quit') return false
    pending = true; updateDisabled(); query('[data-notice]').textContent = ''
    try {
      await reading
      await bridge.command(command)
      if (disposed) return true
      await refresh()
      if (command.type === 'copy-lan' || command.type === 'copy-browser') query('[data-notice]').textContent = t('登录链接已复制。', 'Login link copied.')
      return true
    } catch (error) { report(error); await refresh().catch(() => {}); return false }
    finally { pending = false; if (!disposed) updateDisabled() }
  }
  const savePreference = (key: keyof DesktopPreferences, value: unknown): void => {
    if (!current) return
    const preferences = { ...current.preferences, [key]: value }
    if (key === 'browserAccess' && value === false) preferences.networkExposure = 'loopback'
    void perform({ type: 'preferences', preferences })
  }
  root.onclick = event => {
    const element = (event.target as Element).closest<HTMLButtonElement>('button')
    if (!element || element.disabled) return
    if (element.dataset.tab) { selectPage(element.dataset.tab); return }
    if (element.hasAttribute('data-open-recovery')) { void perform({ type: 'controls', page: 'recovery' }); return }
    const feature = element.dataset.feature as keyof Features | undefined
    if (feature && current) {
      const value = element.dataset.value === 'true'
      if (current.features[feature] !== value) void perform({ type: 'features', features: { ...current.features, [feature]: value } })
      return
    }
    const type = element.dataset.command as DesktopCommand['type'] | undefined
    if (type) void perform(type === 'switch' || type === 'delete' ? { type, name: element.dataset.name! } : { type } as DesktopCommand)
    if (element.hasAttribute('data-refresh')) void refresh().catch(report)
  }
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-preference]').forEach(element => {
    if (element instanceof HTMLInputElement && element.type === 'number') { element.oninput = () => { portDraft = true }; return }
    element.onchange = () => savePreference(element.dataset.preference as keyof DesktopPreferences, element instanceof HTMLInputElement ? element.checked : element.value)
  })
  query<HTMLInputElement>('[data-lan-access]').onchange = event => savePreference('networkExposure', (event.target as HTMLInputElement).checked ? 'lan' : 'loopback')
  query<HTMLFormElement>('[data-form="ports"]').onsubmit = event => {
    event.preventDefault()
    if (!current) return
    void perform({ type: 'preferences', preferences: { ...current.preferences,
      port: Number(query<HTMLInputElement>('[data-preference="port"]').value), lanPort: Number(query<HTMLInputElement>('[data-preference="lanPort"]').value) } }).then(ok => {
      if (ok && !disposed) { portDraft = false; if (current) render(current) }
    })
  }
  query<HTMLFormElement>('[data-form="create"]').onsubmit = event => {
    event.preventDefault()
    const input = query<HTMLInputElement>('[name="profile"]'); const name = input.value.trim()
    void perform({ type: 'create', name }).then(async ok => {
      if (!ok || disposed) return
      input.value = ''
      if (initialPage === 'create-profile') await perform({ type: 'switch', name })
    })
  }
  selectPage('general')
  void refresh().catch(report)
  const timer = setInterval(() => { if (!document.hidden && !pending) void refresh().catch(report) }, 2000)
  return () => { disposed = true; clearInterval(timer); container.replaceChildren() }
}
