/** Real React + built standalone assets; APIs are isolated local fixtures, no account or external request. */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createManagement } from '../packages/standalone/management.mjs'
import { buildStats } from '../src/core/stats.js'
const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const uiRequire = createRequire(new URL('../packages/standalone/package.json', import.meta.url))
const { chromium } = require(process.env.OFM_PLAYWRIGHT_MODULE ?? 'playwright')
const { build } = uiRequire('esbuild')
const output = process.env.OFM_UI_SCREENSHOT_DIR ?? path.join(root, '.verify/four-fixes-ui')
fs.mkdirSync(output, { recursive: true })
const react = await build({ stdin: { contents: "import * as React from 'react';import{createRoot}from'react-dom/client';import{createPortal}from'react-dom';window.testReact=React;window.testDOM={createRoot,createPortal};", resolveDir: path.join(root, 'packages/standalone') }, bundle: true, write: false, format: 'iife', minify: true, define: { 'process.env.NODE_ENV': '"production"' } })
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
const preferences = fs.readFileSync(path.join(root, 'packages/standalone/frontend/ui-preferences.mjs'), 'utf8')
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--dsw-alias-label-primary:#283445;--dsw-alias-label-secondary:#566576;--dsw-alias-label-tertiary:#647488;--dsw-alias-bg-base:#f4f7fb;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f4f7fb;--dsw-alias-bg-layer-3:#eaf0f7;--dsw-alias-border-l1:#e1e7ef;--dsw-alias-border-l2:#ccd7e4;--dsw-alias-accent-primary:#4264a2;--dsw-alias-state-business-primary:#4264a2;--dsw-alias-state-success-primary:#28785b;--dsw-alias-state-error-primary:#ae4354}
body{margin:0;background:#f4f7fb;font:14px 'Segoe UI','Microsoft YaHei',sans-serif}#plugin-root{max-width:1120px;margin:auto;padding:16px;box-sizing:border-box}#other-plugin{position:fixed;bottom:0;left:0;font-size:10px;filter:blur(1px);animation:other-move 2s infinite alternate}@keyframes other-move{to{transform:translateX(2px)}}
[data-theme=dark]{--dsw-alias-label-primary:#e9edf5;--dsw-alias-label-secondary:#b2bed0;--dsw-alias-label-tertiary:#9aa8be;--dsw-alias-bg-base:#121724;--dsw-alias-bg-layer-1:#171d2d;--dsw-alias-bg-layer-2:#1b2333;--dsw-alias-bg-layer-3:#253149;--dsw-alias-border-l1:#334056;--dsw-alias-border-l2:#43516c}html[data-theme=dark] body{background:#121724}
</style></head><body><div id="plugin-root"></div><div id="other-plugin">other plugin fixture</div><script src="/test-react.js"></script><script>window.__ModuleLoader__={load:r=>window.plugin=r.factory(n=>n==='react'?window.testReact:window.testDOM)};</script><script src="/test-client.js"></script><script>
const {CSS,Shell,DICT}=window.plugin.__test;const style=document.createElement('style');style.textContent=CSS;document.head.append(style);const locale=new URLSearchParams(location.search).get('locale')==='en'?'en':'zh';const t=k=>DICT[locale][k]??k;t.locale=locale==='en'?'en-US':'zh-CN';document.documentElement.lang=t.locale;window.fixturePatches=[];window.testDOM.createRoot(document.getElementById('plugin-root')).render(window.testReact.createElement(Shell,{t,data:{catalog:[],settings:{}},counts:{},summary:{reload(){}},stats:{reload(){}},eacAuth:{},setEacAuth(){},eacLogin:{},busy:false,setBusy(){},apply(patch){window.fixturePatches.push(patch)},bench(){},benches:{},ctx:{}}));</script><script type="module">import{getUiPreferences}from'/ui-preferences.mjs';window.otherPrefs=getUiPreferences();</script></body></html>`
const management = createManagement({ stores: { settings: { get: () => ({ forwardKey: 'fixture' }) } }, info: () => ({}) })
const report = {
  startedAt: new Date().toISOString(), fixtureOnly: true, realReact: true,
  servedAssets: 'current packages/standalone/web; no build performed',
  limitations: ['Local API fixtures; no real host installation or vendor account.', 'No GPU, frame time, power or real device performance measurement.', 'Standalone has no upgrade page; managed/self is the plugin UpgradePanel scope.', 'Plugin Shell mounts with host token fixtures, not the complete DSH application.'],
  fixtureCorrections: [
    { location: 'original line 76', cause: 'Standalone accessible name includes its help text; exact name match was too strict.' },
    { location: 'original line 101', cause: 'Plugin switch is named by visible child text; it has no aria-label attribute.' },
    { cause: 'Original screenshot names were assigned before a theme toggle; theme and file name could disagree.' },
    { cause: 'Original script emitted neither partial results nor failure screenshots on timeout.' },
    { cause: 'Denied storage opens the default plugin page; add its local read-only outlet and LAN-address fixtures.' },
  ], scenarios: [], checks: [], pageErrors: [], externalRequestsBlocked: [], unexpectedApiRequests: [], screenshots: [],
}
const tracked = ['client.js', 'packages/standalone/frontend/settings.tsx', 'packages/standalone/frontend/app.tsx', 'packages/standalone/frontend/app.css', 'packages/standalone/frontend/components/shell.tsx', 'packages/standalone/frontend/ui-preferences.mjs', 'packages/standalone/web/app.js', 'packages/standalone/web/app.css', 'packages/standalone/web/assets.json', 'scripts/four-fixes-ui-test.mjs']
const fingerprints = () => Object.fromEntries(tracked.map(file => { const contents = fs.readFileSync(path.join(root, file)); return [file, { sha256: crypto.createHash('sha256').update(contents).digest('hex'), bytes: contents.length, modified: fs.statSync(path.join(root, file)).mtime.toISOString() }] }))
report.filesAtStart = fingerprints()
const server = http.createServer((req, res) => {
  const serve = (value, type) => { res.writeHead(200, { 'content-type': type }); res.end(value) }
  if (req.url.startsWith('/plugin')) return serve(html, 'text/html; charset=utf-8')
  if (req.url === '/test-react.js') return serve(react.outputFiles[0].contents, 'application/javascript')
  if (req.url === '/test-client.js') return serve(client, 'application/javascript')
  if (req.url === '/ui-preferences.mjs') return serve(preferences, 'application/javascript')
  // Only public local static files reach management; account/API operations are fixtures below.
  if (req.url === '/' || req.url.startsWith('/assets/')) return void management.handleRequest(req, res)
  res.writeHead(404); res.end('fixture: unknown path')
})
server.listen(0, '127.0.0.1'); await once(server, 'listening')
const origin = 'http://127.0.0.1:' + server.address().port
management.setPort(server.address().port)
report.origin = origin
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const browser = await chromium.launch({ headless: true, ...(fs.existsSync(edge) ? { executablePath: edge } : {}) })
report.browser = { version: browser.version(), executable: fs.existsSync(edge) ? edge : 'playwright bundled Chromium', headless: true, profile: 'fresh isolated browser contexts' }
const variants = [
  { name: 'desktop-light', width: 1280, height: 900, theme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 900, theme: 'dark' },
  { name: 'mobile-light', width: 390, height: 844, theme: 'light', mobile: true },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark', mobile: true },
]
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const baseStatus = { managed: true, current: '2.5.6', installedVersion: '2.5.6', latest: '2.5.7', available: true, checkedAt: 0, applying: false, recoveryRequired: false }
const key = 'ofm.ui.low-performance.v1'
let currentScenario
function verify(label, condition, actual) {
  const row = { scenario: currentScenario.name, label, status: condition ? 'passed' : 'failed', ...(actual === undefined ? {} : { actual }) }
  report.checks.push(row)
  if (!condition) console.error('FAIL ' + currentScenario.name + ': ' + label)
}
async function capture(page, name) {
  // Let finite entrance transitions finish naturally. Keep infinite decoration/loading
  // running so a normal-mode screenshot does not accidentally emulate low mode.
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(animation => animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime))
    await Promise.race([Promise.allSettled(finite.map(animation => animation.finished)), new Promise(resolve => setTimeout(resolve, 1800))])
  })
  const file = path.join(output, name + '.png')
  await page.screenshot({ path: file, fullPage: true, animations: 'allow' })
  const state = await page.evaluate(() => ({ url: location.href, theme: document.documentElement.dataset.theme, documentLowPerformance: document.documentElement.getAttribute('data-ofm-low-performance'), width: innerWidth, scrollWidth: document.documentElement.scrollWidth, roots: [...document.querySelectorAll('.ofm_root,.ofm_toasts,[data-ofm-announcement-root],.ofm_scrim[data-ofm-urgent]')].map(el => ({ className: el.className, lowPerformance: el.getAttribute('data-ofm-low-performance') })), switches: [...document.querySelectorAll('[role=switch]')].map(el => ({ text: el.textContent, label: el.labels ? [...el.labels].map(label => label.textContent).join(' ') : null, checked: el.getAttribute('aria-checked') ?? String(el.checked), disabled: el.disabled })), buttons: [...document.querySelectorAll('button')].filter(el => el.offsetWidth || el.offsetHeight).map(el => ({ text: el.textContent, disabled: el.disabled })), status: [...document.querySelectorAll('[role=status],[role=alert]')].map(el => el.textContent) }))
  await fs.promises.writeFile(path.join(output, name + '.state.json'), JSON.stringify(state, null, 2) + '\n')
  await fs.promises.writeFile(path.join(output, name + '.aria.txt'), await page.locator('body').ariaSnapshot())
  report.screenshots.push({ scenario: currentScenario.name, path: file, theme: state.theme, width: state.width, scrollWidth: state.scrollWidth })
}
async function setup(variant, options = {}) {
  const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, colorScheme: variant.theme, ...(variant.mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) })
  context.setDefaultTimeout(8000)
  context.setDefaultNavigationTimeout(15000)
  await context.addInitScript(({ theme, storageFailure, initialLow, preferenceKey }) => {
    try {
      localStorage.setItem('ofm-theme', theme); localStorage.setItem('ofm.tab', 'upgrade')
      const date = new Date(); localStorage.setItem('ofm.sponsor.last-shown.v1', date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'))
      if (initialLow !== undefined) localStorage.setItem(preferenceKey, String(initialLow))
    } catch {}
    if (storageFailure === 'access') Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('fixture denied localStorage access', 'SecurityError') } })
    if (storageFailure === 'write') {
      const setItem = Storage.prototype.setItem
      Storage.prototype.setItem = function(name, value) { if (name === preferenceKey) throw new DOMException('fixture quota exceeded', 'QuotaExceededError'); return setItem.call(this, name, value) }
    }
    window.fixtureTransitionCalls = 0
    const transition = document.startViewTransition?.bind(document)
    if (transition) document.startViewTransition = (...args) => { window.fixtureTransitionCalls++; return transition(...args) }
    document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = theme })
  }, { theme: variant.theme, storageFailure: options.storageFailure, initialLow: options.initialLow, preferenceKey: key })
  const state = { status: { ...baseStatus }, statusGate: options.statusGate, summaryGate: options.summaryGate, statusError: false, actions: [], requests: [], actionGate: null }
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) { report.externalRequestsBlocked.push({ scenario: currentScenario.name, url: url.href }); return route.abort() }
    const endpoint = url.pathname
    const json = (value, status = 200) => route.fulfill({ status, json: value })
    if (endpoint.startsWith('/api/our-free-model/')) {
      const part = endpoint.slice('/api/our-free-model'.length)
      state.requests.push({ endpoint: part, method: route.request().method() })
      if (part === '/update/status') { if (state.statusGate) await state.statusGate.promise; return state.statusError ? json({ error: 'fixture update status unavailable' }, 503) : json(state.status) }
      if (['/update/check', '/update/apply', '/reload'].includes(part)) {
        state.actions.push(part)
        if (state.actionGate) await state.actionGate.promise
        return json({ ok: true, version: '2.5.7', reloaded: true })
      }
      if (part === '/meta') return json({ version: '2.5.6', distribution: state.status.managed ? 'managed' : 'self' })
      if (part === '/announcements' || part === '/announcement') return json({ items: [], unread: 0 })
      // Denied storage makes Shell start on its default page, whose read-only panels also mount.
      if (part === '/forward/lan/addresses') return json({ addresses: [] })
      if (part === '/outlet') return json({ enabled: false, active: false, mode: 'client' })
      report.unexpectedApiRequests.push({ scenario: currentScenario.name, endpoint }); return json({ error: 'unimplemented fixture endpoint' }, 501)
    }
    if (endpoint.startsWith('/api/management/')) {
      const part = endpoint.slice('/api/management'.length)
      state.requests.push({ endpoint, method: route.request().method() })
      const settings = { enabled: true, exposeRegionModels: true, streamRecovery: true, standaloneProbe: false, defaultMaxTokens: 32768, probeIntervalMinutes: 15, hiddenModelIds: [] }
      const summary = { version: 'fixture', baseUrl: origin, dataDir: 'isolated-fixture', networkMode: 'fixture', automaticRefresh: false, settings, channels: { state: 'ready' }, eacAuth: { local: false }, catalog: [] }
      if (part === '/summary') { if (state.summaryGate) await state.summaryGate.promise; return json(summary) }
      if (part === '/stats') return json(buildStats({}, []))
      if (part === '/eac/status') return json({ available: true, authorized: false, local: false })
      report.unexpectedApiRequests.push({ scenario: currentScenario.name, endpoint }); return json({ error: 'unimplemented fixture endpoint' }, 501)
    }
    return route.continue()
  })
  context.on('page', page => page.on('pageerror', error => report.pageErrors.push({ scenario: currentScenario?.name, message: error.message, stack: error.stack })))
  return { context, state }
}
const standaloneToggle = page => page.getByRole('switch', { name: /^低性能模式(?:\s|$)/ })
const pluginToggle = (page, locale = 'zh') => page.getByRole('switch', { name: locale === 'en' ? 'Low performance mode' : '低性能模式', exact: true })
async function waitMode(page, surface, enabled) {
  await page.waitForFunction(({ selector, enabled }) => document.querySelector(selector)?.getAttribute('data-ofm-low-performance') === String(enabled), { selector: surface === 'plugin' ? '.ofm_root' : 'html', enabled })
}
async function waitSwitch(toggle, enabled) {
  const element = await toggle.elementHandle()
  try { await toggle.page().waitForFunction(({ element, enabled }) => (element.getAttribute('aria-checked') ?? String(element.checked)) === String(enabled), { element, enabled }) }
  finally { await element.dispose() }
}
async function openSettings(page) {
  await page.getByTestId('overview-ready').waitFor()
  await page.locator('.console-nav-item').filter({ hasText: '服务设置' }).click()
  await standaloneToggle(page).waitFor()
}
async function openPlugin(page, locale = 'zh') {
  await page.goto(origin + '/plugin?locale=' + locale)
  await pluginToggle(page, locale).waitFor()
  await page.waitForFunction(() => Boolean(window.otherPrefs))
}
const names = locale => locale === 'en' ? { check: 'Check for updates', apply: 'Upgrade now', reload: 'Hot-reload plugin', watch: 'Hot-reload on file change', tab: 'Upgrade' } : { check: '检查更新', apply: '立即升级', reload: '热重载插件', watch: '文件变化自动热重载', tab: '升级' }
const managedText = locale => locale === 'en' ? 'This installation is managed by the host that installed it. Update through the original installation method; in-plugin checks, upgrades and hot reload are unavailable.' : '此安装由安装它的宿主管理，请通过原安装方式更新；插件内检查、升级和热重载不可用。'
async function ownerEvent(page) { await page.evaluate(() => window.dispatchEvent(new CustomEvent('ofm:upgraded', { detail: {} }))) }
async function allOwnerDisabled(page, locale = 'zh') {
  const n = names(locale)
  return (await Promise.all([page.getByRole('button', { name: n.check, exact: true }).isDisabled(), page.getByRole('button', { name: n.apply, exact: true }).isDisabled(), page.getByRole('button', { name: n.reload, exact: true }).isDisabled(), page.getByRole('switch', { name: n.watch, exact: true }).isDisabled()])).every(Boolean)
}
async function effectState(page, selector) {
  return page.locator(selector).evaluate(root => {
    const elements = [root, ...root.querySelectorAll('*')]
    const badFilters = elements.flatMap(el => { const s = getComputedStyle(el); return s.backdropFilter !== 'none' || s.filter !== 'none' ? [{ tag: el.tagName, className: el.className, filter: s.filter, backdropFilter: s.backdropFilter }] : [] })
    const decorativeAnimations = elements.flatMap(el => { const s = getComputedStyle(el); return s.animationName !== 'none' && !el.matches('.ofm_prog i,[aria-busy=true]') ? [{ className: el.className, animation: s.animationName }] : [] })
    return { badFilters, decorativeAnimations }
  })
}
async function scenario(name, variant, options, run) {
  currentScenario = { name, variant: variant.name, startedAt: new Date().toISOString(), status: 'running' }
  report.scenarios.push(currentScenario)
  const { context, state } = await setup(variant, options)
  const page = await context.newPage()
  try { await run({ page, context, state }); currentScenario.status = report.checks.some(row => row.scenario === name && row.status === 'failed') ? 'failed' : 'passed' }
  catch (error) {
    currentScenario.status = 'failed'; currentScenario.error = { message: error.message, stack: error.stack }
    try { await capture(page, name + '-FAILURE'); await fs.promises.writeFile(path.join(output, name + '-FAILURE.html'), await page.content()) } catch (captureError) { currentScenario.captureError = captureError.message }
    console.error(name + ': ' + error.message)
  } finally {
    state.statusGate?.resolve(); state.summaryGate?.resolve(); state.actionGate?.resolve()
    currentScenario.finishedAt = new Date().toISOString(); currentScenario.requests = state.requests; currentScenario.actions = state.actions
    await context.close()
    fs.writeFileSync(path.join(output, 'results.partial.json'), JSON.stringify(report, null, 2) + '\n')
  }
}
try {
  for (const variant of variants) {
    await scenario('standalone-' + variant.name, variant, {}, async ({ page, context, state }) => {
      await page.goto(origin); await openSettings(page)
      const toggle = standaloneToggle(page)
      verify('normal mode starts disabled', !(await toggle.isChecked()))
      verify('legacy exact-name lookup finds zero controls (fixture root cause)', await page.getByRole('switch', { name: '低性能模式', exact: true }).count() === 0)
      await capture(page, 'standalone-' + variant.name + '-normal')
      await toggle.check(); await waitMode(page, 'standalone', true)
      const effects = await effectState(page, 'body')
      verify('enabled immediately; blur/filter removed', effects.badFilters.length === 0, effects)
      verify('decorative CSS animations stopped', effects.decorativeAnimations.length === 0, effects.decorativeAnimations)
      verify('preference does not save server settings', !state.requests.some(r => r.method !== 'GET'), state.requests)
      verify('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await capture(page, 'standalone-' + variant.name + '-low')
      const themeCalls = await page.evaluate(() => window.fixtureTransitionCalls)
      await page.getByRole('button', { name: /切换到.*主题/ }).filter({ visible: true }).first().click()
      verify('theme switches without requesting view-transition snapshot', await page.evaluate(calls => window.fixtureTransitionCalls === calls && !document.documentElement.classList.contains('theme-transitioning'), themeCalls))
      verify('theme changed to requested opposite', await page.locator('html').getAttribute('data-theme') === (variant.theme === 'light' ? 'dark' : 'light'))
      await page.reload(); await openSettings(page)
      verify('refresh retains enabled preference', await toggle.isChecked() && await page.locator('html').getAttribute('data-ofm-low-performance') === 'true')
      // A second real UI document tests native browser storage events across both surfaces.
      const pluginPage = await context.newPage(); await openPlugin(pluginPage)
      verify('second plugin document restores same saved preference', await pluginToggle(pluginPage).getAttribute('aria-checked') === 'true')
      await pluginToggle(pluginPage).click(); await waitMode(page, 'standalone', false); await waitSwitch(toggle, false)
      verify('plugin to standalone cross-document storage event', !(await toggle.isChecked()))
      await toggle.check(); await waitSwitch(pluginToggle(pluginPage), true)
      verify('standalone to plugin cross-document storage event', await pluginToggle(pluginPage).getAttribute('aria-checked') === 'true')
      await pluginPage.close()
      await toggle.uncheck(); await page.reload(); await openSettings(page)
      verify('refresh retains disabled preference', !(await toggle.isChecked()) && await page.locator('html').getAttribute('data-ofm-low-performance') === 'false')
    })
    await scenario('plugin-' + variant.name, variant, {}, async ({ page, state }) => {
      await openPlugin(page)
      const toggle = pluginToggle(page)
      await page.getByText(managedText('zh'), { exact: true }).waitFor()
      verify('managed explanation and controls', await allOwnerDisabled(page))
      verify('original aria-label selector is absent (fixture root cause)', await toggle.getAttribute('aria-label') === null)
      await capture(page, 'plugin-' + variant.name + '-normal-managed')
      await toggle.click(); await waitMode(page, 'plugin', true)
      verify('same-document preference module synchronized', await page.evaluate(() => window.otherPrefs.getSnapshot().lowPerformance))
      const effects = await effectState(page, '.ofm_root')
      verify('OFM blur/filter disabled', effects.badFilters.length === 0, effects)
      verify('OFM decorative CSS animations stopped', effects.decorativeAnimations.length === 0, effects.decorativeAnimations)
      verify('neighbor keeps its own filter and animation', await page.locator('#other-plugin').evaluate(el => getComputedStyle(el).filter === 'blur(1px)' && getComputedStyle(el).animationName === 'other-move'))
      verify('host body has no OFM marker', await page.locator('body').getAttribute('data-ofm-low-performance') === null)
      verify('no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await capture(page, 'plugin-' + variant.name + '-low-managed')
      await page.evaluate(() => window.otherPrefs.setLowPerformance(false)); await waitSwitch(toggle, false)
      await toggle.focus(); await page.keyboard.press('Space'); await waitSwitch(toggle, true)
      verify('keyboard Space toggles live preference', await page.evaluate(() => window.otherPrefs.getSnapshot().lowPerformance))
      await page.reload(); await openPluginReady(page)
      verify('refresh restores owned scope', await page.locator('.ofm_root').getAttribute('data-ofm-low-performance') === 'true')
      state.status = { ...baseStatus, managed: false }
      await ownerEvent(page); await page.getByRole('button', { name: '检查更新', exact: true }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find(el => el.textContent === '检查更新')?.disabled === false)
      verify('managed to self restores check/apply/reload/watch', !(await page.getByRole('button', { name: '检查更新', exact: true }).isDisabled()) && !(await page.getByRole('button', { name: '立即升级', exact: true }).isDisabled()) && !(await page.getByRole('button', { name: '热重载插件', exact: true }).isDisabled()) && !(await page.getByRole('switch', { name: '文件变化自动热重载', exact: true }).isDisabled()))
      verify('self state removes managed guidance', await page.getByText(managedText('zh'), { exact: true }).count() === 0)
      await capture(page, 'plugin-' + variant.name + '-low-self')
      await page.getByRole('button', { name: '检查更新', exact: true }).click()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find(el => el.textContent === '检查更新')?.disabled === false)
      verify('self check uses fixture API', state.actions.includes('/update/check'))
      await page.getByRole('switch', { name: '文件变化自动热重载', exact: true }).click()
      verify('self auto reload submits patch', await page.evaluate(() => window.fixturePatches.some(p => typeof p.autoReloadWatch === 'boolean')))
      await page.getByRole('button', { name: '热重载插件', exact: true }).click()
      await page.waitForFunction(() => [...document.querySelectorAll('button')].find(el => el.textContent === '热重载插件')?.disabled === false)
      verify('self reload uses fixture API', state.actions.includes('/reload'))
      state.status = { ...baseStatus, managed: true }; await ownerEvent(page)
      await page.getByText(managedText('zh'), { exact: true }).waitFor()
      verify('self to managed disables all actions again', await allOwnerDisabled(page))
      const actionCount = state.actions.length
      await page.getByRole('button', { name: '检查更新', exact: true }).evaluate(el => el.click())
      await page.getByRole('button', { name: '立即升级', exact: true }).evaluate(el => el.click())
      await page.getByRole('button', { name: '热重载插件', exact: true }).evaluate(el => el.click())
      verify('managed programmatic native clicks issue no action request', state.actions.length === actionCount)
    })
  }
  for (const failure of ['access', 'write']) for (const surface of ['standalone', 'plugin']) {
    const variant = variants[surface === 'standalone' ? 3 : 0]
    await scenario(surface + '-storage-' + failure, variant, { storageFailure: failure }, async ({ page }) => {
      if (surface === 'standalone') { await page.goto(origin); await openSettings(page) } else await openPlugin(page)
      const toggle = surface === 'standalone' ? standaloneToggle(page) : pluginToggle(page)
      for (const enabled of [true, false, true]) { await toggle.click(); await waitMode(page, surface, enabled); await waitSwitch(toggle, enabled) }
      verify('storage ' + failure + ' permits repeated live toggles', true)
      const text = surface === 'standalone' ? '浏览器存储不可用；本次打开仍可切换，关闭或刷新后可能无法保留。' : '浏览器存储不可用，本次选择仅对当前页面生效。'
      verify('storage failure warning visible in real React UI', await page.getByText(text, { exact: true }).isVisible())
      if (surface === 'plugin') verify('same-document failure snapshot remains synchronized', await page.evaluate(() => window.otherPrefs.getSnapshot().storageAvailable === false && window.otherPrefs.getSnapshot().lowPerformance === true))
      await capture(page, surface + '-storage-' + failure)
      await page.reload()
      if (surface === 'standalone') await openSettings(page); else await openPluginReady(page)
      verify('failed storage is not falsely retained after refresh', (surface === 'standalone' ? await standaloneToggle(page).isChecked() : await pluginToggle(page).getAttribute('aria-checked') === 'true') === false)
    })
  }
  const summaryGate = defer()
  await scenario('standalone-loading-saved-low', variants[3], { initialLow: true, summaryGate }, async ({ page }) => {
    await page.goto(origin); await page.getByText('正在连接本地服务…', { exact: true }).waitFor()
    verify('saved low mode active before summary resolves', await page.locator('html').getAttribute('data-ofm-low-performance') === 'true')
    verify('loading bar remains visible and inside track', await page.locator('.loading-bar-fill').evaluate(el => { const r = el.getBoundingClientRect(); const parent = el.parentElement.getBoundingClientRect(); return r.width > 0 && r.left >= parent.left - 1 && r.right <= parent.right + 1 && getComputedStyle(el).opacity !== '0' }))
    await capture(page, 'standalone-mobile-dark-loading-low')
    summaryGate.resolve(); await page.getByTestId('overview-ready').waitFor()
    verify('loading resolves normally', await page.getByTestId('overview-ready').isVisible())
  })
  for (const locale of ['zh', 'en']) {
    const variant = variants[locale === 'en' ? 2 : 1]
    const statusGate = defer()
    await scenario('plugin-upgrade-states-' + locale, variant, { statusGate }, async ({ page, state }) => {
      await openPlugin(page, locale)
      const n = names(locale)
      verify('unknown owner keeps check/reload/watch disabled', await page.getByRole('button', { name: n.check, exact: true }).isDisabled() && await page.getByRole('button', { name: n.reload, exact: true }).isDisabled() && await page.getByRole('switch', { name: n.watch, exact: true }).isDisabled())
      await pluginToggle(page, locale).click(); await waitMode(page, 'plugin', true)
      await capture(page, 'plugin-upgrade-' + locale + '-loading-low')
      state.statusError = true; statusGate.resolve()
      await page.getByText(/fixture update status unavailable/).waitFor()
      verify('status error keeps controls disabled', await page.getByRole('button', { name: n.check, exact: true }).isDisabled() && await page.getByRole('button', { name: n.reload, exact: true }).isDisabled())
      await capture(page, 'plugin-upgrade-' + locale + '-error-low')
      state.statusGate = null; state.statusError = false; await ownerEvent(page)
      await page.getByText(managedText(locale), { exact: true }).waitFor()
      verify('localized managed guidance recovers after error', await allOwnerDisabled(page, locale))
      await capture(page, 'plugin-upgrade-' + locale + '-managed-low')
      state.status.managed = false; await ownerEvent(page)
      await page.waitForFunction(label => [...document.querySelectorAll('button')].find(el => el.textContent === label)?.disabled === false, n.apply)
      state.actionGate = defer()
      await page.getByRole('button', { name: n.apply, exact: true }).click()
      await page.getByRole('progressbar').waitFor()
      verify('self upgrade shows live progress in low mode', await page.getByRole('progressbar').isVisible())
      verify('loading progress keeps its essential animation', await page.locator('.ofm_prog i').evaluate(el => getComputedStyle(el).animationName === 'ofm-prog-slide'))
      await capture(page, 'plugin-upgrade-' + locale + '-self-applying-low')
      state.status.managed = true; await ownerEvent(page)
      await page.getByText(managedText(locale), { exact: true }).waitFor()
      verify('managed transition removes stale progress', await page.getByRole('progressbar').count() === 0 && await allOwnerDisabled(page, locale))
      const actionResponse = page.waitForResponse(response => response.url().endsWith('/api/our-free-model/update/apply'))
      state.actionGate.resolve(); await (await actionResponse).finished()
      verify('upgrade action stayed within local fixture', state.actions.includes('/update/apply'))
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      verify('late self action cannot revive managed controls', await allOwnerDisabled(page, locale))
      await capture(page, 'plugin-upgrade-' + locale + '-managed-after-late-action')
    })
  }
} finally {
  report.filesAtEnd = fingerprints(); report.finishedAt = new Date().toISOString()
  report.fileChangesDuringRun = tracked.filter(file => report.filesAtStart[file].sha256 !== report.filesAtEnd[file].sha256)
  report.summary = { scenarios: report.scenarios.length, passedScenarios: report.scenarios.filter(s => s.status === 'passed').length, failedScenarios: report.scenarios.filter(s => s.status !== 'passed').length, checks: report.checks.length, failedChecks: report.checks.filter(c => c.status === 'failed').length, pageErrors: report.pageErrors.length, screenshots: report.screenshots.length, unexpectedApiRequests: report.unexpectedApiRequests.length }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report.summary))
  await browser.close(); management.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  if (report.summary.failedScenarios || report.summary.failedChecks || report.summary.pageErrors || report.summary.unexpectedApiRequests) process.exitCode = 1
}
async function openPluginReady(page) { await pluginToggle(page).waitFor(); await page.waitForFunction(() => Boolean(window.otherPrefs)) }
