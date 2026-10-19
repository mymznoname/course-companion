// B站目录抓取 — 三条路:
// 1. 应用内自动抓取(fetchBilibiliDirectory):优先走本地代理(server.js 的
//    /api/bili,服务端直连 B站,无 CORS、无第三方依赖);公共 CORS 代理兜底
// 2. bookmarklet(BOOKMARKLET_SRC):用户拖到书签栏,在 B站 页面上下文里读
//    window.__INITIAL_STATE__,复制目录到剪贴板。100% 可靠
// 3. 控制台代码(bilibili-directory-grabber.js):同 bookmarklet 逻辑,F12 粘贴运行
//
// 三条路共用同一套提取逻辑 extractFromState(state)。

// ===== 目录提取核心(纯函数,bookmarklet 与单测共用)=====
function extractFromState(state) {
  if (!state || typeof state !== 'object') return []

  const TITLE_KEYS = ['title', 'part', 'name']
  const ID_KEYS = ['bvid', 'aid', 'avid', 'cid', 'epid', 'page', 'param']
  const BONUS_PATH = /episode|section|pages|archives|season|fav/i
  const BAD_PATH = /nav|menu|recommend|related|relates|rcmd|guess|suggest|slide|banner|ad_|_ad|rank|popup|hot|live|search|tag|available/i

  const candidates = []

  function isItemLike(it) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false
    const title = TITLE_KEYS.map(k => it[k]).find(v => typeof v === 'string' && v.trim())
    if (!title) return false
    const hasId = ID_KEYS.some(k => it[k] !== undefined && it[k] !== null && it[k] !== '')
    return hasId
  }

  function keyOf(it) {
    if (it.bvid) return 'bv:' + it.bvid
    if (it.aid) return 'av:' + it.aid
    if (it.cid) return 'cid:' + it.cid
    return 't:' + (it.title || '')
  }

  function walk(node, depth, path) {
    if (depth > 14 || !node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      if (node.length >= 2 && node.every(isItemLike)) {
        candidates.push({
          path,
          items: node.map(it => ({
            title: (TITLE_KEYS.map(k => it[k]).find(v => typeof v === 'string' && v.trim()) || '').trim(),
            bvid: it.bvid, aid: it.aid, cid: it.cid, page: it.page
          })),
          bonus: BONUS_PATH.test(path) ? 100 : 0,
          penalty: BAD_PATH.test(path) ? 1000 : 0
        })
      }
      for (const el of node) walk(el, depth + 1, path + '[]')
      return
    }
    for (const k of Object.keys(node)) {
      walk(node[k], depth + 1, path + '.' + k)
    }
  }

  walk(state, 0, 'state')

  if (!candidates.length) return []

  // 排序:数量优先,路径加分/减分
  candidates.sort((a, b) => (b.items.length + b.bonus - b.penalty) - (a.items.length + a.bonus - a.penalty))

  // 贪心合并:大头集合优先,其余数组若大部分是新内容且不太"脏",并入
  const best = []
  const bestKeys = new Set()
  for (const c of candidates) {
    if (c.penalty > 0) continue
    const newOnes = c.items.filter(it => !bestKeys.has(keyOf(it)))
    if (best.length === 0) {
      for (const it of newOnes) { best.push(it); bestKeys.add(keyOf(it)) }
      continue
    }
    const newRatio = newOnes.length / c.items.length
    if (newRatio >= 0.8 && (c.bonus > 0 || c.items.length >= 3)) {
      for (const it of newOnes) { best.push(it); bestKeys.add(keyOf(it)) }
    }
  }

  // 过滤明显不是条目的项
  return best
    .filter(it => it.title && it.title.length <= 150 && !/^\d{1,4}$/.test(it.title))
    .map((it, i) => ({ ordinal: i + 1, title: it.title }))
}

export const extractFromInitialState = extractFromState

// ===== 目录标题清洗 =====
// B站 标题常见噪音:「【全熟】Python入门」「UP主 · 第一节」「01 变量」「P03-函数」
// 清洗规则(保守:拿不准就不动,清洗后可人工再改):
//   1. 去掉成对包裹的【】[](整对,且剥完后不能为空)
//   2. 去掉「UP主名 · 标题」形式的前缀(前缀含 节/章/讲/集/期 时不剥,那是章节号)
//   3. 去掉纯编号前缀:01 / P01 / 1.1- / 1、
//   4. 完全重复的标题去重(保留第一个)
// 返回 [{ordinal, title}] 序号重排
function stripBrackets(t) {
  const before = t
  let out = t
    .replace(/^【[^】]{1,60}】\s*/, '').replace(/\s*【[^】]{1,60}】$/, '')
    .replace(/^\[[^\]]{1,60}\]\s*/, '').replace(/\s*\[[^\]]{1,60}\]$/, '')
  if (!out.trim()) out = before
  return out
}

export function cleanCourseTitle(raw) {
  let t = String(raw || '').trim()
  if (!t) return ''
  const before = String(raw || '').trim()
  t = stripBrackets(t)
  // 去掉 B站 页面标题尾巴:「_bilibili」「- bilibili」「_哔哩哔哩」
  t = t.replace(/[_\-\s|—–]+(?:bilibili|哔哩哔哩)$/i, '')
  // 去掉混在中间的 P 号(多 P 视频的页面标题会带当前分 P,如 "... 教程 P01 ...")
  const noP = t.replace(/\s*[Pp](\d{1,3})\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (noP) t = noP
  t = t.trim()
  return t || before
}

export function cleanLessons(lessons) {
  if (!Array.isArray(lessons) || !lessons.length) return []
  const seen = new Set()
  const out = []
  for (const l of lessons) {
    // 兼容两种输入:[{ordinal,title}] 或 ["标题", ...],避免收到字符串时整份变空
    let t = String((l && l.title) || (typeof l === 'string' ? l : '') || '').trim()
    if (!t) continue

    const before = t

    // 噪音常叠多层,整体循环剥离直到稳定:
    //   "P01 【全熟】01 环境搭建"  →  "环境搭建"
    //   "UP主·张三 · 03 条件判断"  →  "条件判断"
    for (let i = 0; i < 4; i++) {
      const prev = t

      // ① 【】/[] 位于首尾的标签
      t = stripBrackets(t).trim()

      // ② 「UP主名 · 标题」—— 左侧不含章节词才剥,避免误伤 "第1讲 · 数据结构"
      t = t.replace(/^([^·\n]{1,30}?)\s*·\s*(\S.*)$/, (m, left, right) =>
        /节|章|讲|集|期|部/.test(left) ? m : right
      ).trim()

      // ③ 编号前缀:先两位段(1.1-),再一位段(01 / P01 / 1、)
      t = t.replace(/^\d{1,3}\.\d{1,3}(?:[.\-、_]\s*|\s+)(\S.*)$/, '$1').trim()
      t = t.replace(/^(?:P\d{1,3}|\d{1,3})(?:[.\-、_]\s*|\s+)(\S.*)$/, '$1').trim()

      if (t === prev) break
    }

    t = t.trim()
    if (!t) t = before.trim()

    // 4. 去重(清洗后完全相同)
    if (seen.has(t)) continue
    seen.add(t)
    out.push({ ordinal: out.length + 1, title: t })
  }
  return out
}

// ===== bookmarklet 源码(单行,可拖进书签栏)=====
// 优先:提取后直接 POST 到本地软件的 /api/import(一键导入,不用切窗口粘贴)
// 失败(服务器没开/跨域被拦):降级为复制到剪贴板(旧行为)
function buildBookmarklet() {
  const extractSrc = String(extractFromState).replace(/\n/g, ' ')
  return 'javascript:(function(){' +
    'try{' +
    'var state=window.__INITIAL_STATE__||window.__pinia||window.__NUXT__||window.__INITIAL_DATA__||{};' +
    'var lessons=(' + extractSrc + ')(state);' +
    'if(!lessons||!lessons.length){alert("没有在这个页面找到目录。\\n请确认你打开的是课程的合集/系列页面,而不是单个视频页。");return;}' +
    'var payload=JSON.stringify({title:(document.title||"").replace(/\\s*-\\s*bilibili$/i,"").replace(/^_/,""),url:location.href,lessons:lessons,importedAt:new Date().toISOString()});' +
    'fetch("http://localhost:4174/api/import",{method:"POST",headers:{"Content-Type":"application/json"},body:payload})' +
    '.then(function(r){if(!r.ok)throw new Error("http "+r.status);return r.json()})' +
    '.then(function(){alert("已发送 "+lessons.length+" 节目录到网课伴学!\\n打开软件,顶部会出现导入提示,点「去创建」即可。")})' +
    '.catch(function(){' +
    '  var text=lessons.map(function(l){return l.ordinal+". "+l.title}).join("\\n");' +
    '  function fb(){var ta=document.createElement("textarea");ta.value=text;ta.style.position="fixed";ta.style.left="-9999px";document.body.appendChild(ta);ta.focus();ta.select();try{document.execCommand("copy");alert("网课伴学没在运行,已复制 "+lessons.length+" 条目录。\\n请打开软件后手动粘贴到第 2 步。")}catch(e){prompt("自动复制失败,请手动全选复制:",text)}document.body.removeChild(ta)}' +
    '  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){alert("网课伴学没在运行,已复制 "+lessons.length+" 条目录。\\n请打开软件后手动粘贴到第 2 步。")},fb)}else{fb()}' +
    '})' +
    '}catch(e){alert("抓取出错:"+e.message)}})()'
}

export const BOOKMARKLET_SRC = buildBookmarklet()

// ===== 应用内自动抓取 =====
// 抓取顺序:
//  1. 本地代理(server.js 运行时的 /api/bili):服务端直连 B站,
//     无 CORS 限制、不依赖第三方,主力通道
//  2. 公共 CORS 代理链:兜底(目前基本不可用)
// 抓到页面 HTML 后从 window.__INITIAL_STATE__ 提取目录,
// 覆盖视频列表页 / 合集页 / 多 P 视频页等全部形态;公开 API 仅作最后兜底。

const CORS_PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u)
]

export function isBilibiliUrl(url) {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!u) return false
  return /(^|\/\/|\.)(bilibili\.com|b23\.tv)/i.test(u)
}

// 从页面 HTML 里提取 __INITIAL_STATE__
function extractStateFromHtml(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*(?:\(function|<\/script)/)
  if (!m) return null
  try {
    return JSON.parse(m[1].replace(/:\s*undefined/g, ':null'))
  } catch {
    return null
  }
}

// 抓页面文本:本地代理优先,公共代理兜底
async function fetchPageText(url) {
  // 1) 本地代理(node server.js 运行时可用)
  try {
    const res = await fetch('/api/bili?url=' + encodeURIComponent(url), { headers: { Accept: 'text/html' } })
    if (res.ok) {
      const text = await res.text()
      // "浏览器下载建议" 是 B站 反爬验证页,拿到它等于没拿到
      if (text && text.length > 2000 && !text.includes('浏览器下载建议')) return text
    }
  } catch { /* 本地代理不可用(如用 vite preview 启动) */ }

  // 2) 公共 CORS 代理
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetch(wrap(url), { headers: { Accept: 'text/html' } })
      if (res.ok) {
        const text = await res.text()
        if (text && text.length > 2000 && !text.includes('浏览器下载建议')) return text
      }
    } catch { /* 试下一个 */ }
  }
  return null
}

// 公开 API 兜底(仅 bvid 形态,且代理可用时)
async function fetchViaProxy(apiUrl) {
  let lastErr = null
  for (const wrap of CORS_PROXIES) {
    try {
      const res = await fetch(wrap(apiUrl), { headers: { Accept: 'application/json' } })
      if (!res.ok) { lastErr = new Error('HTTP ' + res.status); continue }
      const json = await res.json()
      if (json && json.code === 0 && json.data) return json.data
      lastErr = new Error('API code=' + (json && json.code))
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('all proxies failed')
}

export async function fetchBilibiliDirectory(url) {
  const u = (url || '').trim()
  if (!isBilibiliUrl(u)) {
    return { ok: false, error: '不是 B站 链接', suggestBookmarklet: true }
  }

  try {
    // 1) 抓页面 HTML → 提取 __INITIAL_STATE__ → 提取目录
    const html = await fetchPageText(u)
    if (html) {
      const state = extractStateFromHtml(html)
      if (state) {
        const lessons = extractFromState(state)
        if (lessons.length) return { ok: true, lessons, source: 'page' }
        // 页面抓到了但里面没目录 → 大概率是单个视频页
        return { ok: false, error: '这个页面没有目录(可能是单个视频页)', suggestBookmarklet: true }
      }
    }

    // 2) 兜底:公开 view API(仅 bvid)
    const bvMatch = /\/video\/(BV[\w]+)/i.exec(u)
    if (bvMatch) {
      try {
        const data = await fetchViaProxy('https://api.bilibili.com/x/web-interface/view?bvid=' + bvMatch[1])
        if (data.ugc_season) {
          const lessons = extractFromState(data.ugc_season)
          if (lessons.length) return { ok: true, lessons, source: 'ugc_season' }
        }
        if (Array.isArray(data.pages) && data.pages.length) {
          const lessons = data.pages.map((p, i) => ({ ordinal: i + 1, title: p.part || ('P' + p.page) }))
          return { ok: true, lessons, source: 'multi-P' }
        }
        return { ok: false, error: '这是单个视频,没有目录', suggestBookmarklet: true }
      } catch { /* API 也不可用 */ }
    }

    return { ok: false, error: '没抓到目录,可改用「我」页的书签栏工具', suggestBookmarklet: true }
  } catch (e) {
    return { ok: false, error: '抓取失败:' + (e && e.message ? e.message : '网络错误'), suggestBookmarklet: true }
  }
}
