// How the eval builds a turn like the app does (main.ts chat()), kept pure so it can be tested.

import type { HistoryMessage } from '../src/main/ai.ts'
import { dropLooped } from '../src/main/brain.ts'
import type { ToolRec } from './checks.ts'

/** main.ts CHAT_MEMORY: how many history messages a turn carries. */
export const CHAT_MEMORY = 20

export interface TurnRec {
  user: string
  answer: string
  calls: ToolRec[]
}

/**
 * The history the app would hold: the user's earlier texts as written (no clock line, which only
 * the newest message gets) and the model's own final answers as plain text. The app saves a
 * model turn without its tool calls, so earlier tool turns are not replayed here either.
 */
export function historyFrom(seed: { role: 'user' | 'assistant'; content: string }[], prior: TurnRec[]): HistoryMessage[] {
  const all: HistoryMessage[] = [...seed, ...prior.flatMap((t): HistoryMessage[] => [{ role: 'user', content: t.user }, { role: 'assistant', content: t.answer }])]
  const recent = dropLooped(all).slice(-CHAT_MEMORY)
  const first = recent.findIndex(m => m.role === 'user')
  return first < 0 ? [] : recent.slice(first)
}

/** Final replies of a stored result, old single-answer records included. */
export function repliesOf(r: { answer: string; calls: ToolRec[]; turns?: TurnRec[] }): { text: string; tool: boolean }[] {
  return r.turns?.length ? r.turns.map(t => ({ text: t.answer, tool: t.calls.length > 0 })) : [{ text: r.answer, tool: r.calls.length > 0 }]
}
