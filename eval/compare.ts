// Prints the results in eval/results/*.json side by side. Usage: node eval/compare.ts

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CATEGORIES } from './checks.ts'
import type { RunRecord } from './run.ts'

interface Result {
  label: string
  model: string
  runs: number
  results: RunRecord[]
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results')
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []
if (!files.length) {
  console.error('eval/results/ boş; önce node eval/run.ts çalıştır.')
  process.exit(1)
}
const sets = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Result)

const pct = (rs: RunRecord[]) => (rs.length ? `${Math.round((100 * rs.filter(r => r.pass).length) / rs.length)}%` : '-')
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0)
const W = 14

const table: [string, string[]][] = [
  ['Model', sets.map(s => s.model.slice(0, W - 1))],
  ...CATEGORIES.map((c): [string, string[]] => [c, sets.map(s => pct(s.results.filter(r => r.category === c)))]),
  ['GENEL', sets.map(s => pct(s.results))],
  ['Araç doğruluğu', sets.map(s => {
    const t = s.results.filter(r => r.toolOk !== null)
    return t.length ? `${Math.round((100 * t.filter(r => r.toolOk).length) / t.length)}%` : '-'
  })],
  ['Stil bayrağı', sets.map(s => String(s.results.reduce((n, r) => n + r.flags.length, 0)))],
  ['Hata/zaman aşımı', sets.map(s => String(s.results.filter(r => r.error).length))],
  ['Medyan gecikme', sets.map(s => `${(median(s.results.filter(r => !r.error).map(r => r.ms)) / 1000).toFixed(1)} sn`)],
]
console.log(['', ...sets.map(s => s.label)].map((x, i) => (i ? x.padStart(W) : x.padEnd(18))).join(''))
for (const [name, cells] of table) console.log(name.padEnd(18) + cells.map(c => c.padStart(W)).join(''))

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
