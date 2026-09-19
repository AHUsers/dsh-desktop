const byId = id => document.getElementById(id)
const api = window.desktopNext
let running = false
function error(message) { byId('error').textContent = message; byId('error').hidden = !message }
async function refresh() {
  const state = await api.state()
  byId('status').textContent = `当前：${state.selected} · ${{ starting: '启动中', ready: '运行中', error: '需要恢复' }[state.phase]}`
  byId('profiles').replaceChildren(...state.profiles.map(name => {
    const option = document.createElement('option'); option.value = option.textContent = name; option.selected = name === state.selected; return option
  }))
  byId('market').checked = state.features.market
  byId('remote').checked = state.features.remoteControl
  byId('home').textContent = `Next 数据目录：${state.home}`
  error(state.failure)
}
async function perform(command) {
  if (running) return
  running = true
  document.querySelectorAll('button').forEach(button => { button.disabled = true })
  try { await api.command(command); await refresh() } catch (cause) { error(cause.message ?? String(cause)) }
  finally { running = false; document.querySelectorAll('button').forEach(button => { button.disabled = false }) }
}
byId('create').addEventListener('submit', event => { event.preventDefault(); void perform({ type: 'create', name: byId('name').value.trim() }) })
byId('switch').onclick = () => perform({ type: 'switch', name: byId('profiles').value })
byId('save').onclick = () => perform({ type: 'features', features: { market: byId('market').checked, remoteControl: byId('remote').checked } })
byId('restart').onclick = () => perform({ type: 'restart' })
byId('recover').onclick = () => perform({ type: 'recover' })
byId('refresh').onclick = () => refresh().catch(cause => error(String(cause)))
void refresh().catch(cause => error(String(cause)))
