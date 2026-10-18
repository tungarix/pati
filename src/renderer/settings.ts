import type { PatiApi } from '../preload.ts'
import { LANGUAGES, t, type MessageKey } from '../shared/i18n.ts'
import type { AiServer, Character, Lang, Reminder, Settings } from '../shared/types.ts'

interface Fact {
  id: string
  text: string
}

declare global {
  interface Window {
    pati: PatiApi
  }
}

interface State {
  settings: Settings
  character: Character
  characters: Character[]
  problems: { id: string; reason: string }[]
  facts: Fact[]
  brainDir: string
  voice: { whisper: string | null; model: string | null; shortcutOk: boolean }
}

const api = window.pati
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

let settings: Settings
let characters: Character[] = []
let saveTimer: number | undefined
let lastState: State | null = null
const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(settings.language, key, vars)

const ICONS = { x: '<path d="M18 6 6 18M6 6l12 12"/>', up: '<path d="m18 15-6-6-6 6"/>' }
/** Glif yerine SVG ikonlu düğme; ekran okuyucu için adı title'dan alır. */
function iconButton(icon: keyof typeof ICONS, title: string) {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = 'icon'
  b.title = title
  b.setAttribute('aria-label', title)
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`
  return b
}

/** Fills every [data-i18n] element with its message in the current language. */
function translate() {
  document.documentElement.lang = settings.language
  document.title = tr('settings.title')
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = tr(el.dataset.i18n as MessageKey)
}

function save() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    await api.saveSettings(settings)
    $('status').textContent = tr('settings.saved')
  }, 250)
}

// ---- Character ----------------------------------------------------------------

function renderCharacters(problems: State['problems']) {
  const select = $<HTMLSelectElement>('character')
  select.replaceChildren(
    ...characters.map(c => new Option(`${c.name}${c.author ? ` (${c.author})` : ''}`, c.id, false, c.id === settings.characterId)),
  )
  const current = characters.find(c => c.id === settings.characterId) ?? characters[0]
  if (current) $<HTMLImageElement>('avatar').src = current.animations.idle.frames[0]
  $('problems').replaceChildren(
    ...problems.map(p => {
      const li = document.createElement('li')
      li.textContent = tr('settings.packProblem', { id: p.id, reason: p.reason })
      return li
    }),
  )
}

$<HTMLSelectElement>('character').addEventListener('change', e => {
  settings.characterId = (e.target as HTMLSelectElement).value
  save()
})
$('open-folder').addEventListener('click', () => api.openCharactersFolder())
$('reload').addEventListener('click', async () => apply((await api.reloadCharacters()) as State))

// ---- Speech -------------------------------------------------------------------

function renderVoices() {
  const voices = speechSynthesis.getVoices()
  const select = $<HTMLSelectElement>('voice')
  select.replaceChildren(
    new Option(tr('settings.voiceAuto'), '', false, !settings.speech.voiceName),
    ...voices.map(v => new Option(`${v.name} (${v.lang})`, v.name, false, v.name === settings.speech.voiceName)),
  )
}
speechSynthesis.addEventListener('voiceschanged', () => settings && renderVoices())

function bindCheck(id: string, get: () => boolean, set: (v: boolean) => void) {
  const el = $<HTMLInputElement>(id)
  el.checked = get()
  el.onchange = () => {
    set(el.checked)
    save()
  }
}

function bindNumber(id: string, get: () => number, set: (v: number) => void) {
  const el = $<HTMLInputElement>(id)
  el.value = String(get())
  el.oninput = () => {
    const v = Number(el.value)
    if (Number.isFinite(v) && v > 0) {
      set(v)
      save()
    }
  }
}

$('try-voice').addEventListener('click', () => {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(tr('settings.trySample'))
  const voice = speechSynthesis.getVoices().find(v => v.name === settings.speech.voiceName)
  if (voice) u.voice = voice
  u.lang = voice?.lang ?? 'tr-TR'
  u.rate = settings.speech.rate
  u.pitch = settings.speech.pitch
  speechSynthesis.speak(u)
})

// ---- Reminders ----------------------------------------------------------------

function renderReminders() {
  const box = $('reminders')
  box.replaceChildren(...settings.reminders.map(reminderRow))
}

function reminderRow(r: Reminder, i: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'reminder'

  const on = document.createElement('input')
  on.type = 'checkbox'
  on.checked = r.enabled
  on.title = tr('settings.enabled')
  on.onchange = () => update({ ...r, enabled: on.checked })

  const text = document.createElement('input')
  text.type = 'text'
  text.value = r.text
  text.placeholder = tr('settings.reminderPlaceholder')
  text.oninput = () => update({ ...settings.reminders[i], text: text.value }, false)

  if (r.kind === 'once') {
    const when = document.createElement('span')
    when.className = 'muted'
    when.textContent = new Date(r.at).toLocaleString(settings.language === 'tr' ? 'tr-TR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
    row.append(on, text, when, deleteButton())
    return row
  }

  const kind = document.createElement('select')
  kind.append(
    new Option(tr('settings.everyMinutes'), 'interval', false, r.kind === 'interval'),
    new Option(tr('settings.dailyAt'), 'daily', false, r.kind === 'daily'),
  )
  kind.onchange = () =>
    update(kind.value === 'interval'
      ? { id: r.id, text: r.text, enabled: r.enabled, kind: 'interval', minutes: 60 }
      : { id: r.id, text: r.text, enabled: r.enabled, kind: 'daily', time: '17:00' })

  const when = document.createElement('input')
  when.className = 'when'
  if (r.kind === 'interval') {
    when.type = 'number'
    when.min = '1'
    when.value = String(r.minutes)
    when.oninput = () => Number(when.value) > 0 && update({ ...r, minutes: Number(when.value) }, false)
  } else {
    when.type = 'time'
    when.value = r.time
    when.oninput = () => when.value && update({ ...r, time: when.value }, false)
  }

  function deleteButton() {
    const del = iconButton('x', tr('settings.delete'))
    del.classList.add('delete')
    del.onclick = () => {
      settings.reminders.splice(i, 1)
      renderReminders()
      save()
    }
    return del
  }

  function update(next: Reminder, rerender = true) {
    settings.reminders[i] = next
    if (rerender) renderReminders()
    save()
  }

  row.append(on, text, kind, when, deleteButton())
  return row
}

$('add-reminder').addEventListener('click', () => {
  settings.reminders.push({ id: crypto.randomUUID(), text: '', enabled: true, kind: 'interval', minutes: 30 })
  renderReminders()
  const inputs = document.querySelectorAll<HTMLInputElement>('.reminder input[type="text"]')
  inputs[inputs.length - 1]?.focus()
})

// ---- AI: servers ---------------------------------------------------------------

function renderServers() {
  $('ai-servers').replaceChildren(...settings.ai.servers.map(serverRow))
}

function serverRow(server: AiServer, i: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'server'

  const rank = document.createElement('span')
  rank.className = 'rank'
  rank.textContent = `${i + 1}.`

  const url = document.createElement('input')
  url.type = 'text'
  url.value = server.baseUrl
  url.spellcheck = false
  url.title = tr('settings.aiUrl')
  url.onchange = () => update({ baseUrl: url.value.trim() })

  const model = document.createElement('select')
  model.title = tr('settings.aiModel')
  model.onchange = () => update({ model: model.value })
  const fillModels = async () => {
    const models = await api.aiModels(settings.ai.servers[i])
    const current = settings.ai.servers[i]?.model ?? ''
    model.replaceChildren(
      new Option(tr('settings.aiModelAuto'), '', false, !current),
      // keep a saved model visible even while its server is down
      ...[...new Set([...models, ...(current ? [current] : [])])].map(m => new Option(m, m, false, m === current)),
    )
  }
  void fillModels()

  const key = document.createElement('input')
  key.type = 'password'
  key.value = server.apiKey
  key.placeholder = tr('settings.aiKey')
  key.autocomplete = 'off'
  key.oninput = () => update({ apiKey: key.value.trim() }, false)
  key.onchange = () => void fillModels()

  const up = iconButton('up', tr('settings.aiUp'))
  up.disabled = i === 0
  up.onclick = () => {
    const list = settings.ai.servers
    ;[list[i - 1], list[i]] = [list[i], list[i - 1]]
    renderServers()
    save()
  }

  const del = iconButton('x', tr('settings.delete'))
  del.onclick = () => {
    settings.ai.servers.splice(i, 1)
    renderServers()
    save()
  }

  function update(change: Partial<AiServer>, refresh = true) {
    settings.ai.servers[i] = { ...settings.ai.servers[i], ...change }
    save()
    if (refresh && change.baseUrl !== undefined) void fillModels()
  }

  row.append(rank, url, model, key, up, del)
  return row
}

$('ai-detect').addEventListener('click', async () => {
  $('ai-status').textContent = '…'
  const known = new Set(settings.ai.servers.map(s => s.baseUrl))
  const found = await api.aiDetect()
  const fresh = found.filter(f => !known.has(f.url))
  settings.ai.servers.push(...fresh.map(f => ({ baseUrl: f.url, apiKey: '', model: '' })))
  $('ai-status').textContent = found.length === 0
    ? tr('settings.aiNone')
    : found.map(f => (f.needsKey ? tr('settings.aiNeedsKey', { url: f.url }) : tr('settings.aiFound', { url: f.url, count: f.models.length }))).join(' · ')
  renderServers()
  save()
})

$('ai-add').addEventListener('click', () => {
  settings.ai.servers.push({ baseUrl: 'http://localhost:8080/v1', apiKey: '', model: '' })
  renderServers()
  save()
})

// ---- AI: memory -----------------------------------------------------------------

function renderMemory(facts: Fact[]) {
  $('memory-list').replaceChildren(
    ...facts.map(f => {
      const li = document.createElement('li')
      const text = document.createElement('span')
      text.textContent = f.text
      const del = iconButton('x', tr('settings.delete'))
      del.onclick = () => api.memoryDelete(f.id)
      li.append(text, del)
      return li
    }),
  )
  $('memory-empty').hidden = facts.length > 0
  $<HTMLButtonElement>('memory-clear').disabled = facts.length === 0
}

$('brain-open').addEventListener('click', async () => {
  const how = await api.brainOpen()
  $('brain-status').textContent = how === 'folder' ? tr('settings.brainNotVault') : ''
})
$('brain-choose').addEventListener('click', async () => apply((await api.brainChoose()) as State))

$('memory-clear').addEventListener('click', () => {
  if (confirm(tr('settings.memoryClearConfirm'))) api.memoryClear()
})

// ---- Talking by voice -------------------------------------------------------------

function renderVoice(found: State['voice']) {
  $('voice-whisper').textContent = found.whisper ?? `(${tr('settings.voiceMissing')})`
  $('voice-model').textContent = found.model ?? `(${tr('settings.voiceMissing')})`
  $('voice-shortcut-status').textContent = tr(found.shortcutOk ? 'settings.voiceShortcutHelp' : 'settings.voiceShortcutTaken')
  $<HTMLButtonElement>('voice-whisper-auto').disabled = !settings.voice.whisperPath
  $<HTMLButtonElement>('voice-model-auto').disabled = !settings.voice.modelPath
}

$('voice-whisper-choose').addEventListener('click', async () => apply((await api.voiceChoose('whisper')) as State))
$('voice-model-choose').addEventListener('click', async () => apply((await api.voiceChoose('model')) as State))
$('voice-whisper-auto').addEventListener('click', () => ((settings.voice.whisperPath = ''), save()))
$('voice-model-auto').addEventListener('click', () => ((settings.voice.modelPath = ''), save()))

// ---- Wiring -------------------------------------------------------------------

function apply(state: State) {
  lastState = state
  settings = structuredClone(state.settings)
  characters = state.characters
  translate()
  const language = $<HTMLSelectElement>('language')
  language.replaceChildren(...Object.entries(LANGUAGES).map(([code, name]) => new Option(name, code, false, code === settings.language)))
  language.onchange = () => {
    settings.language = language.value as Lang
    save()
    apply({ ...state, settings }) // redraw every label in the new language
  }
  const look = $<HTMLSelectElement>('look')
  look.replaceChildren(
    new Option(tr('settings.lookModern'), 'modern', false, settings.look === 'modern'),
    new Option(tr('settings.lookClassic'), 'classic', false, settings.look === 'classic'),
  )
  look.onchange = () => {
    settings.look = look.value as Settings['look']
    save()
  }
  bindNumber('size', () => settings.size, v => (settings.size = v))
  bindCheck('ai-enabled', () => settings.ai.enabled, v => (settings.ai.enabled = v))
  renderServers()
  bindCheck('ai-memory', () => settings.ai.memory, v => (settings.ai.memory = v))
  renderMemory(state.facts)
  $('brain-dir').textContent = state.brainDir
  bindCheck('tool-clipboard', () => settings.ai.tools.clipboard, v => (settings.ai.tools.clipboard = v))
  bindCheck('tool-web', () => settings.ai.tools.web, v => (settings.ai.tools.web = v))
  bindCheck('tool-actions', () => settings.ai.tools.actions, v => (settings.ai.tools.actions = v))
  const reset = $<HTMLButtonElement>('actions-reset')
  reset.disabled = settings.ai.allowedActions.length === 0
  reset.onclick = () => {
    settings.ai.allowedActions = []
    reset.disabled = true
    save()
  }
  renderCharacters(state.problems)
  renderVoices()
  bindCheck('speech-enabled', () => settings.speech.enabled, v => (settings.speech.enabled = v))
  bindNumber('rate', () => settings.speech.rate, v => (settings.speech.rate = v))
  bindNumber('pitch', () => settings.speech.pitch, v => (settings.speech.pitch = v))
  $<HTMLSelectElement>('voice').onchange = e => {
    settings.speech.voiceName = (e.target as HTMLSelectElement).value || null
    save()
  }
  bindCheck('voice-enabled', () => settings.voice.enabled, v => (settings.voice.enabled = v))
  const shortcut = $<HTMLInputElement>('voice-shortcut')
  shortcut.value = settings.voice.shortcut
  shortcut.onchange = () => {
    settings.voice.shortcut = shortcut.value.trim()
    save()
  }
  renderVoice(state.voice)
  bindCheck('wander', () => settings.wander, v => (settings.wander = v))
  bindCheck('physics', () => settings.physics, v => (settings.physics = v))
  bindCheck('tips-enabled', () => settings.tips.enabled, v => (settings.tips.enabled = v))
  bindCheck('pro-enabled', () => settings.proactive.enabled, v => (settings.proactive.enabled = v))
  bindCheck('pro-briefing', () => settings.proactive.briefing, v => (settings.proactive.briefing = v))
  bindCheck('pro-night', () => settings.proactive.lateNight, v => (settings.proactive.lateNight = v))
  bindCheck('pro-breaks', () => settings.proactive.breaks, v => (settings.proactive.breaks = v))
  bindNumber('tips-min', () => settings.tips.minMinutes, v => (settings.tips.minMinutes = v))
  bindNumber('tips-max', () => settings.tips.maxMinutes, v => (settings.tips.maxMinutes = Math.max(v, settings.tips.minMinutes)))
  bindNumber('sleep-after', () => settings.sleepAfterSeconds / 60, v => (settings.sleepAfterSeconds = Math.round(v * 60)))
  bindCheck('open-at-login', () => settings.openAtLogin, v => (settings.openAtLogin = v))
  renderReminders()
}

api.getState().then(s => apply(s as State))
// The main process changes things too (a key typed into the balloon, a reminder
// or fact the chat added); take those, but not the echo of our own save, which
// would redraw the rows and steal focus mid-typing.
api.onState(s => {
  const next = s as State
  const isEcho = JSON.stringify(next.settings) === JSON.stringify(settings) && JSON.stringify(next.facts) === JSON.stringify(lastState?.facts)
  // The echo still carries fresh whisper and shortcut status.
  if (isEcho) (lastState = next), renderVoice(next.voice)
  else apply(next)
})
