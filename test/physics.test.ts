import assert from 'node:assert/strict'
import { test } from 'node:test'

import { physicsStep, throwVelocity, type Body, type Rect } from '../src/main/physics.ts'

const area = { left: 0, top: 0, right: 1920, bottom: 1040 }
const fall = (body: Body, rects: Rect[], seconds = 3) => {
  let landed = false
  for (let t = 0; t < seconds && !landed; t += 1 / 30) ({ body, landed } = physicsStep(body, 1 / 30, rects, area))
  return { body, landed }
}
const air = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0, airborne: true })

test('a dropped pet falls to the taskbar', () => {
  const { body, landed } = fall(air(500, 200), [])
  assert.equal(landed, true)
  assert.deepEqual(body, { x: 500, y: 1040, vx: 0, vy: 0, airborne: false })
})

test('it lands on the top edge of a window below it, not on one beside it', () => {
  assert.equal(fall(air(500, 200), [{ left: 300, top: 600, right: 900, bottom: 900 }]).body.y, 600)
  assert.equal(fall(air(1200, 200), [{ left: 300, top: 600, right: 900, bottom: 900 }]).body.y, 1040)
})

test('an edge hidden behind a window in front does not hold it', () => {
  const front = { left: 400, top: 300, right: 700, bottom: 800 }
  const back = { left: 300, top: 600, right: 900, bottom: 900 }
  assert.equal(fall(air(500, 200), [front, back]).body.y, 300)
  assert.equal(fall(air(500, 400), [front, back]).body.y, 1040) // already past the front edge, back edge covered
})

test('standing on a window: a nudge keeps it there, closing the window drops it', () => {
  const standing: Body = { x: 500, y: 600, vx: 0, vy: 0, airborne: false }
  assert.equal(physicsStep(standing, 1 / 30, [{ left: 300, top: 603, right: 900, bottom: 900 }], area).body.y, 603)
  const r = physicsStep(standing, 1 / 30, [], area)
  assert.equal(r.body.airborne, true)
  assert.equal(fall(r.body, []).body.y, 1040)
})

test('a window with a NaN edge is ignored, the pet still lands on a real floor', () => {
  const broken = { left: NaN, top: NaN, right: NaN, bottom: NaN }
  assert.equal(fall(air(500, 200), [broken]).body.y, 1040)
  assert.equal(fall(air(500, 200), [{ left: 0, top: NaN, right: 1920, bottom: 900 }]).body.y, 1040)
})

test('maximised windows near the top of the screen are not floors', () => {
  assert.equal(fall(air(500, 0), [{ left: 0, top: 0, right: 1920, bottom: 1040 }]).body.y, 1040)
})

test('a throw keeps going sideways and bounces off the wall', () => {
  const { body } = fall({ x: 1800, y: 500, vx: 2000, vy: -300, airborne: true }, [])
  assert.equal(body.y, 1040)
  assert.ok(body.x < 1920)
})

test('a hard landing bounces once, then it settles', () => {
  let body = air(500, 100)
  let impacts = 0
  for (let i = 0; i < 300 && body.airborne; i++) {
    const r = physicsStep(body, 1 / 60, [], area)
    if (r.impact) impacts++
    body = r.body
  }
  assert.equal(body.airborne, false)
  assert.equal(body.y, 1040)
  assert.equal(impacts, 2)
})

test('throw speed comes from the last 100 ms of dragging', () => {
  const samples = [
    { t: 0, x: 0, y: 0 },
    { t: 900, x: 100, y: 100 },
    { t: 1000, x: 200, y: 50 },
  ]
  assert.deepEqual(throwVelocity(samples), { vx: 450, vy: -225 }) // heavier than the cursor
  assert.deepEqual(throwVelocity([{ t: 0, x: 0, y: 0 }, { t: 10, x: 900, y: 0 }]), { vx: 1300, vy: 0 }) // capped
  assert.deepEqual(throwVelocity([{ t: 0, x: 0, y: 0 }]), { vx: 0, vy: 0 })
  assert.deepEqual(throwVelocity([]), { vx: 0, vy: 0 })
})
