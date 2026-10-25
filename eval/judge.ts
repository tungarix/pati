// Offline LLM judge over a finished run: scores every final answer on four axes (0-2) and caches the verdicts.
// Usage: node eval/judge.ts --url http://127.0.0.1:8080/v1 --key local --label x [--model name] [--par 3]
// Reads eval/results/x.json, writes eval/results/x.judge.json (rerun = only the missing answers; Ctrl+C is safe).

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { listModels } from '../src/main/ai.ts'
import type { RunRecord } from './run.ts'
import type { TurnRec } from './turn.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

export const AXES = ['dilbilgisi', 'dogallik', 'baglam', 'karakter'] as const
export type Axis = (typeof AXES)[number]
export type Scores = Record<Axis, number> & { neden: string }

export const JUDGE_SYSTEM = [
  'Sen bir Türkçe dil ve sohbet kalitesi hakemisin. Masaüstünde yaşayan Pati adlı bir maskotun verdiği TEK bir cevabı puanlarsın.',
  'Dört ekseni 0, 1 ya da 2 ile puanla:',
  '- dilbilgisi: Cümleler doğru ve kusursuz Türkçe mi? 2 = hatasız. 1 = küçük bir hata (ek, yazım). 0 = anlamı bozan ya da bariz hata: yanlış ek ("Tamamdı", "seni hatırlat"), kelime tekrarı ("tamam tamam"), bozuk yapı ("Sen nasıl gidiyor hayat"), çevrilmiş gibi duran cümle.',
  '- dogallik: Gerçek bir arkadaşın yazacağı gibi akıcı ve doğal mı? 2 = doğal. 1 = biraz kalıp ya da kuru. 0 = robotik, kalıp cevap, boş laf, kullanıcının sözünü papağan gibi tekrar eden ya da gereksiz uzun cevap.',
  '- baglam: Cevap kullanıcının son mesajına ve konuşmanın gidişine uyuyor mu? 2 = tam uyuyor, gerekli bilgiyi doğru kullanıyor. 1 = kısmen. 0 = konu dışı, soruyu kaçıran, öncekiyle çelişen, uydurma bilgi ya da yapmadığı bir işi yapmış gibi gösteren cevap.',
  '- karakter: Persona metnindeki karaktere ve tona uyuyor mu, ama bunu abartmadan? 2 = uyuyor. 1 = karakter belli belirsiz ya da biraz abartılı. 0 = karakterle çelişiyor ya da hitap/lakap takıntısı var.',
  'Katı ol: emin değilsen düşük ver. Yalnızca puanlanan cevaba bak; cevabı düzeltme, yeniden yazma.',
  'Çıktı: yalnızca tek satır JSON, başka hiçbir şey yazma:',
  '{"dilbilgisi":0,"dogallik":0,"baglam":0,"karakter":0,"neden":"en fazla 15 kelime"}',
].join('\n')

export interface JudgeInput {
  persona: string
  /** The conversation before the answered message. */
  earlier: { user: string; answer: string }[]
  user: string
  answer: string
}

/** The user message the judge sees: persona, earlier turns, the message and the answer to score. */
export function buildPrompt(i: JudgeInput): { system: string; user: string } {
  const earlier = i.earlier.length ? i.earlier.map(t => `Kullanıcı: ${t.user}\nPati: ${t.answer}`).join('\n') : '(yok)'
  return {
    system: JUDGE_SYSTEM,
    user: [
      `Karakter metni:\n${i.persona || '(bilinmiyor)'}`,
      `Önceki konuşma:\n${earlier}`,
      `Kullanıcının mesajı:\n${i.user}`,
      `Puanlanacak cevap (Pati):\n${i.answer}`,
    ].join('\n\n'),
  }
}

/** First JSON object in the reply with all four axes as 0, 1 or 2; null when it cannot be read. */
export function parseScores(text: string): Scores | null {
  const m = /\{[\s\S]*?\}/.exec(text.replace(/```(?:json)?/gi, ''))
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    const out: Record<string, unknown> = { neden: String(j.neden ?? '') }
    for (const a of AXES) {
      const v = Number(j[a])
      if (!Number.isInteger(v) || v < 0 || v > 2) return null
      out[a] = v
    }
    return out as Scores
  } catch {
    return null
  }
}

/** A zero on any axis fails the answer. */
export const failed = (s: Scores) => AXES.some(a => s[a] === 0)

export const answerKey = (id: string, run: number, turn: number, answer: string) =>
  `${id}#${run}#${turn}#${crypto.createHash('sha1').update(answer).digest('hex').slice(0, 12)}`

export interface Entry extends Partial<Scores> {
  id: string
  run: number
  turn: number
  fail: boolean
}

/** The answers of a result file that need a verdict, with what the judge needs to see. */
export function tasksOf(records: RunRecord[]): { key: string; id: string; run: number; turn: number; input: JudgeInput; character?: string }[] {
  const out = []
  for (const r of records) {
    if (r.error || r.category === 'rota') continue
    const turns: TurnRec[] = r.turns?.length ? r.turns : [{ user: r.user, answer: r.answer, calls: r.calls }]
    for (const [i, t] of turns.entries())
      if (t.answer.trim()) out.push({ key: answerKey(r.id, r.run, i, t.answer), id: r.id, run: r.run, turn: i, character: r.character, input: { persona: '', earlier: turns.slice(0, i).map(x => ({ user: x.user, answer: x.answer })), user: t.user, answer: t.answer } })
  }
  return out
}

let jsonMode = true // some servers reject response_format; then it stays off

async function ask(base: string, key: string, model: string, p: { system: string; user: string }): Promise<string> {
  const send = (json: boolean) =>
    fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }],
        temperature: 0,
        max_tokens: 160,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        chat_template_kwargs: { enable_thinking: false },
      }),
    })
  let res = await send(jsonMode)
  if (res.status === 400 && jsonMode) {
    jsonMode = false
    res = await send(false)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] }
  return body.choices?.[0]?.message?.content ?? ''
}

async function main() {
  const { values: opt } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://127.0.0.1:8080/v1' },
      key: { type: 'string', default: 'local' },
      label: { type: 'string' },
      model: { type: 'string' },
      par: { type: 'string', default: '3' },
    },
  })
  const die = (msg: string): never => {
    console.error(msg)
    process.exit(1)
  }
  if (!opt.label) die('--label gerekli (ör. --label pati4b)')
  const src = path.join(here, 'results', `${opt.label}.json`)
  if (!fs.existsSync(src)) die(`Sonuç dosyası yok: ${src}`)
  const result = JSON.parse(fs.readFileSync(src, 'utf8')) as { results: RunRecord[] }
  const outFile = path.join(here, 'results', `${opt.label}.judge.json`)
  const cache: { label: string; model: string; entries: Record<string, Entry> } = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : { label: opt.label!, model: '', entries: {} }

  const personas = new Map<string, string>()
  const personaOf = (c?: string) => {
    if (!c) return ''
    if (!personas.has(c)) personas.set(c, (JSON.parse(fs.readFileSync(path.join(here, '..', 'characters', c, 'character.json'), 'utf8')).persona.tr as string) ?? '')
    return personas.get(c)!
  }
  const all = tasksOf(result.results)
  const todo = all.filter(t => !cache.entries[t.key])
  console.log(`${opt.label}: ${all.length} cevap, ${all.length - todo.length} önbellekte, ${todo.length} puanlanacak`)

  if (todo.length) {
    let model = opt.model
    try {
      model ||= (await listModels(opt.url!, opt.key, 5000))[0]
    } catch (err) {
      die(`Hakem sunucusuna ulaşılamadı (${opt.url}): ${((err as Error).cause as Error | undefined)?.message ?? (err as Error).message}\nllama-server çalışıyor mu, --url ve --key doğru mu?`)
    }
    if (!model) die('Sunucuda model yok; --model ile ver.')
    cache.model = model!
    let next = 0
    let done = 0
    let broken = 0
    const worker = async () => {
      while (next < todo.length) {
        const t = todo[next++]
        let scores: Scores | null = null
        try {
          const prompt = buildPrompt({ ...t.input, persona: personaOf(t.character) })
          for (let k = 0; k < 2 && !scores; k++) scores = parseScores(await ask(opt.url!, opt.key!, model!, prompt))
        } catch (err) {
          console.error(`${t.id}#${t.run} t${t.turn + 1}: ${(err as Error).message}`)
        }
        done++
        if (!scores) {
          broken++ // not cached: a rerun tries it again
          continue
        }
        cache.entries[t.key] = { id: t.id, run: t.run, turn: t.turn, ...scores, fail: failed(scores) }
        fs.writeFileSync(outFile, JSON.stringify(cache, null, 2))
        if (done % 10 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`)
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Number(opt.par) || 3) }, worker))
    if (broken) console.log(`${broken} cevap okunamadı; yeniden çalıştırınca denenir.`)
  }

  const es = all.map(t => cache.entries[t.key]).filter(Boolean)
  const mean = (a: Axis) => (es.reduce((n, e) => n + (e[a] ?? 0), 0) / (es.length || 1)).toFixed(2)
  console.log(`\n== hakem ${opt.label} (${cache.model}) ==`)
  console.log(AXES.map(a => `${a} ${mean(a)}`).join(', '))
  console.log(`Kalan cevap: ${es.filter(e => e.fail).length}/${es.length}`)
  for (const e of es.filter(x => x.fail).slice(0, 15)) console.log(`  ${e.id}#${e.run} t${e.turn + 1}: ${AXES.map(a => e[a]).join('')} ${e.neden ?? ''}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
