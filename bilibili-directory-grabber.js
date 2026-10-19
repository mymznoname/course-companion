(() => {
const s = window.__INITIAL_STATE__ || {};
const T = ['title','part','name'], I = ['bvid','aid','avid','cid','epid','page','param'];
const ok = x => x && typeof x === 'object' && !Array.isArray(x)
  && T.map(k => x[k]).find(v => typeof v === 'string' && v.trim())
  && I.some(k => x[k] != null && x[k] !== '');
const key = x => x.bvid ? 'b' + x.bvid : x.aid ? 'a' + x.aid : x.cid ? 'c' + x.cid : 't' + x.title;
const bad = /nav|menu|recommend|related|relates|rcmd|guess|suggest|slide|banner|ad_|_ad|rank|popup|hot|live|search|tag|available/i;
const good = /episode|section|pages|archives|season|fav/i;
let cands = [];
(function w(n, d, p) {
  if (d > 14 || !n || typeof n !== 'object') return;
  if (Array.isArray(n)) {
    if (n.length >= 2 && n.every(ok)) cands.push({ p, items: n, bonus: good.test(p) ? 100 : 0, bad: bad.test(p) });
    n.forEach(e => w(e, d + 1, p + '[]'));
    return;
  }
  for (const k of Object.keys(n)) w(n[k], d + 1, p + '.' + k);
})(s, 0, 's');
cands.sort((a, b) => (b.items.length + b.bonus) - (a.items.length + a.bonus));
const best = [], ks = new Set();
for (const c of cands) {
  if (c.bad) continue;
  const nw = c.items.filter(x => !ks.has(key(x)));
  if (!best.length) { nw.forEach(x => { best.push(x); ks.add(key(x)) }); continue; }
  if (nw.length / c.items.length >= 0.8 && (c.bonus > 0 || c.items.length >= 3)) nw.forEach(x => { best.push(x); ks.add(key(x)) });
}
const lessons = best
  .filter(x => { const t = T.map(k => x[k]).find(v => typeof v === 'string' && v.trim()); return t && t.length <= 150 && !/^\d{1,4}$/.test(t); })
  .map((x, i) => ({ ordinal: i + 1, title: T.map(k => x[k]).find(v => typeof v === 'string' && v.trim()).trim() }));
if (!lessons.length) {
  alert('没找到目录。\n请确认你打开的是课程的合集/列表页(或多 P 视频页),而不是单个视频页。');
} else {
  const text = lessons.map(l => l.ordinal + '. ' + l.title).join('\n');
  const fb = () => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try { document.execCommand('copy'); alert('已复制 ' + lessons.length + ' 条目录!'); }
    catch (e) { prompt('自动复制失败,请手动全选复制(Ctrl+A / Ctrl+C):', text); }
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => alert('已复制 ' + lessons.length + ' 条目录!\n回到网课伴学软件,粘贴到添加课程第 2 步。'), fb);
  else fb();
}
})()
