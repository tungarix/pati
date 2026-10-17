// Shimeji-style physics: the pet falls, lands on the taskbar or on the top edge
// of a window, falls again when that window goes away, and can be thrown. Pure,
// so the rules are testable; positions are the pet's feet (bottom centre), in DIP.

export interface Body {
  x: number
  y: number
  vx: number
  vy: number
  airborne: boolean
}

/** A window on screen, front-most first; its top edge is something to stand on. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** The work area: the floor is its bottom (the taskbar), the walls its sides. */
export interface Area {
  left: number
  top: number
  right: number
  bottom: number
}

// Floatier than real gravity: a cartoon falls slowly enough to be seen.
const GRAVITY = 2200 // px/s²
const MAX_FALL = 1900 // px/s
/** Hitting the floor faster than this bounces back up a little. */
const BOUNCE_SPEED = 650
/** A window edge that moved this little is still the same floor (windows get nudged). */
const STICK = 6
/** Edges too near the top of the screen would hide the pet above it (maximised windows). */
export const MIN_HEADROOM = 90

/** Is the point covered by a window in front of `index`? Then that edge is hidden there. */
function hidden(rects: Rect[], index: number, x: number, y: number): boolean {
  for (let i = 0; i < index; i++) {
    const r = rects[i]
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

/** The highest visible floor under x with a top between `from` and `to` (inclusive), or null. */
export function floorBetween(rects: Rect[], area: Area, x: number, from: number, to: number): number | null {
  let best: number | null = area.bottom >= from && area.bottom <= to ? area.bottom : null
  rects.forEach((r, i) => {
    if (x < r.left || x > r.right || r.top < from || r.top > to || r.top < area.top + MIN_HEADROOM) return
    if (hidden(rects, i, x, r.top - 1)) return
    if (best === null || r.top < best) best = r.top
  })
  return best
}

/** `impact` is the speed it hit a floor with this step (0 if it did not), for a squash. */
export function physicsStep(body: Body, dt: number, rects: Rect[], area: Area): { body: Body; landed: boolean; impact: number } {
  if (!body.airborne) {
    const floor = floorBetween(rects, area, body.x, body.y - STICK, body.y + STICK)
    if (floor !== null) return { body: { ...body, y: floor }, landed: false, impact: 0 }
    body = { ...body, airborne: true, vx: 0, vy: 0 } // the floor went away
  }
  let { vx } = body
  let x = body.x + vx * dt
  // Walls bounce, a little softer each time.
  if (x < area.left) (x = area.left), (vx = -vx * 0.5)
  if (x > area.right) (x = area.right), (vx = -vx * 0.5)
  let vy = Math.min(MAX_FALL, body.vy + GRAVITY * dt)
  let y = body.y + vy * dt
  if (y < area.top + MIN_HEADROOM) (y = area.top + MIN_HEADROOM), (vy = Math.max(0, vy))
  if (vy > 0) {
    const floor = floorBetween(rects, area, x, body.y, Math.min(y, area.bottom))
    if (floor !== null) {
      if (vy > BOUNCE_SPEED) return { body: { x, y: floor - 1, vx: vx * 0.6, vy: -vy * 0.3, airborne: true }, landed: false, impact: vy }
      return { body: { x, y: floor, vx: 0, vy: 0, airborne: false }, landed: true, impact: vy }
    }
  }
  // Air drag, so a throw dies out like something with weight.
  const drag = Math.pow(0.35, dt)
  return { body: { x, y, vx: vx * drag, vy, airborne: true }, landed: false, impact: 0 }
}

/** Throw speed from the last cursor positions while dragging (px/s), capped. */
export function throwVelocity(samples: { t: number; x: number; y: number }[], cap = 1300): { vx: number; vy: number } {
  const recent = samples.filter(s => s.t >= samples[samples.length - 1].t - 100)
  if (recent.length < 2) return { vx: 0, vy: 0 }
  const a = recent[0]
  const b = recent[recent.length - 1]
  const dt = (b.t - a.t) / 1000
  if (dt <= 0) return { vx: 0, vy: 0 }
  const clamp = (v: number) => Math.max(-cap, Math.min(cap, v))
  // The pet is heavier than the cursor: it keeps only part of the flick.
  const weight = 0.45
  return { vx: clamp(((b.x - a.x) / dt) * weight), vy: clamp(((b.y - a.y) / dt) * weight) }
}
