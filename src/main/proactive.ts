// When the pet speaks without being asked: a morning briefing, a word late at
// night, a nudge to take a break. Pure, so the timing rules are testable.

export type ProactiveEvent = 'briefing' | 'lateNight' | 'break'

export interface ProactiveState {
  /** Local date (YYYY-MM-DD) of the last briefing and the last late-night word. */
  briefingDay: string
  nightDay: string
  /** Since when the user has been at the computer without a real pause; null when away. */
  activeSince: number | null
}

export interface ProactiveOptions {
  briefing: boolean
  lateNight: boolean
  breaks: boolean
}

export const INITIAL_PROACTIVE: ProactiveState = { briefingDay: '', nightDay: '', activeSince: null }

/** Idle this long counts as a real pause and resets the break timer. */
export const PAUSE_SECONDS = 5 * 60
export const BREAK_AFTER_MS = 90 * 60_000
/** Only someone who touched the computer within this long is "here". */
const PRESENT_SECONDS = 60

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function proactiveStep(
  s: ProactiveState,
  now: Date,
  idleSeconds: number,
  opts: ProactiveOptions,
): { state: ProactiveState; event: ProactiveEvent | null } {
  const here = idleSeconds < PRESENT_SECONDS
  const today = dayKey(now)
  const h = now.getHours()
  let activeSince = idleSeconds >= PAUSE_SECONDS ? null : (s.activeSince ?? (here ? now.getTime() : null))
  const state = { ...s, activeSince }

  if (!here) return { state, event: null }
  if (opts.briefing && h >= 6 && h < 12 && s.briefingDay !== today) return { state: { ...state, briefingDay: today }, event: 'briefing' }
  if (opts.lateNight && h >= 1 && h < 5 && s.nightDay !== today) return { state: { ...state, nightDay: today }, event: 'lateNight' }
  if (opts.breaks && activeSince !== null && now.getTime() - activeSince >= BREAK_AFTER_MS) {
    activeSince = now.getTime() // the next nudge only after another full stretch
    return { state: { ...state, activeSince }, event: 'break' }
  }
  return { state, event: null }
}
