import assert from 'node:assert/strict'
import { settingsDraft, settingsChanged, syncSettings, changedSettingsPatch, validateSettingsDraft } from '../packages/standalone/frontend/settings-data.mjs'

const saved = { enabled: true, exposeRegionModels: true, hideFreeModels: false, hideEacModels: false,
  hiddenModelIds: ['keep-hidden'], streamRecovery: true, standaloneProbe: false,
  defaultMaxTokens: 32768, probeIntervalMinutes: 15 }
const baseline = structuredClone(saved)
const edited = new Set(['defaultMaxTokens'])
const draft = { ...settingsDraft(saved), defaultMaxTokens: '8192' }
const incoming = { ...saved, hideFreeModels: true, hideEacModels: true, probeIntervalMinutes: 30, hiddenModelIds: ['changed-elsewhere'] }
const merged = syncSettings({ saved, draft }, incoming, false, edited)
assert.equal(merged.draft.defaultMaxTokens, '8192', '用户编辑的字段必须保留')
assert.equal(merged.draft.hideFreeModels, true, '模型页新保存的开关必须合并进草稿')
assert.equal(merged.draft.hideEacModels, true)
assert.equal(merged.draft.probeIntervalMinutes, '30', '没有编辑过的数值跟随最新状态')
assert.deepEqual(changedSettingsPatch(merged.draft, merged.saved, edited).patch, { defaultMaxTokens: 8192 }, '保存仅提交用户修改的字段')
assert.ok(!Object.hasOwn(changedSettingsPatch(merged.draft, merged.saved, edited).patch, 'hiddenModelIds'))

const sameField = syncSettings({ saved, draft }, { ...incoming, defaultMaxTokens: 16384 }, false, edited)
assert.equal(sameField.draft.defaultMaxTokens, '8192', '同字段外部变化不能静默覆盖用户输入')
assert.equal(sameField.saved.defaultMaxTokens, 16384)
assert.deepEqual(changedSettingsPatch(sameField.draft, sameField.saved, edited).patch, { defaultMaxTokens: 8192 })
const clean = syncSettings({ saved, draft: settingsDraft(saved) }, incoming, false, new Set())
assert.deepEqual(clean.draft, settingsDraft(incoming))
assert.equal(settingsChanged(clean.draft, clean.saved), false)
assert.deepEqual(changedSettingsPatch({ ...clean.draft, defaultMaxTokens: ' 32768 ' }, incoming, edited).patch, {}, '数值等价的空白不构成修改')
assert.deepEqual(changedSettingsPatch(clean.draft, incoming, new Set()).patch, {})

const invalid = changedSettingsPatch({ ...merged.draft, defaultMaxTokens: '', probeIntervalMinutes: '0' }, incoming, edited)
assert.equal(invalid.patch, null)
assert.deepEqual(Object.keys(invalid.errors).sort(), ['defaultMaxTokens', 'probeIntervalMinutes'])
const whileSaving = syncSettings({ saved, draft }, incoming, true, edited)
assert.deepEqual(whileSaving.draft, draft, '请求进行时不改写提交中的输入')
assert.deepEqual(saved, baseline)
assert.equal(draft.defaultMaxTokens, '8192')
assert.deepEqual(validateSettingsDraft(settingsDraft(saved)).patch, Object.fromEntries(Object.entries(saved).filter(([key]) => key !== 'hiddenModelIds')), '保留原有完整校验契约')
assert.deepEqual(syncSettings({ saved, draft }, incoming, false).draft, draft, '未传编辑集合的旧调用保留旧契约')
console.log('settings-draft-merge: 字段级合并、外部开关、同字段冲突、最小提交、校验和旧契约通过')
