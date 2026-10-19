import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { settingsDraft, changedSettingsPatch } from '../packages/standalone/frontend/settings-data.mjs'
const read = path => fs.readFileSync(new URL('../packages/standalone/frontend/' + path, import.meta.url), 'utf8')
const extract = (source, start, end) => {
  const at = source.indexOf(start), stop = source.indexOf(end, at + start.length)
  assert.ok(at >= 0 && stop > at, '实际操作代码必须可定位：' + start)
  return source.slice(at, stop)
}
const load = (body, name, context) => vm.runInNewContext(stripTypeScriptTypes(body) + '\n' + name, { Error, ...context })
const tick = () => new Promise(resolve => setImmediate(resolve))

// 执行 Switch 实际事件函数，验证自定义点击不会覆盖切换逻辑。
const switchBody = extract(read('components/ui.tsx'), '  const handleClick =', '  return <button')
let clicks = 0, values = []
const event = () => ({ defaultPrevented: false, preventDefault() { this.defaultPrevented = true } })
const click = load(switchBody, 'handleClick', { disabled: false, checked: false, onClick: () => clicks++, onCheckedChange: value => values.push(value) })
click(event()); assert.equal(clicks, 1); assert.deepEqual(values, [true])
load(switchBody, 'handleClick', { disabled: false, checked: true, onClick: value => value.preventDefault(), onCheckedChange: () => assert.fail('取消的点击不得切换') })(event())
load(switchBody, 'handleClick', { disabled: true, checked: true, onClick: () => assert.fail('禁用控件不得执行'), onCheckedChange: () => assert.fail('禁用控件不得切换') })(event())

// 渠道操作保存成功后读取失败，必须继续通知摘要且不诱导重复提交。
const channelRun = extract(read('channels.mjs'), '  const run = async', '  const backup = async')
const channelState = { message: '', busy: false, notifications: 0, reloads: 0, writes: 0 }
const channelContext = { actionPending: { current: false }, mounted: { current: true },
  setBusy: value => channelState.busy = value, setMessage: value => channelState.message = value, setMessageKind() {},
  window: { dispatchEvent: () => channelState.notifications++ }, CustomEvent: class {},
  summary: { reload: () => channelState.reloads++ }, reload: async () => { throw new Error('模拟状态读取失败') } }
const saveChannel = load(channelRun, 'run', channelContext)
await saveChannel(async () => { channelState.writes++ })
assert.equal(channelState.writes, 1); assert.equal(channelState.notifications, 1); assert.equal(channelState.reloads, 1)
assert.match(channelState.message, /已保存.*状态刷新失败.*无需重复提交/); assert.equal(channelState.busy, false)
let finishAction
const firstAction = saveChannel(() => new Promise(resolve => { finishAction = resolve }))
await saveChannel(async () => assert.fail('重复点击不能再次保存')); finishAction(); await firstAction

// 签到读取失败后实际读取函数可以重试，并且拒绝迟到状态。
const autoBody = extract(read('components/channel-browser.tsx'), '  const readAuto =', '  useEffect(() => {\n    mounted.current = true')
const autoState = { auto: undefined, reading: false, error: '' }
const autoMounted = { current: true }, autoSequence = { current: 0 }, autoPending = { current: false }
let failAuto = true
const readAuto = load(autoBody, 'readAuto', { useCallback: callback => callback, mounted: autoMounted, autoSequence, autoPending,
  setAuto: value => autoState.auto = value, setAutoReading: value => autoState.reading = value, setAutoError: value => autoState.error = value,
  rpc: async () => { if (failAuto) throw new Error('签到读取暂时失败'); return { autoCheckin: { enabled: false, ranToday: true } } } })
await readAuto(); assert.match(autoState.error, /签到读取暂时失败/); assert.equal(autoState.reading, false)
failAuto = false; await readAuto(); assert.equal(autoState.error, ''); assert.equal(autoState.auto.enabled, false); assert.equal(autoState.auto.ranToday, true)

// 模型取消刷新时应中断请求，同时保留上一次成功测试的正文。
const models = read('models.tsx'), cancelBody = extract(models, '  const cancel =', '  const copyModelId =')
const controller = new AbortController(), modelState = { test: { state: 'success', result: { text: '原测试回答' } }, message: '', operation: 'probe' }
const pending = { current: controller }
load(cancelBody, 'cancel', { operation: 'probe', pending,
  setOperation: value => modelState.operation = value, setTest: update => modelState.test = update(modelState.test), setMessage: value => modelState.message = value })()
assert.equal(controller.signal.aborted, true); assert.equal(pending.current, undefined)
assert.equal(modelState.test.state, 'success'); assert.equal(modelState.test.result.text, '原测试回答'); assert.match(modelState.message, /已取消可用性探测/)

// 直接复制密钥不会将其写入页面状态；离页后的迟到读取不能继续复制。
const connection = read('connection.tsx')
const connectionRun = extract(connection, '  const run = async', '  const markCopied =')
const keyBody = extract(connection, '  const copyKey =', '  const toggleKey =')
const keyState = { busy: false, copied: [], notices: [] }, activeRef = { current: true }, generation = { current: 0 }
const runKey = load(connectionRun, 'run', { pending: { current: false }, mounted: { current: true }, activeRef, generation,
  setBusy: value => keyState.busy = value, setNotice: value => keyState.notices.push(value), setError: value => { if (value) throw new Error(value) } })
const keyContext = { run: runKey, apiKey: '', host: { getApiKey: async () => 'fixture-secret', copy: async key => keyState.copied.push(key) }, markCopied: () => {}, setApiKey: () => assert.fail('复制不得显示密钥') }
load(keyBody, 'copyKey', keyContext)(); await tick()
assert.deepEqual(keyState.copied, ['fixture-secret']); assert.equal(keyState.busy, false)
let finishKey
keyContext.host.getApiKey = () => new Promise(resolve => { finishKey = resolve })
load(keyBody, 'copyKey', keyContext)(); activeRef.current = false; generation.current++
finishKey('late-secret'); await tick(); assert.deepEqual(keyState.copied, ['fixture-secret'])

// 执行设置页实际提交函数：校验聚焦、最小提交、保存成功后的读取失败。
const settingsBody = extract(read('settings.tsx'), '  const submit = async', '  const toggle =')
const saved = { enabled: true, exposeRegionModels: true, hideFreeModels: true, hideEacModels: false, streamRecovery: true, standaloneProbe: false, defaultMaxTokens: 32768, probeIntervalMinutes: 15 }
const formState = { saved, draft: { ...settingsDraft(saved), defaultMaxTokens: '' } }, feedback = { focus: '', errors: {}, message: '', patches: [] }
const formContext = { state: formState, changedSettingsPatch, settingsDraft, editedFields: { current: new Set(['defaultMaxTokens']) },
  savingRef: { current: false }, activeRef: { current: true }, mounted: { current: true }, generation: { current: 0 },
  setErrors: value => feedback.errors = value, setMessage: value => feedback.message = value, setError() {}, setSaving() {},
  setState: update => { const value = typeof update === 'function' ? update(formState) : update; Object.assign(formState, value) },
  window: { requestAnimationFrame: callback => callback() }, document: { getElementById: id => ({ focus: () => feedback.focus = id }) },
  host: { saveSettings: async patch => { feedback.patches.push(patch); return { ...saved, ...patch } }, refresh: async () => { throw new Error('模拟读取失败') } } }
const submit = load(settingsBody, 'submit', formContext)
await submit({ preventDefault() {} }); assert.equal(feedback.focus, 'setting-defaultMaxTokens'); assert.equal(feedback.patches.length, 0)
formState.draft.defaultMaxTokens = '8192'; await submit({ preventDefault() {} })
assert.equal(feedback.patches.length, 1); assert.equal(JSON.stringify(feedback.patches[0]), JSON.stringify({ defaultMaxTokens: 8192 }))
assert.match(feedback.message, /设置已保存；状态刷新失败/)

// 键盘图表的实际事件处理：方向键和首尾键，不吞掉 Tab。
const usage = read('usage.tsx')
const keyboard = extract(usage, 'onKeyDown={event => {', '          }}>').replace('onKeyDown={', '') + '}'
const focus = [], days = Array.from({ length: 7 }, (_, i) => ({ day: String(i) }))
const chartKey = index => load('const handle = ' + keyboard, 'handle', { index, days })
const keyEvent = key => ({ key, prevented: false, preventDefault() { this.prevented = true }, currentTarget: { parentElement: { querySelectorAll: () => days.map((_, i) => ({ focus: () => focus.push(i) })) } } })
chartKey(3)(keyEvent('Home')); chartKey(3)(keyEvent('End')); chartKey(6)(keyEvent('ArrowRight')); chartKey(0)(keyEvent('ArrowLeft'))
assert.deepEqual(focus, [0, 6, 6, 0]); const tab = keyEvent('Tab'); chartKey(3)(tab); assert.equal(tab.prevented, false)
console.log('frontend-interaction: Switch 组合事件、渠道保存/读取、签到恢复、模型取消、遮罩复制/迟到响应、设置校验/提交和图表键盘通过')
