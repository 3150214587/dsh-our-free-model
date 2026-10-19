/** 广告横幅偏好、详情内容和插件构建的一致性，完全离线。 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SPONSOR, SPONSOR_COLLAPSE_KEY, sponsorBannerCollapsed, saveSponsorBannerCollapsed } from '../src/sponsor.js'
const memory = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}
const storage = memory()
assert.equal(sponsorBannerCollapsed(storage), false)
saveSponsorBannerCollapsed(storage, true)
assert.equal(sponsorBannerCollapsed(storage), true, '收起偏好可在刷新、重新进入时复用')
saveSponsorBannerCollapsed(storage, false)
assert.equal(sponsorBannerCollapsed(storage), false, '主动展开后不应沿用旧收起状态')
storage.setItem(SPONSOR_COLLAPSE_KEY, 'corrupt')
assert.equal(sponsorBannerCollapsed(storage), false, '未知偏好值按正常展示处理')
assert.equal(sponsorBannerCollapsed(undefined), false)
const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('quota') } }
assert.equal(sponsorBannerCollapsed(blocked), false)
assert.doesNotThrow(() => saveSponsorBannerCollapsed(blocked, true), '存储禁用不能阻断当前交互')
assert.doesNotThrow(() => saveSponsorBannerCollapsed(undefined, true))
for (const legacy of ['1900-01-01', '2099-12-31']) {
  const old = memory(); old.setItem('ofm.sponsor.last-shown.v1', legacy)
  assert.equal(sponsorBannerCollapsed(old), false, '旧每日记录与横幅无关')
}
const source = fs.readFileSync(new URL('../src/sponsor.js', import.meta.url), 'utf8')
assert.doesNotMatch(source, /SponsorNotice|claimSponsorDay|showModal|createPortal|SPONSOR_DAY_KEY/, '赞助组件不包含自动弹窗入口')
assert.doesNotMatch(source, /document\.body\.style|keydown|visibilitychange/, '横幅不能锁定滚动或拦截宿主按键')
assert.equal(new URL(SPONSOR.url).searchParams.get('aff'), SPONSOR.invite)
assert.equal(SPONSOR.paragraphs.length, 6)
assert.equal(fs.readFileSync(new URL('../docs/images/sponsor-beichen-examples.jpg', import.meta.url)).length, 59507)
execFileSync(process.execPath, [fileURLToPath(new URL('./build-sponsor.mjs', import.meta.url)), '--check'], { stdio: 'pipe' })
console.log('sponsor: 横幅收起/展开、存储异常、旧记录兼容、无弹窗与共享内容检查通过')
