/** @param {import('./types').ServiceSettings} settings */
export function settingsDraft(settings) {
  return {
    enabled: settings.enabled,
    exposeRegionModels: settings.exposeRegionModels,
    hideFreeModels: settings.hideFreeModels === true,
    hideEacModels: settings.hideEacModels === true,
    streamRecovery: settings.streamRecovery,
    standaloneProbe: settings.standaloneProbe,
    defaultMaxTokens: String(settings.defaultMaxTokens),
    probeIntervalMinutes: String(settings.probeIntervalMinutes),
  }
}

/** @param {ReturnType<typeof settingsDraft>} draft
 * @param {import('./types').ServiceSettings} saved */
export function settingsChanged(draft, saved) {
  const baseline = settingsDraft(saved)
  return Object.keys(baseline).some(key => draft[key] !== baseline[key])
}

/** 轮询可以更新基线，但不能覆盖草稿或正在保存的输入。
 * @param {{ saved: import('./types').ServiceSettings, draft: ReturnType<typeof settingsDraft> }} state
 * @param {import('./types').ServiceSettings} saved
 * @param {boolean} saving */
export function syncSettings(state, saved, saving, editedFields) {
  if (saving) return { saved, draft: state.draft }
  // 旧调用保留原有草稿契约；交互表单传入明确编辑过的字段后逐字段合并。
  if (!editedFields) return { saved, draft: settingsChanged(state.draft, state.saved) ? state.draft : settingsDraft(saved) }
  const incoming = settingsDraft(saved)
  const draft = { ...incoming }
  for (const key of Object.keys(incoming)) if (editedFields.has(key)) draft[key] = state.draft[key]
  return { saved, draft }
}

/** 只提交明确编辑且与最新保存值不同的字段，不携带其他页面拥有的设置。 */
export function changedSettingsPatch(draft, saved, editedFields) {
  const validation = validateSettingsDraft(draft)
  if (!validation.patch) return validation
  return { errors: validation.errors, patch: Object.fromEntries(Object.entries(validation.patch)
    .filter(([key, value]) => (!editedFields || editedFields.has(key)) && value !== saved[key])) }
}

/** Only form-owned settings are submitted; preserve per-model choices made elsewhere.
 * @param {ReturnType<typeof settingsDraft>} draft */
export function validateSettingsDraft(draft) {
  /** @type {Partial<Record<'defaultMaxTokens' | 'probeIntervalMinutes', string>>} */
  const errors = {}
  for (const [key, label, min, max] of [
    ['defaultMaxTokens', '最大输出 Token', 512, 131072],
    ['probeIntervalMinutes', '刷新间隔', 1, 1440],
  ]) {
    const raw = draft[key].trim()
    const value = Number(raw)
    if (!raw || !Number.isInteger(value) || value < min || value > max) {
      errors[key] = `${label}必须是 ${min}–${max} 的整数。`
    }
  }
  return {
    errors,
    patch: Object.keys(errors).length ? null : {
      enabled: draft.enabled, exposeRegionModels: draft.exposeRegionModels,
      hideFreeModels: draft.hideFreeModels, hideEacModels: draft.hideEacModels,
      streamRecovery: draft.streamRecovery, standaloneProbe: draft.standaloneProbe,
      defaultMaxTokens: Number(draft.defaultMaxTokens), probeIntervalMinutes: Number(draft.probeIntervalMinutes),
    },
  }
}
