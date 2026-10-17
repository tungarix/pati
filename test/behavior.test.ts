import { test } from 'node:test'
import assert from 'node:assert/strict'

import { INITIAL, step, WALK_SPEED, type Inputs } from '../src/core/behavior.ts'

const base: Inputs = {
  userIdleSeconds: 0,
  sleepAfterSeconds: 120,
  isDragging: false,
  isBalloonOpen: false,
  isSpeaking: false,
  wander: true,
  hitEdge: false,
  random: () => 0.9, // never starts a walk
}

/** A random source that returns the given values in turn. */
const seq = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

test('idle pet stays idle without the wander roll', () => {
  const r = step(INITIAL, base)
  assert.equal(r.state.mode, 'idle')
  assert.equal(r.moveBy, 0)
})

test('a lucky roll starts a walk in the rolled direction and moves', () => {
  // roll < chance, then direction (< 0.5 → left), then distance
  const r = step(INITIAL, { ...base, random: seq(0, 0.1, 0.5) })
  assert.equal(r.state.mode, 'walk')
  assert.equal(r.state.facing, -1)
  assert.equal(r.moveBy, -WALK_SPEED)
  assert.equal(r.state.walk?.remaining, 140 - WALK_SPEED)
})

test('a walk ends at its distance or at the screen edge', () => {
  const walking = { mode: 'walk' as const, walk: { remaining: 2, dir: 1 as const }, facing: 1 as const }
  const last = step(walking, base)
  assert.equal(last.moveBy, 2)
  const done = step(last.state, base)
  assert.deepEqual(done.events, ['walk-ended'])
  assert.equal(done.state.mode, 'idle')

  const edge = step({ ...walking, walk: { remaining: 50, dir: 1 } }, { ...base, hitEdge: true })
  assert.deepEqual(edge.events, ['walk-ended'])
  assert.equal(edge.moveBy, 0)
})

test('sleeps when the user is away, wakes when they return', () => {
  const asleep = step(INITIAL, { ...base, userIdleSeconds: 300 })
  assert.equal(asleep.state.mode, 'sleep')
  assert.deepEqual(asleep.events, ['fell-asleep'])
  const awake = step(asleep.state, base)
  assert.deepEqual(awake.events, ['woke-up'])
})

test('dragging and talking take priority and stop a walk', () => {
  const walking = { mode: 'walk' as const, walk: { remaining: 100, dir: 1 as const }, facing: 1 as const }
  const dragged = step(walking, { ...base, isDragging: true, userIdleSeconds: 999 })
  assert.equal(dragged.state.mode, 'drag')
  assert.equal(dragged.state.walk, null)
  assert.equal(step(walking, { ...base, isSpeaking: true }).state.mode, 'talk')
  // an open balloon keeps it awake even when the user is idle
  assert.equal(step(INITIAL, { ...base, isBalloonOpen: true, userIdleSeconds: 999 }).state.mode, 'idle')
})
