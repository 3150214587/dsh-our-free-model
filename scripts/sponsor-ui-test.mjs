/** 使用真实 React、插件组件与独立端构建验证广告交互；只访问本机接口。 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createManagement } from '../packages/standalone/management.mjs'
import { buildStats } from '../src/core/stats.js'
import { SPONSOR, SPONSOR_COLLAPSE_KEY } from '../src/sponsor.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const standaloneRequire = createRequire(new URL('../packages/standalone/package.json', import.meta.url))
const require = createRequire(import.meta.url)
const { build } = standaloneRequire('esbuild')
const { chromium } = require(process.env.OFM_PLAYWRIGHT_MODULE ?? 'playwright')
const output = process.env.OFM_SPONSOR_OUTPUT ?? path.join(root, '.verify/sponsor')
fs.mkdirSync(output, { recursive: true })
const reactBundle = await build({ stdin: { contents: `import * as React from 'react'; import {createRoot} from 'react-dom/client'; import {createPortal} from 'react-dom'; window.testReact=React; window.testDOM={createRoot,createPortal};`, resolveDir: path.join(root, 'packages/standalone') }, bundle: true, write: false, format: 'iife', minify: true, define: { 'process.env.NODE_ENV': '"production"' } })
const plugin = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
const pluginHtml = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root { --dsw-alias-label-primary:#283445;--dsw-alias-label-secondary:#566576;--dsw-alias-label-tertiary:#718091;--dsw-alias-bg-base:#f4f7fb;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f4f7fb;--dsw-alias-bg-layer-3:#eaf0f7;--dsw-alias-border-l1:#e1e7ef;--dsw-alias-border-l2:#ccd7e4;--dsw-alias-accent-primary:#4264a2;--dsw-alias-state-business-primary:#4264a2;--dsw-alias-state-success-primary:#28785b;--dsw-alias-state-error-primary:#ae4354 }
body{margin:0;background:#f4f7fb;font:14px 'Segoe UI','Microsoft YaHei',sans-serif}#root{max-width:1120px;margin:auto;padding:24px;}
</style></head><body><div id="plugin-settings" role="dialog" aria-modal="true"><div id="root"></div></div><script src="/test-react.js"></script><script>
window.__ModuleLoader__={load:r=>window.plugin=r.factory(name=>name==='react'?window.testReact:window.testDOM)};
</script><script src="/test-client.js"></script><script>
const React=window.testReact,h=React.createElement,{CSS,Shell,DICT}=window.plugin.__test;
const sheet=document.createElement('style');sheet.textContent=CSS;document.head.append(sheet);
if (!localStorage.getItem('ofm.tab')) localStorage.setItem('ofm.tab','free');const t=key=>DICT.zh[key]??key;t.locale='zh-CN';
window.testPluginRoot=window.testDOM.createRoot(document.getElementById('root'));
window.testPluginRoot.render(h(Shell,{t,data:{catalog:[],settings:{}},counts:{},summary:{reload(){}},stats:{reload(){}},eacAuth:{},setEacAuth(){},eacLogin:{},busy:false,setBusy(){},apply(){},bench(){},benches:{},ctx:{}}));
// 对齐宿主 SettingsPanel 的 document 级 Esc 关闭行为。
document.addEventListener('keydown',event=>{if(event.key==='Escape'){window.testPluginRoot.unmount();document.getElementById('plugin-settings').remove()}});
</script></body></html>`
const management = createManagement({ stores: { settings: { get: () => ({ forwardKey: 'isolated' }) } }, info: () => ({}) })
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/plugin')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pluginHtml) }
  if (req.url === '/test-react.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(reactBundle.outputFiles[0].contents) }
  if (req.url === '/test-client.js') { res.writeHead(200, { 'content-type': 'application/javascript' }); return res.end(plugin) }
  void management.handleRequest(req, res)
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
management.setPort(server.address().port)
const browser = await chromium.launch({ headless: true, ...(process.env.OFM_BROWSER_PATH ? { executablePath: process.env.OFM_BROWSER_PATH } : {}) })
const errors = [], checks = []
const check = (label, value) => { assert.ok(value, label); checks.push(label) }
const summary = { version: '2.5.4', baseUrl: origin, dataDir: 'isolated', networkMode: 'fixture', automaticRefresh: false,
  catalogSyncedAt: 0, settings: { enabled: true }, channels: { state: 'ready' }, eacAuth: { local: false }, catalog: [] }
const attach = async (context, theme = 'light') => {
  await context.addInitScript(theme => { try { localStorage.setItem('ofm-theme', theme) } catch {} }, theme)
  await context.route('**/api/management/**', route => {
    const endpoint = new URL(route.request().url()).pathname.split('/api/management')[1]
    let value = endpoint === '/summary' ? summary : endpoint === '/stats' ? buildStats({}, []) : endpoint === '/eac/status' ? { available: true, authorized: false, local: false } : { ok: true }
    if (endpoint === '/channels/rpc') {
      const body = route.request().postDataJSON()
      value = { ok: true, value: body.method === 'provider.status' ? { statuses: Object.fromEntries(body.payload.providers.map(id => [id, { accounts: { total: 0, enabled: 0 } }])) } : body.method === 'usage.autoCheckin' ? { autoCheckin: { enabled: false } } : body.method === 'usage.tokenLedger' ? { entries: [] } : {} }
    }
    return route.fulfill({ json: value })
  })
  await context.route('**/api/our-free-model/**', route => route.fulfill({ json: { items: [], entries: [], models: [], catalog: [], settings: {}, repositories: [] } }))
}
const observe = page => page.on('pageerror', error => errors.push(error.message))
const shot = (page, name) => process.argv.includes('--no-screenshots') ? Promise.resolve() : page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false, animations: 'disabled' })
const isUninterrupted = page => page.evaluate(() => !document.querySelector('dialog[open]') && document.body.style.overflow !== 'hidden')
const waitBanner = async page => { await page.locator('.ofm-sponsor-banner').waitFor(); await page.waitForTimeout(900) }
try {
  for (const variant of [
    { name: 'plugin', route: '/plugin', theme: 'light', width: 1400, height: 980 },
    { name: 'desktop-light', route: '/', theme: 'light', width: 1440, height: 1000 },
    { name: 'desktop-dark', route: '/', theme: 'dark', width: 1440, height: 1000 },
    { name: 'mobile-light', route: '/', theme: 'light', width: 390, height: 844 },
    { name: 'mobile-dark', route: '/', theme: 'dark', width: 390, height: 844 },
    { name: 'plugin-narrow', route: '/plugin', theme: 'light', width: 440, height: 844 },
    { name: 'small-light', route: '/', theme: 'light', width: 320, height: 740 },
  ]) {
    const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, permissions: ['clipboard-read', 'clipboard-write'] })
    await attach(context, variant.theme)
    const page = await context.newPage(); observe(page)
    let popups = 0
    page.on('popup', () => popups++)
    await page.goto(origin + variant.route); await waitBanner(page)
    const banner = page.locator('.ofm-sponsor-banner')
    check(`${variant.name}: 页面只展示一处广告`, await banner.count() === 1)
    check(`${variant.name}: 首次进入没有弹窗和滚动锁`, await isUninterrupted(page))
    check(`${variant.name}: 明确标注广告且只有一个详情入口`, (await banner.innerText()).includes(SPONSOR.title) && await banner.getByRole('button', { name: '了解详情', exact: true }).count() === 1)
    check(`${variant.name}: 横幅在首屏内`, await banner.evaluate(e => e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight))
    check(`${variant.name}: 横幅和页面不横向溢出`, await banner.evaluate(e => e.scrollWidth <= e.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1))
    if (variant.name === 'plugin') {
      await page.locator('#root').evaluate(e => { e.style.width = '520px' })
      check('插件在宽浏览器的窄设置面板内也能响应布局', await banner.evaluate(e => e.scrollWidth <= e.clientWidth + 1))
      await page.locator('#root').evaluate(e => { e.style.width = '' })
    }
    check(`${variant.name}: 没有轮播和持续动画`, await banner.evaluate(e => e.getAnimations({ subtree: true }).every(a => a.effect.getTiming().iterations !== Infinity)))
    await shot(page, `${variant.name}-banner`)
    const expandedHeight = await banner.evaluate(e => e.offsetHeight)
    await banner.getByRole('button', { name: '收起', exact: true }).click()
    check(`${variant.name}: 收起明显减少占用`, await banner.evaluate(e => e.offsetHeight) < expandedHeight * .8)
    check(`${variant.name}: 收起后仍可查看详情`, await banner.getByRole('button', { name: '了解详情', exact: true }).isVisible())
    await shot(page, `${variant.name}-collapsed`)
    await page.reload(); await waitBanner(page)
    check(`${variant.name}: 刷新保留收起偏好`, await banner.getAttribute('class').then(c => c.includes('is-collapsed')))
    await banner.getByRole('button', { name: '展开', exact: true }).click()
    check(`${variant.name}: 可以主动恢复展开`, await banner.getByRole('button', { name: '收起', exact: true }).getAttribute('aria-expanded') === 'true')
    await banner.getByRole('button', { name: '了解详情', exact: true }).click()
    const article = page.locator('.ofm-sponsor-page')
    await article.waitFor()
    check(`${variant.name}: 详情进入原广告专页且没有外跳`, page.url().startsWith(origin) && popups === 0)
    check(`${variant.name}: 详情页也有横幅且清楚标记当前位置`, await banner.count() === 1 && await banner.getByRole('button', { name: '正在查看详情', exact: true }).isDisabled())
    check(`${variant.name}: 原文完整保留`, (await article.innerText()).includes(SPONSOR.paragraphs[5]))
    check(`${variant.name}: 菜单选中广告专页`, await page.locator(variant.route === '/plugin' ? '#ofm-sponsor-menu-plugin[data-on="true"]' : '#ofm-sponsor-menu-desktop[aria-current="page"]').count() === 1)
    await shot(page, `${variant.name}-page`)
    await article.getByRole('button', { name: '复制邀请码', exact: true }).click()
    check(`${variant.name}: 邀请码仍可复制`, await page.evaluate(() => navigator.clipboard.readText()) === SPONSOR.invite)
    const image = article.locator('.ofm-sponsor-evidence img')
    await image.scrollIntoViewIfNeeded(); await image.evaluate(e => e.decode())
    check(`${variant.name}: 原始附图正常显示`, await image.evaluate(e => e.naturalWidth === 1227))
    check(`${variant.name}: 专页外链保留邀请码`, (await article.locator('a').evaluateAll(links => links.map(link => link.href))).every(url => url === SPONSOR.url))
    await shot(page, `${variant.name}-evidence`)
    if (variant.route === '/plugin') {
      await page.getByRole('tab', { name: '免费模型', exact: false }).click()
    } else {
      await page.locator('.console-nav-item').filter({ hasText: '服务设置' }).click()
      check(`${variant.name}: 工作页面也保留唯一的横幅`, await banner.count() === 1)
      await page.locator('.console-nav-item').filter({ hasText: '概览' }).click()
    }
    await waitBanner(page)
    check(`${variant.name}: 返回主入口不弹窗且可继续使用`, await isUninterrupted(page))
    await page.locator(variant.route === '/plugin' ? '#ofm-sponsor-menu-plugin' : '#ofm-sponsor-menu-desktop').click()
    check(`${variant.name}: 旧菜单仍可独立进入专页`, await article.isVisible())
    await page.reload(); await page.waitForTimeout(900)
    check(`${variant.name}: 重载与旧每日记录不会触发公告`, await isUninterrupted(page))
    await context.close()
  }
  for (const isPlugin of [false, true]) {
    const context = await browser.newContext(); await attach(context)
    const page = await context.newPage(); observe(page)
    await page.goto(origin + (isPlugin ? '/plugin' : '/')); await waitBanner(page)
    await page.getByRole('button', { name: '收起', exact: true }).click()
    const labels = isPlugin ? ['EAC 模型', '白嫖模型接入', '聚合渠道', '省 Token', '路由', '数据看板', '运行日志', '网关设置', '插件升级', '推荐项目'] : ['模型清单', '用量统计', '免费账号渠道', 'EAC 协付渠道', 'API 接入', '服务设置']
    for (const label of labels) {
      await page.locator(isPlugin ? '.ofm_tab' : '.console-nav-item').filter({ hasText: label }).click()
      check(`${isPlugin ? '插件' : '桌面'} ${label} 页面显示同一条横幅`, await page.locator('.ofm-sponsor-banner.is-collapsed').count() === 1)
      check(`${isPlugin ? '插件' : '桌面'} ${label} 页面不重新展开或弹窗`, await isUninterrupted(page))
    }
    await context.close()
  }
  // Seed legacy daily dates and make the next-day boundary irrelevant: there is no announcement code.
  for (const legacy of [null, '1900-01-01', '2099-12-31']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' }); await attach(context)
    if (legacy) await context.addInitScript(value => localStorage.setItem('ofm.sponsor.last-shown.v1', value), legacy)
    const page = await context.newPage(); observe(page)
    await page.goto(origin); await waitBanner(page)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    check(`旧每日记录 ${legacy ?? '不存在'} 不再触发公告`, await isUninterrupted(page))
    check(`旧每日记录 ${legacy ?? '不存在'} 不被读写迁移`, await page.evaluate(() => localStorage.getItem('ofm.sponsor.last-shown.v1')) === legacy)
    await context.close()
  }
  const blocked = await browser.newContext(); await attach(blocked)
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError') } }))
  const privatePage = await blocked.newPage(); observe(privatePage)
  await privatePage.goto(origin); await waitBanner(privatePage)
  await privatePage.getByRole('button', { name: '收起', exact: true }).click()
  check('禁用存储时本次会话仍能收起', await privatePage.locator('.ofm-sponsor-banner.is-collapsed').count() === 1)
  await privatePage.getByRole('button', { name: '了解详情', exact: true }).click()
  check('禁用存储时详情导航仍正常', await privatePage.locator('.ofm-sponsor-page').isVisible())
  await blocked.close()
  const context = await browser.newContext(); await attach(context)
  const pages = await Promise.all([context.newPage(), context.newPage()]); pages.forEach(observe)
  await Promise.all(pages.map(page => page.goto(origin)))
  await Promise.all(pages.map(waitBanner))
  await pages[0].getByRole('button', { name: '收起', exact: true }).click()
  await pages[1].locator('.ofm-sponsor-banner.is-collapsed').waitFor()
  check('同源窗口同步收起偏好', await pages[1].getByRole('button', { name: '展开', exact: true }).isVisible())
  await pages[1].getByRole('button', { name: '展开', exact: true }).click()
  await pages[0].locator('.ofm-sponsor-banner:not(.is-collapsed)').waitFor()
  check('同源窗口同步展开偏好', await pages[0].getByRole('button', { name: '收起', exact: true }).isVisible())
  await context.close()
  const pluginHost = await browser.newContext(); await attach(pluginHost)
  const pluginPage = await pluginHost.newPage(); observe(pluginPage)
  await pluginPage.goto(origin + '/plugin'); await waitBanner(pluginPage)
  await pluginPage.keyboard.press('Escape')
  check('横幅不拦截宿主设置页原有 Esc 行为', await pluginPage.locator('#plugin-settings').count() === 0)
  check('卸载后没有残留遮罩或滚动锁', await isUninterrupted(pluginPage))
  await pluginHost.close()
  assert.deepEqual(errors, [], '前端不得出现未捕获错误')
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ checks, errors }, null, 2))
  console.log(`sponsor-ui: ${checks.length} 项真实浏览器检查通过；输出：${output}`)
} finally { await browser.close(); management.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
