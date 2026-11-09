// The pet's behaviour as a pure state machine: no DOM, no Electron, no clock.
// The window feeds it inputs every tick and draws whatever mode it returns.

import type { AnimationName } from '../shared/types.ts'

export type Mode = 'idle' | 'walk' | 'sleep' | 'drag' | 'talk' | 'fight' | 'win' | 'sit' | 'climb'

export interface BehaviorState {
  mode: Mode
  /** Pixels left to walk and which way; null when standing. */
  walk: { remaining: number; dir: 1 | -1 } | null
  /** Fighting an enemy, then posing for the win; held being dragged or asleep ends it. */
  scene: 'fight' | 'win' | null
  facing: 1 | -1
  /** Ticks left of sitting; null when not sitting. */
  sit: number | null
  /** Climbing the screen edge: px of wall left and which side (the way it was walking); null when not. */
  climb: { remaining: number; side: 1 | -1 } | null
}

export interface Inputs {
  userIdleSeconds: number
  sleepAfterSeconds: number
  isDragging: boolean
  isBalloonOpen: boolean
  isSpeaking: boolean
  wander: boolean
  /** The window hit the edge of the screen on the last move. */
  hitEdge: boolean
  /** One-off news from the main process: an enemy reached the pet, or is dead. */
  enemy: 'arrived' | 'dead' | null
  /** The character draws a sit pose, the setting is on and nothing (full screen app, focus) says stay put. */
  canSit: boolean
  /** Same for climbing; it also needs physics, because letting go means falling. */
  canClimb: boolean
  /** Most wall the pet may climb (px, window units): about 60% of the screen height. */
  climbRange: number
  /** The win pose has been shown long enough. */
  sceneOver: boolean
  /** Injected so tests are deterministic. */
  random: () => number
}

export type BehaviorEvent = 'fell-asleep' | 'woke-up' | 'walk-ended' | 'fight-started' | 'fight-won' | 'climb-ended'

export interface Step {
  state: BehaviorState
  /** Horizontal pixels the window should move this tick. */
  moveBy: number
  /** Pixels the window should climb up this tick (0 unless climbing). */
  climbBy: number
  events: BehaviorEvent[]
}

/** Chance per tick (100 ms) that an idle pet starts a stroll: about one every 17 s. */
export const WANDER_CHANCE = 0.006
/** px per tick at 100% size: 50 px/s, an unhurried stroll. */
export const WALK_SPEED = 5
export const WALK_MIN = 60
export const WALK_MAX = 220

/** Chance per tick that an idle pet sits down: about once a minute. */
export const SIT_CHANCE = 0.002
/** 8-25 s of sitting, in ticks. */
export const SIT_MIN = 80
export const SIT_MAX = 250
/** Chance that a walk into the screen edge turns into a climb. */
export const CLIMB_CHANCE = 0.25
/** px per tick up the wall, for 6-12 s at most (ticks). */
export const CLIMB_SPEED = 4
export const CLIMB_MIN_TICKS = 60
export const CLIMB_MAX_TICKS = 120

export const INITIAL: BehaviorState = { mode: 'idle', walk: null, scene: null, facing: 1, sit: null, climb: null }

export function step(s: BehaviorState, i: Inputs): Step {
  const events: BehaviorEvent[] = []
  let walk = s.walk
  let facing = s.facing

  // Which wall it walked into, for a possible climb below.
  const wall = walk && i.hitEdge ? walk.dir : 0

  // A walk that ran into the edge or out of distance ends before anything else.
  if (walk && (i.hitEdge || walk.remaining <= 0)) {
    walk = null
    events.push('walk-ended')
  }

  const isAsleep = i.userIdleSeconds >= i.sleepAfterSeconds && !i.isBalloonOpen && !i.isDragging
  if (isAsleep && s.mode !== 'sleep') events.push('fell-asleep')
  if (!isAsleep && s.mode === 'sleep') events.push('woke-up')

  // An enemy only starts a fight with a pet that is up and not held; a win ends on its own.
  let scene = s.scene
  if (i.isDragging || isAsleep) scene = null
  else if (i.enemy === 'arrived' && !scene) (scene = 'fight'), events.push('fight-started')
  else if (i.enemy === 'dead' && scene === 'fight') (scene = 'win'), events.push('fight-won')
  else if (scene === 'win' && i.sceneOver) scene = null

  let mode: Mode
  let sit = s.sit
  let climb = s.climb
  let climbBy = 0
  if (i.isDragging) mode = 'drag'
  else if (isAsleep) mode = 'sleep'
  else if (scene) mode = scene
  else if (i.isSpeaking) mode = 'talk'
  else if (i.isBalloonOpen) mode = 'idle'
  else if (climb && i.canClimb && climb.remaining > 0) {
    // Stuck to the wall: up by a fixed step, no walking.
    mode = 'climb'
    climbBy = Math.min(CLIMB_SPEED, climb.remaining)
    climb = { ...climb, remaining: climb.remaining - climbBy }
    facing = climb.side
  } else if (sit !== null && i.canSit && sit > 0) {
    mode = 'sit'
    sit -= 1
  } else {
    climb = null
    sit = null
    if (!walk && i.wander && i.random() < WANDER_CHANCE) {
      const dir = i.random() < 0.5 ? -1 : 1
      walk = { remaining: Math.round(WALK_MIN + i.random() * (WALK_MAX - WALK_MIN)), dir }
      facing = dir
    }
    if (wall && i.canClimb && i.random() < CLIMB_CHANCE) {
      const ticks = CLIMB_MIN_TICKS + i.random() * (CLIMB_MAX_TICKS - CLIMB_MIN_TICKS)
      climb = { remaining: Math.min(i.climbRange, Math.round(ticks * CLIMB_SPEED)), side: wall }
      facing = wall
      walk = null
    } else if (!walk && i.canSit && i.random() < SIT_CHANCE) {
      sit = Math.round(SIT_MIN + i.random() * (SIT_MAX - SIT_MIN))
    }
    mode = climb ? 'climb' : sit !== null ? 'sit' : walk ? 'walk' : 'idle'
  }
  // Anything but sitting or climbing clears them; a finished or interrupted climb tells the window to let go.
  if (mode !== 'sit') sit = null
  if (mode !== 'climb') climb = null
  if (s.climb && !climb) events.push('climb-ended')

  // Only a walking pet moves; anything else interrupts the walk.
  let moveBy = 0
  if (mode === 'walk' && walk) {
    const px = Math.min(WALK_SPEED, walk.remaining)
    moveBy = px * walk.dir
    walk = { ...walk, remaining: walk.remaining - px }
  } else if (walk && mode !== 'walk') {
    walk = null
  }

  return { state: { mode, walk, scene, facing, sit, climb }, moveBy, climbBy, events }
}

/** Which animation a mode plays. */
export function animationFor(mode: Mode): AnimationName {
  return mode
}
