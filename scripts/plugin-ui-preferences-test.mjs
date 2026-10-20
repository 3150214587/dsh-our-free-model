/** Browser-local OFM preferences and benchmark UI, using real client callbacks.
 * Run: node scripts/plugin-ui-preferences-test.mjs
 * Optional CSS verification with an isolated Chromium profile:
 *   node scripts/plugin-ui-preferences-test.mjs --browser
 *   OFM_UI_BROWSER / OFM_UI_TEST_TMP may select its executable/temp directory.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const KEY = 'ofm.ui.low-performance.v1'
const source = fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  .replace('exports.__test = {', 'exports.__test = { LowPerformancePreference, SettingsPage, ModelCard, Roster, uiRoot, setLowPerformance, toastHost, showToast, showUrgentModal, announcementPortalHost, useCountUp,')
const tick = () => new Promise(resolve => setImmediate(resolve))
let checks = 0
async function check(name, run) { await run(); checks++; console.log('  ok  ' + name) }
function flatten(value, out = []) {
  if (Array.isArray(value)) for (const child of value) flatten(child, out)
  else if (value && typeof value === 'object') { out.push(value); flatten(value.children, out) }
  else if (typeof value === 'string') out.push(value)
  return out
}
class Node {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attributes = {}; this.className = ''; this.parentNode = null; this.style = {} }
  setAttribute(name, value) { this.attributes[name] = String(value) }
  getAttribute(name) { return this.attributes[name] ?? null }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node }
  removeChild(node) { this.children = this.children.filter(child => child !== node); node.parentNode = null }
  remove() { this.parentNode?.removeChild(this) }
  addEventListener() {}
  get firstElementChild() { return this.children[0] }
}
function boot({ storage = new Map(), failStorage = false, fetchImpl } = {}) {
  let bundle, cursor = 0, tree, dirty = true
  const cells = [], effects = [], listeners = new Map(), frames = new Map(), timers = [], calls = []
  const html = new Node('html'), head = html.appendChild(new Node('head')), body = html.appendChild(new Node('body'))
  const matches = (node, selector) => {
    const className = selector.match(/^\.([\w-]+)/)?.[1]
    if (className && !node.className.split(/\s+/).includes(className)) return false
    const attr = selector.match(/\[([\w-]+)\]/)?.[1]
    return (!attr || node.getAttribute(attr) !== null) && Boolean(className || attr)
  }
  const all = () => flattenDom(html)
  const document = {
    documentElement: html, head, body, baseURI: 'http://ofm.invalid/',
    createElement: tag => new Node(tag), createTextNode: text => Object.assign(new Node('#text'), { textContent: text }),
    querySelectorAll: selector => all().filter(node => selector.split(',').some(part => matches(node, part.trim()))),
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null },
  }
  function flattenDom(node) { return [node, ...node.children.flatMap(flattenDom)] }
  const localStorage = {
    getItem(key) { if (failStorage) throw new Error('storage read denied'); return storage.get(key) ?? null },
    setItem(key, value) { if (failStorage) throw new Error('storage write denied'); storage.set(key, value) },
  }
  const window = {
    __ModuleLoader__: { load: value => { bundle = value } }, localStorage,
    matchMedia: () => ({ matches: false }),
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
    dispatchEvent(event) { for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event) },
  }
  const changed = (a, b) => !a || !b || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]))
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), Fragment: 'fragment',
    useState(initial) {
      const index = cursor++
      if (!(index in cells)) cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[index].value, value => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value; dirty = true }]
    },
    useRef(initial) { return cells[cursor++] ??= { current: initial } },
    useMemo(factory, deps) { const index = cursor++; if (!cells[index] || changed(cells[index].deps, deps)) cells[index] = { value: factory(), deps }; return cells[index].value },
    useEffect(fn, deps) {
      const index = cursor++
      if (!cells[index] || changed(cells[index].deps, deps)) {
        const previous = cells[index]; cells[index] = { deps, cleanup: previous?.cleanup }
        effects.push(() => { previous?.cleanup?.(); cells[index].cleanup = fn() })
      }
    },
  }
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps)
  vm.runInNewContext(source, {
    window, document, URL, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options) } },
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer }, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    requestAnimationFrame: fn => { const id = frames.size + 1; frames.set(id, fn); return id }, cancelAnimationFrame: id => frames.delete(id),
    fetch: async (url, options) => {
      const endpoint = new URL(url, document.baseURI).pathname.replace('/api/our-free-model', '')
      calls.push({ endpoint, options, timeout: timers.at(-1)?.delay })
      const value = await fetchImpl?.(endpoint, options) ?? {}
      return { ok: value.httpOk !== false, text: async () => JSON.stringify(value.httpOk === false ? { error: value.error } : value) }
    },
  })
  const plugin = bundle.factory(name => name === 'react' ? react : { createPortal: (children, host) => ({ children, host }) })
  const api = plugin.__test
  const t = Object.assign(key => api.DICT.zh[key] ?? key, { locale: 'zh-CN' })
  const draw = (component = api.LowPerformancePreference, props = { t }) => {
    let passes = 0
    do {
      if (++passes > 30) throw new Error('hook render loop')
      dirty = false; cursor = 0; tree = component(props)
      for (const effect of effects.splice(0)) effect()
    } while (dirty)
    return tree
  }
  const nodes = () => flatten(draw())
  const toggle = () => { nodes().find(node => node?.props?.label === t('pref.lowPerformance')).props.onChange(); return draw() }
  return { api, plugin, t, draw, nodes, toggle, document, window, frames, timers, calls, storage,
    root(className = 'ofm_root') { const node = new Node(); node.className = className; body.appendChild(node); return node },
    dispose() { for (const cell of cells) cell?.cleanup?.() },
  }
}

await check('default effects remain on; native switch uses the normal keyboard-accessible button', () => {
  const app = boot(), root = app.root(); app.api.uiRoot(root)
  const switchNode = app.nodes().find(node => node?.props?.label === '低性能模式')
  const button = switchNode.type(switchNode.props)
  assert.equal(button.type, 'button'); assert.equal(button.props.type, 'button')
  assert.equal(button.props.role, 'switch'); assert.equal(button.props['aria-checked'], 'false')
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'false')
  assert.match(button.props.title, /立即.*本机存储.*刷新后保留/)
  app.dispose()
})
await check('toggle persists exact true/false strings and survives a fresh bundle', () => {
  const storage = new Map(), app = boot({ storage }), root = app.root(); app.api.uiRoot(root)
  app.toggle(); assert.equal(storage.get(KEY), 'true'); assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
  const refreshed = boot({ storage })
  assert.equal(refreshed.nodes().find(node => node?.props?.label === '低性能模式').props.checked, true)
  refreshed.toggle(); assert.equal(storage.get(KEY), 'false')
  const restored = boot({ storage }); assert.equal(restored.nodes().find(node => node?.props?.label === '低性能模式').props.checked, false)
  app.dispose(); refreshed.dispose(); restored.dispose()
})
await check('storage access failure still allows repeated in-session changes', () => {
  const app = boot({ failStorage: true }), root = app.root(); app.api.uiRoot(root)
  app.toggle(); assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
  assert.ok(app.nodes().includes('浏览器存储不可用，本次选择仅对当前页面生效。'))
  assert.equal(app.nodes().find(node => node?.props?.label === '低性能模式').props.checked, true)
  app.toggle(); assert.equal(root.getAttribute('data-ofm-low-performance'), 'false'); app.dispose()
})
await check('existing and newly-created OFM portals switch immediately; foreign siblings get no marker', () => {
  const app = boot(), root = app.root(), foreign = app.root('host-other-plugin')
  app.api.uiRoot(root)
  const toast = app.api.toastHost(), announcement = app.api.announcementPortalHost()
  app.api.showUrgentModal({ title: 'fixture', html: '', confirmLabel: 'OK' })
  const urgent = app.document.querySelector('.ofm_scrim[data-ofm-urgent]')
  assert.ok(urgent)
  app.toggle()
  for (const node of [root, toast, announcement, urgent]) assert.equal(node.getAttribute('data-ofm-low-performance'), 'true')
  assert.equal(foreign.getAttribute('data-ofm-low-performance'), null)
  assert.equal(app.document.documentElement.getAttribute('data-ofm-low-performance'), null)
  toast.remove(); assert.equal(app.api.toastHost().getAttribute('data-ofm-low-performance'), 'true')
  announcement.remove(); assert.equal(app.api.announcementPortalHost().getAttribute('data-ofm-low-performance'), 'true')
  assert.ok(app.api.showToast({ title: 'Still loading', body: 'Text survives', holdMs: 0 }))
  app.toggle(); for (const node of [root, urgent]) assert.equal(node.getAttribute('data-ofm-low-performance'), 'false')
  app.dispose()
})
await check('cross-tab preference/clear synchronizes OFM; unrelated storage keys are ignored', () => {
  const app = boot(), root = app.root(); app.api.uiRoot(root); app.draw()
  app.window.dispatchEvent({ type: 'storage', key: KEY, newValue: 'true' })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
  assert.equal(app.nodes().find(node => node?.props?.label === '低性能模式').props.checked, true)
  app.window.dispatchEvent({ type: 'storage', key: 'other-plugin', newValue: 'false' })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
  app.window.dispatchEvent({ type: 'storage', key: null, newValue: null })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'false'); app.dispose()
})
await check('same-document events synchronize memory, propagate storage failures and never echo', () => {
  const app = boot(), root = app.root(), events = []
  app.api.uiRoot(root); app.draw()
  app.window.addEventListener('ofm:ui-preferences', event => events.push(event))
  app.toggle()
  assert.equal(events.length, 1)
  assert.equal(events[0].detail.lowPerformance, true)
  assert.equal(events[0].detail.storageAvailable, true)
  app.window.dispatchEvent({ type: 'ofm:ui-preferences', detail: { lowPerformance: false, storageAvailable: false } })
  assert.equal(events.length, 2, 'consuming a preference event must not emit another event')
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'false')
  assert.equal(app.nodes().find(node => node?.props?.label === '低性能模式').props.checked, false)
  assert.ok(app.nodes().includes('浏览器存储不可用，本次选择仅对当前页面生效。'))
  app.window.dispatchEvent({ type: 'ofm:ui-preferences', detail: { lowPerformance: 'true', storageAvailable: true } })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'false', 'invalid preference payload is ignored')
  app.dispose()
})
await check('sessionStorage cannot change the browser-local preference', () => {
  const app = boot(), root = app.root(); app.api.uiRoot(root); app.draw()
  app.window.dispatchEvent({ type: 'storage', key: KEY, newValue: 'true', storageArea: {} })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'false')
  app.window.dispatchEvent({ type: 'storage', key: KEY, newValue: 'true', storageArea: app.window.localStorage })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'true'); app.dispose()
})
await check('plugin-level storage listener updates portals while settings are closed and cleans up', () => {
  const app = boot(), root = app.root(), registered = []
  app.api.uiRoot(root)
  app.plugin.apply({ locale: { bind: () => app.t }, slots: { inject() {} }, effect: (fn, name) => registered.push({ fn, name }) })
  const effect = registered.find(item => item.name === 'our-free-model: UI preferences')
  assert.ok(effect); const dispose = effect.fn()
  app.window.dispatchEvent({ type: 'storage', key: KEY, newValue: 'true' })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
  dispose(); app.window.dispatchEvent({ type: 'storage', key: KEY, newValue: 'false' })
  assert.equal(root.getAttribute('data-ofm-low-performance'), 'true')
})
await check('turning low mode on cancels JS count-up and immediately shows its final value', () => {
  const app = boot(), Count = () => app.api.useCountUp(12345)
  app.draw(Count, {}); assert.equal(app.frames.size, 1)
  app.api.setLowPerformance(true)
  assert.equal(app.draw(Count, {}), 12345)
  assert.equal(app.frames.size, 0); app.dispose()
})
await check('listing stays selectable and does not imply verified inference; manual failures show their error', () => {
  const app = boot(), { ModelCard, Roster } = app.api
  const model = { id: 'fixture', name: 'Fixture', availabilitySource: 'listing', availability: 'unknown', route: 'our-free-model' }
  const props = { model, t: app.t, onBench() {}, onVisibility() {} }
  let nodes = flatten(ModelCard(props))
  assert.ok(nodes.includes('已列出 · 未实测')); assert.ok(nodes.includes(app.t('hint.listed')))
  assert.equal(nodes.find(node => node?.type === 'article').props.className, 'ofm_card')
  assert.equal(Boolean(nodes.find(node => node?.props?.label === app.t('visibility.showModel')).props.disabled), false)
  const roster = flatten(Roster({ summary: { catalog: [model], settings: {} }, t: app.t }))
  assert.ok(roster.includes('可选模型')); assert.ok(roster.some(node => node?.type === ModelCard))
  nodes = flatten(ModelCard({ ...props, model: { ...model, availabilitySource: 'manual', availability: 'unknown', detail: 'No normal finish' } }))
  assert.ok(nodes.includes('No normal finish')); assert.ok(!nodes.includes('可用'))
  nodes = flatten(ModelCard({ ...props, model: { ...model, availabilitySource: 'manual', availability: 'available', probedAt: Date.now(), ttftMs: 321 } }))
  assert.ok(nodes.includes('最近测量')); assert.ok(nodes.some(node => node?.children?.includes(321)))
})
for (const persisted of [true, false]) {
  await check('benchmark waits 330s, refreshes summary and keeps success when persisted=' + persisted, async () => {
    const summary = { catalog: [{ id: 'listing', availability: 'available', availabilitySource: 'listing' }], settings: {} }
    const app = boot({ fetchImpl: endpoint => endpoint === '/summary' ? summary : endpoint === '/bench'
      ? { ttftMs: 123, tokensPerSecond: 45, reasoningTokens: 6, persisted } : {} })
    const props = { t: app.t }, draw = () => app.draw(app.api.SettingsPage, props)
    draw(); await tick(); let tree = draw()
    assert.equal(tree.props.counts.available ?? 0, 0, 'listing must not enter the confirmed-available count')
    await tree.props.bench({ id: 'fixture' }); await tick(); tree = draw()
    assert.equal(app.calls.find(call => call.endpoint === '/bench').timeout, 330_000)
    assert.equal(JSON.parse(app.calls.find(call => call.endpoint === '/bench').options.body).model, 'fixture')
    assert.ok(app.calls.filter(call => call.endpoint === '/summary').length >= 2)
    assert.equal(tree.props.benches.fixture.running, false)
    assert.match(tree.props.benches.fixture.result, /文本响应通过.*123.*45/)
    assert.equal(tree.props.benches.fixture.result.includes('结果未能保存'), !persisted)
    assert.ok(!app.calls.some(call => call.endpoint === '/settings'), 'UI preferences do not write backend settings')
    app.dispose()
  })
}
await check('a failed benchmark releases its busy state, keeps the error and refreshes persisted status', async () => {
  const app = boot({ fetchImpl: endpoint => endpoint === '/summary' ? { catalog: [], settings: {} }
    : endpoint === '/bench' ? { httpOk: false, error: 'No visible text' } : {} })
  const draw = () => app.draw(app.api.SettingsPage, { t: app.t })
  draw(); await tick(); const tree = draw(); await tree.props.bench({ id: 'fixture' }); await tick()
  const result = draw().props.benches.fixture
  assert.equal(result.running, false); assert.equal(result.result, 'No visible text')
  assert.ok(app.calls.filter(call => call.endpoint === '/summary').length >= 2); app.dispose()
})

if (process.argv.includes('--browser')) {
  await check('real browser CSS disables only OFM decoration and preserves progress, skeletons and host animation', () => {
    const executable = process.env.OFM_UI_BROWSER ?? (process.platform === 'win32'
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : 'chromium')
    const temporary = fs.mkdtempSync(path.join(process.env.OFM_UI_TEST_TMP ?? os.tmpdir(), 'ofm-ui-preferences-'))
    try {
      const { CSS } = boot().api
      const html = `<!doctype html><meta charset="utf-8"><style>${CSS}
.host-spinner{animation:host-spin 2s linear infinite;filter:blur(2px)}@keyframes host-spin{to{transform:rotate(360deg)}}
</style><body><div id="host" class="host-spinner">Host sibling</div>
<div id="ofm" class="ofm_root"><div class="ofm_nav">OFM text</div><span class="ofm_dot ok"></span><div class="ofm_aurora"><i></i></div><div class="ofm_prog"><i></i></div><div class="ofm_skel">Loading</div><button class="ofm_btn" aria-busy="true">Working</button></div>
<div id="toast" class="ofm_toasts"><div class="ofm_toast">Toast text</div></div>
<div id="announcement" data-ofm-announcement-root="true"><div class="ofm_scrim"><div class="ofm_ann">Announcement text</div></div></div>
<div id="urgent" class="ofm_scrim" data-ofm-urgent="true">Urgent text</div><pre id="results"></pre>
<script>
const roots=[ofm,toast,announcement,urgent];
const read=(selector,pseudo)=>{const node=document.querySelector(selector),s=getComputedStyle(node,pseudo);return {animation:s.animationName,filter:s.filter,backdrop:s.backdropFilter,display:s.display,opacity:s.opacity,width:node.getBoundingClientRect().width}};
const hostBefore=read('#host'),normal=read('.ofm_nav');
for(const root of roots)root.setAttribute('data-ofm-low-performance','true');
const low={nav:read('.ofm_nav'),dot:read('.ofm_dot'),aurora:read('.ofm_aurora'),progress:read('.ofm_prog i'),skeleton:read('.ofm_skel'),spinner:read('.ofm_btn','::after'),toast:read('.ofm_toast'),announcement:read('#announcement .ofm_scrim'),urgent:read('#urgent')};
const hostAfter=read('#host');for(const root of roots)root.setAttribute('data-ofm-low-performance','false');
results.textContent=JSON.stringify({hostBefore,hostAfter,normal,low,restored:read('.ofm_nav'),dotRestored:read('.ofm_dot'),text:ofm.textContent});
</script>`
      const fixture = path.join(temporary, 'fixture.html')
      fs.writeFileSync(fixture, html)
      const result = spawnSync(executable, ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.join(temporary, 'profile'), '--dump-dom', pathToFileURL(fixture).href], { encoding: 'utf8', timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024 })
      assert.ifError(result.error)
      assert.equal(result.status, 0, result.stderr.slice(0, 500))
      const match = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/)
      assert.ok(match, 'Chromium must execute the fixture script')
      const data = JSON.parse(match[1])
      assert.notEqual(data.normal.backdrop, 'none'); assert.notEqual(data.restored.backdrop, 'none')
      for (const name of ['nav', 'toast', 'announcement', 'urgent']) assert.equal(data.low[name].backdrop, 'none', name)
      assert.equal(data.low.dot.animation, 'none', 'legacy !important breathing must stop')
      assert.notEqual(data.dotRestored.animation, 'none'); assert.equal(data.low.aurora.display, 'none')
      assert.equal(data.low.progress.animation, 'ofm-prog-slide'); assert.ok(data.low.progress.width > 0)
      assert.equal(data.low.spinner.animation, 'ofm-btn-spin'); assert.notEqual(data.low.skeleton.display, 'none')
      assert.equal(data.low.skeleton.opacity, '1'); assert.match(data.text, /OFM text.*Loading.*Working/)
      assert.deepEqual(data.hostAfter, data.hostBefore)
    } finally { fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) }
  })
}
console.log(checks + ' plugin UI preference and benchmark checks passed')
