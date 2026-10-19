import { useEffect, useRef, useState } from 'react'
import { Cable, Check, CircleCheck, Copy, Eye, EyeOff, KeyRound, Link2, LockKeyhole, RotateCcw, ShieldAlert, Terminal } from 'lucide-react'
import { Button, Card } from './components/ui'
import type { Host, Summary } from './types'
import './settings.css'

type ExampleShell = 'curl' | 'powershell'
export function Connection({ summary, host, active }: { summary: Summary; host: Host; active: boolean }) {
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [shell, setShell] = useState<ExampleShell>(() => /Windows/i.test(navigator.userAgent) ? 'powershell' : 'curl')
  const pending = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)
  const activeRef = useRef(active)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  activeRef.current = active
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; generation.current++; if (copyTimer.current) clearTimeout(copyTimer.current) }
  }, [])
  useEffect(() => {
    if (!active) { generation.current++; pending.current = false; setApiKey(''); setCopied(''); setBusy(false); setNotice(''); setError('') }
  }, [active])
  const endpoint = summary.baseUrl + '/v1'
  const model = summary.catalog.find(row => row.routable)?.id ?? 'MODEL_ID'
  const body = JSON.stringify({ model, messages: [{ role: 'user', content: '你好' }] })
  const example = shell === 'powershell' ? [
    '$headers = @{ Authorization = "Bearer YOUR_API_KEY" }',
    "$body = @'", body, "'@",
    'Invoke-RestMethod -Method Post -Uri "' + endpoint + '/chat/completions" -Headers $headers -ContentType "application/json" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))',
  ].join('\n') : [
    'curl ' + endpoint + '/chat/completions \\',
    '  -H "Authorization: Bearer YOUR_API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '" + body + "'",
  ].join('\n')
  const run = async (action: (isCurrent: () => boolean) => Promise<void>, message = '') => {
    if (pending.current || !activeRef.current) return
    const started = ++generation.current
    const isCurrent = () => mounted.current && activeRef.current && generation.current === started
    pending.current = true
    setBusy(true); setNotice(''); setError('')
    try { await action(isCurrent); if (isCurrent() && message) setNotice(message) }
    catch (reason) { if (isCurrent()) setError(reason instanceof Error ? reason.message : '操作失败，请重试。') }
    finally { if (isCurrent()) { pending.current = false; setBusy(false) } }
  }
  const markCopied = (id: string) => {
    if (copyTimer.current) clearTimeout(copyTimer.current)
    setCopied(id)
    copyTimer.current = setTimeout(() => { if (mounted.current && activeRef.current) setCopied('') }, 1800)
  }
  const copy = (id: string, text: string, message: string) => run(async isCurrent => {
    try { await host.copy(text) } catch {
      if (isCurrent() && id === 'endpoint') {
        const field = document.getElementById('connection-endpoint') as HTMLInputElement | null
        field?.focus(); field?.select()
      }
      throw new Error(id === 'endpoint' ? '浏览器未允许复制，已选中地址，可手动复制。' : '浏览器未允许复制，请选中示例后手动复制。')
    }
    if (isCurrent()) markCopied(id)
  }, message)
  const copyKey = () => void run(async isCurrent => {
    const key = apiKey || await host.getApiKey()
    if (!isCurrent()) return
    try { await host.copy(key) } catch { throw new Error('浏览器未允许复制密钥。可点击“查看密钥”后选中文字手动复制。') }
    if (isCurrent()) markCopied('key')
  }, '密钥已复制，页面保持当前遮罩状态。')
  const toggleKey = () => void run(async isCurrent => {
    if (apiKey) { setApiKey(''); return }
    const key = await host.getApiKey()
    if (isCurrent()) setApiKey(key)
  })
  const rotate = () => {
    if (pending.current || !window.confirm('轮换后旧 API Key 会立即失效，确认继续吗？')) return
    void run(async isCurrent => { const key = await host.rotateKey(); if (isCurrent()) setApiKey(key) }, '密钥已轮换，请更新所有客户端配置。')
  }
  if (!active) return null
  return <div className="connection-browser" data-testid="connection-ready">
    <header className="dashboard-heading"><div><h1>API 接入</h1><p>复制连接信息，在你的工具中选择 OpenAI 兼容接口。</p></div><Cable size={22} aria-hidden="true" /></header>
    {notice && <p className="connection-feedback" role="status"><CircleCheck size={15} />{notice}</p>}
    {error && <p className="connection-error" role="alert"><ShieldAlert size={16} />{error}</p>}
    <Card className="connection-card"><div className="connection-card-heading"><span className="cx-icon"><KeyRound size={16} /></span><div><h2>连接凭据</h2><p>管理会话与推理密钥相互独立。</p></div></div>
      <label className="field-label" htmlFor="connection-endpoint">API Base URL</label>
      <div className="copy-field"><div className="cx-field"><Link2 size={14} /><input id="connection-endpoint" readOnly value={endpoint} /></div>
        <Button variant="outline" className={copied === 'endpoint' ? 'cx-copied' : undefined} disabled={busy} onClick={() => void copy('endpoint', endpoint, '地址已复制。')}>{copied === 'endpoint' ? <Check size={14} /> : <Copy size={14} />}复制地址</Button></div>
      <label className="field-label" htmlFor="connection-key">API Key</label>
      <div className="copy-field"><div className={'cx-field' + (apiKey ? ' cx-revealed' : '')}><LockKeyhole size={14} /><input id="connection-key" type={apiKey ? 'text' : 'password'} readOnly value={apiKey} placeholder="密钥已保护，可直接复制" /></div>
        <Button variant="outline" disabled={busy} onClick={toggleKey} aria-controls="connection-key" aria-pressed={!!apiKey}>{apiKey ? <EyeOff size={14} /> : <Eye size={14} />}{apiKey ? '隐藏密钥' : '查看密钥'}</Button>
        <Button variant="outline" className={copied === 'key' ? 'cx-copied' : undefined} disabled={busy} onClick={copyKey}>{copied === 'key' ? <Check size={14} /> : <Copy size={14} />}复制</Button></div>
      <p className="footnote">密钥用于客户端调用；无需显示即可复制，离开接入页后会清除页面中的明文。</p>
      {busy && <span className="connection-operation" role="status">正在处理，请稍候…</span>}
    </Card>
    <Card className="connection-card"><div className="connection-card-heading"><span className="cx-icon"><Terminal size={16} /></span><div><h2>快速开始</h2><p>将 YOUR_API_KEY 替换为上方密钥，示例中不会自动填入真实密钥。</p></div>
      <Button variant="ghost" className={copied === 'example' ? 'cx-copied' : undefined} disabled={busy} onClick={() => void copy('example', example, '示例已复制。')}>{copied === 'example' ? <Check size={14} /> : <Copy size={14} />}复制示例</Button></div>
      <div className="connection-example-tabs channel-filters" role="group" aria-label="示例执行环境">{([['powershell', 'PowerShell'], ['curl', 'cURL / Bash']] as const).map(([id, label]) => <button key={id} aria-pressed={shell === id} onClick={() => setShell(id)}>{label}</button>)}</div>
      <pre className="connection-example cx-code" tabIndex={0} aria-label={shell === 'powershell' ? 'PowerShell 调用示例' : 'cURL 调用示例'}>{example}</pre>
    </Card>
    <Card className="connection-card connection-danger"><div className="connection-card-heading"><span className="cx-icon cx-icon-danger"><ShieldAlert size={16} /></span><div><h2>轮换 API Key</h2><p>旧密钥会立即失效，所有已接入的客户端都需要更新。</p></div></div>
      <Button variant="outline" className="cx-danger-btn" disabled={busy} onClick={rotate}><RotateCcw size={15} />轮换密钥</Button></Card>
  </div>
}
