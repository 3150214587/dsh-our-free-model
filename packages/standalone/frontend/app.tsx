import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Sidebar, Topbar } from './components/shell'
import { Overview } from './components/overview'
import { Connection } from './connection'
import type { Host, Page, ServiceSettings, Snapshot } from './types'
import './app.css'
import { SponsorPage, SponsorBanner } from './sponsor'

const API = '/api/management'
const pageNames: Page[] = ['overview', 'models', 'usage', 'channels', 'eac', 'settings', 'connection', 'sponsor']
const platform = document.getElementById('root')?.dataset.loginPlatform ?? (/Windows/i.test(navigator.userAgent) ? 'windows' : /Macintosh|Mac OS/i.test(navigator.userAgent) ? 'macos' : 'unsupported')
const terminalName = platform === 'windows' ? 'PowerShell' : '终端'
type Request = <T = any>(path: string, body?: unknown, timeoutMs?: number, signal?: AbortSignal) => Promise<T>
const messageOf = (error: unknown) => error instanceof Error ? error.name === 'TimeoutError' ? '请求超时，请检查服务是否仍在运行。' : error.message : '请求失败，请重试。'

function LoginScreen({ request, reason = '', reconnect }: { request: Request; reason?: string; reconnect?: () => Promise<void> }) {
  const [key, setKey] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { setError(reason) }, [reason])
  const command = platform === 'windows'
    ? '(Get-Content -LiteralPath "$env:USERPROFILE\\.our-free-model\\settings.json" -Raw -Encoding UTF8 | ConvertFrom-Json).forwardKey | Set-Clipboard'
    : platform === 'macos'
      ? `node -e 'const fs = require("node:fs"); const {execFileSync} = require("node:child_process"); const key = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).forwardKey; if (typeof key !== "string" || !key.trim()) throw new Error("missing login token"); execFileSync("/usr/bin/pbcopy", [], {input: key});' "$HOME/.our-free-model/settings.json"`
      : `node -e 'const fs = require("node:fs"); const key = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).forwardKey; if (typeof key !== "string" || !key.trim()) throw new Error("missing login token"); process.stdout.write(key + "\\n");' "$HOME/.our-free-model/settings.json"`
  const submit = async (event: FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await request('/session', { key: key.trim() }); setKey(''); window.dispatchEvent(new CustomEvent('ofm:logged-in')) } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) } }
  const openTerminal = async () => { if (platform === 'unsupported' || busy) return; setBusy(true); setStatus(`正在本机打开${terminalName}…`); try { await request('/login/terminal', {}, 15000); setStatus(`已请求打开${terminalName}。窗口提示复制成功后，回到这里粘贴令牌。`); document.getElementById('login-key')?.focus() } catch (reason) { setStatus(`${messageOf(reason)}。可以展开下方的手动获取说明。`) } finally { setBusy(false) } }
  const copyCommand = async () => { try { await navigator.clipboard.writeText(command); setStatus(`命令已复制。在${terminalName}执行后，回到这里粘贴令牌。`) } catch { const input = document.getElementById('login-command') as HTMLTextAreaElement | null; input?.focus(); input?.select(); setStatus(`浏览器未允许复制，已选中命令，请按 ${platform === 'macos' ? 'Command+C' : 'Ctrl+C'} 手动复制。`) } }
  return <section id="login-screen" className="login-shell" data-testid="login-screen"><div className="login-card login-card-enter"><span className="login-card-glow" aria-hidden="true" /><div className="brand-mark" aria-hidden="true">ofm<span>.</span></div>
    <span className="eyebrow">OUR FREE MODEL / LOCAL CONSOLE</span><h1>连接你的本地服务</h1><p>使用启动时打印的一次性链接，或输入保存在本机的登录令牌。</p>
    <form id="login-form" onSubmit={event => { void submit(event) }}><label htmlFor="login-key">登录令牌（API Key）</label><input id="login-key" name="key" type="password" autoComplete="off" placeholder="ofm-…" required value={key} onChange={event => setKey(event.target.value)} /><button className={"primary" + (busy ? " is-busy" : "")} type="submit" disabled={busy}>{busy && <span className="ui-spinner" aria-hidden="true" />}<span className="login-submit-label">进入控制台</span> <span aria-hidden="true">→</span></button></form>
    {error && <div id="login-error" role="alert" className="error login-error-enter"><p>{error}</p>{reconnect && reason && reason !== '已退出管理' && <button type="button" className="text-button" disabled={busy} onClick={() => { setBusy(true); void reconnect().catch(value => setError(messageOf(value))).finally(() => setBusy(false)) }}>重新连接服务</button>}</div>}<div className="login-help"><h2>没有令牌？从本机获取</h2><p id="login-terminal-help">{platform === 'unsupported' ? '当前系统不支持自动打开终端，请展开下方说明手动获取令牌。' : `点击下方按钮，会打开${terminalName}并将当前服务的令牌复制到剪贴板。回来粘贴到上方即可。`}</p>
      <button id="login-terminal" className="secondary" type="button" data-login-platform={platform} disabled={platform === 'unsupported' || busy} onClick={() => void openTerminal()}>打开{platform === 'windows' ? ' PowerShell ' : '终端'}获取令牌 ↗</button><p id="login-help-status" role="status">{status}</p><details><summary>手动获取与其他系统</summary><p>默认位置：用户目录下的 <code>.our-free-model/settings.json</code>，取 <code>forwardKey</code> 字段。</p><label id="login-command-label" htmlFor="login-command">获取令牌命令（默认目录）</label><textarea id="login-command" readOnly rows={4} spellCheck={false} value={command} /><button id="copy-login-command" className="text-button" type="button" onClick={() => void copyCommand()}>复制获取令牌命令</button></details></div><small>登录仅用于本机管理。会话在 8 小时后或服务重启后失效。</small></div></section>
}
function LoadingScreen() { return <div id="loading-screen" className="loading-screen"><div className="loading-inner"><div className="brand-mark loading-brand">ofm<span>·</span></div><span className="loading-bar" aria-hidden="true"><span className="loading-bar-fill" /></span><p>正在连接本地服务…</p></div></div> }
function PageLoadFailure({ error }: { error: string }) {
  return <div className="page-load-failure" role="alert"><AlertCircle size={22} aria-hidden="true" /><div><h2>这个页面暂时没有载入</h2><p>请确认本地服务仍在运行，然后重新加载。其他页面和已保存的数据不受影响。</p><div className="notice-actions"><button type="button" className="secondary" onClick={() => window.location.reload()}>重新加载应用</button></div><details><summary>查看错误详情</summary><p>{error}</p></details></div></div>
}
function ChannelMount({ kind, summary }: { kind: 'channels' | 'eac'; summary: Snapshot['summary'] & { reload(): void } }) {
  const [module, setModule] = useState<typeof import('./channels.mjs')>()
  const [loadError, setLoadError] = useState('')
  const generation = useRef(0), summaryRef = useRef(summary)
  summaryRef.current = summary
  useEffect(() => {
    const current = ++generation.current
    let alive = true
    setLoadError('')
    void import('./channels.mjs').then(value => {
      if (alive && current === generation.current) setModule(value)
    }).catch(reason => { if (alive && current === generation.current) setLoadError(messageOf(reason)) })
    return () => { alive = false; generation.current++ }
  }, [kind])
  useEffect(() => {
    if (!module) return
    try { module.show(kind, summaryRef.current) } catch (reason) { setLoadError(messageOf(reason)) }
    return () => module.hide()
  }, [module, kind])
  return <div className="channel-mount"><div id="channel-root" className="ofm_root" role={module ? undefined : 'status'}>{module ? null : loadError ? null : '正在加载渠道管理…'}</div>{loadError && <PageLoadFailure error={loadError} />}</div>
}
function LazyPage({ name, snapshot, host, active }: { name: 'models' | 'usage' | 'settings'; snapshot: Snapshot; host: Host; active: boolean }) {
  const [module, setModule] = useState<any>()
  const [loadError, setLoadError] = useState('')
  useEffect(() => {
    let alive = true
    setLoadError('')
    const loaded = name === 'models' ? import('./models') : name === 'usage' ? import('./usage') : import('./settings')
    void loaded.then(value => { if (alive) setModule(value) }).catch(reason => { if (alive) setLoadError(messageOf(reason)) })
    return () => { alive = false }
  }, [name])
  if (loadError) return <PageLoadFailure error={loadError} />
  if (!module) return <div className="page-load-skeleton" role="status"><span aria-hidden="true" /><span aria-hidden="true" /><p>正在加载页面…</p></div>
  const Component = module[name === 'models' ? 'Models' : name === 'usage' ? 'Usage' : 'Settings']
  return <Component summary={snapshot.summary} stats={snapshot.stats} host={host} active={active} />
}
function App() {
  const [mode, setMode] = useState<'loading' | 'login' | 'ready'>('loading')
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [page, setPage] = useState<Page>(() => {
    const saved = new URLSearchParams(location.hash.slice(1)).get('page') as Page
    return pageNames.includes(saved) ? saved : 'overview'
  })
  const [notice, setNotice] = useState(''), [error, setError] = useState('')
  const [connection, setConnection] = useState<'ready' | 'stale' | 'reconnecting'>('ready')
  const [visited, setVisited] = useState<Page[]>(() => [page])
  const generation = useRef(0), loading = useRef<Promise<void> | undefined>(undefined)
  const authenticated = useRef(false), settingsRevision = useRef(0)
  const enterLogin = (reason = '') => {
    generation.current++; loading.current = undefined; authenticated.current = false
    setSnapshot(undefined); setVisited([]); setPage('overview'); setError(reason); setNotice(''); setMode('login')
    if (typeof history.replaceState === 'function') history.replaceState(null, '', location.pathname + location.search)
  }
  const request: Request = async (path, body, timeoutMs = 10000, signal) => {
    const current = generation.current
    const response = await fetch(API + path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    })
    const value = await response.json()
    if (!response.ok) {
      const reason = Object.assign(new Error(value.error ?? `请求失败（${response.status}）`), { status: response.status })
      if (current === generation.current && response.status === 401 && path !== '/session') enterLogin(reason.message)
      throw reason
    }
    if (current !== generation.current) throw new Error('管理会话已变化，请重新操作。')
    return value
  }
  const loadData = async () => {
    if (loading.current) return loading.current
    const current = generation.current, revision = settingsRevision.current
    const pending = Promise.all([request('/summary'), request('/stats')]).then(([summary, stats]) => {
      if (current !== generation.current) return
      setSnapshot(previous => ({ summary: revision !== settingsRevision.current && previous ? { ...summary, settings: previous.summary.settings } : summary, stats }))
      authenticated.current = true; setMode('ready'); setConnection('ready'); setError('')
    }).finally(() => { if (loading.current === pending) loading.current = undefined })
    loading.current = pending
    return pending
  }
  const reconnect = async () => {
    const current = generation.current
    setConnection('reconnecting')
    try { await loadData() } catch (reason) {
      if (current === generation.current) { setConnection('stale'); setError(messageOf(reason)) }
    }
  }
  const navigate = (next: Page, push = true) => {
    if (!pageNames.includes(next)) return
    setPage(next); setVisited(previous => previous.includes(next) ? previous : [...previous, next]); setNotice('')
    if (push && next !== page && typeof history.pushState === 'function') history.pushState({ ofmPage: next }, '', `${location.pathname}${location.search}#page=${next}`)
  }
  const host = useMemo<Host>(() => ({
    navigate: next => navigate(next), refresh: async () => { await loadData() },
    copy: async value => { await navigator.clipboard.writeText(value); setNotice('已复制到剪贴板') },
    getApiKey: async () => (await request<{ key: string }>('/key')).key,
    rotateKey: async () => (await request<{ key: string }>('/key/rotate', { confirm: true })).key,
    logout: async () => { await request('/logout', {}); enterLogin('已退出管理') },
    error: reason => setError(messageOf(reason)),
    testModel: (model, signal) => request('/models/test', { model }, 70000, signal),
    refreshModels: async (probe, signal) => { await request('/models/refresh', { probe }, 300000, signal); if (!signal.aborted) await loadData() },
    saveSettings: async (settings: Partial<ServiceSettings>) => {
      const value = await request<{ settings: ServiceSettings }>('/settings', settings)
      settingsRevision.current++
      setSnapshot(previous => previous ? { ...previous, summary: { ...previous.summary, settings: value.settings } } : previous)
      return value.settings
    },
  }), [page])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [page])
  useEffect(() => {
    const onPopState = () => {
      const next = new URLSearchParams(location.hash.slice(1)).get('page') as Page
      navigate(pageNames.includes(next) ? next : 'overview', false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
  useEffect(() => {
    const onUnauthorized = () => enterLogin('管理会话已失效，请重新登录')
    window.addEventListener('ofm:unauthorized', onUnauthorized)
    return () => window.removeEventListener('ofm:unauthorized', onUnauthorized)
  }, [])
  useEffect(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get('login')
    if (token) history.replaceState(null, '', location.pathname + location.search)
    void (async () => {
      try { if (token) await request('/session', { bootstrapToken: token }); await loadData() }
      catch (reason) {
        const status = (reason as any)?.status
        // request() 已在无效会话的 401 分支保留了明确原因；不要用空字符串覆盖它。
        if (status === 401 && !token) return
        enterLogin(messageOf(reason))
      }
    })()
  }, [])
  useEffect(() => {
    if (mode !== 'ready') return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      const current = generation.current
      void loadData().catch(reason => { if (current === generation.current) { setConnection('stale'); setError(messageOf(reason)) } })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [mode])
  const content: ReactNode = snapshot && page === 'sponsor' ? <SponsorPage />
    : snapshot && page === 'overview' ? <Overview {...snapshot} host={host} />
      : snapshot && page === 'connection' ? <Connection summary={snapshot.summary} host={host} active />
        : snapshot && (page === 'channels' || page === 'eac') ? <ChannelMount key={page} kind={page} summary={{ ...snapshot.summary, reload: () => { void reconnect() } }} /> : null
  if (mode === 'loading') return <LoadingScreen />
  if (mode === 'login') return <LoginScreen reason={error} reconnect={reconnect} request={async (...args) => { const result = await request(...args); if (args[0] === '/session') await loadData(); return result }} />
  return <div id="app" className="app-shell" data-connection={connection}>
    <a className="skip-link" href="#ofm-main-content" onClick={event => { event.preventDefault(); document.getElementById('ofm-main-content')?.focus() }}>跳到主要内容</a>
    <aside className="sidebar"><Sidebar page={page} summary={snapshot?.summary} host={host} /></aside>
    <main id="ofm-main-content" tabIndex={-1}>
      <header className="topbar"><Topbar page={page} summary={snapshot?.summary} /></header>
      {snapshot?.summary.networkMode === 'fixture' && <div className="notice test-mode-notice" role="status">当前为本机替身测试模式：账号、模型回答与额度均为测试数据。</div>}
      {notice && <div className="notice notice-enter" role="status">{notice}<button type="button" className="text-button" onClick={() => setNotice('')}>关闭</button></div>}
      {error && <div className="notice error-notice app-reconnect" role="alert"><AlertCircle size={16} /><div><strong>{connection === 'stale' ? '连接暂时中断，正在显示上次读取的数据' : '操作未完成'}</strong><p>{error}</p></div><div className="notice-actions"><button type="button" className="text-button" disabled={connection === 'reconnecting'} onClick={() => { void reconnect() }}>{connection === 'reconnecting' ? '正在重新连接…' : '重新连接服务'}</button><button type="button" className="text-button" onClick={() => setError('')}>关闭提示</button></div></div>}
      <section className="page"><SponsorBanner onDetails={() => host.navigate('sponsor')} detailsActive={page === 'sponsor'} />{content}
        {snapshot && (['models', 'usage', 'settings'] as const).filter(name => visited.includes(name) || name === page).map(name => <div key={name} hidden={page !== name}><LazyPage name={name} snapshot={snapshot} host={host} active={page === name} /></div>)}
      </section>
      <footer>OUR FREE MODEL <span>·</span> 本地运行 · 由你掌控</footer>
    </main>
  </div>
}
createRoot(document.getElementById('root')!).render(<App />)
