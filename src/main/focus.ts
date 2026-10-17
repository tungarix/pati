// Focus mode (pomodoro): a stretch of quiet work, then a break; every fourth break
// is a long one. Pure, so the timing rules are testable.

export interface FocusState {
  phase: 'off' | 'focus' | 'break'
  /** When the current phase ends (ms); 0 while off. */
  until: number
  /** Focus stretches finished since the last long break. */
  round: number
}

export type FocusEvent = 'focusDone' | 'longFocusDone' | 'breakDone'

export const FOCUS_OFF: FocusState = { phase: 'off', until: 0, round: 0 }
export const FOCUS_MINUTES = 25
const SHORT_BREAK_MINUTES = 5
const LONG_BREAK_MINUTES = 15
const ROUNDS_TO_LONG_BREAK = 4

export function startFocus(s: FocusState, now: number, minutes = FOCUS_MINUTES): FocusState {
  return { phase: 'focus', until: now + minutes * 60_000, round: s.round }
}

export function focusStep(s: FocusState, now: number): { state: FocusState; event: FocusEvent | null } {
  if (s.phase === 'off' || now < s.until) return { state: s, event: null }
  if (s.phase === 'break') return { state: { ...FOCUS_OFF, round: s.round }, event: 'breakDone' }
  const round = s.round + 1
  const long = round >= ROUNDS_TO_LONG_BREAK
  return {
    state: { phase: 'break', until: now + (long ? LONG_BREAK_MINUTES : SHORT_BREAK_MINUTES) * 60_000, round: long ? 0 : round },
    event: long ? 'longFocusDone' : 'focusDone',
  }
}
