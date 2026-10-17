// What the user told the pet about themselves: one bullet per fact in the brain's
// Memory.md, so editing that note in Obsidian is editing the pet's memory.
import fs from 'node:fs'
import path from 'node:path'

import type { Lang } from '../shared/types.ts'

export interface Fact {
  id: string
  text: string
  createdAt: number
}

/** Oldest facts go first once the list is full, so the prompt stays small. */
export const MEMORY_LIMIT = 40

const HEADER: Record<Lang, string> = {
  tr: "# Memory\n\nPati'nin senin hakkında hatırladıkları. Satır ekleyebilir, düzeltebilir ya da silebilirsin.\n\n",
  en: '# Memory\n\nWhat Pati remembers about you. Add, fix or delete lines as you like.\n\n',
}

/** Stable id from the text, so a fact keeps its id across reloads of the note. */
function idOf(text: string): string {
  let h = 5381
  for (const ch of text) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0
  return `f${h.toString(36)}`
}

export function loadFacts(file: string): Fact[] {
  if (!fs.existsSync(file)) return []
  return [...fs.readFileSync(file, 'utf8').matchAll(/^[-*] +(.+?)\s*$/gm)].map((m, i) => ({ id: idOf(m[1]), text: m[1], createdAt: i }))
}

export function saveFacts(file: string, facts: Fact[], lang: Lang): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, HEADER[lang] + facts.map(f => `- ${f.text}`).join('\n') + (facts.length ? '\n' : ''), 'utf8')
}

const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim()

/** Adds a fact unless the same one is already known; trims to the limit. */
export function addFact(facts: Fact[], text: string, now = Date.now()): Fact[] {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!clean || facts.some(f => norm(f.text) === norm(clean))) return facts
  return [...facts, { id: idOf(clean), text: clean, createdAt: now }].slice(-MEMORY_LIMIT)
}

/** Removes every fact containing `text` (case-insensitive); returns how many went. */
export function forgetFacts(facts: Fact[], text: string): { facts: Fact[]; removed: number } {
  const needle = norm(text)
  if (!needle) return { facts, removed: 0 }
  const kept = facts.filter(f => !norm(f.text).includes(needle))
  return { facts: kept, removed: facts.length - kept.length }
}

const PERSONAL = [
  'ben ', 'benim', 'adım', 'ismim', 'yaşındayım', 'okuyorum', 'öğrenciyim', 'çalışıyorum', 'mesleğim', 'hobim',
  'severim', 'seviyorum', 'sevmem', 'sevmiyorum', 'nefret ederim', 'bayılırım',
  "i'm ", 'i am ', 'my name', 'years old', 'i study', 'i work', 'i love', 'i like', 'i hate', "i don't like", 'my hobby',
]

/** Whether a message probably tells something lasting about the user; cheap, errs towards yes. */
export function looksPersonal(text: string): boolean {
  // Turkish lower-casing turns English "I" into dotless "ı", so check both forms.
  const t = ` ${text.toLocaleLowerCase('tr')} ${text.toLowerCase()} `
  return PERSONAL.some(w => t.includes(w))
}

/** The block the system prompt carries so the model knows the user. */
export function memoryBlock(facts: Fact[], lang: Lang): string {
  if (facts.length === 0) return ''
  const title = lang === 'tr' ? 'Kullanıcı hakkında bildiklerin:' : 'What you know about the user:'
  return `${title}\n${facts.map(f => `- ${f.text}`).join('\n')}`
}
