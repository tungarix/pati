import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CLIMB_SPEED, INITIAL, SIT_MIN, step, WALK_SPEED, type Inputs } from '../src/core/behavior.ts'

const base: Inputs = {
  userIdleSeconds: 0,
  sleepAfterSeconds: 120,
  isDragging: false,
  isBalloonOpen: false,
  isSpeaking: false,
  wander: true,
  hitEdge: false,
  canSit: true,
  canClimb: true,
  climbRange: 600,
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
  const walking = { mode: 'walk' as const, walk: { remaining: 2, dir: 1 as const }, scene: null, facing: 1 as const, sit: null, climb: null }
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
  const walking = { mode: 'walk' as const, walk: { remaining: 100, dir: 1 as const }, scene: null, facing: 1 as const, sit: null, climb: null }
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

// ---- Sitting and climbing ----

test('a lucky roll sits an idle pet down, and it gets up by itself', () => {
  const r = step(INITIAL, { ...base, random: seq(0.9, 0.0, 0) }) // no wander, sit roll, shortest sit
  assert.equal(r.state.mode, 'sit')
  assert.equal(r.state.sit, SIT_MIN)
  let s = r.state
  for (let n = 0; n <= SIT_MIN; n++) s = step(s, base).state
  assert.equal(s.mode, 'idle')
  assert.equal(s.sit, null)
})

test('it never sits when the pack, the setting or the moment says no', () => {
  const lucky = { ...base, random: () => 0 }
  assert.notEqual(step(INITIAL, { ...lucky, canSit: false, wander: false }).state.mode, 'sit')
  assert.notEqual(step(INITIAL, { ...lucky, isBalloonOpen: true }).state.mode, 'sit')
  assert.notEqual(step(INITIAL, { ...lucky, isSpeaking: true }).state.mode, 'sit')
})

test('sitting ends at once on a drag, a balloon, speech, an enemy or sleep', () => {
  const sitting = { ...INITIAL, mode: 'sit' as const, sit: 100 }
  assert.equal(step(sitting, base).state.mode, 'sit')
  assert.equal(step(sitting, { ...base, isDragging: true }).state.mode, 'drag')
  assert.equal(step(sitting, { ...base, isBalloonOpen: true }).state.mode, 'idle')
  assert.equal(step(sitting, { ...base, isSpeaking: true }).state.mode, 'talk')
  assert.equal(step(sitting, { ...base, enemy: 'arrived' }).state.mode, 'fight')
  assert.equal(step(sitting, { ...base, userIdleSeconds: 999 }).state.mode, 'sleep')
  assert.equal(step(sitting, { ...base, isDragging: true }).state.sit, null)
})

const walkingRight = { ...INITIAL, mode: 'walk' as const, walk: { remaining: 50, dir: 1 as const } }

test('hitting the screen edge can start a climb up that wall, no sideways walking', () => {
  const r = step(walkingRight, { ...base, hitEdge: true, random: () => 0 })
  assert.equal(r.state.mode, 'climb')
  assert.deepEqual(r.state.climb?.side, 1)
  assert.equal(r.state.walk, null)
  const up = step(r.state, base)
  assert.equal(up.state.mode, 'climb')
  assert.equal(up.climbBy, CLIMB_SPEED)
  assert.equal(up.moveBy, 0)
})

test('an unlucky roll, a pack without climb or a missing edge means no climb', () => {
  assert.notEqual(step(walkingRight, { ...base, hitEdge: true, random: () => 0.9 }).state.mode, 'climb')
  assert.notEqual(step(walkingRight, { ...base, hitEdge: true, canClimb: false, random: () => 0 }).state.mode, 'climb')
  assert.notEqual(step(walkingRight, { ...base, random: () => 0.9 }).state.mode, 'climb')
})

test('a climb stops at the range, then lets go', () => {
  let s = step(walkingRight, { ...base, hitEdge: true, climbRange: 10, random: () => 0 }).state
  assert.equal(s.climb?.remaining, 10)
  let up = 0
  const events: string[] = []
  for (let n = 0; n < 10 && s.mode === 'climb'; n++) {
    const r = step(s, base)
    up += r.climbBy
    events.push(...r.events)
    s = r.state
  }
  assert.equal(up, 10)
  assert.equal(s.mode, 'idle')
  assert.deepEqual(events, ['climb-ended'])
})

test('a drag, a balloon or an enemy interrupts a climb and reports the let-go', () => {
  const climbing = { ...INITIAL, mode: 'climb' as const, climb: { remaining: 200, side: -1 as const } }
  for (const extra of [{ isDragging: true }, { isBalloonOpen: true }, { enemy: 'arrived' as const }, { canClimb: false }]) {
    const r = step(climbing, { ...base, ...extra })
    assert.notEqual(r.state.mode, 'climb')
    assert.equal(r.state.climb, null)
    assert.equal(r.climbBy, 0)
    assert.deepEqual(r.events.filter(e => e === 'climb-ended'), ['climb-ended'])
  }
})
