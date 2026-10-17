import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FOCUS_OFF, focusStep, startFocus } from '../src/main/focus.ts'

const MIN = 60_000

test('a focus stretch ends in a short break, then turns off', () => {
  let s = startFocus(FOCUS_OFF, 0)
  assert.equal(focusStep(s, 24 * MIN).event, null)
  let r = focusStep(s, 25 * MIN)
  assert.equal(r.event, 'focusDone')
  assert.deepEqual(r.state, { phase: 'break', until: 30 * MIN, round: 1 })
  r = focusStep(r.state, 30 * MIN)
  assert.equal(r.event, 'breakDone')
  assert.equal(r.state.phase, 'off')
  assert.equal(r.state.round, 1)
})

test('every fourth stretch gets a long break and starts the count again', () => {
  let s = { ...FOCUS_OFF, round: 3 }
  s = startFocus(s, 0, 10)
  const r = focusStep(s, 10 * MIN)
  assert.equal(r.event, 'longFocusDone')
  assert.deepEqual(r.state, { phase: 'break', until: 25 * MIN, round: 0 })
})

test('off stays off', () => {
  assert.deepEqual(focusStep(FOCUS_OFF, 999 * MIN), { state: FOCUS_OFF, event: null })
})
