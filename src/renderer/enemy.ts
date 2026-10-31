import type { PatiApi } from '../preload.ts'
import { inHitbox } from '../shared/hitbox.ts'
import type { EnemyShow } from '../shared/types.ts'
import { ENEMY_SIZE } from '../main/enemies.ts'

declare global {
  interface Window {
    pati: PatiApi
  }
}

const img = document.getElementById('enemy') as HTMLImageElement
let timer = 0
let current: EnemyShow | null = null
let interactive = false
let sentAt = 0
let dragging = false
let pressAt: { x: number; y: number; clientX: number; clientY: number } | null = null

// The main process says what to show; this window only draws frames.
window.pati.onEnemy(show => {
  current = show
  if (!dragging) setInteractive(false) // a new picture: the next mouse move decides again
  clearInterval(timer)
  img.style.transformOrigin = '50% 100%'
  img.style.transform = `${show.flip ? 'scaleX(-1) ' : ''}scale(${show.scale})`
  img.style.imageRendering = show.pixel ? 'pixelated' : 'auto'
  let i = 0
  img.src = show.frames[0]
  if (show.frames.length < 2) return
  // A looping walk wraps round; a hit or a death plays once and holds its last frame.
  timer = window.setInterval(() => {
    i = show.loop ? (i + 1) % show.frames.length : Math.min(i + 1, show.frames.length - 1)
    img.src = show.frames[i]
  }, 1000 / show.fps)
})

const api = window.pati

function setInteractive(next: boolean) {
  // Re-sent every second: a state can be dropped after clicks on other windows.
  if (next === interactive && Date.now() - sentAt < 1000) return
  interactive = next
  sentAt = Date.now()
  api.enemyInteractive(next)
}

const over = (e: MouseEvent) => !!current && inHitbox(current.box, e.clientX, e.clientY, current.scale, current.flip, ENEMY_SIZE)

// Mouse moves arrive even while the window ignores clicks (forward: true).
document.addEventListener('mousemove', e => !dragging && setInteractive(over(e)))
document.addEventListener('mouseleave', () => !dragging && setInteractive(false))

document.addEventListener('mousedown', e => {
  if (e.button === 0 && over(e)) pressAt = { x: e.screenX, y: e.screenY, clientX: e.clientX, clientY: e.clientY }
})

window.addEventListener('mousemove', e => {
  if (!pressAt || dragging || Math.abs(e.screenX - pressAt.x) + Math.abs(e.screenY - pressAt.y) < 5) return
  dragging = true
  api.enemyGrab({ x: pressAt.clientX, y: pressAt.clientY })
})

window.addEventListener('mouseup', () => {
  if (dragging) api.enemyDrop()
  dragging = false
  pressAt = null // a plain click does nothing
})
