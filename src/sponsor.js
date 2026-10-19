/** 赞助内容与页内展示位：只有用户主动查看详情才进入广告专页。 */
export const SPONSOR = Object.freeze({
  title: '北辰API',
  name: '北辰API',
  url: 'https://beichenapi.com/register?aff=DL49WAC2DQNG',
  invite: 'DL49WAC2DQNG',
  greeting: '非常抱歉，亲爱的朋友：',
  paragraphs: [
    '为了租上服务器(超级贵，我们几个穷学生...)，让我们的插件正常使用，我们不得不找甲方接一点广告和挣一点佣金。非常抱歉，这都是为了提高服务器并发量和号池(100%是为了提升体验和维护运营)(突然爆火了，我们的小服务器直接炸，只好花钱换)，属实是无奈之举。若广告带来了不好的体验，还望体谅。',
    '本插件旨在给大家学习提供免费的算力，可能响应速度确实偏慢，但已经尽我们所能在提升。(肯定不是为了骗你star，最近的爆火，真是意料之外)如果响应太慢，可能是因为同时多人使用，还希望多多包涵。',
    '关于广告：广告是为了用服务器以及运营，并且其来源是大家使用中转站的抽成。(所以如果可以，请务必使用我们的邀请码呀ʕ  •ᴥ•ʔ)',
    '这是我们甲方的中转站，可以去官网首页有群链接找群主要体验，提供了优质的外国大模型算力(肯定是有品质保证的，不然也不敢挂合作)。如果希望使用外国优质大模型(大胆进行鹈鹕测试)，请务必考虑使用我们的链接。(求求大家了，不要跳过这个邀请码，我们的某位成员为此什么都会做的( •̥́ ˍ •̀ू ))',
    '(•‾̑⌣‾̑•)✧˖如果你希望使用相关付费算力，请务必考虑我们提供的渠道(其实这个渠道很不错的，价格和质量还不错)。我们的项目还会继续运营，以后也会免费下去。打这个广告也是迫不得已...(相信我们，真的不想圈米，只想运营好这个项目(所以租了个很贵的服务器)，(ó﹏ò｡) 对于讨厌广告的朋友实在抱歉啊)',
    '总之，还是感谢大家的支持(没办法以中转站的形式中支持也没关系，愿意点Star和使用，就已经让我们非常高兴)和陪伴，有了这种变相的赞助，我们肯定会保障ofm服务越来越好。再次真心谢谢大家。',
  ],
})

// 只存展示位的收起偏好；不再读取或写入旧的每日弹窗记录。
export const SPONSOR_COLLAPSE_KEY = 'ofm.sponsor.banner-collapsed.v1'

export function sponsorBannerCollapsed(storage) {
  try { return storage?.getItem(SPONSOR_COLLAPSE_KEY) === '1' } catch { return false }
}

export function saveSponsorBannerCollapsed(storage, collapsed) {
  try { storage?.setItem(SPONSOR_COLLAPSE_KEY, collapsed ? '1' : '0') } catch { /* 本次会话仍保持选择。 */ }
}

/** 两端共用 React 组件；插件通过构建脚本内联，独立端直接导入。 */
export function createSponsorUI(React, image, variant = 'plugin') {
  const { createElement: h, useState, useEffect, useRef } = React
  const surfaceClass = `ofm-sponsor ofm-sponsor-${variant}`
  const icon = (name, size = 18) => h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
    name === 'arrow' ? h('path', { d: 'M7 17 17 7M7 7h10v10' })
      : name === 'close' ? h('path', { d: 'm6 6 12 12M6 18 18 6' })
        : [h('path', { key: 1, d: 'M20 8v5a3 3 0 0 1-3 3H8a4 4 0 0 1-4-4V8zM20 9h1a2 2 0 0 1 0 4h-1M8 4v1m5-1v1' }), h('path', { key: 2, d: 'M4 20h16' })])

  function SponsorArticle() {
    const [copied, setCopied] = useState('')
    const copyTimer = useRef(null)
    useEffect(() => () => clearTimeout(copyTimer.current), [])
    const copy = async (value, label) => {
      try {
        await navigator.clipboard.writeText(value)
        setCopied(`${label}已复制`)
      } catch { setCopied('复制未完成，请选中文字手动复制。') }
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(''), 3000)
    }
    const paragraph = index => h('p', { key: index }, SPONSOR.paragraphs[index])
    return h('article', { className: 'ofm-sponsor-article' },
      h('div', { className: 'ofm-sponsor-intro' },
        h('div', null, h('h2', null, '让免费服务，继续陪伴。'), h('p', null, '一封来自 OFM 团队的说明，也是一份坦诚的赞助邀请。')),
        h('span', { className: 'ofm-sponsor-seal', 'aria-hidden': true }, icon('cup', 26))),
      h('div', { className: 'ofm-sponsor-letter' },
        h('p', { className: 'ofm-sponsor-greeting' }, SPONSOR.greeting),
        paragraph(0), paragraph(1), paragraph(2),
        h('div', { className: 'ofm-sponsor-contact' },
          h('p', null, '这里是附上了邀请码的链接：'),
          h('a', { className: 'ofm-sponsor-url', href: SPONSOR.url, target: '_blank', rel: 'noopener noreferrer' }, SPONSOR.url, icon('arrow', 16)),
          h('p', null, '(如果邮箱暂时没有信息，那就是注册的人太多，晚点试试就好了，抱歉啊)'),
          h('div', { className: 'ofm-sponsor-copyrow' }, h('span', null, '邀请码 ', h('strong', null, SPONSOR.invite)),
            h('button', { type: 'button', onClick: () => copy(SPONSOR.invite, '邀请码') }, '复制邀请码')),
          h('span', { className: 'ofm-sponsor-copy-status', role: 'status' }, copied)),
        paragraph(3), paragraph(4), paragraph(5),
        h('div', { className: 'ofm-sponsor-signoff' }, h('span', null, '感谢你的理解与陪伴'), h('strong', null, 'OFM 团队'))),
      h('figure', { className: 'ofm-sponsor-evidence' },
        h('figcaption', null, h('strong', null, '另附：中转站鹈鹕测试'), h('span', null, '发现问题直接电客服 · 以下为提供的原图')),
        h('img', { src: image, alt: '提供的中转站鹈鹕测试示例：三幅图像分别展示骑行鹈鹕和山河场景，下方保留模型名称、生成时间与耗时。', width: 1227, height: 367, loading: 'lazy', decoding: 'async' })),
      h('div', { className: 'ofm-sponsor-end' }, h('p', null, '愿意了解，再往前一步。'),
        h('a', { className: 'ofm-sponsor-visit', href: SPONSOR.url, target: '_blank', rel: 'noopener noreferrer' }, '前往北辰API', icon('arrow')), h('span', null, '赞助商网站 · 含邀请码')))
  }

  function SponsorPage() {
    return h('section', { className: surfaceClass + ' ofm-sponsor-page', 'aria-labelledby': 'ofm-sponsor-page-title' },
      h('header', { className: 'ofm-sponsor-pagehead' }, h('h1', { id: 'ofm-sponsor-page-title' }, SPONSOR.title), h('p', null, '北辰 API × OFM · 你可以在这里随时阅读全文。')),
      h(SponsorArticle))
  }

  function SponsorBanner({ onDetails, detailsActive = false }) {
    const storage = () => { try { return window.localStorage } catch { return undefined } }
    const [collapsed, setCollapsed] = useState(() => sponsorBannerCollapsed(storage()))
    useEffect(() => {
      const update = event => {
        if (event.key === SPONSOR_COLLAPSE_KEY || event.key === null) setCollapsed(sponsorBannerCollapsed(storage()))
      }
      window.addEventListener('storage', update)
      return () => window.removeEventListener('storage', update)
    }, [])
    const toggle = () => {
      const next = !collapsed
      setCollapsed(next)
      saveSponsorBannerCollapsed(storage(), next)
    }
    const descriptionId = `ofm-sponsor-banner-description-${variant}`
    const mark = h('svg', { width: 32, height: 32, viewBox: '0 0 40 40', fill: 'none', 'aria-hidden': true },
      h('path', { d: 'M20 4 24.3 15.7 36 20 24.3 24.3 20 36 15.7 24.3 4 20 15.7 15.7Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
      h('circle', { cx: 20, cy: 20, r: 4, fill: 'currentColor', fillOpacity: .16, stroke: 'currentColor', strokeWidth: 1.3 }))
    return h('div', { className: 'ofm-sponsor-slot' }, h('section', { className: `${surfaceClass} ofm-sponsor-banner${collapsed ? ' is-collapsed' : ''}`, 'aria-label': '北辰API广告' },
      h('span', { className: 'ofm-sponsor-banner-mark', 'aria-hidden': true }, mark),
      h('div', { className: 'ofm-sponsor-banner-copy' },
        h('div', { className: 'ofm-sponsor-banner-title' }, h('h2', null, SPONSOR.name), h('span', { className: 'ofm-sponsor-ad-label' }, '广告')),
        h('div', { id: descriptionId, hidden: collapsed, className: 'ofm-sponsor-banner-description' },
          h('p', null, '海外模型 API 中转服务，为有付费算力需求的朋友多一个选择。'),
          h('p', { className: 'ofm-sponsor-banner-disclosure' }, '通过邀请码使用，可帮助 OFM 分担服务器与运营费用。'))),
      h('div', { className: 'ofm-sponsor-banner-actions' },
        h('button', { type: 'button', className: 'ofm-sponsor-details', onClick: onDetails, disabled: detailsActive }, detailsActive ? '正在查看详情' : '了解详情',
          h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M4 12h16m-6-6 6 6-6 6' }))),
        h('button', { type: 'button', className: 'ofm-sponsor-banner-toggle', 'aria-expanded': !collapsed, 'aria-controls': descriptionId, onClick: toggle }, collapsed ? '展开' : '收起',
          h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: collapsed ? 'm4 6 4 4 4-4' : 'm4 10 4-4 4 4' }))))))
  }
  return { SponsorPage, SponsorBanner }
}
