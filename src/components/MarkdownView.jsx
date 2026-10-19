import { marked } from 'marked'

// 安全渲染 — 简单 markdown
marked.setOptions({ breaks: true, gfm: true })

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a',
  'hr', 'del'
])

function sanitize(html) {
  return html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (m, slash, tag, attrs) => {
    if (!ALLOWED_TAGS.has(tag.toLowerCase())) return ''
    if (slash) return m
    if (tag.toLowerCase() === 'a') {
      const href = attrs.match(/href="([^"]*)"/)
      const safe = href && /^https?:\/\//.test(href[1]) ? href[1] : '#'
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">`
    }
    return m
  })
}

export default function MarkdownView({ source }) {
  if (!source) return <div className="text-muted text-sm">*[未总结]*</div>
  const html = marked.parse(source)
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
}
