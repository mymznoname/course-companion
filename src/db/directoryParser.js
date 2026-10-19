// 目录文本解析器(Pure function)
// 输入:用户从网课平台粘贴的纯文本目录
// 输出:{ lessons: [{ordinal, title}], errors: [{line, content, reason}] }
//
// 识别规则(按优先级):
// 1. N. / N、 - 顶级章/节
// 2. N.M / N-M - 小节
// 3. 第 N 章 / 第 N 节 - 中文格式
// 4. Chapter N / Lesson N - 英文格式
// 5. N - title(短横杠)
// 6. 缩进 2+ 空格或 tab - 子级
// 7. 其他非空行 - 视为节

const RE_PATTERNS = [
  { re: /^(\d+)\.(\d+)\s*[.\u3001\-_]?\s*(.+)$/, kind: 'sub' },        // N.M
  { re: /^(\d+)[.\u3001]\s*(.+)$/, kind: 'section' },                  // N. / N、
  { re: /^第\s*(\d+)\s*章\s*[:\s]*(.*)$/, kind: 'section_cn' },        // 第 N 章
  { re: /^第\s*(\d+)\s*节\s*[:\s]*(.*)$/, kind: 'singleton_cn' },      // 第 N 节
  { re: /^Chapter\s+(\d+)\s*[:\-]?\s*(.*)$/i, kind: 'section_en' },    // Chapter N
  { re: /^Lesson\s+(\d+)\s*[:\-]?\s*(.*)$/i, kind: 'singleton_en' },   // Lesson N
  { re: /^(\d+)\s*[-—]\s*(.+)$/, kind: 'section' }                     // N - title
]

/**
 * 解析目录文本
 * @param {string} text
 * @returns {{ lessons: Array<{ordinal:number,title:string}>, errors: Array<{line:number,content:string,reason:string}> }}
 */
export function parseDirectory(text) {
  if (!text || typeof text !== 'string') {
    return { lessons: [], errors: [] }
  }

  // 预处理:去除 BOM 与零宽字符;按行切;trim 空白;跳过空行
  const cleaned = text
    // BOM
    .replace(/\uFEFF/g, '')
    // 零宽字符
    .replace(/[\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFE00-\uFE0F]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')

  const rawLines = cleaned.split('\n').map(l => l.replace(/\s+$/, ''))
  const errors = []
  const lessons = []
  let ordinal = 0

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const lineNo = i + 1
    if (!line.trim()) continue

    let matched = false

    // 1. 尝试所有正则
    for (const { re, kind } of RE_PATTERNS) {
      const m = line.match(re)
      if (m) {
        let title = ''
        if (kind === 'sub') {
          title = m[3].trim()
        } else if (kind === 'singleton_cn' || kind === 'singleton_en') {
          // "第 N 节 标题"  → ordinal=N (视为独立节,不挂父章节,扁平化处理)
          ordinal = parseInt(m[1], 10) || (ordinal + 1)
          title = (m[2] || '').trim() || `第 ${ordinal} 节`
        } else {
          ordinal = parseInt(m[1], 10) || (ordinal + 1)
          title = m[2].trim()
        }
        if (!title) {
          errors.push({ line: lineNo, content: line, reason: 'empty-title' })
          matched = true
          break
        }
        lessons.push({ ordinal, title })
        matched = true
        break
      }
    }

    if (matched) continue

    // 2. 尝试缩进(2+ 空格或 1+ tab)
    if (/^[\s\t]{2,}\S/.test(line) || /^\t+\S/.test(line)) {
      const title = line.trim()
      if (title) {
        ordinal += 1
        lessons.push({ ordinal, title })
        continue
      }
    }

    // 3. 兜底:作为一节
    {
      const title = line.trim()
      if (title) {
        ordinal += 1
        lessons.push({ ordinal, title })
        // 不放 errors,因为 MVP 容忍
      }
    }
  }

  // 重新规范化 ordinal 为 1..N 顺序,避免 N.M 解析后 ordinal 重复或跳号
  const normalized = lessons.map((l, idx) => ({ ordinal: idx + 1, title: l.title }))

  return { lessons: normalized, errors }
}

// 单测(开发时 node 直接跑:`node directoryParser.js`)
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('directoryParser.js')) {
  const cases = [
    {
      name: '数字 N.M 风格',
      in: `1. 第 1 章 入门
1.1 第 1 节 安装
1.2 第 2 节 配置
2. 第 2 章 进阶
2.1 第 1 节 x
2.2 第 2 节 y`,
      expectCount: 6
    },
    {
      name: '中文第N章风格',
      in: `第 1 章 入门
  1.1 安装
  1.2 配置
第 2 章 进阶`,
      expectCount: 4
    },
    {
      name: 'Chapter/Lesson 风格',
      in: `Chapter 1: Intro
Lesson 1: setup
Lesson 2: hello`,
      expectCount: 3
    },
    {
      name: '短横杠风格',
      in: `01 - lesson title
02 - lesson title`,
      expectCount: 2
    },
    {
      name: '混合纯文本行',
      in: `第一讲 开篇
第二讲 入门的艺术
第三讲 实操`,
      expectCount: 3
    }
  ]

  let ok = 0
  for (const c of cases) {
    const { lessons, errors } = parseDirectory(c.in)
    const pass = lessons.length === c.expectCount
    console.log(`${pass ? '✓' : '✗'} ${c.name}: 解析出 ${lessons.length} 节,预期 ${c.expectCount}, errors=${errors.length}`)
    if (lessons.length) {
      console.log('    示例:', lessons[0])
    }
    if (pass) ok++
  }
  console.log(`\n通过 ${ok}/${cases.length}`)
}
