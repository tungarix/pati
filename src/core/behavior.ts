// The pet's behaviour as a pure state machine: no DOM, no Electron, no clock.
// The window feeds it inputs every tick and draws whatever mode it returns.

import type { AnimationName } from '../shared/types.ts'

export type Mode = 'idle' | 'walk' | 'sleep' | 'drag' | 'talk' | 'fight' | 'win'

export interface BehaviorState {
  mode: Mode
  /** Pixels left to walk and which way; null when standing. */
  walk: { remaining: number; dir: 1 | -1 } | null
  /** Fighting an enemy, then posing for the win; held being dragged or asleep ends it. */
  scene: 'fight' | 'win' | null
  facing: 1 | -1
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
  /** The win pose has been shown long enough. */
  sceneOver: boolean
  /** Injected so tests are deterministic. */
  random: () => number
}

export type BehaviorEvent = 'fell-asleep' | 'woke-up' | 'walk-ended' | 'fight-started' | 'fight-won'

export interface Step {
  state: BehaviorState
  /** Horizontal pixels the window should move this tick. */
  moveBy: number
  events: BehaviorEvent[]
}

/** Chance per tick (100 ms) that an idle pet starts a stroll: about one every 17 s. */
export const WANDER_CHANCE = 0.006
/** px per tick at 100% size: 50 px/s, an unhurried stroll. */
export const WALK_SPEED = 5
export const WALK_MIN = 60
export const WALK_MAX = 220

export const INITIAL: BehaviorState = { mode: 'idle', walk: null, scene: null, facing: 1 }

export function step(s: BehaviorState, i: Inputs): Step {
  const events: BehaviorEvent[] = []
  let walk = s.walk
  let facing = s.facing

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
  if (i.isDragging) mode = 'drag'
  else if (isAsleep) mode = 'sleep'
  else if (scene) mode = scene
  else if (i.isSpeaking) mode = 'talk'
  else if (i.isBalloonOpen) mode = 'idle'
  else {
    if (!walk && i.wander && i.random() < WANDER_CHANCE) {
      const dir = i.random() < 0.5 ? -1 : 1
      walk = { remaining: Math.round(WALK_MIN + i.random() * (WALK_MAX - WALK_MIN)), dir }
      facing = dir
    }
    mode = walk ? 'walk' : 'idle'
  }

  // Only a walking pet moves; anything else interrupts the walk.
  let moveBy = 0
  if (mode === 'walk' && walk) {
    const px = Math.min(WALK_SPEED, walk.remaining)
    moveBy = px * walk.dir
    walk = { ...walk, remaining: walk.remaining - px }
  } else if (walk && mode !== 'walk') {
    walk = null
  }

  return { state: { mode, walk, scene, facing }, moveBy, events }
}

/** Which animation a mode plays. */
export function animationFor(mode: Mode): AnimationName {
  return mode
}
