import { INITIAL, step, type BehaviorState } from '../core/behavior.ts'
import type { PatiApi } from '../preload.ts'
import { t, type MessageKey } from '../shared/i18n.ts'
import { encodeWav } from '../shared/wav.ts'
import type { AnimationName, Character, CharacterLines, PetCommand, Settings } from '../shared/types.ts'

declare global {
  interface Window {
    pati: PatiApi
  }
}

interface State {
  settings: Settings
  character: Character
  focus: { phase: 'off' | 'focus' | 'break'; until: number }
}

type Button = [label: string, onPress: () => void, isPrimary?: boolean]

const api = window.pati
const sprite = document.getElementById('sprite') as HTMLImageElement
const balloon = document.getElementById('balloon') as HTMLDivElement
const balloonText = document.getElementById('balloon-text') as HTMLParagraphElement
const balloonButtons = document.getElementById('balloon-buttons') as HTMLDivElement
const zzz = document.getElementById('zzz') as HTMLDivElement
const shadow = document.getElementById('shadow') as HTMLDivElement
const chatForm = document.getElementById('chat-form') as HTMLFormElement
const chatInput = document.getElementById('chat-input') as HTMLInputElement
const chatSend = document.getElementById('chat-send') as HTMLButtonElement
const thread = document.getElementById('thread') as HTMLDivElement
const petName = document.getElementById('pet-name') as HTMLSpanElement
const waitLabel = document.getElementById('wait') as HTMLSpanElement
const listenBox = document.getElementById('listen') as HTMLDivElement
const listenLabel = document.getElementById('listen-label') as HTMLSpanElement
const listenBars = [...listenBox.querySelectorAll<HTMLElement>('.bars i')]
const chatMic = document.getElementById('chat-mic') as HTMLButtonElement

let settings: Settings
let character: Character
let anim: AnimationName = 'idle'
/** When the current animation started (ms, performance clock), for motion in step with its frames. */
let animStart = 0
/** Distance walked (px); walk frames follow it. */
let walkDist = 0
let frame = 0
let userIdleSeconds = 0
let behavior: BehaviorState = INITIAL
let hitEdge = false
let isDragging = false
/** Falling or flying after a throw (main process physics). */
let isAirborne = false
/** Dusting itself off after a landing, until then. */
let dustUntil = 0
/** Playing guitar while idle, until then. */
let guitarUntil = 0
let isSpeaking = false
let isChatting = false
/** The balloon's input is asking for the server's API key instead of a message. */
let isAskingKey = false
/** When the current chat request was sent; null while none is pending. */
let waitingSince: number | null = null
let balloonUntil = 0
let hushUntil = 0
let focus: State['focus'] = { phase: 'off', until: 0 }
/** Quiet for an hour, or focusing: no tips, no unasked talk. */
const isQuiet = () => Date.now() < hushUntil || focus.phase === 'focus'
let nextTipAt = 0
let isInteractive = false

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(settings.language, key, vars)
const lines = (): CharacterLines => character.lines[settings.language]

// ---- Drawing -----------------------------------------------------------------

function framesOf(name: AnimationName) {
  const a = character.animations
  return a[name] ?? (name === 'fall' ? a.drag : undefined) ?? a.idle
}

function setAnim(name: AnimationName) {
  if (anim === name) return
  anim = name
  animStart = performance.now()
  frame = 0
  drawFrame()
}

function drawFrame() {
  const { frames } = framesOf(anim)
  const src = frames[frame % frames.length]
  if (sprite.src !== src) sprite.src = src
}

function sizeSprite() {
  const k = character.scale * settings.size
  // Pixel art scales up with hard edges; drawn frames (scale below 2) stay smooth.
  sprite.style.imageRendering = character.scale >= 2 ? 'pixelated' : 'auto'
  sprite.style.width = `${sprite.naturalWidth * k}px`
  sprite.style.height = `${sprite.naturalHeight * k}px`
  document.documentElement.style.setProperty('--balloon-bottom', `${sprite.naturalHeight * k + 22}px`)
}
sprite.addEventListener('load', sizeSprite)

function jump() {
  sprite.classList.remove('jump')
  void sprite.offsetWidth // restart the animation
  sprite.classList.add('jump')
}

// ---- Talking -----------------------------------------------------------------

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices()
  if (settings.speech.voiceName) {
    const chosen = voices.find(v => v.name === settings.speech.voiceName)
    if (chosen) return chosen
  }
  const lang = character.voice.lang.toLowerCase()
  return voices.find(v => v.lang.toLowerCase() === lang) ?? voices.find(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2))) ?? null
}

function speak(text: string) {
  speechSynthesis.cancel()
  if (!settings.speech.enabled) return
  const u = new SpeechSynthesisUtterance(text.replace(/[“”"…]/g, ''))
  const voice = pickVoice()
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? character.voice.lang
  u.rate = settings.speech.rate * character.voice.rate
  u.pitch = Math.max(0, Math.min(2, settings.speech.pitch * character.voice.pitch))
  u.onstart = () => (isSpeaking = true)
  u.onend = u.onerror = () => (isSpeaking = false)
  speechSynthesis.speak(u)
}

function say(text: string, buttons: Button[] = [], seconds = 8, withVoice = true) {
  setChat(false)
  balloonText.textContent = text
  balloonButtons.replaceChildren(
    ...buttons.map(([label, onPress, isPrimary]) => {
      const b = document.createElement('button')
      b.textContent = label
      if (isPrimary) b.className = 'primary'
      b.addEventListener('click', e => {
        e.stopPropagation()
        onPress()
      })
      return b
    }),
  )
  balloon.hidden = false
  balloonUntil = Date.now() + seconds * 1000
  jump()
  if (withVoice) speak(text)
}

function closeBalloon() {
  stopListening?.(false)
  balloon.hidden = true
  speechSynthesis.cancel()
  if (isChatting) api.aiStop()
  setChat(false)
}

// ---- Chat with the local model -------------------------------------------------

function setChat(on: boolean) {
  isChatting = on
  chatForm.hidden = !on
  thread.hidden = !on
  if (on) balloonText.textContent = ''
  waitLabel.textContent = ''
  setKeyMode(false)
}

/** Adds one bubble to the chat; the thread keeps the last few so the balloon stays small. */
function addBubble(who: 'pet' | 'user', text: string): HTMLElement {
  thread.querySelector('.typing')?.remove()
  const b = document.createElement('div')
  b.className = `msg ${who}`
  b.textContent = text
  thread.append(b)
  while (thread.children.length > 8) thread.firstElementChild?.remove()
  thread.scrollTop = thread.scrollHeight
  return b
}

function showTyping() {
  const b = addBubble('pet', '')
  b.classList.add('typing')
  b.append(document.createElement('i'), document.createElement('i'), document.createElement('i'))
}

function setKeyMode(on: boolean) {
  isAskingKey = on
  chatInput.type = on ? 'password' : 'text'
  chatInput.placeholder = tr(on ? 'chat.keyPlaceholder' : 'chat.placeholder')
}

function openChat() {
  say('', [], 120, false)
  setChat(true)
  thread.replaceChildren()
  addBubble('pet', lines().menu)
  chatInput.placeholder = tr('chat.placeholder')
  chatSend.title = tr('chat.send')
  chatMic.hidden = !settings.voice.enabled
  setListening(!!stopListening, listenLabel.textContent ?? '')
  api.focusPet()
  chatInput.focus()
}

function sendChat(text: string) {
  // A typed key is not shown back, not even masked.
  if (!isAskingKey) addBubble('user', text)
  showTyping()
  waitingSince = Date.now()
  balloonUntil = Date.now() + 120_000
  speechSynthesis.cancel()
  if (isAskingKey) {
    setKeyMode(false)
    api.aiKey(text)
  } else {
    api.aiChat(text)
  }
}

chatForm.addEventListener('submit', e => {
  e.preventDefault()
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ''
  sendChat(text)
})
chatInput.addEventListener('keydown', e => e.key === 'Escape' && closeBalloon())

function onAi(event: 'token' | 'done' | 'error' | 'needKey', text: string, id?: string) {
  if (event !== 'token') waitingSince = null
  if (!isChatting) return
  waitLabel.textContent = ''
  if (event !== 'token') addBubble('pet', text)
  if (id && settings.look === 'modern') addRating(id)
  balloonUntil = Date.now() + 120_000
  if (event === 'needKey') setKeyMode(true)
  if (event !== 'token') {
    if (event === 'done') speak(text)
    chatInput.focus()
  }
}

/** 👍/👎 under a model answer; rated answers become training examples in the brain. */
function addRating(id: string) {
  const row = document.createElement('div')
  row.className = 'rate'
  for (const [rating, icon] of [['up', '👍'], ['down', '👎']] as const) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = icon
    b.title = tr(rating === 'up' ? 'chat.rateUp' : 'chat.rateDown')
    b.setAttribute('aria-label', b.title)
    b.onclick = () => {
      api.rate(id, rating)
      b.classList.add('chosen')
      row.querySelectorAll('button').forEach(x => (x.disabled = true))
    }
    row.append(b)
  }
  thread.append(row)
  thread.scrollTop = thread.scrollHeight
}

// ---- Motion: life between the frames -----------------------------------------------

/** A damped spring: `value` follows `target` with a little overshoot. */
interface Spring {
  value: number
  v: number
  target: number
  k: number
  damping: number
}
const spring = (k: number, damping: number): Spring => ({ value: 0, v: 0, target: 0, k, damping })
const motion = {
  /** Lean in degrees: into a throw, behind the cursor while held. Damped, so it settles without wobbling on. */
  lean: spring(40, 11),
  /** + stretches tall (fast fall), - squashes wide (landing). Stiff, so it wobbles quickly. */
  squash: spring(320, 13),
}

/** The window is gliding `px` further (the main process moves it smoothly). */
function walked(px: number) {
  walkDist += Math.abs(px)
}

function stepSpring(s: Spring, dt: number) {
  s.v += (-s.k * (s.value - s.target) - s.damping * s.v) * dt
  s.value += s.v * dt
}

/**
 * Every display frame: breathing, steps that bob in time with the walk frames,
 * swaying to the guitar, swinging and squashing with the physics. Few drawn frames
 * look alive this way.
 */
let lastMotion = performance.now()
function animateMotion(now: number) {
  requestAnimationFrame(animateMotion)
  if (!character) return // state not loaded yet
  const dt = Math.min(0.05, (now - lastMotion) / 1000)
  lastMotion = now
  stepSpring(motion.lean, dt)
  stepSpring(motion.squash, dt)
  const t = (now - animStart) / 1000
  // Frames advance on the display clock, so they stay in step with the motion below;
  // a walk with a stride advances with the distance walked instead, so the feet stay put.
  const { frames, fps, stride } = framesOf(anim)
  const k = character.scale * settings.size
  const halfSteps = anim === 'walk' && stride ? walkDist / ((stride * k) / 2) : t * fps
  if (frames.length > 1) {
    const f = Math.floor(halfSteps) % frames.length
    if (f !== frame) (frame = f), drawFrame()
  }
  const wave = (hz: number, phase = 0) => Math.sin(2 * Math.PI * hz * t + phase)
  const px = settings.size
  let bob = 0
  let rock = 0
  let breathe = 0
  if (anim === 'idle') breathe = 0.01 * wave(1 / 3.2)
  else if (anim === 'sleep') breathe = 0.022 * wave(1 / 4.5)
  else if (anim === 'walk') {
    // Up on the passing frames, down on the contact frames (two frames per step).
    bob = -2 * Math.abs(Math.sin((Math.PI * (halfSteps - 0.5)) / 2))
    rock = 1 * behavior.facing
  } else if (anim === 'talk') bob = -1 * Math.abs(wave(2.5))
  else if (anim === 'guitar') {
    bob = -1.5 * Math.abs(wave(2))
    rock = 1.2 * wave(2)
  } else if (anim === 'fall') rock = 2 * wave(2.5)
  const s = motion.squash.value + breathe
  // Held by the scruff it pivots at the top; otherwise at the feet.
  sprite.style.transformOrigin = anim === 'drag' ? '50% 6%' : '50% 100%'
  sprite.style.rotate = `${(motion.lean.value + rock).toFixed(2)}deg`
  sprite.style.scale = `${(1 - s * 0.7).toFixed(4)} ${(1 + s).toFixed(4)}`
  sprite.style.translate = `0 ${(bob * px).toFixed(2)}px`
  const grounded = !isAirborne && !isDragging
  shadow.style.opacity = grounded ? '1' : '0'
  shadow.style.scale = `${(1 - bob / 20 + Math.max(0, -s)).toFixed(3)} 1`
}
requestAnimationFrame(animateMotion)

// ---- Talking by voice -----------------------------------------------------------

/** Stops the current recording and sends it on (or drops it); null while not listening. */
let stopListening: ((send?: boolean) => void) | null = null

function setListening(on: boolean, label = '') {
  listenBox.hidden = !on && !label
  listenBox.classList.toggle('active', on)
  listenLabel.textContent = label
  chatMic.classList.toggle('active', on)
  chatMic.title = tr(on ? 'voice.stop' : 'voice.start')
}

function toggleListening() {
  if (stopListening) stopListening()
  else void startListening()
}

async function startListening() {
  if (!isChatting) openChat()
  speechSynthesis.cancel()
  balloonUntil = Date.now() + 120_000
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
  } catch {
    addBubble('pet', tr('voice.noMic'))
    return
  }
  // whisper.cpp wants 16 kHz mono; the context resamples the microphone for us.
  const ctx = new AudioContext({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  // shortcut: ScriptProcessorNode is deprecated; move to an AudioWorklet if Chromium drops it.
  const node = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  const started = Date.now()
  let heard = false
  let quietSince = started
  node.onaudioprocess = e => {
    const data = e.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(data))
    const level = Math.sqrt(data.reduce((a, x) => a + x * x, 0) / data.length)
    const now = Date.now()
    listenBars.forEach((b, i) => (b.style.transform = `scaleY(${Math.min(1, 0.15 + level * 14 * (0.6 + 0.4 * Math.sin(i * 1.7 + now / 90)))})`))
    if (level > 0.015) {
      heard = true
      quietSince = now
    }
    // Stop by itself after a pause once something was said, or at the latest after 20 s.
    if ((heard && now - quietSince > 1500) || now - started > 20_000) finish()
  }
  source.connect(node)
  node.connect(ctx.destination)
  setListening(true, tr('voice.listening'))

  const finish = async (send = true) => {
    if (stopListening !== finish) return
    stopListening = null
    node.disconnect()
    source.disconnect()
    stream.getTracks().forEach(t => t.stop())
    void ctx.close()
    if (!send) return setListening(false)
    const samples = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
    chunks.reduce((at, c) => (samples.set(c, at), at + c.length), 0)
    setListening(false, tr('voice.transcribing'))
    balloonUntil = Date.now() + 120_000
    const r = await api.transcribe(encodeWav(samples, ctx.sampleRate))
    setListening(false)
    if (!isChatting) openChat()
    if ('error' in r) addBubble('pet', r.error)
    else if (!r.text) addBubble('pet', tr('voice.heardNothing'))
    else sendChat(r.text)
  }
  stopListening = finish
}

chatMic.addEventListener('click', e => (e.stopPropagation(), toggleListening()))

/** An action waiting for the user's OK, shown inside the chat with three answers. */
function askConfirm(id: string, text: string) {
  if (!isChatting) openChat()
  const b = addBubble('pet', text)
  const row = document.createElement('div')
  row.className = 'buttons'
  const answers: [string, 'yes' | 'always' | 'no'][] = [[tr('confirm.yes'), 'yes'], [tr('confirm.always'), 'always'], [tr('confirm.no'), 'no']]
  for (const [label, answer] of answers) {
    const btn = document.createElement('button')
    btn.textContent = label
    if (answer === 'yes') btn.className = 'primary'
    btn.onclick = e => {
      e.stopPropagation()
      row.remove()
      api.confirmReply(id, answer)
      showTyping()
    }
    row.append(btn)
  }
  b.after(row)
  thread.scrollTop = thread.scrollHeight
  balloonUntil = Date.now() + 120_000
}

function openMenu() {
  const l = lines()
  const time = new Date().toLocaleTimeString(settings.language === 'tr' ? 'tr-TR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const buttons: Button[] = [
    [tr('menu.joke'), () => say(pick(l.jokes), [[l.thanks, closeBalloon]], 12)],
    [tr('menu.time'), () => say(tr('balloon.time', { time }), [], 5)],
    [tr('menu.tip'), () => say(pick(l.tips), [[l.thanks, closeBalloon]], 12)],
    [tr('menu.settings'), () => (closeBalloon(), api.openSettings())],
    focus.phase === 'focus'
      ? [tr('menu.focusStop', { m: Math.max(1, Math.ceil((focus.until - Date.now()) / 60_000)) }), () => void api.focus(false).then(t => say(t, [], 5))]
      : [tr('menu.focus'), () => void api.focus(true).then(t => say(t, [], 5))],
    [tr('menu.hush'), () => ((hushUntil = Date.now() + 3_600_000), say(l.hush, [], 4))],
    [tr('menu.hide'), () => (closeBalloon(), api.hidePet())],
  ]
  if (settings.ai.enabled) {
    // Opens the chat and asks, so the answer (and any permission question) lands in the thread.
    if (settings.ai.tools.actions) buttons.splice(1, 0, [tr('menu.look'), () => (openChat(), sendChat(tr('menu.lookAsk')))])
    buttons.unshift([tr('menu.chat'), openChat])
  }
  say(l.menu, buttons, 20, false)
}

function remind(text: string) {
  say(`⏰ ${text}`, [
    [tr('balloon.ok'), closeBalloon],
    [tr('balloon.snooze'), () => (closeBalloon(), setTimeout(() => remind(text), 600_000))],
  ], 60)
}

// ---- Pointer: click-through, drag, click -------------------------------------

function setInteractive(next: boolean) {
  if (next === isInteractive) return
  isInteractive = next
  api.setInteractive(next)
}

// Mouse moves arrive even while the window ignores clicks (forward: true).
document.addEventListener('mousemove', e => {
  if (isDragging) return
  const el = document.elementFromPoint(e.clientX, e.clientY)
  setInteractive(!!el && (el === sprite || !!el.closest('#balloon')))
})
document.addEventListener('mouseleave', () => !isDragging && setInteractive(false))

let pressAt: { x: number; y: number; clientX: number; clientY: number } | null = null

sprite.addEventListener('mousedown', e => {
  if (e.button !== 0) return
  pressAt = { x: e.screenX, y: e.screenY, clientX: e.clientX, clientY: e.clientY }
})

window.addEventListener('mousemove', e => {
  if (!pressAt || isDragging) return
  if (Math.abs(e.screenX - pressAt.x) + Math.abs(e.screenY - pressAt.y) < 5) return
  isDragging = true
  sprite.classList.add('dragging')
  api.dragStart({ x: pressAt.clientX, y: pressAt.clientY })
})

window.addEventListener('mouseup', () => {
  if (!pressAt) return
  pressAt = null
  if (isDragging) {
    isDragging = false
    sprite.classList.remove('dragging')
    api.dragEnd()
    return
  }
  // A click, not a drag: answer it like the old assistants did.
  if (!balloon.hidden) closeBalloon()
  else openMenu()
})

sprite.addEventListener('dblclick', jump)
sprite.addEventListener('contextmenu', e => {
  e.preventDefault()
  api.contextMenu()
})

// ---- The life loop -----------------------------------------------------------

function scheduleTip() {
  nextTipAt = Date.now() + rand(settings.tips.minMinutes, settings.tips.maxMinutes) * 60_000
}

let isTicking = false

async function tick() {
  // A move round-trips to the main process; never run two ticks at once.
  if (isTicking) return
  isTicking = true
  try {
    await tickOnce()
  } finally {
    isTicking = false
  }
}

async function tickOnce() {
  const now = Date.now()
  if (waitingSince !== null && !balloon.hidden) {
    // Slow local models can take minutes; show that it is still working instead of giving up.
    const s = Math.round((now - waitingSince) / 1000)
    waitLabel.textContent = s >= 5 ? tr('chat.waiting', { s }) : ''
    balloonUntil = now + 120_000
  }
  if (!balloon.hidden && now > balloonUntil && !isSpeaking) closeBalloon()

  const r = step(behavior, {
    userIdleSeconds,
    sleepAfterSeconds: settings.sleepAfterSeconds,
    isDragging: isDragging || isAirborne,
    isBalloonOpen: !balloon.hidden,
    isSpeaking,
    wander: settings.wander && focus.phase !== 'focus' && now >= dustUntil,
    hitEdge,
    random: Math.random,
  })
  behavior = r.state
  hitEdge = false
  if (r.events.includes('woke-up') && !isQuiet()) say(pick(lines().wake), [], 4)
  if (r.events.includes('walk-ended')) api.walkEnded()

  if (behavior.mode === 'idle' && balloon.hidden && settings.tips.enabled && now > nextTipAt && !isQuiet()) {
    scheduleTip()
    say(pick(lines().tips), [[lines().thanks, closeBalloon]], 12)
  }

  if (r.moveBy) {
    // A bigger pet takes bigger steps.
    const res = await api.moveBy(r.moveBy * settings.size)
    hitEdge = res.atEdge
    if (res.moved) walked(res.moved)
  }
  sprite.classList.toggle('flip', behavior.facing < 0)
  // The physics poses win over what the behaviour wants; dusting off only while standing still.
  if (isAirborne && !isDragging) setAnim('fall')
  else if (now < dustUntil && !isDragging) setAnim(now < dustUntil - (framesOf('dust').frames.length / framesOf('dust').fps) * 1000 ? 'idle' : 'dust')
  else if (behavior.mode === 'idle' && now < guitarUntil) setAnim('guitar')
  else setAnim(behavior.mode)
  // Now and then, standing around with nothing to do, it plays a few bars (about once in 3 minutes).
  if (behavior.mode === 'idle' && balloon.hidden && character.animations.guitar && now > guitarUntil && Math.random() < 1 / 1800)
    guitarUntil = now + 6000
  zzz.hidden = behavior.mode !== 'sleep'
}

function applyLook() {
  document.body.className = settings.look
  document.documentElement.style.setProperty('--accent', character.accent)
  petName.textContent = character.name
  if (sprite.naturalWidth) sizeSprite()
}

function applyState(state: State) {
  const changed = character?.id !== state.character.id
  settings = state.settings
  character = state.character
  focus = state.focus
  applyLook()
  if (changed) {
    frame = 0
    drawFrame()
  }
}

api.onState(s => applyState(s as State))
api.onCommand((cmd: PetCommand) => {
  if (cmd.type === 'idle') userIdleSeconds = cmd.seconds
  else if (cmd.type === 'say') {
    if (cmd.kind === 'reminder') remind(cmd.text)
    // Unasked talk never interrupts a chat and respects "quiet for an hour".
    else if (cmd.kind === 'proactive') {
      if (!isChatting && !isQuiet()) say(cmd.text, [[tr('menu.chat'), openChat, true], [lines().thanks, closeBalloon]], 25)
    } else say(cmd.text)
  }
  else if (cmd.type === 'menu') openMenu()
  else if (cmd.type === 'physics') {
    isAirborne = cmd.airborne
    motion.lean.target = cmd.tilt
    motion.squash.target = cmd.stretch
    if (cmd.impact > 0 && !cmd.airborne && character.animations.dust) {
      const dust = character.animations.dust
      dustUntil = Date.now() + 400 + (dust.frames.length / dust.fps) * 1000 // a beat to recover, then dust off
    }
    // A hit kicks the squash spring; harder hits squash more, then it wobbles back.
    if (cmd.impact > 0) motion.squash.v -= 17 * Math.min(0.3, cmd.impact / 4000)
  }
  else if (cmd.type === 'ai') onAi(cmd.event, cmd.text, cmd.event === 'done' ? cmd.id : undefined)
  else if (cmd.type === 'confirm') askConfirm(cmd.id, cmd.text)
  else if (cmd.type === 'listen') toggleListening()
})

api.getState().then((s: State) => {
  applyState(s)
  scheduleTip()
  setInterval(tick, 100)
  // Voices load late in Chromium; greet once they are known.
  setTimeout(() => say(pick(lines().greet), [], 5), 600)
})
