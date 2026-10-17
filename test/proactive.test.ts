import { test } from 'node:test'
import assert from 'node:assert/strict'

import { BREAK_AFTER_MS, INITIAL_PROACTIVE, proactiveStep } from '../src/main/proactive.ts'

const ALL = { briefing: true, lateNight: true, breaks: true }
const at = (h: number, m = 0, day = 17) => new Date(2026, 9, day, h, m)

test('the morning briefing comes once a day, only when the user is there', () => {
  assert.equal(proactiveStep(INITIAL_PROACTIVE, at(8), 600, ALL).event, null) // away
  const first = proactiveStep(INITIAL_PROACTIVE, at(8), 5, ALL)
  assert.equal(first.event, 'briefing')
  assert.equal(proactiveStep(first.state, at(9), 5, ALL).event, null)
  assert.equal(proactiveStep(first.state, at(8, 0, 18), 5, ALL).event, 'briefing') // next day
  assert.equal(proactiveStep(INITIAL_PROACTIVE, at(13), 5, ALL).event, null) // too late
  assert.equal(proactiveStep(INITIAL_PROACTIVE, at(8), 5, { ...ALL, briefing: false }).event, null)
})

test('a late-night word once per night', () => {
  const r = proactiveStep(INITIAL_PROACTIVE, at(3), 5, ALL)
  assert.equal(r.event, 'lateNight')
  assert.equal(proactiveStep(r.state, at(4), 5, ALL).event, null)
  assert.equal(proactiveStep(INITIAL_PROACTIVE, at(0, 30), 5, ALL).event, null)
})

test('a break nudge after 90 unbroken minutes; a 5-minute pause resets it', () => {
  let s = proactiveStep(INITIAL_PROACTIVE, at(14), 5, ALL).state
  assert.equal(proactiveStep(s, at(15, 29), 5, ALL).event, null)
  const nudge = proactiveStep(s, at(15, 30), 5, ALL)
  assert.equal(nudge.event, 'break')
  assert.equal(proactiveStep(nudge.state, at(15, 40), 5, ALL).event, null) // timer restarted

  s = proactiveStep(s, at(15, 0), 400, ALL).state // stepped away for a real pause
  assert.equal(s.activeSince, null)
  s = proactiveStep(s, at(15, 10), 5, ALL).state
  assert.equal(s.activeSince, at(15, 10).getTime())
  assert.equal(proactiveStep(s, new Date(at(15, 10).getTime() + BREAK_AFTER_MS - 1), 5, ALL).event, null)
})
