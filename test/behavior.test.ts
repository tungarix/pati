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
  enemy: null,
  sceneOver: false,
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
  const walking = { mode: 'walk' as const, walk: { remaining: 2, dir: 1 as const }, scene: null, facing: 1 as const }
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
  const walking = { mode: 'walk' as const, walk: { remaining: 100, dir: 1 as const }, scene: null, facing: 1 as const }
  const dragged = step(walking, { ...base, isDragging: true, userIdleSeconds: 999 })
  assert.equal(dragged.state.mode, 'drag')
  assert.equal(dragged.state.walk, null)
  assert.equal(step(walking, { ...base, isSpeaking: true }).state.mode, 'talk')
  // an open balloon keeps it awake even when the user is idle
  assert.equal(step(INITIAL, { ...base, isBalloonOpen: true, userIdleSeconds: 999 }).state.mode, 'idle')
})

test('an enemy arriving starts a fight, its death a win, and the win ends when over', () => {
  const fight = step(INITIAL, { ...base, enemy: 'arrived' })
  assert.equal(fight.state.mode, 'fight')
  assert.deepEqual(fight.events, ['fight-started'])
  assert.equal(step(fight.state, base).state.mode, 'fight') // stays until the enemy is dead
  const win = step(fight.state, { ...base, enemy: 'dead' })
  assert.equal(win.state.mode, 'win')
  assert.deepEqual(win.events, ['fight-won'])
  assert.equal(step(win.state, base).state.mode, 'win')
  assert.equal(step(win.state, { ...base, sceneOver: true }).state.mode, 'idle')
})

test('a fight stops the walk, and being picked up or falling asleep ends it', () => {
  const walking = { ...INITIAL, mode: 'walk' as const, walk: { remaining: 100, dir: 1 as const } }
  const fight = step(walking, { ...base, enemy: 'arrived' })
  assert.equal(fight.state.mode, 'fight')
  assert.equal(fight.state.walk, null)
  assert.equal(fight.moveBy, 0)
  assert.equal(step(fight.state, { ...base, isDragging: true }).state.scene, null)
  assert.equal(step(fight.state, { ...base, userIdleSeconds: 500 }).state.mode, 'sleep')
  // The enemy dying after the pet was dragged away is no win.
  const dragged = step(fight.state, { ...base, isDragging: true }).state
  assert.equal(step(dragged, { ...base, enemy: 'dead' }).state.mode, 'idle')
})

test('a sleeping or held pet is not pulled into a fight', () => {
  assert.equal(step(INITIAL, { ...base, enemy: 'arrived', isDragging: true }).state.mode, 'drag')
  assert.equal(step(INITIAL, { ...base, enemy: 'arrived', userIdleSeconds: 500 }).state.scene, null)
})
