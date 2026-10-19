/** 三套前端重建的恢复流程与宽窄布局验收；仅本机替身、真实网页资源。 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createManagement } from '../packages/standalone/management.mjs'
import { buildStats } from '../src/core/stats.js'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.OFM_PLAYWRIGHT_MODULE ?? 'playwright')
const output = process.env.OFM_REDESIGN_OUTPUT ?? path.resolve('.verify/frontend-redesign')
fs.mkdirSync(output, { recursive: true })
const management = createManagement({ stores: { settings: { get: () => ({ forwardKey: 'isolated' }) } }, info: () => ({}) })
const server = http.createServer((req, res) => { void management.handleRequest(req, res) })
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
management.setPort(server.address().port)
const browser = await chromium.launch({ headless: true, ...(process.env.OFM_BROWSER_PATH ? { executablePath: process.env.OFM_BROWSER_PATH } : {}) })
const checks = [], errors = []
const check = (label, value) => { assert.ok(value, label); checks.push(label) }
const baseSettings = { enabled: true, exposeRegionModels: true, hideFreeModels: false, hideEacModels: false, streamRecovery: true, standaloneProbe: false, defaultMaxTokens: 32768, probeIntervalMinutes: 15 }
const labels = ['概览', '模型清单', '用量统计', '免费账号渠道', 'EAC 协付渠道', 'API 接入', '服务设置', '来自赞助商的广告']
async function fixture(theme = 'light', options = {}) {
  const state = { settings: { ...baseSettings }, failSummary: false, login: true, key: 'ofm-private-test-key', ...options }
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' })
  await context.addInitScript(theme => { localStorage.setItem('ofm-theme', theme); localStorage.setItem('ofm.sponsor.banner-collapsed.v1', '1') }, theme)
  await context.route('**/api/management/**', route => {
    const body = route.request().postDataJSON(), endpoint = new URL(route.request().url()).pathname.split('/api/management')[1]
    const answer = (value, status = 200) => route.fulfill({ status, json: value })
    if (endpoint === '/session') { state.login = body.key === state.key; return answer(state.login ? { ok: true } : { error: '登录令牌无效' }, state.login ? 200 : 401) }
    if (!state.login) return answer({ error: '管理会话已失效，请重新登录' }, 401)
    if (endpoint === '/summary') return state.failSummary ? answer({ error: '本地服务暂时不可达' }, 503) : answer({ version: '2.5.4', baseUrl: origin, dataDir: 'isolated', networkMode: 'fixture', automaticRefresh: false, catalogSyncedAt: Date.now(), settings: { ...state.settings }, channels: { state: 'ready' }, eacAuth: { local: false }, catalog: Array.from({ length: 40 }, (_, i) => ({ id: `fixture/model-${i}`, name: `测试模型 ${i}`, channel: 'anonymous', routable: true, availability: 'available', contextWindow: 128000 })) })
    if (endpoint === '/stats') return answer(buildStats({}, []))
    if (endpoint === '/settings') { Object.assign(state.settings, body); return answer({ settings: { ...state.settings } }) }
    if (endpoint === '/key') return answer({ key: state.key })
    if (endpoint === '/key/rotate') { state.key = 'ofm-rotated-test-key'; return answer({ key: state.key }) }
    if (endpoint === '/logout') { state.login = false; return answer({ ok: true }) }
    if (endpoint === '/eac/status') return answer({ available: true, authorized: false, local: false })
    if (endpoint === '/eac/pool') return answer({ inflight: 1, pool: 100, active24h: 12 })
    if (endpoint === '/channels/rpc') return answer({ ok: true, value: body.method === 'provider.status' ? { statuses: Object.fromEntries(body.payload.providers.map(id => [id, { accounts: { total: 0, enabled: 0 } }])) } : body.method === 'usage.autoCheckin' ? { autoCheckin: { enabled: false } } : body.method === 'usage.tokenLedger' ? { entries: [] } : {} })
    return answer({ ok: true })
  })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  const nav = async label => { const item = page.locator('.console-nav-item').filter({ hasText: label }); await item.click(); await page.waitForTimeout(80) }
  return { context, page, state, nav }
}
try {
  const first = await fixture('light', { failSummary: true })
  await first.page.goto(origin)
  await first.page.getByTestId('login-screen').waitFor()
  check('初次连接失败原因在登录页清楚显示', await first.page.getByRole('alert').innerText().then(value => value.includes('本地服务暂时不可达')))
  first.state.failSummary = false
  await first.page.getByRole('button', { name: '重新连接服务', exact: true }).click()
  await first.page.getByTestId('overview-ready').waitFor()
  check('登录页可以重新连接而无需重复输入令牌', await first.page.locator('.console-nav').isVisible())
  first.state.failSummary = true
  await first.page.getByRole('button', { name: '更新状态', exact: true }).click()
  await first.page.locator('.error-notice').waitFor()
  await first.page.locator('.error-notice').getByRole('button', { name: '重新连接服务', exact: true }).click()
  await first.page.waitForFunction(() => document.getElementById('app')?.dataset.connection === 'stale')
  check('重连再次失败有反馈且保留旧数据', await first.page.getByTestId('overview-ready').isVisible())
  first.state.failSummary = false
  await first.page.locator('.error-notice').getByRole('button', { name: '重新连接服务', exact: true }).click()
  await first.page.waitForSelector('.error-notice', { state: 'hidden' })
  check('服务恢复后清除过期状态', await first.page.locator('#app').getAttribute('data-connection') === 'ready')
  await first.nav('模型清单'); await first.page.getByTestId('models-ready').waitFor()
  await first.nav('服务设置'); await first.page.getByTestId('settings-ready').waitFor()
  await first.page.locator('.skip-link').focus(); await first.page.keyboard.press('Enter')
  check('跳转正文不改变页面或导航地址', first.page.url().endsWith('#page=settings') && await first.page.getByTestId('settings-ready').isVisible())
  await first.page.goBack()
  await first.page.waitForFunction(() => location.hash === '#page=models')
  check('浏览器返回键与页面导航保持一致', await first.page.getByTestId('models-ready').isVisible())
  first.state.login = false
  await first.nav('概览'); await first.page.getByRole('button', { name: '更新状态', exact: true }).click()
  await first.page.getByTestId('login-screen').waitFor()
  check('会话失效后的登录原因不会丢失', await first.page.getByRole('alert').innerText().then(value => value.includes('管理会话已失效')))
  await first.context.close()

  const resource = await fixture()
  let blockModel = true
  await resource.context.route('**/assets/models-*.js', route => blockModel ? route.abort('failed') : route.continue())
  await resource.page.goto(origin); await resource.page.getByTestId('overview-ready').waitFor()
  await resource.nav('模型清单')
  await resource.page.locator('.page-load-failure').waitFor()
  check('页面资源加载失败有明确恢复入口', await resource.page.getByRole('button', { name: '重新加载应用', exact: true }).isVisible())
  blockModel = false
  await resource.page.getByRole('button', { name: '重新加载应用', exact: true }).click()
  await resource.page.getByTestId('models-ready').waitFor()
  check('资源恢复后刷新可回到原页面', resource.page.url().endsWith('#page=models'))
  await resource.context.close()

  for (const theme of ['light', 'dark']) {
    const { context, page, nav } = await fixture(theme)
    await page.goto(origin); await page.getByTestId('overview-ready').waitFor()
    for (const [index, label] of labels.entries()) {
      await nav(label)
      if (label === '模型清单') await page.getByTestId('models-ready').waitFor()
      if (label === '用量统计') await page.getByTestId('usage-ready').waitFor()
      if (label === '服务设置') await page.getByTestId('settings-ready').waitFor()
      await page.waitForTimeout(140)
      check(`${theme}/${label}: 保留页面横幅与当前导航`, await page.locator('.ofm-sponsor-banner').count() === 1 && await page.locator('.console-nav-item[aria-current="page"]').count() === 1)
      check(`${theme}/${label}: 没有横向页面溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      if (!process.argv.includes('--no-screenshots')) await page.screenshot({ path: path.join(output, `${theme}-${index}.png`), animations: 'disabled', fullPage: true })
    }
    await nav('概览')
    const identity = await page.evaluate(() => {
      const card = document.querySelector('.ui-card'), primary = document.querySelector('.ui-button-default'), root = getComputedStyle(document.documentElement)
      const c = card && getComputedStyle(card), button = primary && getComputedStyle(primary)
      const rgba = text => (text.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const lum = rgb => rgb.map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4 }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0)
      const contrast = (a, b) => { const one = lum(rgba(a)), two = lum(rgba(b)); return (Math.max(one, two) + .05) / (Math.min(one, two) + .05) }
      return { cardRadius: c?.borderRadius, cardClip: c?.clipPath, cardShadow: c?.boxShadow, controlRadius: button?.borderRadius, accent: root.getPropertyValue('--green').trim(), primaryContrast: button ? contrast(button.color, button.backgroundColor) : null, infiniteAnimations: document.getAnimations().filter(animation => animation.playState === 'running' && animation.effect.getTiming().iterations === Infinity).length }
    })
    check(`${theme}: 减少动效模式停止持续动画`, identity.infiniteAnimations === 0)
    if (theme === 'dark') check('夜主题保持机械直角而非圆润浅色换皮', identity.cardRadius === '0px' && identity.controlRadius === '0px')
    else check('昼主题保持纸面圆角与暖影', identity.cardRadius !== '0px' && identity.cardShadow !== 'none')
    if (identity.primaryContrast !== null) check(`${theme}: 主操作文字对比度至少4.5`, identity.primaryContrast >= 4.5)
    fs.writeFileSync(path.join(output, `${theme}-identity.json`), JSON.stringify(identity, null, 2))
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const label of ['模型清单', '免费账号渠道', '服务设置', 'API 接入']) {
        await nav(label); await page.waitForTimeout(120)
        check(`${theme}/${width}/${label}: 窄窗口无页面溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        check(`${theme}/${width}/${label}: 当前入口可见`, await page.locator('.console-nav-item[aria-current="page"]').evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 }))
        if (!process.argv.includes('--no-screenshots')) await page.screenshot({ path: path.join(output, `${theme}-${width}-${labels.indexOf(label)}.png`), animations: 'disabled', fullPage: false })
      }
    }
    await context.close()
  }
  assert.deepEqual(errors, [], '恢复流程和页面导航不能产生未捕获错误')
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
  console.log(`frontend-redesign-ui: ${checks.length} checks passed; ${output}`)
} finally { await browser.close(); management.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
