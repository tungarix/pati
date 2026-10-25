// Runs eval cases against one OpenAI-compatible server and writes eval/results/<label>.json.
// Usage: node eval/run.ts --url http://127.0.0.1:8081/v1 --key local --label 4b
//          [--cases eval/cases.json,eval/cases-v2.json] [--sampling old|new] [--model name]
//          [--only cat] [--limit n] [--runs n] [--dry]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { chatWithTools, listModels, SAMPLING, stripVocative, systemPrompt, withClock, type ChatMessage } from '../src/main/ai.ts'
import { cleanAppName, FOLDERS, MEDIA_ACTIONS, websiteUrl } from '../src/main/actions.ts'
import { pastBlock, withSummary } from '../src/main/brain.ts'
import { matchIntent } from '../src/main/intents.ts'
import { memoryBlock } from '../src/main/memory.ts'
import { reminderTime, toolDefinitions } from '../src/main/tools.ts'
import { CATEGORIES, checkExpect, checkRoute, styleFlags, turnsOf, validateCases, type Case, type Check, type ToolRec } from './checks.ts'
import { distinctReplies, grammarFlags, lengthFlags, openerStats } from './hidden.ts'
import { historyFrom, repliesOf, type TurnRec } from './turn.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const NOW = new Date(2026, 9, 21, 14, 37) // a Wednesday
const TIMEOUT_MS = 180_000
const DEFAULT_DISTINCT = 0.6

export interface RunRecord {
  id: string
  run: number
  category: string
  character?: string
  /** Every user text of the case, " | " between turns. */
  user: string
  /** Tool calls of all turns. */
  calls: ToolRec[]
  /** The final answer (of the last turn). */
  answer: string
  /** Each turn: what was asked, the model's final answer and the tools it called. */
  turns?: TurnRec[]
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
    cases: { type: 'string', default: 'eval/cases.json' },
    sampling: { type: 'string', default: 'new' },
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

if (opt.sampling !== 'old' && opt.sampling !== 'new') die('--sampling old ya da new olmalı.')

const files = opt.cases!.split(',').map(f => f.trim()).filter(Boolean)
const all = files.flatMap(f => {
  const file = path.resolve(f)
  if (!fs.existsSync(file)) return die(`Vaka dosyası yok: ${f}`)
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Case[]
})
const { errors, caught } = validateCases(all)
if (errors.length) die(`Vaka dosyaları hatalı (${files.join(', ')}):\n${errors.map(e => `  ${e}`).join('\n')}`)

const isRoute = (c: Case) => c.expect?.route !== undefined
const routeCheck = (c: Case) => checkRoute(c.user ?? '', c.expect!.route ?? null)

if (opt.dry) {
  const n = (c: string) => all.filter(x => x.category === c).length
  console.log(CATEGORIES.map(c => `${c}: ${n(c)}`).join('\n'))
  const badRoutes = all.filter(isRoute).filter(c => !routeCheck(c).ok)
  for (const c of badRoutes) console.log(`ROTA HATASI ${c.id}: ${routeCheck(c).reason}`)
  console.log(`toplam: ${all.length}, rota vakası: ${all.filter(isRoute).length}, modele gitmeyen (offender): ${caught.length}${caught.length ? ` -> ${caught.join(', ')}` : ''}`)
  process.exit(caught.length || badRoutes.length ? 1 : 0)
}

let cases = all.filter(c => !caught.includes(c.id))
if (caught.length) console.log(`Atlandı (matchIntent/Focus/Screen yakalıyor, modele gitmez): ${caught.join(', ')}`)

if (!opt.label) die('--label gerekli (ör. --label 4b)')
if (opt.only) cases = cases.filter(c => c.category === opt.only)
if (opt.limit) cases = cases.slice(0, Number(opt.limit))
const runs = Math.max(1, Number(opt.runs) || 1)
if (!cases.length) die('Çalıştırılacak vaka yok.')

// "old" is the app before 0.4.6: only temperature and frequency_penalty, none of the extras. Wrapping fetch
// keeps ai.ts untouched, so "new" is exactly what ships.
if (opt.sampling === 'old') {
  const realFetch = globalThis.fetch
  globalThis.fetch = (input, init) => {
    if (typeof init?.body === 'string' && String(input).endsWith('/chat/completions')) {
      const body = JSON.parse(init.body) as Record<string, unknown>
      for (const k of Object.keys(SAMPLING)) delete body[k]
      init = { ...init, body: JSON.stringify({ ...body, temperature: 0.5, frequency_penalty: 0.5 }) }
    }
    return realFetch(input, init)
  }
}

const personaOf = (character: string): string => {
  const j = JSON.parse(fs.readFileSync(path.join(here, '..', 'characters', character, 'character.json'), 'utf8'))
  return j.persona.tr as string
}

/** Stands in for runTool in tools.ts: records the call, answers like the real tool on success or bad args; a case may override a tool's result. */
function fakeTool(calls: ToolRec[], override: Record<string, unknown> = {}) {
  return async (name: string, raw: string): Promise<string> => {
    let args: Record<string, unknown> = {}
    try {
      args = raw ? JSON.parse(raw) : {}
    } catch {
      calls.push({ name, args: { _raw: raw } })
      return JSON.stringify({ error: 'arguments were not valid JSON' })
    }
    calls.push({ name, args })
    if (name in override) return JSON.stringify(override[name])
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
      case 'open_path': {
        const n = str('name')
        const isDir = str('kind') === 'folder'
        return JSON.stringify(n ? { ok: true, opened: `C:\\Users\\x\\Desktop\\${n}${isDir ? '' : '.pdf'}`, name: `${n}${isDir ? '' : '.pdf'}`, isDir } : { error: `unknown or disabled tool: ${name}` })
      }
      case 'take_note':
        return JSON.stringify(str('text') ? { ok: true } : { error: `unknown or disabled tool: ${name}` })
      case 'system_status':
        return JSON.stringify({ battery: 64, charging: false, cpu: 12, memory: 48 })
    }
    return JSON.stringify({ error: `unknown or disabled tool: ${name}` })
  }
}

const tools = toolDefinitions({ allowMemory: true, allowClipboard: false, allowWeb: false, allowActions: true })

/** A case the router answers alone: no server, no model. */
function runRoute(c: Case): RunRecord {
  const check = routeCheck(c)
  const got = matchIntent(c.user ?? '', 'tr')
  return {
    id: c.id, run: 1, category: c.category, character: c.character, user: c.user ?? '', calls: got ? [{ name: got.tool, args: got.args as Record<string, unknown> }] : [],
    answer: '', ms: 0, checks: [check], flags: [], toolOk: null, pass: check.ok,
  }
}

async function runCase(c: Case, run: number, server: { baseUrl: string; apiKey: string; model: string }): Promise<RunRecord> {
  const persona = personaOf(c.character)
  const facts = (c.facts ?? []).map((text, i) => ({ id: `f${i}`, text, createdAt: i }))
  const days = (c.pastDays ?? []).map(d => ({ key: d.key, file: '', md: withSummary(`# ${d.key}\n`, 'tr', d.summary) }))
  const known = [memoryBlock(facts, 'tr'), pastBlock(days, 'tr')].filter(Boolean).join('\n\n')
  const system: ChatMessage = { role: 'system', content: systemPrompt(persona, 'tr', known) }
  const spec = turnsOf(c)
  const multi = spec.length > 1
  const calls: ToolRec[] = []
  const turns: TurnRec[] = []
  const t0 = Date.now()
  const rec: RunRecord = { id: c.id, run, category: c.category, character: c.character, user: spec.map(t => t.user).join(' | '), calls, answer: '', turns, ms: 0, checks: [], flags: [], toolOk: null, pass: false }
  try {
    for (const [i, t] of spec.entries()) {
      const here: ToolRec[] = []
      const messages = [system, ...historyFrom(c.history ?? [], turns), { role: 'user' as const, content: withClock(t.user, 'tr', NOW) }]
      let answer = await chatWithTools(server, server.model, messages, tools, fakeTool(here, c.tool_results), AbortSignal.timeout(TIMEOUT_MS))
      if (c.character !== 'atlas') answer = stripVocative(answer)
      answer ||= '…'
      turns.push({ user: t.user, answer, calls: here })
      calls.push(...here)
      const tag = (s: string) => (multi && s ? `t${i + 1}: ${s}` : s)
      rec.checks.push(...checkExpect(t.expect ?? {}, answer, here, NOW).map(k => ({ ...k, reason: tag(k.reason) })))
      rec.flags.push(...styleFlags(answer, persona))
    }
    rec.ms = Date.now() - t0
    rec.answer = turns[turns.length - 1].answer
    const replies = turns.map(t => t.answer)
    const named = (name: string, per: string[][]) => {
      const bad = per.flatMap((fs, i) => fs.map(f => (multi ? `t${i + 1}:${f}` : f)))
      return { name, ok: bad.length === 0, reason: bad.join(', ') }
    }
    rec.checks.push(named('grammar', replies.map(grammarFlags)), named('length', replies.map(r => lengthFlags(r, c.category))))
    const threshold = c.distinct ?? (c.category === 'tekrar' ? DEFAULT_DISTINCT : undefined)
    if (threshold !== undefined && replies.length > 1) rec.checks.push(distinctReplies(replies, threshold))
    const toolChecks = rec.checks.filter(k => k.name === 'tool' || k.name === 'args')
    rec.toolOk = toolChecks.length ? toolChecks.every(k => k.ok) : null
    rec.pass = rec.checks.every(k => k.ok) && rec.flags.length === 0
  } catch (err) {
    rec.ms = Date.now() - t0
    rec.answer = turns[turns.length - 1]?.answer ?? ''
    rec.error = (err as Error).name === 'TimeoutError' ? `zaman aşımı (${TIMEOUT_MS / 1000} sn)` : (err as Error).message
  }
  return rec
}

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-')
const quantile = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : 0)

async function main() {
  const base = opt.url!
  let model = opt.model
  const needModel = cases.some(c => !isRoute(c))
  if (needModel) {
    try {
      const models = await listModels(base, opt.key, 5000)
      model ||= models[0]
    } catch (err) {
      die(`Sunucuya ulaşılamadı (${base}): ${((err as Error).cause as Error | undefined)?.message ?? (err as Error).message}\nllama-server çalışıyor mu, --url ve --key doğru mu? (Yalnız rota vakaları için --only rota modelsiz çalışır.)`)
    }
    if (!model) die('Sunucuda model yok; --model ile ver.')
  }
  const server = { baseUrl: base, apiKey: opt.key!, model: model ?? '' }
  console.log(`${opt.label}: ${model ?? 'model yok (yalnız rota)'} @ ${base}, örnekleme ${opt.sampling}, ${cases.length} vaka x ${runs}`)

  const records: RunRecord[] = []
  for (const c of cases)
    for (let r = 1; r <= (isRoute(c) ? 1 : runs); r++) {
      const rec = isRoute(c) ? runRoute(c) : await runCase(c, r, server)
      records.push(rec)
      const why = rec.error ? `HATA ${rec.error}` : [...rec.checks.filter(k => !k.ok).map(k => `${k.name}: ${k.reason}`), ...rec.flags.map(f => `stil:${f}`)].join('; ')
      console.log(`${rec.pass ? 'OK  ' : 'FAIL'} ${c.id}${runs > 1 && !isRoute(c) ? `#${r}` : ''} ${(rec.ms / 1000).toFixed(1)}s ${why}`)
    }

  fs.mkdirSync(path.join(here, 'results'), { recursive: true })
  fs.writeFileSync(path.join(here, 'results', `${opt.label}.json`), JSON.stringify({ label: opt.label, model: model ?? 'router', url: base, sampling: opt.sampling, cases: files, date: new Date().toISOString(), runs, results: records }, null, 2))

  console.log(`\n== ${opt.label} (${model ?? 'router'}, örnekleme ${opt.sampling}) ==`)
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
  const checked = (name: string) => records.flatMap(r => r.checks.filter(k => k.name === name))
  const dist = checked('distinct')
  console.log(`Tekrar (aynı soru, farklı cevap): ${pct(dist.filter(k => k.ok).length, dist.length)} (${dist.length} vaka)`)
  console.log(`Gramer bayrağı: ${checked('grammar').filter(k => !k.ok).length} vaka, Uzunluk bayrağı: ${checked('length').filter(k => !k.ok).length} vaka`)
  const replies = records.filter(r => !r.error && r.category !== 'rota').flatMap(repliesOf)
  const o = openerStats(replies.map(x => x.text), replies.map(x => x.tool))
  console.log(`Açılış: en sık "${o.topWord}" %${Math.round(100 * o.topShare)}, farklı iki kelimelik açılış ${o.twoWordOpeners}, Tamam payı (araçsız) %${Math.round(100 * o.tamamShare)}`)
  const ms = records.filter(r => !r.error && r.ms).map(r => r.ms)
  console.log(`Gecikme: medyan ${(quantile(ms, 0.5) / 1000).toFixed(1)} sn, p90 ${(quantile(ms, 0.9) / 1000).toFixed(1)} sn`)
  if (runs > 1) {
    const per = new Map<string, number[]>()
    for (const r of records) per.set(r.id, [...(per.get(r.id) ?? []), r.pass ? 1 : 0])
    const flaky = [...per].filter(([, v]) => v.includes(0) && v.includes(1)).map(([id, v]) => `${id} ${v.reduce((a, b) => a + b, 0)}/${v.length}`)
    console.log(`Tutarsız vakalar: ${flaky.join(', ') || 'yok'}`)
  }
}

await main()
