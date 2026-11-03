// Writes docs/BENCHMARK.md: every saved eval run side by side, one table per case set.
//   node eval/benchmark.ts
import fs from 'node:fs'
import path from 'node:path'

const DIR = path.join(import.meta.dirname, 'results')
const OUT = path.join(import.meta.dirname, '..', 'docs', 'BENCHMARK.md')

const NAMES: Record<string, string> = {
  '35b': 'Qwen3.6-35B (2 bit)',
  '4b': 'Qwen3.5-4B (düz)',
  '9b': 'Qwen3.5-9B (düz)',
  pati4b: 'Pati-4B ilk eğitim',
  'pati4b-v2': 'Pati-4B deneme v2',
  'pati4b-a': 'Pati-4B deneme a',
  'v1-eski': 'Pati-4B v1 (eski ayar)',
  'v1-yeni': 'Pati-4B v1',
  'v3-eski': 'Pati-4B v3 (eski ayar)',
  'v3-yeni': 'Pati-4B v3',
  'bolt-e4b': 'Bolt E4B (düşünme açık)',
  'bolt-e4b-dusunmesiz': 'Bolt E4B (düşünme kapalı)',
  'v4-yeni': 'Pati-4B v4 (deneme)',
  'v41-yeni': 'Pati-4B v4.1 (deneme)',
  'v3-yeni2': 'Pati-4B v3 (1. ölçüm, yeni set)',
  'v42-yeni': 'Pati-4B v4.2 (1. ölçüm)',
  'v42-yeni2': 'Pati-4B v4.2 (2. ölçüm)',
  'v3-yeni3': 'Pati-4B v3 (2. ölçüm, yeni set)',
}

interface Check { name: string; ok: boolean; reason: string }
interface Rec { id: string; category: string; pass: boolean; toolOk: boolean | null; ms: number; checks: Check[] }
interface Run { label: string; model: string; date: string; runs: number; sampling?: string; results: Rec[] }

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '-')
const passRate = (rs: Rec[]) => pct(rs.filter(r => r.pass).length, rs.length)
// Fails only for an answer that starts with a lowercase letter: a formatting rule the app could fix itself.
const onlyLower = (r: Rec) => !r.pass && r.checks.filter(c => !c.ok).every(c => c.name === 'grammar' && /küçük_harfle_başlıyor/.test(c.reason))
// "21% (71%)": the strict rate, and in brackets the rate when the lowercase-start rule is ignored (only when it differs).
const withAdj = (rs: Rec[]) => {
  const strict = passRate(rs)
  const adj = pct(rs.filter(x => x.pass || onlyLower(x)).length, rs.length)
  return strict === adj ? strict : `${strict} (${adj})`
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0

const runs = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.json') && !f.includes('.judge.'))
  .map(f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as Run)
  .sort((a, b) => Object.keys(NAMES).indexOf(a.label) - Object.keys(NAMES).indexOf(b.label))

const bySet = new Map<number, Run[]>()
for (const r of runs) {
  const n = new Set(r.results.map(x => x.id)).size
  bySet.set(n, [...(bySet.get(n) ?? []), r])
}

const lines = [
  '# Pati ölçüm sonuçları',
  '',
  'Türkçe ölçüm setiyle ([eval/README.md](../eval/README.md)) ölçülen her model yan yana. Bu dosya `node eval/benchmark.ts` ile kayıtlı sonuçlardan üretilir.',
  '',
  'Okurken: iki vaka seti var ve birbirine eklenemez (80 vaka tek turlu eski set, 158 vaka çok turlu, tekrar, dosya ve gramer kontrolleri olan yeni set). **Genel** katı puandır. **Genel (küçük harf hariç)** yalnızca küçük harfle başlayan cevap yüzünden kalan vakaları geçmiş sayar; bu uygulamanın kendisinin düzeltebileceği bir biçim kuralıdır. Kategori hücrelerinde parantez içindeki sayı, aynı kural yok sayılınca çıkan orandır (yalnızca farklıysa yazılır). Sayılar vaka başına koşuların ortalamasıdır, kayıtlı dosyalardan hesaplanır.',
  '',
]

for (const [n, set] of [...bySet].sort((a, b) => a[0] - b[0])) {
  const cats = [...new Set(set.flatMap(r => r.results.map(x => x.category)))]
  const head = set.map(r => `${NAMES[r.label] ?? r.label}`)
  const row = (name: string, f: (r: Run) => string) => `| ${name} | ${set.map(f).join(' | ')} |`
  lines.push(`## ${n} vakalık set`, '', `| | ${head.join(' | ')} |`, `|---|${set.map(() => '---').join('|')}|`)
  lines.push(row('**Genel**', r => `**${passRate(r.results)}**`))
  lines.push(row('Genel (küçük harf hariç)', r => pct(r.results.filter(x => x.pass || onlyLower(x)).length, r.results.length)))
  lines.push(row('Araç doğruluğu', r => { const t = r.results.filter(x => x.toolOk !== null); return pct(t.filter(x => x.toolOk).length, t.length) }))
  for (const c of cats) lines.push(row(c, r => withAdj(r.results.filter(x => x.category === c))))
  lines.push(row('Medyan gecikme', r => `${(median(r.results.map(x => x.ms)) / 1000).toFixed(1)} sn`))
  lines.push(row('Koşu / tarih', r => `${r.runs} / ${String(r.date).slice(0, 10)}`), '')
}

lines.push(
  '## Notlar',
  '',
  '- **Bolt E4B** modelin kendi ayarlarıyla, "düşünme" açık ölçüldü (Pati-4B düşünmeden cevap verir). Q4_K_M, 6,18 GB. Cevapların yaklaşık yarısı küçük harfle başlıyor; bu yüzden katı ve düzeltilmiş puan çok ayrışıyor.',
  '- Sonuç dosyaları `eval/results/` altındadır ve depoya girmez.',
  '',
)

fs.writeFileSync(OUT, lines.join('\n'))
console.log(`docs/BENCHMARK.md: ${bySet.size} set, ${runs.length} koşu`)
