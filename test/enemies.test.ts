import { test } from 'node:test'
import assert from 'node:assert/strict'

import { advance, ARRIVE_DISTANCE, grab, HOLD_MAX_MS, opaqueBox, release, unionBox, canSpawn, LIFETIME_MS, nextSpawnDelay, pickEnemy, planSpawn, startRun, type Around, type Run, type Signal, type SpawnContext } from '../src/main/enemies.ts'
import type { Enemy } from '../src/shared/types.ts'
import { GRAVITY } from '../src/main/physics.ts'

const ready: SpawnContext = { frequency: 'rare', canFight: true, active: false, focusMode: false, petBusy: false, dragging: false, airborne: false, petVisible: true }

test('the delay follows the frequency; off never comes', () => {
  assert.equal(nextSpawnDelay('off', () => 0.5), null)
  assert.equal(nextSpawnDelay('rare', () => 0.5), 20 * 60_000)
  assert.equal(nextSpawnDelay('sometimes', () => 0.5), 10 * 60_000)
  assert.equal(nextSpawnDelay('often', () => 0), 2 * 60_000) // half the average at the least
  assert.equal(nextSpawnDelay('nonsense' as never, () => 0.5), null) // a broken setting is off
})

test('an enemy comes only when the pet is free and the character can fight', () => {
  assert.equal(canSpawn(ready), true)
  for (const block of [{ frequency: 'off' }, { canFight: false }, { active: true }, { focusMode: true }, { petBusy: true }, { dragging: true }, { airborne: true }, { petVisible: false }])
    assert.equal(canSpawn({ ...ready, ...block } as SpawnContext), false, JSON.stringify(block))
})

const enemy = (id: string, weight: number): Enemy => ({ id, name: id, frames: { walk: [], hit: [], die: [] }, speed: 4, weight })

test('enemies are picked by weight', () => {
  const list = [enemy('a', 1), enemy('b', 3)]
  assert.equal(pickEnemy(list, () => 0)?.id, 'a')
  assert.equal(pickEnemy(list, () => 0.5)?.id, 'b')
  assert.equal(pickEnemy(list, () => 0.999)?.id, 'b')
  assert.equal(pickEnemy([], () => 0.5), null)
})

const area = { left: 0, right: 1920 }

test('it starts on one side of the pet, walking towards it', () => {
  const left = planSpawn(960, area, 100, () => 0)
  assert.equal(left.dir, 1)
  assert.ok(left.x < 960)
  const right = planSpawn(960, area, 100, () => 0.9)
  assert.equal(right.dir, -1)
  assert.ok(right.x > 960)
})

test('a pet at the screen edge is met from the other side, and a slow enemy starts nearer', () => {
  assert.equal(planSpawn(100, area, 100, () => 0).dir, -1) // the left side has only 100 px
  const slow = planSpawn(960, area, 25, () => 0.9) // 25 px/s cannot cross 960 px in 25 s
  assert.ok(slow.x - 960 < 960)
  assert.ok(slow.x - 960 >= 400)
})

const around: Around = { petX: 1000, petReady: true, struck: false, speed: 100, size: 1 }

test('it walks to the pet, arrives, is hit, dies and is done', () => {
  let run = startRun({ x: 400, dir: 1 })
  const signals: Signal[] = []
  for (let i = 0; i < 2000 && !signals.includes('done'); i++) {
    const r = advance(run, 33, { ...around, struck: run.phase === 'fight' })
    run = r.run
    if (r.signal) signals.push(r.signal)
  }
  assert.deepEqual(signals, ['arrived', 'hit', 'die', 'done'])
  assert.ok(Math.abs(run.x - 1000) <= ARRIVE_DISTANCE)
})

test('it keeps walking while the pet is busy, then waits next to it', () => {
  let run = startRun({ x: 400, dir: 1 })
  for (let i = 0; i < 200; i++) run = advance(run, 100, { ...around, petReady: false }).run
  assert.equal(run.phase, 'walk')
  assert.ok(Math.abs(run.x - 1000) <= ARRIVE_DISTANCE + 1)
  assert.equal(advance(run, 100, around).signal, 'arrived')
})

test('a blow that never lands does not stall the fight', () => {
  let run: Run = { ...startRun({ x: 900, dir: 1 }), phase: 'fight' }
  let signal: Signal = null
  for (let i = 0; i < 60 && !signal; i++) ({ run, signal } = advance(run, 100, around))
  assert.equal(signal, 'hit')
})

test('an enemy that cannot reach the pet is gone after 25 seconds', () => {
  const far = { ...around, petX: 100_000 }
  let run = startRun({ x: 0, dir: 1 })
  let signal: Signal = null
  let t = 0
  for (; !signal && t < 40_000; t += 100) ({ run, signal } = advance(run, 100, far))
  assert.equal(signal, 'expired')
  assert.ok(t >= LIFETIME_MS && t <= LIFETIME_MS + 200)
})

test('it turns round if the pet crossed it, and a bigger pet is met from further off', () => {
  assert.equal(advance(startRun({ x: 2000, dir: 1 }), 100, around).run.dir, -1)
  const x = 1000 - ARRIVE_DISTANCE * 1.5
  assert.equal(advance(startRun({ x, dir: 1 }), 33, { ...around, size: 1.5 }).signal, 'arrived')
  assert.equal(advance(startRun({ x, dir: 1 }), 33, around).signal, null)
})

test('opaqueBox: an empty image has none, a known bitmap gives its exact box', () => {
  assert.equal(opaqueBox(Buffer.alloc(4 * 4 * 4), 4, 4), null)
  const bmp = Buffer.alloc(5 * 4 * 4) // 5×4
  const px = (x: number, y: number, a: number) => (bmp[(y * 5 + x) * 4 + 3] = a)
  px(1, 1, 255); px(3, 2, 17); px(4, 0, 16) /* too faint */; px(0, 3, 0)
  assert.deepEqual(opaqueBox(bmp, 5, 4), { x: 1, y: 1, w: 3, h: 2 })
  assert.deepEqual(unionBox([{ x: 1, y: 1, w: 3, h: 2 }, null, { x: 0, y: 2, w: 2, h: 3 }]), { x: 0, y: 1, w: 4, h: 4 })
  assert.equal(unionBox([null]), null)
})

const at = (petX: number): Around => ({ ...around, petX })
const room = { left: 0, right: 1000 }

test('held: nothing advances, the hold is capped, release heads for the pet', () => {
  const held = grab(startRun({ x: 500, dir: 1 }))
  assert.equal(held.held, true)
  const r = advance({ ...held, age: 1000 }, 5000, at(900))
  assert.equal(r.run.x, 500) // no walking
  assert.equal(r.run.age, 1000) // lifetime paused
  assert.equal(r.signal, null)
  const capped = advance({ ...held, heldAge: HOLD_MAX_MS - 10 }, 50, at(100))
  assert.equal(capped.signal, 'released')
  assert.equal(capped.run.held, false)
  assert.equal(capped.run.dir, -1)
  const dropped = release({ ...held, x: 1200 }, 300, room)
  assert.deepEqual([dropped.x, dropped.dir, dropped.held], [1000, -1, false])
  assert.equal(release({ ...held, x: 100 }, 300, room).dir, 1)
})

test('only a walking enemy can be grabbed', () => {
  for (const phase of ['fight', 'hit', 'die'] as const) {
    const run = { ...startRun({ x: 500, dir: 1 }), phase }
    assert.equal(grab(run), run, phase)
  }
})

test('released above the floor it falls with the pet gravity, then lands and walks on', () => {
  const held = { ...grab(startRun({ x: 500, dir: 1 })), age: 1000 }
  let run = release(held, 900, room, 400)
  assert.equal(run.falling, true)
  assert.equal(grab(run), run) // not grabbable mid-fall
  let t = 0
  let last = run.lift!
  let signal: Signal = null
  while (signal !== 'landed' && t < 5000) {
    ;({ run, signal } = advance(run, 16, at(100)))
    t += 16
    if (signal !== 'landed') {
      assert.ok(run.lift! < last, 'falls monotonically')
      assert.equal(run.x, 500) // no walking
      assert.equal(run.age, 1000) // no ageing
      last = run.lift!
    }
  }
  // 400 = g/2 t² (the cap is far away) → t = sqrt(2*400/GRAVITY)
  const expected = Math.sqrt((2 * 400) / GRAVITY) * 1000
  assert.ok(Math.abs(t - expected) < 40, `${t} vs ${expected}`)
  assert.deepEqual([run.falling, run.lift, run.dir], [false, 0, -1]) // released facing the pet at 900, it landed facing the pet now at 100
  assert.equal(advance(run, 16, at(100)).run.x < 500, true) // walks again, now towards the moved pet
})

test('released at the floor it lands at once', () => {
  const run = release(grab(startRun({ x: 500, dir: 1 })), 100, room, 0)
  assert.equal(run.falling, false)
  assert.equal(run.dir, -1)
})
