// The pet's "brain": a folder of plain Markdown the user can open as an Obsidian
// vault. One note per day of chat, with a summary on top, so the pet can pick up
// where it left off after a restart and remember earlier days.
import fs from 'node:fs'
import path from 'node:path'

import type { Lang } from '../shared/types.ts'
import type { ChatMessage } from './ai.ts'

// Language-neutral names: switching the app language must not lose the brain.
export const CHATS_DIR = 'Chats'
export const MEMORY_NOTE = 'Memory.md'
const INDEX_NOTE = 'Pati.md'

const LABEL = { tr: { you: 'Sen', summary: 'Özet' }, en: { you: 'You', summary: 'Summary' } }
const SUMMARY_HEADING = /^## (Özet|Summary)\s*$/m

const INDEX: Record<Lang, string> = {
  tr: `# Pati beyni

Bu klasör Pati'nin hafızası. Hepsi düz Markdown; Obsidian'da açıp okuyabilir, düzenleyebilirsin.

- [[Memory]]: Pati'nin senin hakkında hatırladıkları. Buraya "- " ile satır eklersen Pati de öğrenir, silersen unutur.
- \`Chats/\`: her günün sohbeti. En üstteki "Özet" bölümünü Pati kendisi yazar ve sonraki günlerde hatırlamak için kullanır.

Hiçbir şey bilgisayarından çıkmaz.
`,
  en: `# Pati's brain

This folder is Pati's memory. It is all plain Markdown; open it in Obsidian to read or edit it.

- [[Memory]]: what Pati remembers about you. Add a line starting with "- " and Pati learns it; delete one and it forgets.
- \`Chats/\`: one note per day of chat. Pati writes the "Summary" at the top itself and reads it to remember earlier days.

Nothing leaves your computer.
`,
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dayFile(dir: string, d: Date): string {
  return path.join(dir, CHATS_DIR, `${dayKey(d)}.md`)
}

/** Creates the folder layout and the index note the first time. */
export function ensureBrain(dir: string, lang: Lang): void {
  fs.mkdirSync(path.join(dir, CHATS_DIR), { recursive: true })
  const index = path.join(dir, INDEX_NOTE)
  if (!fs.existsSync(index)) fs.writeFileSync(index, INDEX[lang], 'utf8')
}

const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')

/** Appends one exchange under a time heading; starts the day's note if needed. */
export function appendExchange(dir: string, now: Date, lang: Lang, petName: string, user: string, answer: string): void {
  const file = dayFile(dir, now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const head = fs.existsSync(file) ? '' : `# ${dayKey(now)}\n`
  // One line per message keeps the note readable and the parser simple.
  const flat = (s: string) => s.replace(/\s*\n+\s*/g, ' ').trim()
  fs.appendFileSync(file, `${head}\n### ${time}\n**${LABEL[lang].you}:** ${flat(user)}\n\n**${petName}:** ${flat(answer)}\n`, 'utf8')
}

/** The exchanges of a day note as chat messages: in each block the first speaker is the user. */
export function parseExchanges(md: string): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const block of md.split(/^### .*$/m).slice(1)) {
    const lines = [...block.matchAll(/^\*\*[^*]+:\*\* (.*)$/gm)].map(m => m[1].trim())
    if (lines.length < 2) continue
    out.push({ role: 'user', content: lines[0] }, { role: 'assistant', content: lines[1] })
  }
  return out
}

export function getSummary(md: string): string {
  const m = SUMMARY_HEADING.exec(md)
  if (!m) return ''
  const rest = md.slice(m.index + m[0].length)
  return rest.slice(0, rest.search(/^#{2,3} /m) === -1 ? undefined : rest.search(/^#{2,3} /m)).trim()
}

/** The note with its summary section set (added under the title, or replaced). */
export function withSummary(md: string, lang: Lang, summary: string): string {
  const section = `## ${LABEL[lang].summary}\n${summary.trim()}\n\n`
  const m = SUMMARY_HEADING.exec(md)
  if (m) {
    const after = md.slice(m.index + m[0].length)
    const next = after.search(/^#{2,3} /m)
    return md.slice(0, m.index) + section + (next === -1 ? '' : after.slice(next))
  }
  const title = md.match(/^# .*\n/)
  return title ? title[0] + '\n' + section + md.slice(title[0].length).replace(/^\n+/, '') : section + md
}

export interface Day {
  key: string
  file: string
  md: string
}

/** Earlier days with chats, newest first, today excluded. */
export function pastDays(dir: string, today: Date, limit: number): Day[] {
  const chats = path.join(dir, CHATS_DIR)
  if (!fs.existsSync(chats)) return []
  const todayKey = dayKey(today)
  return fs
    .readdirSync(chats)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f.slice(0, 10) < todayKey)
    .sort()
    .reverse()
    .slice(0, limit)
    .map(f => ({ key: f.slice(0, 10), file: path.join(chats, f), md: read(path.join(chats, f)) }))
}

/** Today's exchanges, so a restarted pet still knows what was just said. */
export function todaysMessages(dir: string, now: Date): ChatMessage[] {
  return parseExchanges(read(dayFile(dir, now)))
}

/** The prompt block that lets the pet remember earlier days. */
export function pastBlock(days: Day[], lang: Lang): string {
  const lines = days.map(d => [d.key, getSummary(d.md)] as const).filter(([, s]) => s)
  if (lines.length === 0) return ''
  const title = lang === 'tr' ? 'Önceki günlerde konuştuklarınız (eskiden yeniye):' : 'What you talked about on earlier days (oldest first):'
  return `${title}\n${lines.reverse().map(([k, s]) => `- ${k}: ${s}`).join('\n')}`
}

export const SUMMARY_PROMPT: Record<Lang, string> = {
  tr: 'Aşağıdaki sohbeti 2-4 cümleyle özetle. Kullanıcının neden bahsettiğini, nasıl hissettiğini ve açık kalan bir plan ya da soru varsa onu yaz. Üçüncü şahısla, düz metin olarak yaz; selamlama ya da yorum ekleme.',
  en: 'Summarize the chat below in 2-4 sentences: what the user talked about, how they felt, and any plan or question left open. Third person, plain text, no greeting or commentary.',
}

/** A day's exchanges as plain text for the summarizer. */
export function transcript(md: string, lang: Lang): string {
  const you = LABEL[lang].you
  return parseExchanges(md)
    .map(m => `${m.role === 'user' ? you : 'Pati'}: ${m.content}`)
    .join('\n')
}
