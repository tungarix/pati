// Runs eval/cases.json against one OpenAI-compatible server and writes eval/results/<label>.json.
// Usage: node eval/run.ts --url http://127.0.0.1:8081/v1 --key local --label 4b [--model name] [--only cat] [--limit n] [--runs n] [--dry]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { chatWithTools, listModels, systemPrompt, withClock, type ChatMessage } from '../src/main/ai.ts'
import { cleanAppName, FOLDERS, MEDIA_ACTIONS, websiteUrl } from '../src/main/actions.ts'
import { memoryBlock } from '../src/main/memory.ts'
import { reminderTime, toolDefinitions } from '../src/main/tools.ts'
import { CATEGORIES, checkExpect, styleFlags, validateCases, type Case, type Check, type ToolRec } from './checks.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const NOW = new Date(2026, 9, 21, 14, 37) // a Wednesday
const TIMEOUT_MS = 180_000

export interface RunRecord {
  id: string
  run: number
  category: string
  user: string
  calls: ToolRec[]
  answer: string
  ms: number
  checks: Check[]
  flags: string[]
  toolOk: boolean | null
  pass: boolean
  error?: string
}

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:8081/v1' },
    key: { type: 'string', default: 'local' },
    label: { type: 'string' },
    model: { type: 'string' },
    only: { type: 'string' },
    limit: { type: 'string' },
    runs: { type: 'string', default: '1' },
    dry: { type: 'boolean', default: false },
  },
})

const die = (msg: string): never => {
  console.error(msg)
  process.exit(1)
}

const all = JSON.parse(fs.readFileSync(path.join(here, 'cases.json'), 'utf8')) as Case[]
const { errors, caught } = validateCases(all)
if (errors.length) die(`cases.json hatalı:\n${errors.map(e => `  ${e}`).join('\n')}`)
let cases = all.filter(c => !caught.includes(c.id))
if (caught.length) console.log(`Atlandı (matchIntent/Focus/Screen yakalıyor, modele gitmez): ${caught.join(', ')}`)

if (opt.dry) {
  const n = (c: string) => all.filter(x => x.category === c).length
  console.log(CATEGORIES.map(c => `${c}: ${n(c)}`).join('\n'))
  console.log(`toplam: ${all.length}, yakalanan: ${caught.length}`)
  process.exit(caught.length ? 1 : 0)
}

if (!opt.label) die('--label gerekli (ör. --label 4b)')
if (opt.only) cases = cases.filter(c => c.category === opt.only)
if (opt.limit) cases = cases.slice(0, Number(opt.limit))
const runs = Math.max(1, Number(opt.runs) || 1)
if (!cases.length) die('Çalıştırılacak vaka yok.')

const personaOf = (character: string): string => {
  const j = JSON.parse(fs.readFileSync(path.join(here, '..', 'characters', character, 'character.json'), 'utf8'))
  return j.persona.tr as string
}

/** Stands in for runTool in tools.ts: records the call, answers like the real tool on success or bad args. */
function fakeTool(calls: ToolRec[]) {
  return async (name: string, raw: string): Promise<string> => {
    let args: Record<string, unknown> = {}
    try {
      args = raw ? JSON.parse(raw) : {}
    } catch {
      calls.push({ name, args: { _raw: raw } })
      return JSON.stringify({ error: 'arguments were not valid JSON' })
    }
    calls.push({ name, args })
    const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '')
    switch (name) {
      case 'remember':
        return JSON.stringify(str('fact') ? { ok: true } : { error: 'empty fact' })
      case 'set_reminder': {
        const at = reminderTime({ at: str('at') || undefined, in_minutes: args.in_minutes as number }, NOW)
        if (!str('text') || at === null) return JSON.stringify({ error: 'need text and a valid "at" (HH:MM) or in_minutes' })
        return JSON.stringify({ ok: true, at: new Date(at).toLocaleString('tr-TR') })
      }
      case 'open_app': {
        const n = cleanAppName(str('name'))
        return JSON.stringify(n ? { ok: true, opened: n } : { error: 'no installed app matches ""' })
      }
      case 'open_website': {
        const url = websiteUrl({ url: str('url') || undefined, query: str('query') || undefined })
        return JSON.stringify(url ? { ok: true, opened: url } : { error: 'need an http(s) url or search words' })
      }
      case 'media_control':
        return JSON.stringify(MEDIA_ACTIONS.includes(str('action') as never) ? { ok: true } : { error: `unknown or disabled tool: ${name}` })
      case 'open_folder':
        return JSON.stringify(FOLDERS.includes(str('which') as never) ? { ok: true } : { error: `unknown or disabled tool: ${name}` })
      case 'take_note':
        return JSON.stringify(str('text') ? { ok: true } : { error: `unknown or disabled tool: ${name}` })
      case 'system_status':
        return JSON.stringify({ battery: 64, charging: false, cpu: 12, memory: 48 })
    }
    return JSON.stringify({ error: `unknown or disabled tool: ${name}` })
  }
}

const tools = toolDefinitions({ allowMemory: true, allowClipboard: false, allowWeb: false, allowActions: true })

async function runCase(c: Case, run: number, server: { baseUrl: string; apiKey: string; model: string }): Promise<RunRecord> {
  const persona = personaOf(c.character)
  const facts = (c.facts ?? []).map((text, i) => ({ id: `f${i}`, text, createdAt: i }))
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(persona, 'tr', memoryBlock(facts, 'tr')) },
    ...(c.history ?? []),
    { role: 'user', content: withClock(c.user, 'tr', NOW) },
  ]
  const calls: ToolRec[] = []
  const t0 = Date.now()
  const rec: RunRecord = { id: c.id, run, category: c.category, user: c.user, calls, answer: '', ms: 0, checks: [], flags: [], toolOk: null, pass: false }
  try {
    rec.answer = await chatWithTools(server, server.model, messages, tools, fakeTool(calls), AbortSignal.timeout(TIMEOUT_MS))
    rec.ms = Date.now() - t0
    rec.checks = checkExpect(c.expect, rec.answer, calls, NOW)
    rec.flags = styleFlags(rec.answer, persona)
    const toolChecks = rec.checks.filter(k => k.name === 'tool' || k.name === 'args')
    rec.toolOk = toolChecks.length ? toolChecks.every(k => k.ok) : null
    rec.pass = rec.checks.every(k => k.ok) && rec.flags.length === 0
  } catch (err) {
    rec.ms = Date.now() - t0
    rec.error = (err as Error).name === 'TimeoutError' ? `zaman aşımı (${TIMEOUT_MS / 1000} sn)` : (err as Error).message
  }
  return rec
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-')
const quantile = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0)

async function main() {
  const base = opt.url!
  let model = opt.model
  try {
    const models = await listModels(base, opt.key, 5000)
    model ||= models[0]
  } catch (err) {
    die(`Sunucuya ulaşılamadı (${base}): ${((err as Error).cause as Error | undefined)?.message ?? (err as Error).message}\nllama-server çalışıyor mu, --url ve --key doğru mu?`)
  }
  if (!model) die('Sunucuda model yok; --model ile ver.')
  const server = { baseUrl: base, apiKey: opt.key!, model: model! }
  console.log(`${opt.label}: ${model} @ ${base}, ${cases.length} vaka x ${runs}`)

  const records: RunRecord[] = []
  for (const c of cases)
    for (let r = 1; r <= runs; r++) {
      const rec = await runCase(c, r, server)
      records.push(rec)
      const why = rec.error ? `HATA ${rec.error}` : [...rec.checks.filter(k => !k.ok).map(k => k.reason), ...rec.flags.map(f => `stil:${f}`)].join('; ')
      console.log(`${rec.pass ? 'OK  ' : 'FAIL'} ${c.id}${runs > 1 ? `#${r}` : ''} ${(rec.ms / 1000).toFixed(1)}s ${why}`)
    }

  fs.mkdirSync(path.join(here, 'results'), { recursive: true })
  fs.writeFileSync(path.join(here, 'results', `${opt.label}.json`), JSON.stringify({ label: opt.label, model, url: base, date: new Date().toISOString(), runs, results: records }, null, 2))

  console.log(`\n== ${opt.label} (${model}) ==`)
  console.log(`Genel: ${pct(records.filter(r => r.pass).length, records.length)} (${records.length} koşu, ${records.filter(r => r.error).length} hata)`)
  const tl = records.filter(r => r.toolOk !== null)
  console.log(`Araç doğruluğu: ${pct(tl.filter(r => r.toolOk).length, tl.length)}`)
  for (const cat of CATEGORIES) {
    const rs = records.filter(r => r.category === cat)
    if (rs.length) console.log(`  ${cat.padEnd(14)} ${pct(rs.filter(r => r.pass).length, rs.length)}`)
  }
  const flagCount: Record<string, number> = {}
  for (const r of records) for (const f of r.flags) flagCount[f] = (flagCount[f] ?? 0) + 1
  console.log(`Stil bayrakları: ${Object.entries(flagCount).map(([k, v]) => `${k}=${v}`).join(', ') || 'yok'}`)
  const ms = records.filter(r => !r.error).map(r => r.ms)
  console.log(`Gecikme: medyan ${(quantile(ms, 0.5) / 1000).toFixed(1)} sn, p90 ${(quantile(ms, 0.9) / 1000).toFixed(1)} sn`)
  if (runs > 1) {
    const per = new Map<string, number[]>()
    for (const r of records) per.set(r.id, [...(per.get(r.id) ?? []), r.pass ? 1 : 0])
    const flaky = [...per].filter(([, v]) => v.includes(0) && v.includes(1)).map(([id, v]) => `${id} ${v.reduce((a, b) => a + b, 0)}/${v.length}`)
    console.log(`Tutarsız vakalar: ${flaky.join(', ') || 'yok'}`)
  }
}

await main()
