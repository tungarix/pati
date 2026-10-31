// Enemies that walk in from a screen edge and fight the pet. Pure: when one comes, who
// it is, where it walks and what it does each step are decided here; the window and the
// timers live in main.ts, so every rule is testable.

import type { Enemy, EnemyFrequency } from '../shared/types.ts'
import { GRAVITY, MAX_FALL } from './physics.ts'

export { opaqueBox, unionBox } from '../shared/hitbox.ts'

/** The enemy window is a fixed square (frames are 192×192); it is never resized. */
export const ENEMY_SIZE = 192
/** Average minutes between enemies; an unknown or "off" setting means never. */
const AVERAGE_MINUTES: Record<EnemyFrequency, number | null> = { off: null, rare: 20, sometimes: 10, often: 4 }
/** When one was due but the pet was busy, try again soon instead of waiting a whole period. */
export const RETRY_MS = 30_000
/** An enemy that cannot reach the pet is gone after this. */
export const LIFETIME_MS = 25_000
/** `speed` in a pack is 1-8 of these (px/s). */
export const SPEED_UNIT = 25
/** Centre distance at which the pet and the enemy fight, at size 1. */
export const ARRIVE_DISTANCE = 150
const FIGHT_TIMEOUT_MS = 4000
const HIT_MS = 400
const DIE_MS = 900
/** The enemy appears at least this far from the pet, and never further than it can walk in time. */
const SPAWN_MIN = 400
/** Picked up for longer than this, an enemy lets go by itself. */
export const HOLD_MAX_MS = 60_000

/** Milliseconds until the next enemy: around the average, between half and one and a half of it; null = never. */
export function nextSpawnDelay(freq: EnemyFrequency, random: () => number): number | null {
  const minutes = AVERAGE_MINUTES[freq] ?? null
  return minutes === null ? null : Math.round(minutes * 60_000 * (0.5 + random()))
}

export interface SpawnContext {
  frequency: EnemyFrequency
  /** The character draws a `fight` scene and at least one enemy. */
  canFight: boolean
  /** An enemy is already around. */
  active: boolean
  focusMode: boolean
  /** Balloon open, asleep or speaking (the pet window knows). */
  petBusy: boolean
  dragging: boolean
  airborne: boolean
  petVisible: boolean
}

export function canSpawn(c: SpawnContext): boolean {
  if (AVERAGE_MINUTES[c.frequency] == null || !c.canFight || c.active) return false
  return !c.focusMode && !c.petBusy && !c.dragging && !c.airborne && c.petVisible
}

/** A weighted pick; null for an empty list. */
export function pickEnemy(enemies: Enemy[], random: () => number): Enemy | null {
  let left = random() * enemies.reduce((sum, e) => sum + e.weight, 0)
  for (const e of enemies) if ((left -= e.weight) < 0) return e
  return enemies.at(-1) ?? null
}

/**
 * Where an enemy starts: on a random side of the pet at the screen edge, or the other
 * side if that one is too close; nearer than the edge if it could not walk so far in time.
 * `dir` is the way it walks: -1 left (how enemies are drawn), 1 right.
 */
export function planSpawn(petX: number, area: { left: number; right: number }, pxPerSecond: number, random: () => number): { x: number; dir: 1 | -1 } {
  const room = { left: petX - area.left, right: area.right - petX }
  let side: 'left' | 'right' = random() < 0.5 ? 'left' : 'right'
  if (room[side] < SPAWN_MIN && room[side === 'left' ? 'right' : 'left'] > room[side]) side = side === 'left' ? 'right' : 'left'
  const reach = Math.max(SPAWN_MIN, pxPerSecond * (LIFETIME_MS / 1000) * 0.7)
  const distance = Math.min(room[side], reach)
  return side === 'left' ? { x: petX - distance, dir: 1 } : { x: petX + distance, dir: -1 }
}

export type Phase = 'walk' | 'fight' | 'hit' | 'die'

export interface Run {
  phase: Phase
  /** Centre of the enemy, in DIP. */
  x: number
  dir: 1 | -1
  age: number
  phaseAge: number
  /** Carried by the mouse: time stands still for it (no walking, no lifetime). */
  held?: boolean
  heldAge?: number
  /** Let go above the floor: falls (no walking, no ageing) until `lift` (DIP above the floor) is 0. */
  falling?: boolean
  lift?: number
  /** Fall speed, px/s. */
  vy?: number
}

/** What the caller must do after a step: tell the pet, change the picture, or close the window. */
export type Signal = 'arrived' | 'hit' | 'die' | 'done' | 'expired' | 'released' | 'landed' | null

export interface Around {
  petX: number
  /** The pet is standing and free to fight (not held, falling or asleep). */
  petReady: boolean
  /** The pet's fight scene reached its blow. */
  struck: boolean
  /** Walking pixels per second. */
  speed: number
  /** `settings.size`: a bigger pet is met from further away. */
  size: number
}

export function startRun(plan: { x: number; dir: 1 | -1 }): Run {
  return { phase: 'walk', x: plan.x, dir: plan.dir, age: 0, phaseAge: 0 }
}

/** Picked up; only a walking enemy can be (hit, fight and die are not to be touched, nor one still falling). */
export function grab(run: Run): Run {
  return run.phase === 'walk' && !run.held && !run.falling ? { ...run, held: true, heldAge: 0 } : run
}

/** Let go at `x`, `lift` above the floor: falls if above it (horizontal speed is dropped), else heads for the pet at once. */
export function release(run: Run, petX: number, area: { left: number; right: number }, lift = 0): Run {
  const x = Math.max(area.left, Math.min(area.right, run.x))
  const fall = lift > 0 ? { falling: true, lift, vy: 0 } : { falling: false, lift: 0, vy: 0 }
  return { ...run, x, dir: petX < x ? -1 : 1, held: false, heldAge: 0, ...fall }
}

/** One step of `dt` ms. walk → fight (pet plays its scene) → hit → die → done. */
export function advance(run: Run, dt: number, o: Around): { run: Run; signal: Signal } {
  const age = run.age + dt
  const phaseAge = run.phaseAge + dt
  const to = (phase: Phase, signal: Signal): { run: Run; signal: Signal } => ({ run: { ...run, phase, age, phaseAge: 0 }, signal })
  if (run.held) {
    const heldAge = (run.heldAge ?? 0) + dt
    if (heldAge >= HOLD_MAX_MS) return { run: release(run, o.petX, { left: -Infinity, right: Infinity }), signal: 'released' }
    return { run: { ...run, heldAge }, signal: null }
  }
  if (run.falling) {
    // Time stands still like when held; gravity always ends it (fall speed is capped), so it cannot stall.
    const vy = Math.min(MAX_FALL, (run.vy ?? 0) + GRAVITY * (dt / 1000))
    const lift = (run.lift ?? 0) - vy * (dt / 1000)
    if (lift > 0) return { run: { ...run, lift, vy }, signal: null }
    // Lands: heads for the pet from wherever it is now.
    return { run: { ...run, falling: false, lift: 0, vy: 0, dir: o.petX < run.x ? -1 : 1 }, signal: 'landed' }
  }
  const stay = (x = run.x, dir = run.dir): { run: Run; signal: Signal } => ({ run: { ...run, x, dir, age, phaseAge }, signal: null })

  if (run.phase === 'walk') {
    if (age >= LIFETIME_MS) return { run: { ...run, age, phaseAge }, signal: 'expired' }
    const gap = o.petX - run.x
    const dir = gap < 0 ? -1 : 1 // keeps heading for the pet even if the pet crossed it
    const near = Math.abs(gap) <= ARRIVE_DISTANCE * o.size
    if (near && o.petReady) return { run: { ...to('fight', null).run, dir }, signal: 'arrived' }
    // Waits at the pet while it is busy.
    return stay(near ? run.x : run.x + dir * Math.min(Math.abs(gap), (o.speed * dt) / 1000), dir)
  }
  // Fight: a pet that never lands its blow (picked up, say) does not stall it for good.
  if (run.phase === 'fight') return o.struck || phaseAge >= FIGHT_TIMEOUT_MS ? to('hit', 'hit') : stay()
  if (run.phase === 'hit') return phaseAge >= HIT_MS ? to('die', 'die') : stay()
  return phaseAge >= DIE_MS ? { run: { ...run, age, phaseAge }, signal: 'done' } : stay()
}
