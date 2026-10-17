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
}

type Button = [label: string, onPress: () => void, isPrimary?: boolean]

const api = window.pati
const sprite = document.getElementById('sprite') as HTMLImageElement
const balloon = document.getElementById('balloon') as HTMLDivElement
const balloonText = document.getElementById('balloon-text') as HTMLParagraphElement
const balloonButtons = document.getElementById('balloon-buttons') as HTMLDivElement
const zzz = document.getElementById('zzz') as HTMLDivElement
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
let frame = 0
let frameClock = 0
let userIdleSeconds = 0
let behavior: BehaviorState = INITIAL
let hitEdge = false
let isDragging = false
let isSpeaking = false
let isChatting = false
/** The balloon's input is asking for the server's API key instead of a message. */
let isAskingKey = false
/** When the current chat request was sent; null while none is pending. */
let waitingSince: number | null = null
let balloonUntil = 0
let hushUntil = 0
let nextTipAt = 0
let isInteractive = false

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(settings.language, key, vars)
const lines = (): CharacterLines => character.lines[settings.language]

// ---- Drawing -----------------------------------------------------------------

function framesOf(name: AnimationName) {
  return character.animations[name] ?? character.animations.idle
}

function setAnim(name: AnimationName) {
  if (anim === name) return
  anim = name
  frame = 0
  frameClock = 0
  drawFrame()
}

function drawFrame() {
  const { frames } = framesOf(anim)
  const src = frames[frame % frames.length]
  if (sprite.src !== src) sprite.src = src
}

sprite.addEventListener('load', () => {
  sprite.style.width = `${sprite.naturalWidth * character.scale}px`
  sprite.style.height = `${sprite.naturalHeight * character.scale}px`
  document.documentElement.style.setProperty('--balloon-bottom', `${sprite.naturalHeight * character.scale + 22}px`)
})

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

function onAi(event: 'token' | 'done' | 'error' | 'needKey', text: string) {
  if (event !== 'token') waitingSince = null
  if (!isChatting) return
  waitLabel.textContent = ''
  if (event !== 'token') addBubble('pet', text)
  balloonUntil = Date.now() + 120_000
  if (event === 'needKey') setKeyMode(true)
  if (event !== 'token') {
    if (event === 'done') speak(text)
    chatInput.focus()
  }
}

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
    [tr('menu.hush'), () => ((hushUntil = Date.now() + 3_600_000), say(l.hush, [], 4))],
    [tr('menu.hide'), () => (closeBalloon(), api.hidePet())],
  ]
  if (settings.ai.enabled) buttons.unshift([tr('menu.chat'), openChat])
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
    isDragging,
    isBalloonOpen: !balloon.hidden,
    isSpeaking,
    wander: settings.wander,
    hitEdge,
    random: Math.random,
  })
  behavior = r.state
  hitEdge = false
  if (r.events.includes('woke-up') && now > hushUntil) say(pick(lines().wake), [], 4)
  if (r.events.includes('walk-ended')) api.walkEnded()

  if (behavior.mode === 'idle' && balloon.hidden && settings.tips.enabled && now > nextTipAt && now > hushUntil) {
    scheduleTip()
    say(pick(lines().tips), [[lines().thanks, closeBalloon]], 12)
  }

  if (r.moveBy) hitEdge = (await api.moveBy(r.moveBy)).atEdge
  sprite.classList.toggle('flip', behavior.facing < 0)
  setAnim(behavior.mode)
  zzz.hidden = behavior.mode !== 'sleep'

  frameClock += 100
  const { frames, fps } = framesOf(anim)
  if (frames.length > 1 && frameClock >= 1000 / fps) {
    frameClock = 0
    frame = (frame + 1) % frames.length
    drawFrame()
  }
}

function applyLook() {
  document.body.className = settings.look
  document.documentElement.style.setProperty('--accent', character.accent)
  petName.textContent = character.name
}

function applyState(state: State) {
  const changed = character?.id !== state.character.id
  settings = state.settings
  character = state.character
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
      if (!isChatting && Date.now() > hushUntil) say(cmd.text, [[tr('menu.chat'), openChat, true], [lines().thanks, closeBalloon]], 25)
    } else say(cmd.text)
  }
  else if (cmd.type === 'menu') openMenu()
  else if (cmd.type === 'ai') onAi(cmd.event, cmd.text)
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
