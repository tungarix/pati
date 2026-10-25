// Prints the results in eval/results/*.json side by side. Usage:
//   node eval/compare.ts                    all results, side by side
//   node eval/compare.ts --pair eski yeni   paired difference of two labels with a bootstrap interval

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { CATEGORIES } from './checks.ts'
import { grammarFlags, lengthFlags, openerStats } from './hidden.ts'
import type { RunRecord } from './run.ts'
import { pairedBootstrap } from './stats.ts'
import { repliesOf } from './turn.ts'

interface Result {
  label: string
  model: string
  runs: number
  results: RunRecord[]
}

const { values: opt } = parseArgs({ options: { pair: { type: 'boolean', default: false } }, allowPositionals: true })
const positional = process.argv.slice(2).filter(a => !a.startsWith('--'))

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results')
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.endsWith('.judge.json')).sort() : []
if (!files.length) {
  console.error('eval/results/ boş; önce node eval/run.ts çalıştır.')
  process.exit(1)
}

/** Share of passing runs per case id (several runs: mean). */
function rates(s: Result): Map<string, number> {
  const per = new Map<string, number[]>()
  for (const r of s.results) per.set(r.id, [...(per.get(r.id) ?? []), r.pass ? 1 : 0])
  return new Map([...per].map(([id, v]) => [id, v.reduce((a, b) => a + b, 0) / v.length]))
}

if (opt.pair) {
  const [a, b] = positional
  const load = (label?: string) => {
    if (!label || !files.includes(`${label}.json`)) {
      console.error(`Sonuç yok: ${label ?? '(etiket verilmedi)'}. Kullanım: node eval/compare.ts --pair eski yeni`)
      process.exit(1)
    }
    return read(`${label}.json`) as Result
  }
  const ra = rates(load(a))
  const rb = rates(load(b))
  const ids = [...ra.keys()].filter(id => rb.has(id))
  if (!ids.length) {
    console.error('İki sonuçta ortak vaka yok.')
    process.exit(1)
  }
  const d = pairedBootstrap(ids.map(id => ra.get(id)!), ids.map(id => rb.get(id)!))
  const pts = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}`
  console.log(`${a} -> ${b}: ${d.n} ortak vaka`)
  console.log(`fark ${pts(d.mean)} puan [${pts(d.lo)}, ${pts(d.hi)}] — ${d.significant ? 'anlamlı' : 'anlamsız'}`)
  process.exit(0)
}

const sets = files.map(f => read(f) as Result)
const judgeOf = (label: string) => {
  const f = path.join(dir, `${label}.judge.json`)
  return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as { entries: Record<string, { id: string; run: number; fail: boolean }> }) : null
}

const pct = (rs: RunRecord[]) => (rs.length ? `${Math.round((100 * rs.filter(r => r.pass).length) / rs.length)}%` : '-')
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0)
const W = 14

// The newer checks are recomputed from the stored replies, so results from before they existed can be read too.
const replyList = (s: Result) => s.results.filter(r => !r.error && r.category !== 'rota').flatMap(r => repliesOf(r).map(x => ({ ...x, category: r.category })))
const opener = (s: Result) => {
  const rs = replyList(s)
  return openerStats(rs.map(r => r.text), rs.map(r => r.tool))
}
const distinct = (s: Result) => {
  const ks = s.results.flatMap(r => r.checks.filter(k => k.name === 'distinct'))
  return ks.length ? `${Math.round((100 * ks.filter(k => k.ok).length) / ks.length)}%` : '-'
}
const judgePass = (s: Result) => {
  const j = judgeOf(s.label)
  if (!j) return '-'
  const by = new Map<string, boolean>()
  for (const e of Object.values(j.entries)) by.set(`${e.id}#${e.run}`, (by.get(`${e.id}#${e.run}`) ?? false) || e.fail)
  return by.size ? `${Math.round((100 * [...by.values()].filter(f => !f).length) / by.size)}%` : '-'
}

const table: [string, string[]][] = [
  ['Model', sets.map(s => s.model.slice(0, W - 1))],
  ...CATEGORIES.map((c): [string, string[]] => [c, sets.map(s => pct(s.results.filter(r => r.category === c)))]),
  ['GENEL', sets.map(s => pct(s.results))],
  ['Araç doğruluğu', sets.map(s => {
    const t = s.results.filter(r => r.toolOk !== null)
    return t.length ? `${Math.round((100 * t.filter(r => r.toolOk).length) / t.length)}%` : '-'
  })],
  ['Stil bayrağı', sets.map(s => String(s.results.reduce((n, r) => n + r.flags.length, 0)))],
  ['Tekrar (aynı soru, farklı cevap) %', sets.map(distinct)],
  ['Gramer bayrağı', sets.map(s => String(replyList(s).reduce((n, r) => n + grammarFlags(r.text).length, 0)))],
  ['Uzunluk bayrağı', sets.map(s => String(replyList(s).reduce((n, r) => n + lengthFlags(r.text, r.category).length, 0)))],
  ['En sık açılış payı', sets.map(s => `${Math.round(100 * opener(s).topShare)}% ${opener(s).topWord}`.slice(0, W - 1))],
  ['Tamam açılış payı (araçsız)', sets.map(s => `${Math.round(100 * opener(s).tamamShare)}%`)],
  ['Judge geçti %', sets.map(judgePass)],
  ['Hata/zaman aşımı', sets.map(s => String(s.results.filter(r => r.error).length))],
  ['Medyan gecikme', sets.map(s => `${(median(s.results.filter(r => !r.error).map(r => r.ms)) / 1000).toFixed(1)} sn`)],
]
const L = Math.max(18, ...table.map(([n]) => n.length + 2))
console.log(['', ...sets.map(s => s.label)].map((x, i) => (i ? x.padStart(W) : x.padEnd(L))).join(''))
for (const [name, cells] of table) console.log(name.padEnd(L) + cells.map(c => c.padStart(W)).join(''))

// Pass rate per case id (several runs: share of passing runs).
const rate = (s: Result, id: string) => {
  const rs = s.results.filter(r => r.id === id)
  return rs.length ? rs.filter(r => r.pass).length / rs.length : null
}
const ids = [...new Set(sets.flatMap(s => s.results.map(r => r.id)))]
const trim = (s: string) => s.replace(/\s+/g, ' ').slice(0, 120)
const diff = ids.filter(id => {
  const rates = sets.map(s => rate(s, id)).filter(r => r !== null)
  return rates.length > 1 && Math.max(...rates) >= 0.5 && Math.min(...rates) < 0.5
})
console.log(`\nModellerin ayrıştığı vakalar (${diff.length}):`)
for (const id of diff) {
  const first = sets.flatMap(s => s.results).find(r => r.id === id)!
  console.log(`\n${id} [${first.category}] ${first.user}`)
  for (const s of sets) {
    const r = s.results.find(x => x.id === id)
    if (!r) continue
    const tools = r.calls.map(c => c.name).join(',') || '-'
    const fails = [...r.checks.filter(k => !k.ok).map(k => k.reason), ...r.flags.map(f => `stil:${f}`)].join('; ')
    console.log(`  ${s.label.padEnd(8)} ${Math.round(100 * (rate(s, id) ?? 0))}% araç:${tools} "${trim(r.error ? `HATA ${r.error}` : r.answer)}"${fails ? ` <- ${fails}` : ''}`)
  }
}
