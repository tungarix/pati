// The pet's "brain": a folder of plain Markdown the user can open as an Obsidian
// vault. One note per day of chat, with a summary on top, so the pet can pick up
// where it left off after a restart and remember earlier days.
import fs from 'node:fs'
import path from 'node:path'

import type { Lang } from '../shared/types.ts'
import type { ChatMessage, HistoryMessage } from './ai.ts'

// Language-neutral names: switching the app language must not lose the brain.
export const CHATS_DIR = 'Chats'
export const MEMORY_NOTE = 'Memory.md'
const INDEX_NOTE = 'Pati.md'
export const FEEDBACK_FILE = 'Feedback.jsonl'

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

/** A plain command the pet ran itself; kept so the model later sees it as a real tool turn. */
export interface IntentRecord {
  tool: string
  args: object
  result?: object
}

const INTENT_LINE = /^<!-- pati-intent: (.*) -->$/m

/** Appends one exchange under a time heading; starts the day's note if needed. */
export function appendExchange(dir: string, now: Date, lang: Lang, petName: string, user: string, answer: string, intent?: IntentRecord): void {
  const file = dayFile(dir, now)
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const head = fs.existsSync(file) ? '' : `# ${dayKey(now)}\n`
  // One line per message keeps the note readable and the parser simple.
  const flat = (s: string) => s.replace(/\s*\n+\s*/g, ' ').trim()
  // The comment is invisible in Obsidian's reading view; ">" keeps a stray "-->" from closing it early.
  const mark = intent ? `<!-- pati-intent: ${JSON.stringify(intent).replaceAll('>', '\\u003e')} -->\n` : ''
  fs.appendFileSync(file, `${head}\n### ${time}\n**${LABEL[lang].you}:** ${flat(user)}\n\n**${petName}:** ${flat(answer)}\n${mark}`, 'utf8')
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

/**
 * Like parseExchanges, but an exchange that carries a pati-intent line comes back as the
 * turn format the model was trained on: user, assistant tool call, tool result, reply.
 */
export function parseHistory(md: string): HistoryMessage[] {
  const out: HistoryMessage[] = []
  let n = 0
  for (const block of md.split(/^### .*$/m).slice(1)) {
    const lines = [...block.matchAll(/^\*\*[^*]+:\*\* (.*)$/gm)].map(m => m[1].trim())
    if (lines.length < 2) continue
    out.push({ role: 'user', content: lines[0] })
    let intent: IntentRecord | undefined
    try {
      intent = JSON.parse(INTENT_LINE.exec(block)?.[1] ?? 'null') ?? undefined
    } catch {
      // A hand-edited comment is just ignored.
    }
    if (intent?.tool) {
      const id = `call_${++n}`
      out.push(
        { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: intent.tool, arguments: JSON.stringify(intent.args ?? {}) } }] },
        { role: 'tool', tool_call_id: id, content: JSON.stringify(intent.result ?? { ok: true }) },
      )
    }
    out.push({ role: 'assistant', content: lines[1] })
  }
  return out
}

/**
 * Drops earlier turns whose reply a later turn repeats word for word, with their user
 * message, so the model does not see itself looping and copy the loop.
 */
export function dropLooped(history: HistoryMessage[]): HistoryMessage[] {
  const turns: HistoryMessage[][] = []
  for (const m of history) {
    if (m.role === 'user' || !turns.length) turns.push([m])
    else turns[turns.length - 1].push(m)
  }
  const reply = (t: HistoryMessage[]) => t[t.length - 1].content
  return turns.filter((t, i) => !turns.slice(i + 1).some(later => reply(later) === reply(t))).flat()
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
export function todaysMessages(dir: string, now: Date): HistoryMessage[] {
  return parseHistory(read(dayFile(dir, now)))
}

/** The prompt block that lets the pet remember earlier days. */
export function pastBlock(days: Day[], lang: Lang): string {
  const lines = days.map(d => [d.key, getSummary(d.md)] as const).filter(([, s]) => s)
  if (lines.length === 0) return ''
  const title = lang === 'tr' ? 'Önceki günlerde konuştuklarınız (eskiden yeniye):' : 'What you talked about on earlier days (oldest first):'
  return `${title}\n${lines.reverse().map(([k, s]) => `- ${k}: ${s}`).join('\n')}`
}

export const SUMMARY_PROMPT: Record<Lang, string> = {
  tr: 'Aşağıdaki sohbeti en fazla 2 kısa, sade Türkçe cümleyle özetle: kullanıcı ne anlattı, açık kalan bir plan ya da soru var mı. Üçüncü şahısla, düz metin yaz; asistanın adını, alıntıyı, selamlamayı ve yorumu ekleme.',
  en: 'Summarize the chat below in at most 2 short, plain English sentences: what the user talked about and any plan or question left open. Third person, plain text; no name of the assistant, no quotes, no greeting or commentary.',
}

/** A day with fewer exchanges than this has nothing worth summarizing. */
export const MIN_SUMMARY_EXCHANGES = 4
export const SUMMARY_MAX_CHARS = 250

export const exchangeCount = (md: string) => parseExchanges(md).length / 2

/** A summary cut to at most `max` characters, at a sentence end if there is one, else a word end. */
export function capSummary(text: string, max = SUMMARY_MAX_CHARS): string {
  const s = text.replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
  return end >= max / 3 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max)
}

/** A day's exchanges as plain text for the summarizer. */
export function transcript(md: string, lang: Lang): string {
  const you = LABEL[lang].you
  return parseExchanges(md)
    .map(m => `${m.role === 'user' ? you : 'Pati'}: ${m.content}`)
    .join('\n')
}

/** One rated answer: the whole conversation that produced it, ready as a fine-tuning example. */
export interface FeedbackRecord {
  time: string
  character: string
  model: string
  messages: HistoryMessage[]
  answer: string
  rating: 'up' | 'down'
  better?: string
}

/** Adds a rated answer to Feedback.jsonl, one JSON object per line. */
export function appendFeedback(dir: string, record: FeedbackRecord): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(dir, FEEDBACK_FILE), JSON.stringify(record) + '\n', 'utf8')
}

/** How many rated answers Feedback.jsonl holds; 0 for a missing file. */
export function countFeedback(dir: string): { up: number; down: number } {
  const count = { up: 0, down: 0 }
  let text = ''
  try {
    text = fs.readFileSync(path.join(dir, FEEDBACK_FILE), 'utf8')
  } catch {
    return count
  }
  for (const line of text.split('\n')) {
    if (line.includes('"rating":"up"')) count.up++
    else if (line.includes('"rating":"down"')) count.down++
  }
  return count
}
