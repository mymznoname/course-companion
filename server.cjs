// 网课伴学 · 本地服务器(零依赖)
// 作用:1) 伺服 dist/ 静态文件(替代 npm run preview)
//       2) /api/bili?url=... 代理端点:服务端直接抓 B站 页面,
//          绕过浏览器 CORS 限制和不稳定的公共代理
// 用法:node server.js  →  http://localhost:4174/
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = process.env.PORT || 4174
const DIST = path.join(__dirname, 'dist')
const INBOX_FILE = path.join(__dirname, 'import-inbox.json')
const STATUS_FILE = path.join(__dirname, 'app-status.json')
const REMINDER_FILE = path.join(__dirname, 'reminder-state.json')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const ALLOWED = /(^|\/\/|\.)(bilibili\.com|b23\.tv|hdslb\.com|bilivideo\.com)/i

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function send(res, code, body, type, extraHeaders) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', ...CORS, ...(extraHeaders || {}) })
  res.end(typeof body === 'object' ? JSON.stringify(body) : body)
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

const server = http.createServer(async (req, res) => {
  let u
  try { u = new URL(req.url, 'http://localhost') } catch { return send(res, 400, 'bad request') }

  // CORS 预检(书签栏从 bilibili.com 跨域 POST 进来)
  if (req.method === 'OPTIONS') return send(res, 204, '')

  // ===== B站 抓取代理 =====
  if (u.pathname === '/api/bili') {
    const target = u.searchParams.get('url') || ''
    if (!target || !ALLOWED.test(target)) return send(res, 400, 'only bilibili urls allowed')
    try {
      const r = await fetch(target, {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://www.bilibili.com/',
          'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        },
        redirect: 'follow'
      })
      const buf = Buffer.from(await r.arrayBuffer())
      res.writeHead(r.status, {
        'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      })
      res.end(buf)
    } catch (e) {
      send(res, 502, 'fetch failed: ' + (e && e.message ? e.message : 'unknown'))
    }
    return
  }

  // ===== 导入收件箱(书签栏工具一键导入)=====
  // POST /api/import        body: {title, url, lessons:[{ordinal,title}], importedAt}
  // GET  /api/import        查未处理的导入
  // POST /api/import/ack    body: {id} 标记已处理(创建了课程或忽略)
  if (u.pathname === '/api/import') {
    if (req.method === 'GET') {
      return send(res, 200, { items: readJson(INBOX_FILE, []) }, 'application/json')
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => { body += c; if (body.length > 2e6) req.destroy() })
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}')
          const rawLessons = Array.isArray(data.lessons) ? data.lessons : []
          // 兼容两种格式:[{ordinal,title}] 或直接的 ["标题", ...],顺带丢掉空项
          const lessons = rawLessons
            .slice(0, 500)
            .map((l, i) => ({
              ordinal: i + 1,
              title: String((l && l.title) || (typeof l === 'string' ? l : '') || '').trim().slice(0, 200)
            }))
            .filter(l => l.title)
          if (!lessons.length || !data.title) {
            return send(res, 400, { ok: false, error: 'title 和 lessons 不能为空' }, 'application/json')
          }
          if (!ALLOWED.test(String(data.url || ''))) {
            return send(res, 400, { ok: false, error: '只接受 bilibili 链接' }, 'application/json')
          }
          const items = readJson(INBOX_FILE, [])
          const item = {
            id: Date.now(),
            title: String(data.title).slice(0, 200),
            url: String(data.url).slice(0, 500),
            lessons,
            importedAt: new Date().toISOString()
          }
          items.unshift(item)
          writeJson(INBOX_FILE, items.slice(0, 20))
          send(res, 200, { ok: true, id: item.id, count: item.lessons.length }, 'application/json')
        } catch (e) {
          send(res, 400, { ok: false, error: 'JSON 解析失败' }, 'application/json')
        }
      })
      return
    }
    return send(res, 405, 'method not allowed')
  }

  if (u.pathname === '/api/import/ack' && req.method === 'POST') {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      try {
        const { id } = JSON.parse(body || '{}')
        const items = readJson(INBOX_FILE, []).filter(x => x.id !== Number(id))
        writeJson(INBOX_FILE, items)
        send(res, 200, { ok: true, left: items.length }, 'application/json')
      } catch {
        send(res, 400, { ok: false, error: 'bad request' }, 'application/json')
      }
    })
    return
  }

  // ===== 软件状态同步(给每日提醒用:服务器读不到浏览器里的 IndexedDB)=====
  // POST /api/status  { date, pendingCount, activeCount, reviewDueCount, reminderEnabled, reminderTime }
  // GET  /api/status  读当前状态
  if (u.pathname === '/api/status') {
    if (req.method === 'GET') {
      return send(res, 200, readJson(STATUS_FILE, null) || {}, 'application/json')
    }
    if (req.method === 'POST') {
      let body = ''
      req.on('data', c => { body += c })
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}')
          writeJson(STATUS_FILE, {
            date: String(data.date || '').slice(0, 10),
            pendingCount: Number(data.pendingCount) || 0,
            activeCount: Number(data.activeCount) || 0,
            reviewDueCount: Number(data.reviewDueCount) || 0,
            reminderEnabled: !!data.reminderEnabled,
            reminderTime: String(data.reminderTime || '').slice(0, 5),
            updatedAt: new Date().toISOString()
          })
          send(res, 200, { ok: true }, 'application/json')
        } catch {
          send(res, 400, { ok: false }, 'application/json')
        }
      })
      return
    }
    return send(res, 405, 'method not allowed')
  }

  // ===== 静态文件 =====
  let p
  try { p = decodeURIComponent(u.pathname) } catch { return send(res, 400, 'bad path') }
  if (p === '/') p = '/index.html'

  const file = path.normalize(path.join(DIST, p))
  if (!file.startsWith(DIST)) return send(res, 403, 'forbidden')

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } else {
    // SPA 回退
    const index = path.join(DIST, 'index.html')
    if (fs.existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      fs.createReadStream(index).pipe(res)
    } else {
      send(res, 404, 'dist/ not found — run npm run build first')
    }
  }
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 被占用了。先关掉占用该端口的程序,或换端口:PORT=4175 node server.js`)
  } else {
    console.error(e)
  }
  process.exit(1)
})

server.listen(PORT, () => {
  console.log(`网课伴学 running at http://localhost:${PORT}`)
  console.log('停止:Ctrl+C')
})

// ===== 每日提醒调度 =====
// 软件把「今日状态 + 提醒设置」POST 到 /api/status;
// 服务器每分钟检查:到设定时间 + 今天还没提醒过 + 有未完成节
// → 弹 Windows 通知(软件关着也能收到,因为服务器开机自启一直在跑)
const { spawn } = require('child_process')

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function popup(title, message) {
  const ps = `(New-Object -ComObject Wscript.Shell).Popup('${message.replace(/'/g, "''")}', 60, '${title}')`
  try {
    spawn('powershell', ['-WindowStyle', 'Hidden', '-Command', ps], { detached: true, stdio: 'ignore' }).unref()
  } catch (e) {
    console.error('[reminder] popup failed:', e.message)
  }
}

function checkReminder() {
  const status = readJson(STATUS_FILE, null)
  if (!status || !status.reminderEnabled || !status.reminderTime) return

  const now = new Date()
  const today = todayStr()
  const [hh, mm] = String(status.reminderTime).split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return
  const due = now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm)
  if (!due) return

  const state = readJson(REMINDER_FILE, {})
  if (state.lastRemindedDate === today) return

  const activeCount = Number(status.activeCount) || 0
  const pendingCount = Number(status.pendingCount) || 0
  const reviewDueCount = Number(status.reviewDueCount) || 0

  // 软件今天同步过 → 精确文案;没同步过 → 只要还有在读课程就温和提醒
  let message = null
  if (status.date === today && pendingCount > 0) {
    message = `今天还有 ${pendingCount} 节课没记录`
    if (activeCount > 1) message += `(${activeCount} 门课)`
    if (reviewDueCount > 0) message += `,含 ${reviewDueCount} 节待回顾`
    message += '。\n双击桌面的「网课伴学」回去记一下。'
  } else if (status.date !== today && activeCount > 0) {
    message = '今天还没打开网课伴学记录学习。\n双击桌面的「网课伴学」开始吧。'
  }
  if (!message) return

  state.lastRemindedDate = today
  writeJson(REMINDER_FILE, state)
  console.log(`[reminder] ${today} 弹出提醒`)
  popup('网课伴学', message)
}

setInterval(checkReminder, 30 * 1000)
