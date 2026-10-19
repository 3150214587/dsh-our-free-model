import { Coffee, Activity, Boxes, Cable, ChevronRight, Handshake, LayoutDashboard, LogOut, Moon, Network, Settings2, ShieldCheck, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import brandMark from '../../../../icon.svg?inline'
import { Badge, Button } from './ui'
import type { Host, Page, Summary } from '../types'

const navigation = [
  { label: '工作空间', items: [
    { id: 'overview', name: '概览', icon: LayoutDashboard },
    { id: 'models', name: '模型清单', icon: Boxes },
    { id: 'usage', name: '用量统计', icon: Activity },
  ] },
  { label: '渠道与连接', items: [
    { id: 'channels', name: '免费账号渠道', icon: Network },
    { id: 'eac', name: 'EAC 协付渠道', icon: Handshake },
    { id: 'connection', name: 'API 接入', icon: Cable },
  ] },
  { label: '管理', items: [{ id: 'settings', name: '服务设置', icon: Settings2 }] },
  { label: '项目支持', items: [{ id: 'sponsor', name: '来自赞助商的广告', icon: Coffee }] },
] as const

type Origin = { x: number; y: number }
type Theme = 'light' | 'dark'
type ThemeTransition = ReturnType<Document['startViewTransition']>
const revealProperties = ['--theme-reveal-x', '--theme-reveal-y', '--theme-reveal-r'] as const

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const intent = useRef(theme)
  const transition = useRef<ThemeTransition | null>(null)
  const revision = useRef(0)
  const mounted = useRef(true)

  const clearReveal = () => {
    const root = document.documentElement
    root.classList.remove('theme-transitioning')
    revealProperties.forEach(property => root.style.removeProperty(property))
  }
  const stopTransition = () => {
    revision.current += 1
    transition.current?.skipTransition()
    transition.current = null
    clearReveal()
  }
  const apply = (next: Theme, persist = true) => {
    intent.current = next
    document.documentElement.dataset.theme = next
    if (persist) {
      try { localStorage.setItem('ofm-theme', next) } catch { /* 无可用存储时，本次会话仍可切换。 */ }
    }
    if (mounted.current) setTheme(next)
  }

  useEffect(() => {
    mounted.current = true
    const syncPreference = (event: StorageEvent) => {
      if (event.key !== 'ofm-theme' || (event.newValue !== 'dark' && event.newValue !== 'light')) return
      stopTransition()
      apply(event.newValue, false)
    }
    window.addEventListener('storage', syncPreference)
    return () => {
      mounted.current = false
      window.removeEventListener('storage', syncPreference)
      stopTransition()
    }
  }, [])

  const toggle = (origin?: Origin) => {
    const next: Theme = intent.current === 'dark' ? 'light' : 'dark'
    stopTransition()
    // 快速点击按用户意图切换，旧快照不能反过来覆盖新选择。
    intent.current = next
    if (!origin || typeof document.startViewTransition !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(next)
      return
    }
    const root = document.documentElement
    const version = ++revision.current
    const radius = Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y))
    root.style.setProperty('--theme-reveal-x', origin.x + 'px')
    root.style.setProperty('--theme-reveal-y', origin.y + 'px')
    root.style.setProperty('--theme-reveal-r', radius + 'px')
    root.classList.add('theme-transitioning')
    const finish = () => {
      if (version !== revision.current) return
      if (root.dataset.theme !== next) apply(next)
      transition.current = null
      clearReveal()
    }
    try {
      const current = document.startViewTransition(() => {
        if (version === revision.current) flushSync(() => apply(next))
      })
      transition.current = current
      // 被下一次点击跳过时 ready 会拒绝；finished 仍负责最终清理。
      void current.ready.catch(() => {})
      void current.finished.then(finish, finish)
    } catch {
      apply(next)
      finish()
    }
  }
  return { theme, toggle }
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const label = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'
  return <Button variant="ghost" size="icon" className="theme-toggle" aria-label={label} title={theme === 'dark' ? '浅色' : '深色'}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); toggle({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) }}>
    <span className="theme-toggle-track" data-theme={theme}>
      <span className="theme-toggle-icon theme-toggle-sun" aria-hidden="true"><Sun size={16} /></span>
      <span className="theme-toggle-icon theme-toggle-moon" aria-hidden="true"><Moon size={16} /></span>
    </span>
  </Button>
}

export const pageNames: Record<Page, string> = {
  overview: '概览', models: '模型清单', usage: '用量统计', channels: '免费账号渠道',
  eac: 'EAC 协付渠道', settings: '服务设置', connection: 'API 接入', sponsor: '来自赞助商的广告',
}

export function Sidebar({ page, summary, host }: { page: Page; summary?: Summary; host: Host }) {
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const element = nav.current
    if (!element) return
    let frame = 0
    const revealSelected = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const selected = element.querySelector<HTMLElement>('[aria-current="page"]')
        if (!selected) return
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        const item = selected.getBoundingClientRect()
        if (!window.matchMedia('(max-width: 700px)').matches) {
          const sidebar = element.closest<HTMLElement>('.sidebar')
          if (!sidebar) return
          const bounds = sidebar.getBoundingClientRect()
          const delta = item.top < bounds.top ? item.top - bounds.top - 12
            : item.bottom > bounds.bottom ? item.bottom - bounds.bottom + 12 : 0
          if (delta) sidebar.scrollBy({ top: delta, behavior })
          return
        }
        const bounds = element.getBoundingClientRect()
        const delta = item.left < bounds.left ? item.left - bounds.left - 12
          : item.right > bounds.right ? item.right - bounds.right + 12 : 0
        if (delta) element.scrollTo({ left: element.scrollLeft + delta,
          behavior })
      })
    }
    revealSelected()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(revealSelected) : null
    observer?.observe(element)
    window.addEventListener('resize', revealSelected)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', revealSelected) }
  }, [page])

  return <>
    <button type="button" className="console-brand" onClick={() => host.navigate('overview')} aria-label="Our Free Model 首页">
      <img className="console-mark" src={brandMark} alt="" width={34} height={36} />
      <span className="console-brand-copy">Our Free Model<small>本地模型工作台</small></span>
    </button>
    <div className="workspace-switch"><span className="workspace-avatar"><ShieldCheck size={17} /></span>
      <span className="workspace-copy">个人工作空间<small>独立本地服务</small></span><Badge>本机</Badge>
    </div>
    <nav className="console-nav" ref={nav} aria-label="管理导航">{navigation.map(group => <div className="nav-group" key={group.label}>
      <span className="nav-group-label">{group.label}</span>
      {group.items.map(item => <button type="button" key={item.id} id={item.id === 'sponsor' ? 'ofm-sponsor-menu-desktop' : undefined}
        className={'console-nav-item ' + (item.id === 'sponsor' ? 'ofm-sponsor-nav ' : '') + (page === item.id ? 'selected' : '')}
        aria-current={page === item.id ? 'page' : undefined} onClick={() => host.navigate(item.id)}>
        <span className="console-nav-indicator" aria-hidden="true" />
        <item.icon size={18} strokeWidth={1.7} /><span>{item.name}</span>
        {item.id === 'models' && <span className="count-badge">{summary?.catalog.length ?? '—'}</span>}
      </button>)}
    </div>)}</nav>
    <div className="sidebar-support"><ShieldCheck size={17} /><div><strong>独立本地存储</strong><p>本机运行 / 仅监听回环地址</p></div></div>
    <div className="console-sidebar-footer"><div><span className="status-dot" aria-hidden="true" /><span>本地服务</span><small>v{summary?.version ?? '—'}</small></div>
      <ThemeToggle /><Button variant="ghost" size="icon" aria-label="退出管理" title="退出管理" onClick={() => { void host.logout().catch(host.error) }}><LogOut size={16} /></Button></div>
  </>
}

export function Topbar({ page, summary }: { page: Page; summary?: Summary }) {
  return <><div className="console-breadcrumb"><span>工作空间</span><ChevronRight size={14} /><strong key={page} className="console-breadcrumb-current">{pageNames[page]}</strong></div>
    <div className="console-topbar-status"><span className={'status-dot' + (summary?.settings.enabled === false ? ' paused' : '')} aria-hidden="true" /><span>{summary?.settings.enabled === false ? '推理已暂停' : '本地服务'}</span><span className="topbar-divider" /><span>LOCAL</span></div></>
}
