// Pure checkers for the eval: no server, no I/O, so test/eval.test.ts can cover them.

import { systemPrompt } from '../src/main/ai.ts'
import { matchFocus, matchIntent, matchScreen } from '../src/main/intents.ts'
import { reminderTime } from '../src/main/tools.ts'

export interface ToolRec {
  name: string
  args: Record<string, unknown>
}

export type ArgSpec = string | number | string[]

export interface Expect {
  tool?: string | null
  anyTool?: string[]
  args?: Record<string, ArgSpec>
  contains?: string[]
  notContains?: string[]
  maxSentences?: number
  /** Clock time "HH:MM" or minutes from the fixed clock the set_reminder call must end up firing at (±1 min). */
  fireAt?: string
  fireIn?: number
}

export interface Case {
  id: string
  category: string
  character: 'tungarix' | 'atlas'
  user: string
  facts?: string[]
  history?: { role: 'user' | 'assistant'; content: string }[]
  expect: Expect
}

export interface Check {
  name: string
  ok: boolean
  reason: string
}

export const CATEGORIES = ['hatirlatici', 'hafiza_kaydet', 'hafiza_kullan', 'arac_eylem', 'sohbet', 'durustluk', 'saat', 'bilgi', 'stil']

export const lower = (s: string) => s.toLocaleLowerCase('tr')

/** Lower-cases a regex source but leaves escapes alone (\S must not become \s). */
const lowerPattern = (p: string) => p.replace(/\\.|[^\\]+/g, m => (m[0] === '\\' ? m : lower(m)))

/** Case-insensitive, Turkish-aware regex match: İ/I fold to i/ı on both sides. */
export function matches(pattern: string, text: string): boolean {
  return new RegExp(lowerPattern(pattern), 'i').test(lower(text))
}

function argOk(spec: string | number, value: unknown): boolean {
  if (value === undefined || value === null) return false
  return typeof spec === 'number' ? Math.abs(Number(value) - spec) <= 1 : matches(spec, String(value))
}

/** Every spec must be met by some call of that tool; an array spec may be met across calls (two facts). */
export function checkArgs(calls: ToolRec[], names: string[], args: Record<string, ArgSpec>): Check {
  const mine = calls.filter(c => names.includes(c.name))
  const bad: string[] = []
  for (const [key, spec] of Object.entries(args)) {
    const parts = Array.isArray(spec) ? spec : [spec]
    // "url|query": either argument may carry the words.
    for (const p of parts) if (!mine.some(c => key.split('|').some(k => argOk(p, c.args[k])))) bad.push(`${key}~${p}`)
  }
  return { name: 'args', ok: bad.length === 0, reason: bad.length ? `eksik: ${bad.join(', ')}` : '' }
}

/** Whether some set_reminder call fires within a minute of the wanted time, however it spelled it. */
export function checkFire(calls: ToolRec[], e: Expect, now: Date): Check {
  const want = e.fireIn !== undefined ? now.getTime() + e.fireIn * 60_000 : reminderTime({ at: e.fireAt }, now)
  const fires = calls.filter(c => c.name === 'set_reminder').map(c =>
    reminderTime({ at: typeof c.args.at === 'string' ? c.args.at.trim() : undefined, in_minutes: c.args.in_minutes as number }, now))
  const ok = want !== null && fires.some(t => t !== null && Math.abs(t - want) <= 60_000)
  const fmt = (t: number | null) => (t === null ? 'geçersiz' : new Date(t).toTimeString().slice(0, 5))
  return { name: 'fire', ok, reason: ok ? '' : `beklenen ${fmt(want)}, kurulan ${fires.map(fmt).join(', ') || 'yok'}` }
}

export function checkTool(calls: ToolRec[], e: Expect): Check[] {
  const out: Check[] = []
  const names = calls.map(c => c.name)
  if (e.tool === null) out.push({ name: 'tool', ok: names.length === 0, reason: names.length ? `araç çağırdı: ${names.join(', ')}` : '' })
  else {
    const want = e.anyTool ?? (e.tool ? [e.tool] : null)
    if (want) {
      const hit = names.some(n => want.includes(n))
      out.push({ name: 'tool', ok: hit, reason: hit ? '' : `beklenen ${want.join('|')}, gelen ${names.join(', ') || 'yok'}` })
      if (e.args) out.push(checkArgs(calls, want, e.args))
    }
  }
  return out
}

export function sentences(text: string): number {
  return text.split(/[.!?…]+(?:\s+|$)/).filter(s => s.trim()).length
}

/** Runs every `expect` check on the final answer and the recorded tool calls. */
export function checkExpect(e: Expect, answer: string, calls: ToolRec[], now = new Date(2026, 9, 21, 14, 37)): Check[] {
  const out = checkTool(calls, e)
  if (e.fireAt !== undefined || e.fireIn !== undefined) out.push(checkFire(calls, e, now))
  for (const p of e.contains ?? []) out.push({ name: 'contains', ok: matches(p, answer), reason: matches(p, answer) ? '' : `yok: ${p}` })
  for (const p of e.notContains ?? []) out.push({ name: 'notContains', ok: !matches(p, answer), reason: matches(p, answer) ? `var: ${p}` : '' })
  if (e.maxSentences !== undefined) {
    const n = sentences(answer)
    out.push({ name: 'maxSentences', ok: n <= e.maxSentences, reason: n > e.maxSentences ? `${n} cümle (en fazla ${e.maxSentences})` : '' })
  }
  return out
}

const ENGLISH = /\b(the|you|and|is|are|what|how|can|with|your|this|that|have|for)\b/gi

/** Pieces of the persona and rules long enough that quoting them is a leak, not a coincidence. */
export function leakFragments(persona: string): string[] {
  return `${persona}\n${systemPrompt('', 'tr')}`
    .split(/[.:;,\n]/)
    .map(s => lower(s.replace(/^\s*-\s*/, '').trim()))
    .filter(s => s.length >= 20)
}

/** Style problems in an answer, independent of what the case expects. Empty array = clean. */
export function styleFlags(answer: string, persona = ''): string[] {
  const flags: string[] = []
  const a = answer.trim()
  if (!a || a === '…') flags.push('empty')
  if (/\*\*|^#{1,6}\s|^\s*(?:[-*•]|\d+[.)])\s|`/m.test(answer)) flags.push('markdown')
  if (/\$|\\frac|\\\(|\\\[|\\sqrt/.test(answer)) flags.push('latex')
  if (emojiCount(answer) > 1) flags.push('emoji')
  if ((answer.match(/!/g) ?? []).length > 3) flags.push('exclaim')
  if (a && !/[çğıöşüÇĞİÖŞÜ]/.test(a) && new Set((a.match(ENGLISH) ?? []).map(w => w.toLowerCase())).size >= 2) flags.push('nonTurkish')
  const la = lower(a)
  if (a && leakFragments(persona).some(f => la.includes(f))) flags.push('ruleLeak')
  if ((la.match(/kanka/g) ?? []).length > 1) flags.push('kanka')
  return flags
}

export const emojiCount = (s: string) => (s.match(/\p{Extended_Pictographic}/gu) ?? []).length

const KEYS = ['tool', 'anyTool', 'args', 'contains', 'notContains', 'maxSentences', 'fireAt', 'fireIn']

/** Schema and regex problems of a case list, plus the cases the app would answer without the model. */
export function validateCases(cases: Case[]): { errors: string[]; caught: string[] } {
  const errors: string[] = []
  const caught: string[] = []
  const seen = new Set<string>()
  const re = (id: string, p: unknown) => {
    try {
      new RegExp(lowerPattern(String(p)), 'i')
    } catch {
      errors.push(`${id}: geçersiz regex ${p}`)
    }
  }
  for (const c of cases) {
    const id = c.id ?? '?'
    if (!c.id || seen.has(c.id)) errors.push(`${id}: id yok ya da tekrar`)
    seen.add(c.id)
    if (!CATEGORIES.includes(c.category)) errors.push(`${id}: bilinmeyen kategori ${c.category}`)
    if (c.character !== 'tungarix' && c.character !== 'atlas') errors.push(`${id}: bilinmeyen karakter ${c.character}`)
    if (typeof c.user !== 'string' || !c.user.trim()) errors.push(`${id}: user boş`)
    if (c.facts && !c.facts.every(f => typeof f === 'string')) errors.push(`${id}: facts string olmalı`)
    for (const h of c.history ?? []) if (!['user', 'assistant'].includes(h.role) || typeof h.content !== 'string') errors.push(`${id}: history bozuk`)
    const e = c.expect
    if (!e || typeof e !== 'object') {
      errors.push(`${id}: expect yok`)
      continue
    }
    for (const k of Object.keys(e)) if (!KEYS.includes(k)) errors.push(`${id}: bilinmeyen expect anahtarı ${k}`)
    if (Object.keys(e).length === 0) errors.push(`${id}: expect boş`)
    for (const [k, v] of Object.entries(e.args ?? {}))
      for (const p of Array.isArray(v) ? v : [v]) {
        if (typeof p === 'number') continue
        if (typeof p !== 'string') errors.push(`${id}: args.${k} string/number/dizi olmalı`)
        else re(id, p)
      }
    for (const p of [...(e.contains ?? []), ...(e.notContains ?? [])]) re(id, p)
    if (e.fireAt !== undefined && !/^\d{1,2}:\d{2}$/.test(e.fireAt)) errors.push(`${id}: fireAt HH:MM olmalı`)
    if (e.fireAt !== undefined && e.fireIn !== undefined) errors.push(`${id}: fireAt ile fireIn birlikte olmaz`)
    if (e.tool !== undefined && e.anyTool) errors.push(`${id}: tool ile anyTool birlikte olmaz`)
    if (typeof c.user === 'string' && (matchIntent(c.user, 'tr') || matchFocus(c.user) !== null || matchScreen(c.user))) caught.push(id)
  }
  return { errors, caught }
}
