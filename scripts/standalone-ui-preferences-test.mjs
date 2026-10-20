import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { LOW_PERFORMANCE_KEY, createUiPreferences, createThemeSwitcher, getUiPreferences } from '../packages/standalone/frontend/ui-preferences.mjs'
import { settingsDraft, settingsChanged, syncSettings, validateSettingsDraft } from '../packages/standalone/frontend/settings-data.mjs'
import { visibilityCopy } from '../packages/standalone/frontend/visibility-data.mjs'

function harness(initial, faults = {}) {
  const values = new Map(initial === undefined ? [] : [[LOW_PERFORMANCE_KEY, initial]])
  const writes = []
  const attributes = new Map(), properties = new Map(), classes = new Set()
  const root = {
    dataset: { theme: 'light' },
    setAttribute(name, value) { attributes.set(name, value) },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    style: { setProperty: (name, value) => properties.set(name, value), removeProperty: name => properties.delete(name) },
  }
  const storage = {
    getItem(key) { if (faults.read) throw new Error('read denied'); return values.get(key) ?? null },
    setItem(key, value) { if (faults.write) throw new Error('quota exceeded'); values.set(key, value); writes.push([key, value]) },
  }
  const events = new EventTarget()
  const getStorage = () => { if (faults.access) throw new Error('SecurityError'); return storage }
  const preferences = createUiPreferences({ root, getStorage, events })
  const change = (key, newValue, storageArea = storage) => events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue, storageArea }))
  return { preferences, root, attributes, properties, classes, values, writes, storage, events, change, faults }
}

for (const [raw, expected] of [[undefined, false], ['true', true], ['false', false], ['TRUE', false], ['1', false], ['', false]]) {
  test('初始化偏好：' + String(raw), () => {
    const h = harness(raw)
    assert.equal(h.preferences.getSnapshot().lowPerformance, expected)
    assert.equal(h.attributes.get('data-ofm-low-performance'), String(expected))
    assert.equal(h.writes.length, 0, '初始化不覆盖浏览器已有值')
    assert.equal(h.preferences.getSnapshot(), h.preferences.getSnapshot(), 'React 快照必须稳定')
    h.preferences.dispose()
  })
}

test('切换立即更新文档并保存字符串；刷新后恢复，关闭也会保存', () => {
  const h = harness()
  let notified = 0
  const unsubscribe = h.preferences.subscribe(() => notified++)
  h.preferences.setLowPerformance(true)
  assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
  assert.deepEqual(h.writes, [[LOW_PERFORMANCE_KEY, 'true']])
  assert.equal(notified, 1)
  const reload = harness(h.values.get(LOW_PERFORMANCE_KEY))
  assert.equal(reload.preferences.getSnapshot().lowPerformance, true)
  unsubscribe()
  h.preferences.setLowPerformance(false)
  assert.equal(notified, 1)
  assert.equal(h.values.get(LOW_PERFORMANCE_KEY), 'false')
  assert.equal(harness(h.values.get(LOW_PERFORMANCE_KEY)).preferences.getSnapshot().lowPerformance, false)
  reload.preferences.dispose(); h.preferences.dispose()
})

for (const fault of ['access', 'read', 'write']) {
  test('存储异常仍能往返切换：' + fault, () => {
    const h = harness(undefined, { [fault]: true })
    h.preferences.setLowPerformance(true)
    assert.equal(h.preferences.getSnapshot().lowPerformance, true)
    assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
    if (fault !== 'read') assert.equal(h.preferences.getSnapshot().storageAvailable, false)
    h.preferences.setLowPerformance(false)
    assert.equal(h.attributes.get('data-ofm-low-performance'), 'false')
    h.faults[fault] = false
    h.preferences.setLowPerformance(true)
    assert.equal(h.preferences.getSnapshot().storageAvailable, true)
    assert.equal(h.values.get(LOW_PERFORMANCE_KEY), 'true')
    h.preferences.dispose()
  })
}

test('跨窗口同步只接受本地同名偏好；删除/清空后恢复默认', () => {
  const h = harness()
  h.change('ofm-theme', 'true')
  h.change(LOW_PERFORMANCE_KEY, 'true', {})
  assert.equal(h.preferences.getSnapshot().lowPerformance, false)
  h.change(LOW_PERFORMANCE_KEY, 'true')
  assert.equal(h.preferences.getSnapshot().lowPerformance, true)
  assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
  assert.equal(h.writes.length, 0, '同步不回写，避免窗口间循环')
  h.change(LOW_PERFORMANCE_KEY, null)
  assert.equal(h.preferences.getSnapshot().lowPerformance, false)
  h.change(LOW_PERFORMANCE_KEY, 'true')
  h.change(null, null)
  assert.equal(h.preferences.getSnapshot().lowPerformance, false)
  h.preferences.dispose()
  h.change(LOW_PERFORMANCE_KEY, 'true')
  assert.equal(h.preferences.getSnapshot().lowPerformance, false, '销毁后移除事件监听')
})

function themeHarness(initial, options = {}) {
  const h = harness(initial)
  const transitions = [], applied = []
  let commits = 0
  const document = { documentElement: h.root }
  if (!options.unsupported) document.startViewTransition = callback => {
    if (options.throws) throw new Error('snapshot unavailable')
    let resolve, reject
    const finished = new Promise((yes, no) => { resolve = yes; reject = no })
    const entry = { callback, resolve, reject, skipped: 0, finished,
      ready: options.rejectReady ? Promise.reject(new Error('snapshot skipped')) : Promise.resolve(),
      skipTransition() { entry.skipped++; resolve() },
    }
    transitions.push(entry)
    return entry
  }
  const window = { innerWidth: 390, innerHeight: 844, matchMedia: () => ({ matches: Boolean(options.reduced) }) }
  const switcher = createThemeSwitcher({ document, window, preferences: h.preferences,
    apply: next => { h.root.dataset.theme = next; applied.push(next) },
    commit: update => { commits++; update() },
  })
  return { ...h, switcher, document, window, transitions, applied, commits: () => commits }
}

const origin = { x: 20, y: 30 }
for (const initialTheme of ['light', 'dark']) {
  test('低性能主题直接切换且从不申请动画快照：' + initialTheme, () => {
    const h = themeHarness('true')
    h.switcher.dispose()
    h.root.dataset.theme = initialTheme
    const switcher = createThemeSwitcher({ document: h.document, window: h.window, preferences: h.preferences,
      apply: next => { h.root.dataset.theme = next },
    })
    switcher.toggle(origin)
    assert.equal(h.root.dataset.theme, initialTheme === 'light' ? 'dark' : 'light')
    switcher.toggle(origin)
    assert.equal(h.root.dataset.theme, initialTheme)
    assert.equal(h.transitions.length, 0)
    assert.equal(h.properties.size, 0)
    assert.equal(h.classes.size, 0)
    switcher.dispose(); h.preferences.dispose()
  })
}

test('普通模式保留主题动画，完成后清理揭幕状态', async () => {
  const h = themeHarness('false')
  h.switcher.toggle(origin)
  assert.equal(h.transitions.length, 1)
  assert.equal(h.classes.has('theme-transitioning'), true)
  h.transitions[0].callback()
  assert.equal(h.root.dataset.theme, 'dark')
  assert.equal(h.commits(), 1)
  h.transitions[0].resolve()
  await Promise.resolve()
  assert.equal(h.classes.size, 0)
  assert.equal(h.properties.size, 0)
  h.switcher.dispose(); h.preferences.dispose()
})

test('开启低性能会取消进行中的主题动画，迟到回调不能覆盖最新主题', async () => {
  const h = themeHarness()
  h.switcher.toggle(origin)
  h.preferences.setLowPerformance(true)
  assert.equal(h.transitions[0].skipped, 1)
  assert.equal(h.root.dataset.theme, 'dark')
  h.switcher.toggle(origin)
  assert.equal(h.root.dataset.theme, 'light')
  h.transitions[0].callback()
  await Promise.resolve()
  assert.equal(h.root.dataset.theme, 'light')
  assert.equal(h.transitions.length, 1)
  assert.equal(h.properties.size, 0)
  h.switcher.dispose(); h.preferences.dispose()
})

test('快速切换不受旧动画回调影响，跨窗口开启低模式同样取消动画', async () => {
  const h = themeHarness()
  h.switcher.toggle(origin)
  h.switcher.toggle(origin)
  assert.equal(h.transitions[0].skipped, 1)
  h.transitions[1].callback(); h.transitions[0].callback()
  assert.equal(h.root.dataset.theme, 'light')
  h.change(LOW_PERFORMANCE_KEY, 'true')
  assert.equal(h.transitions[1].skipped, 1)
  await Promise.resolve()
  assert.equal(h.classes.size, 0)
  h.switcher.dispose(); h.preferences.dispose()
})

for (const options of [{ reduced: true }, { unsupported: true }, { throws: true }]) {
  test('系统降动效或动画不可用仍切换主题：' + JSON.stringify(options), () => {
    const h = themeHarness('false', options)
    h.switcher.toggle(origin)
    assert.equal(h.root.dataset.theme, 'dark')
    assert.equal(h.classes.size, 0)
    assert.equal(h.properties.size, 0)
    h.switcher.dispose(); h.preferences.dispose()
  })
}

test('快照失败和卸载均清理状态，不产生未处理的拒绝', async () => {
  const h = themeHarness(undefined, { rejectReady: true })
  h.switcher.toggle(origin)
  h.transitions[0].reject(new Error('animation failed'))
  await Promise.resolve()
  assert.equal(h.classes.size, 0)
  assert.equal(h.properties.size, 0)
  h.switcher.toggle(origin)
  h.switcher.dispose()
  h.transitions[1].callback()
  h.switcher.toggle(origin)
  await Promise.resolve()
  assert.equal(h.transitions.length, 2)
  assert.equal(h.properties.size, 0)
  h.preferences.dispose()
})

// Compile real TSX in memory when the project's existing compiler is available.
// Core storage/theme behavior above always runs, including in offline CI.
let transformSync
try { ({ transformSync } = createRequire(new URL('../packages/standalone/package.json', import.meta.url))('esbuild')) } catch {}
function componentHarness(file, names) {
  const source = fs.readFileSync(new URL('../packages/standalone/frontend/' + file, import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/^export /gm, '')
  const code = transformSync(source + '\nexports.component = ' + names.component, { loader: 'tsx', jsxFactory: 'h', jsxFragment: 'Fragment' }).code
  const slots = [], effects = [], memos = []
  let index = 0
  const context = {
    ...names,
    useState(initial) { const at = index++; if (!(at in slots)) slots[at] = typeof initial === 'function' ? initial() : initial; return [slots[at], next => { slots[at] = typeof next === 'function' ? next(slots[at]) : next }] },
    useMemo(factory) { index++; const value = factory(); memos.push(value); return value },
    useRef(initial) { const at = index++; return slots[at] ??= { current: initial } },
    useEffect(effect, deps) { const at = index++; if (slots[at]) return; slots[at] = deps; effects.push(effect) },
    useSyncExternalStore(subscribe, snapshot) { index++; return snapshot() },
    h: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    Fragment: 'fragment', exports: {},
  }
  vm.runInNewContext(code, context)
  return { memos, render(props) { index = 0; return context.exports.component(props) }, mount() { return effects.splice(0).map(effect => effect()) } }
}
function find(node, predicate, parents = []) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return { node, parents }
  for (const child of node.children ?? []) { const result = find(child, predicate, [...parents, node]); if (result) return result }
}

test('实际设置控件立即切换、说明存储异常，且不调用服务保存', { skip: !transformSync && 'esbuild 未安装；纯行为测试仍执行' }, () => {
  const h = harness(undefined, { write: true })
  let saves = 0
  const serviceSettings = { enabled: true, exposeRegionModels: false, streamRecovery: true, standaloneProbe: false,
    hideFreeModels: false, hideEacModels: false, defaultMaxTokens: 4096, probeIntervalMinutes: 60 }
  const component = componentHarness('settings.tsx', { component: 'Settings', document: { documentElement: { lang: 'zh-CN' } }, getUiPreferences: () => h.preferences,
    settingsDraft, settingsChanged, syncSettings, validateSettingsDraft, visibilityCopy,
    Badge: 'Badge', Button: 'Button', Card: 'Card', Input: 'Input', CircleAlert: 'CircleAlert', Check: 'Check',
    LoaderCircle: 'LoaderCircle', RotateCcw: 'RotateCcw', Save: 'Save', Settings2: 'Settings2', RefreshCw: 'RefreshCw',
  })
  const props = { summary: { settings: serviceSettings, automaticRefresh: true }, host: { saveSettings() { saves++ } }, active: true }
  let tree = component.render(props)
  let field = find(tree, node => node.props.id === 'setting-low-performance')
  assert.equal(field.node.props.checked, false)
  assert.equal(field.node.props.role, 'switch')
  assert.equal(field.parents.some(node => node.type === 'form'), false, '本地开关不参与服务保存')
  assert.equal(field.parents.some(node => node.props.disabled), false)
  field.node.props.onChange({ target: { checked: true } })
  tree = component.render(props)
  assert.equal(find(tree, node => node.props.id === 'setting-low-performance').node.props.checked, true)
  const status = find(tree, node => node.props.id === 'setting-ui-preferences-status').node
  assert.match(status.children.join(''), /存储不可用/)
  assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
  assert.equal(saves, 0)
  assert.equal(component.render({ ...props, active: false }), null)
  assert.equal(find(component.render(props), node => node.props.id === 'setting-low-performance').node.props.checked, true)
  h.preferences.dispose()
})

test('实际主题按钮在低模式下直接切换并更新可访问名称', { skip: !transformSync && 'esbuild 未安装；纯行为测试仍执行' }, () => {
  const h = themeHarness('true')
  h.switcher.dispose()
  const icons = Object.fromEntries(['Coffee', 'Activity', 'Boxes', 'Cable', 'ChevronRight', 'Handshake', 'LayoutDashboard', 'LogOut', 'Moon', 'Network', 'Settings2', 'ShieldCheck', 'Sun'].map(name => [name, name]))
  const component = componentHarness('components/shell.tsx', { ...icons, component: 'ThemeToggle', document: h.document, window: h.window,
    localStorage: h.storage, getUiPreferences: () => h.preferences, createThemeSwitcher, flushSync: update => update(),
    Badge: 'Badge', Button: 'Button', brandMark: '',
  })
  let tree = component.render()
  const cleanups = component.mount()
  tree.props.onClick({ currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 40, height: 40 }) } })
  tree = component.render()
  assert.equal(tree.props['aria-label'], '切换到浅色主题')
  assert.equal(h.root.dataset.theme, 'dark')
  assert.equal(h.values.get('ofm-theme'), 'dark')
  assert.equal(h.transitions.length, 0)
  cleanups.forEach(cleanup => cleanup?.())
  h.preferences.dispose()
})

test('应用入口共享同一个偏好实例，初始化即恢复已存模式', () => {
  const h = harness('true')
  globalThis.document = { documentElement: h.root }
  globalThis.window = { localStorage: h.storage, addEventListener: (...args) => h.events.addEventListener(...args), removeEventListener: (...args) => h.events.removeEventListener(...args) }
  try {
    const store = getUiPreferences()
    assert.equal(store, getUiPreferences())
    assert.equal(store.getSnapshot().lowPerformance, true)
    assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
    store.dispose()
  } finally { delete globalThis.document; delete globalThis.window; h.preferences.dispose() }
})


test('实际应用入口在首屏前恢复偏好，测速请求使用 330 秒超时', { skip: !transformSync && 'esbuild 未安装；纯行为测试仍执行' }, async () => {
  const h = harness('true')
  let initialized = false
  const times = [], requests = []
  const document = { documentElement: h.root, getElementById: () => h.root }
  const component = componentHarness('app.tsx', { component: 'App', document,
    navigator: { userAgent: 'Windows', clipboard: {} }, window: {},
    getUiPreferences() { initialized = true; return h.preferences },
    createRoot() {
      assert.equal(initialized, true, '偏好初始化必须先于 React 根节点创建')
      assert.equal(h.attributes.get('data-ofm-low-performance'), 'true')
      return { render() {} }
    },
    Sidebar: 'Sidebar', Topbar: 'Topbar', Overview: 'Overview', Connection: 'Connection', AlertCircle: 'AlertCircle',
    SponsorPage: 'SponsorPage', SponsorNotice: 'SponsorNotice',
    AbortSignal: { timeout(ms) { times.push(ms); return { ms } }, any(signals) { return signals } },
    fetch: async (url, init) => { requests.push({ url, init }); return { ok: true, json: async () => ({ ok: true }) } },
  })
  component.render()
  const host = component.memos.find(value => typeof value?.testModel === 'function')
  assert.ok(host)
  assert.deepEqual(await host.testModel('fixture-model', {}), { ok: true })
  assert.equal(times.at(-1), 330000)
  assert.equal(requests.at(-1).url, '/api/management/models/test')
  h.preferences.dispose()
})


test('同文档渠道与外壳共享事件，切换不循环写入，存储失败状态也同步', () => {
  const h = harness()
  const secondAttributes = new Map()
  const second = createUiPreferences({ root: { setAttribute: (key, value) => secondAttributes.set(key, value) }, getStorage: () => h.storage, events: h.events })
  h.preferences.setLowPerformance(true)
  assert.equal(second.getSnapshot().lowPerformance, true)
  assert.equal(secondAttributes.get('data-ofm-low-performance'), 'true')
  assert.equal(h.writes.length, 1, '收到事件不能重新保存并形成事件环')
  h.events.dispatchEvent(new CustomEvent('ofm:ui-preferences', { detail: { lowPerformance: false, storageAvailable: false } }))
  assert.equal(h.preferences.getSnapshot().lowPerformance, false)
  assert.equal(second.getSnapshot().lowPerformance, false)
  assert.equal(second.getSnapshot().storageAvailable, false)
  h.events.dispatchEvent(new CustomEvent('ofm:ui-preferences', { detail: { lowPerformance: 'true' } }))
  assert.equal(second.getSnapshot().lowPerformance, false, '忽略形状不对的事件')
  second.dispose(); h.preferences.dispose()
})
