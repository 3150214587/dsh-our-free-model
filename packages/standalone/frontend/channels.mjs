import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { shared } from 'ofm-shared-client'
import { ChannelBrowser } from './components/channel-browser'
import 'ofm-shared-styles.css'

const { EacAuth, useEacLogin, DICT, Tank, usePool, poolReading, capacityText, CHANNEL_PROVIDERS, LedgerPage, LogsPage } = shared
const h = React.createElement
const t = key => DICT.zh[key] ?? key
t.locale = 'zh'
let requestLifetime = new AbortController()
const ctx = {
  connection: { rpc: {
    async call(_base, _method, payload, signal) {
      const lifetime = requestLifetime.signal
      const response = await fetch('/api/management/channels/rpc', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.any([signal, lifetime]), credentials: 'same-origin',
      })
      const result = await response.json()
      lifetime.throwIfAborted()
      if (response.status === 401) window.dispatchEvent(new CustomEvent('ofm:unauthorized'))
      if (!response.ok) throw new Error(result.error ?? '渠道请求失败')
      return result
    },
  } },
}
async function rpc(method, payload = {}) {
  const result = await ctx.connection.rpc.call('/api', 'channel-pack', { method, payload }, AbortSignal.timeout(180000))
  if (!result.ok) throw new Error(result.error?.message ?? '渠道操作失败')
  return result.value
}
const lockedProviders = new Set(['buddy', 'workbuddy', 'loomy'])

function ChannelTools({ summary }) {
  const [provider, setProvider] = React.useState('buddy')
  const [status, setStatus] = React.useState()
  const [lock, setLock] = React.useState()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [accounts, setAccounts] = React.useState([])
  const [account, setAccount] = React.useState('')
  const [nickname, setNickname] = React.useState('')
  const file = React.useRef()
  const generation = React.useRef(0)
  const actionPending = React.useRef(false)
  const mounted = React.useRef(true)
  const [messageKind, setMessageKind] = React.useState('status')
  const reload = React.useCallback(async () => {
    const started = ++generation.current
    const [statuses, value, nextLock] = await Promise.all([
      rpc('provider.status', { providers: [provider] }),
      rpc('account.list', { provider }),
      lockedProviders.has(provider) ? rpc('credits.permanentLock', { provider }) : undefined,
    ])
    if (started !== generation.current) return
    setStatus(statuses.statuses[provider])
    setAccounts(value.accounts)
    setLock(nextLock)
  }, [provider])
  React.useEffect(() => {
    setStatus(undefined); setLock(undefined); setAccounts([]); setAccount(''); setNickname(''); setMessage('')
    let active = true
    mounted.current = true
    void reload().catch(error => { if (active) { setMessage(error.message); setMessageKind('alert') } })
    return () => { active = false; mounted.current = false; generation.current++ }
  }, [reload])
  const run = async (action, successMessage = '已保存。') => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true); setMessage(''); setMessageKind('status')
    try {
      await action()
      if (!mounted.current) return
      window.dispatchEvent(new CustomEvent('ofm:channels'))
      summary.reload?.()
      try {
        await reload()
        if (mounted.current) setMessage(successMessage)
      } catch (error) {
        if (mounted.current) setMessage(successMessage + ' 状态刷新失败：' + error.message + '。可重新读取，无需重复提交。')
      }
    } catch (error) {
      if (mounted.current) { setMessage(error.message); setMessageKind('alert') }
    } finally {
      actionPending.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const backup = async () => {
    const value = await rpc('backup.export')
    const blob = new Blob([JSON.stringify(value.payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `ofm-channels-${new Date().toISOString().slice(0, 10)}.json`
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const importFile = async event => {
    const selected = event.target.files[0]
    event.target.value = ''
    if (!selected) return
    if (selected.size > 8 * 1024 * 1024) { setMessage('备份文件不能超过 8MB。'); return }
    if (!window.confirm('导入会合并备份中的账号凭据、模型开关和积分锁定设置，确认继续吗？')) return
    await run(async () => { await rpc('backup.import', { payload: JSON.parse(await selected.text()) }) })
  }
  return h('section', { className: 'ofm_hero', 'aria-label': '供应商与数据管理' },
    h('h3', null, '供应商与数据管理'),
    h('div', { className: 'ofm_row' },
      h('label', null, '供应商 ', h('select', { value: provider, disabled: busy, onChange: event => setProvider(event.target.value) },
        CHANNEL_PROVIDERS.map(row => h('option', { value: row.id, key: row.id }, row.name)))),
      h('button', { className: 'ofm_btn', disabled: busy || !status, onClick: () => run(() => rpc('provider.setEnabled', { provider, enabled: status.closed === true })) },
        status?.closed ? '启用供应商' : '关闭供应商'),
      lock ? h('label', null, h('input', { type: 'checkbox', checked: lock.locked === true, disabled: busy, onChange: event => run(() => rpc('credits.permanentLock', { provider, locked: event.target.checked })) }), ' 锁定永久积分') : null),
    lock ? h('p', { className: 'ofm_note' }, lock.windowDays ? `锁定后仅使用 ${lock.windowDays} 天内到期的积分；免费模型沿用原有豁免规则。` : '锁定后按原渠道规则保护永久积分。') : null,
    h('div', { className: 'ofm_row' },
      h('label', null, '账号 ', h('select', { value: account, disabled: busy, onChange: event => { setAccount(event.target.value); setNickname(accounts.find(row => row.id === event.target.value)?.nickname ?? '') } },
        h('option', { value: '' }, '选择账号'),
        accounts.map(row => h('option', { value: row.id, key: row.id }, row.nickname ?? row.id)))),
      h('input', { 'aria-label': '账号昵称', value: nickname, placeholder: '账号昵称', disabled: !account || busy, onChange: event => setNickname(event.target.value) }),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.update', { accountId: account, patch: { nickname } })) }, '保存昵称'),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.reorder', { provider, orderedIds: [account, ...accounts.filter(row => row.id !== account).map(row => row.id)] })) }, '优先使用'),
      h('button', { className: 'ofm_btn', disabled: !account || busy, onClick: () => run(() => rpc('account.reset', { accountId: account })) }, '重置限流标记')),
    h('div', { className: 'ofm_row ofm_acts' },
      h('button', { className: 'ofm_btn', disabled: busy, onClick: () => run(backup, '备份已生成，请在下载列表中查看。') }, '导出账号备份'),
      h('button', { className: 'ofm_btn', disabled: busy, onClick: () => file.current.click() }, '导入账号备份'),
      h('input', { ref: file, type: 'file', hidden: true, accept: '.json,application/json', onChange: importFile })),
    h('p', { className: 'ofm_note' }, '备份包含登录凭据，请保存在可信的本地位置。插件导出的原格式备份也可以手动导入。'),
    message ? h('div', { className: 'channel-tools-feedback' },
      h('p', { role: messageKind, className: 'ofm_note' }, message),
      h('button', { className: 'ofm_btn', disabled: busy, onClick: () => {
        setBusy(true)
        void reload().then(() => { if (mounted.current) { setMessage('状态已更新。'); setMessageKind('status') } })
          .catch(error => { if (mounted.current) { setMessage(error.message); setMessageKind('alert') } })
          .finally(() => { if (mounted.current) setBusy(false) })
      } }, '重新读取状态')) : null)
}

function ChannelConsole({ summary }) {
  const [page, setPage] = React.useState('accounts')
  return h(React.Fragment, null,
    h('header', { className: 'dashboard-heading' },
      h('div', null,
        h('h1', null, '免费账号渠道'), h('p', null, '连接你的账号，把各家的免费额度汇集到一个 API。'))),
    h('div', { className: 'ofm_seg', role: 'tablist', 'aria-label': '渠道管理页面' },
      [['accounts', '登录与账号池'], ['ledger', '渠道用量'], ['logs', '请求日志'], ['tools', '供应商与备份']].map(([id, name]) =>
        h('button', { key: id, id: 'channels-tab-' + id, role: 'tab', 'aria-selected': page === id,
          'aria-controls': 'channels-panel-' + id, tabIndex: page === id ? 0 : -1, onClick: () => setPage(id),
          onKeyDown: event => {
            const ids = ['accounts', 'ledger', 'logs', 'tools']
            const current = ids.indexOf(id)
            const next = event.key === 'ArrowRight' ? (current + 1) % ids.length : event.key === 'ArrowLeft' ? (current + ids.length - 1) % ids.length
              : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : -1
            if (next < 0) return
            event.preventDefault(); setPage(ids[next])
            requestAnimationFrame(() => document.getElementById('channels-tab-' + ids[next])?.focus())
          } }, name))),
    h('section', { role: 'tabpanel', id: 'channels-panel-' + page, 'aria-labelledby': 'channels-tab-' + page, tabIndex: 0 },
      page === 'accounts' ? h(ChannelBrowser, { rpc, summary })
        : page === 'ledger' ? h(LedgerPage, { t, ctx, summary })
          : page === 'logs' ? h(LogsPage, { t, ctx, summary })
            : h(ChannelTools, { summary })))
}

function EacPage({ summary }) {
  const [auth, onAuth] = React.useState(summary.eacAuth)
  const login = useEacLogin({ t, summary, onAuth })
  const { pool } = usePool()
  const reading = pool == null ? null : poolReading(pool)
  React.useEffect(() => { login.refresh() }, [login.refresh])
  return h(React.Fragment, null,
    h('header', { className: 'dashboard-heading' },
      h('div', null,
        h('h1', null, 'EAC 协付渠道'), h('p', null, '使用本机独立授权，连接共享资源池。'))),
    h(EacAuth, { t, auth, eacLogin: login }),
    h('div', { className: 'ofm_hero' },
      h('h3', null, 'EAC 实时资源池'),
      pool == null ? h('p', { role: pool === undefined ? 'status' : 'alert' }, pool === undefined ? '正在查询资源池…' : '资源池暂时无法查询，请稍后刷新。')
        : h(React.Fragment, null,
          h(Tank, { pct: reading.pct, level: reading.level, size: 'xl' }),
          h('p', null, `当前并发：${pool.inflight} · 24 小时活跃：${reading.active ?? '未知'} · 容量：${pool.pool ?? '未知'}`),
          h('p', null, capacityText(pool, t)))))
}

let root
export function show(kind, summary) {
  if (!root) {
    requestLifetime = new AbortController()
    root = createRoot(document.getElementById('channel-root'))
  }
  root.render(h(kind === 'eac' ? EacPage : ChannelConsole, { t, ctx, summary }))
}
export function hide() {
  requestLifetime.abort()
  if (root) { root.unmount(); root = undefined }
}
