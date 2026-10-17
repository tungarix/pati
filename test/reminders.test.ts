import { test } from 'node:test'
import assert from 'node:assert/strict'

import { dueReminders } from '../src/main/reminders.ts'
import type { Reminder } from '../src/shared/types.ts'

const at = (h: number, m: number) => new Date(2026, 9, 15, h, m).getTime() // a Thursday
const water: Reminder = { id: 'w', text: 'Su iç', enabled: true, kind: 'interval', minutes: 60 }
const study: Reminder = { id: 's', text: 'Ders', enabled: true, kind: 'daily', time: '17:00' }

test('interval waits a full period from start, then from the last firing', () => {
  assert.deepEqual(dueReminders([water], {}, at(10, 59), at(10, 0)), [])
  assert.deepEqual(dueReminders([water], {}, at(11, 0), at(10, 0)), [water])
  assert.deepEqual(dueReminders([water], { w: at(11, 0) }, at(11, 30), at(10, 0)), [])
})

test('daily fires once after its time, not before, not twice', () => {
  assert.deepEqual(dueReminders([study], {}, at(16, 59), at(9, 0)), [])
  assert.deepEqual(dueReminders([study], {}, at(17, 5), at(9, 0)), [study])
  assert.deepEqual(dueReminders([study], { s: at(17, 5) }, at(18, 0), at(9, 0)), [])
  // fired yesterday: due again today
  assert.deepEqual(dueReminders([study], { s: at(17, 5) - 86_400_000 }, at(17, 1), at(9, 0)), [study])
})

test('a one-off reminder fires once when its time comes', () => {
  const once: Reminder = { id: 'o', text: 'Fırını kapat', enabled: true, kind: 'once', at: at(12, 30) }
  assert.deepEqual(dueReminders([once], {}, at(12, 29), at(9, 0)), [])
  assert.deepEqual(dueReminders([once], {}, at(12, 31), at(9, 0)), [once])
  assert.deepEqual(dueReminders([once], { o: at(12, 31) }, at(13, 0), at(9, 0)), [])
})

test('daily respects weekdays, disabled and empty reminders are skipped', () => {
  const weekend: Reminder = { ...study, id: 'x', days: [0, 6] }
  assert.deepEqual(dueReminders([weekend], {}, at(18, 0), at(9, 0)), [])
  assert.deepEqual(dueReminders([{ ...water, enabled: false }], {}, at(23, 0), at(0, 0)), [])
  assert.deepEqual(dueReminders([{ ...water, text: '  ' }], {}, at(23, 0), at(0, 0)), [])
})
