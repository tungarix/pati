import type { Reminder } from '../shared/types.ts'

/** When each reminder last fired, in ms since the epoch, by reminder id. */
export type FiredLog = Record<string, number>

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * The reminders due at `now`. An interval reminder is due once `minutes` have
 * passed since it last fired (or since `startedAt` if it never has); a daily
 * one once its HH:MM has passed today and it has not fired today.
 */
export function dueReminders(reminders: Reminder[], fired: FiredLog, now: number, startedAt: number): Reminder[] {
  const today = new Date(now)
  return reminders.filter(r => {
    if (!r.enabled || !r.text.trim()) return false
    const last = fired[r.id]
    if (r.kind === 'once') return last === undefined && now >= r.at
    if (r.kind === 'interval') {
      if (!(r.minutes > 0)) return false
      return now - (last ?? startedAt) >= r.minutes * 60_000
    }
    const m = /^(\d{1,2}):(\d{2})$/.exec(r.time)
    if (!m) return false
    if (r.days && r.days.length > 0 && !r.days.includes(today.getDay())) return false
    const at = new Date(today)
    at.setHours(Number(m[1]), Number(m[2]), 0, 0)
    if (now < at.getTime()) return false
    return last === undefined || !sameDay(new Date(last), today) || last < at.getTime()
  })
}
