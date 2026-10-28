import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, Tray } from 'electron'

import { detectLang, t, type MessageKey } from '../shared/i18n.ts'
import type { AiServer, Character, PetCommand, Settings } from '../shared/types.ts'
import { askAboutImage, chatWithTools, closest, detectServers, isRepeat, listModels, stripVocative, systemPrompt, UnauthorizedError, withClock, type HistoryMessage } from './ai.ts'
import { loadCharacters, type PackProblem } from './characters.ts'
import { addFact, forgetFacts, loadFacts, looksPersonal, memoryBlock, saveFacts, type Fact } from './memory.ts'
import { appendExchange, appendFeedback, capSummary, dropLooped, ensureBrain, exchangeCount, type FeedbackRecord, getSummary, MEMORY_NOTE, MIN_SUMMARY_EXCHANGES, pastBlock, pastDays, SUMMARY_PROMPT, todaysMessages, transcript, withSummary } from './brain.ts'
import { dueReminders, type FiredLog } from './reminders.ts'
import { InstallError, LocalModel, withManagedServer } from './localModel.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { bestMatch, findPaths, findShortcut, MEDIA_KEYS, websiteUrl, type ActionKind, type Folder, type MediaAction } from './actions.ts'
import { FOCUS_MINUTES, FOCUS_OFF, focusStep, startFocus, type FocusState } from './focus.ts'
import { physicsStep, pixel, throwVelocity, type Body, type Rect } from './physics.ts'
import { watchWindows } from './windows.ts'
import { INITIAL_PROACTIVE, proactiveStep, type ProactiveEvent, type ProactiveState } from './proactive.ts'
import { matchFocus, matchIntent, matchScreen, type Intent } from './intents.ts'
import { runTool, toolDefinitions, type ToolContext } from './tools.ts'
import { findModel, findWhisper, transcribe } from './voice.ts'

const PET_W = 340
const PET_H = 460
// A bigger character needs a bigger window; smaller ones keep room for the balloon.
const petW = () => Math.round(PET_W * Math.max(1, settings.size))
const petH = () => Math.round(PET_H * Math.max(1, settings.size))

const BUILT_IN_DIR = path.join(app.getAppPath(), 'characters')
const USER_DIR = path.join(app.getPath('userData'), 'characters')
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')
const FIRED_FILE = path.join(app.getPath('userData'), 'reminders-fired.json')
const PROACTIVE_FILE = path.join(app.getPath('userData'), 'proactive.json')
/** Where v0.2 kept memory; moved into the brain's Memory.md on first start. */
const OLD_MEMORY_FILE = path.join(app.getPath('userData'), 'memory.json')

let settings: Settings
let characters: Character[] = []
let problems: PackProblem[] = []
let pet: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let tray: Tray | null = null
let dragTimer: NodeJS.Timeout | null = null
const startedAt = Date.now()
/** The chat so far with the current character, oldest first; cleared when the character changes. */
let chatAbort: AbortController | null = null
let focus: FocusState = FOCUS_OFF
/** How much of today's chat the model sees again. */
const CHAT_MEMORY = 20
const REPEAT_NOTE = {
  tr: 'Önceki cevaplarını tekrarlama; bu mesaja farklı, kısa ve doğal bir cevap ver.',
  en: 'Do not repeat your earlier replies; answer this message differently, briefly and naturally.',
}

function currentCharacter(): Character {
  return characters.find(c => c.id === settings.characterId) ?? characters[0]
}

function reloadCharacters(): void {
  ;({ characters, problems } = loadCharacters(BUILT_IN_DIR, USER_DIR))
}

function send(cmd: PetCommand): void {
  pet?.webContents.send('command', cmd)
}

function broadcastState(): void {
  for (const win of [pet, settingsWin]) win?.webContents.send('state', stateForWindows())
  rebuildTray()
}

function stateForWindows() {
  return { settings, character: currentCharacter(), characters, problems, userDir: USER_DIR, facts: currentFacts(), brainDir: brainDir(), voice: voiceStatus(), focus, model: modelState() }
}

// ---- The pet window ---------------------------------------------------------

function startPosition(): { x: number; y: number } {
  const saved = settings.position
  if (saved) {
    // Keep it only if it still lands on a connected screen.
    const area = screen.getDisplayNearestPoint(saved).workArea
    if (saved.x >= area.x - petW() / 2 && saved.x <= area.x + area.width - petW() / 2 && saved.y >= area.y - petH() / 2 && saved.y <= area.y + area.height - petH() / 2)
      return saved
  }
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - petW() - 40, y: area.y + area.height - petH() }
}

function createPet(): void {
  const { x, y } = startPosition()
  pet = new BrowserWindow({
    width: petW(),
    height: petH(),
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  pet.setAlwaysOnTop(true, 'floating')
  // Clicks fall through to the desktop until the pointer is over the character or its balloon.
  pet.setIgnoreMouseEvents(true, { forward: true })
  pet.loadFile(path.join(__dirname, 'renderer', 'pet.html'))
  pet.once('ready-to-show', () => pet?.showInactive())
  pet.on('closed', () => (pet = null))
}

function savePosition(): void {
  if (!pet) return
  const [x, y] = pet.getPosition()
  settings.position = { x, y }
  saveSettings(SETTINGS_FILE, settings)
}

// ---- Settings window --------------------------------------------------------

function openSettings(): void {
  if (settingsWin) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 720,
    title: 'Pati Ayarları',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  })
  settingsWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'))
  settingsWin.on('closed', () => (settingsWin = null))
}

// ---- Tray and context menu --------------------------------------------------

function menuTemplate(): Electron.MenuItemConstructorOptions[] {
  const lang = settings.language
  return [
    { label: t(lang, 'tray.settings'), click: openSettings },
    {
      label: t(lang, 'tray.character'),
      submenu: characters.map(c => ({
        label: c.name,
        type: 'radio' as const,
        checked: c.id === currentCharacter()?.id,
        click: () => applySettings({ ...settings, characterId: c.id }),
      })),
    },
    {
      label: t(lang, 'settings.size'),
      submenu: [0.5, 0.75, 1, 1.25, 1.5, 2].map(size => ({
        label: `${size * 100}%`,
        type: 'radio' as const,
        checked: settings.size === size,
        click: () => applySettings({ ...settings, size }),
      })),
    },
    { label: t(lang, pet?.isVisible() ? 'tray.hide' : 'tray.show'), click: togglePet },
    { label: t(lang, 'tray.openFolder'), click: openCharactersFolder },
    { type: 'separator' },
    { label: t(lang, 'tray.quit'), click: () => app.quit() },
  ]
}

function trayIcon(): Electron.NativeImage {
  const first = currentCharacter()?.animations.idle.frames[0]
  if (!first) return nativeImage.createEmpty()
  return nativeImage.createFromPath(fileURLToPath(first)).resize({ width: 16, height: 16, quality: 'good' })
}

function rebuildTray(): void {
  if (!tray) {
    tray = new Tray(trayIcon())
    tray.setToolTip('Pati')
    tray.on('click', togglePet)
  } else {
    tray.setImage(trayIcon())
  }
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()))
}

function togglePet(): void {
  if (!pet) createPet()
  else if (pet.isVisible()) pet.hide()
  else pet.showInactive()
  rebuildTray()
}

function openCharactersFolder(): void {
  fs.mkdirSync(USER_DIR, { recursive: true })
  void shell.openPath(USER_DIR)
}

function applySettings(next: Settings): void {
  const resized = next.size !== settings.size
  settings = next
  if (resized && pet) {
    // Grow up and to the left, so the character's feet stay where they were.
    const b = pet.getBounds()
    pet.setBounds({ x: b.x + b.width - petW(), y: b.y + b.height - petH(), width: petW(), height: petH() })
  }
  saveSettings(SETTINGS_FILE, settings)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
  registerShortcut()
  broadcastState()
}

// ---- Timers -----------------------------------------------------------------

function readFired(): FiredLog {
  try {
    return JSON.parse(fs.readFileSync(FIRED_FILE, 'utf8')) as FiredLog
  } catch {
    return {}
  }
}

function startTimers(): void {
  setInterval(() => send({ type: 'idle', seconds: powerMonitor.getSystemIdleTime() }), 3000)

  let proactive: ProactiveState = INITIAL_PROACTIVE
  try {
    proactive = { ...INITIAL_PROACTIVE, ...JSON.parse(fs.readFileSync(PROACTIVE_FILE, 'utf8')), activeSince: null }
  } catch {
    // first run
  }
  setInterval(() => {
    const r = proactiveStep(proactive, new Date(), powerMonitor.getSystemIdleTime(), settings.proactive)
    proactive = r.state
    if (!r.event) return
    fs.writeFileSync(PROACTIVE_FILE, JSON.stringify({ briefingDay: proactive.briefingDay, nightDay: proactive.nightDay }), 'utf8')
    if (settings.proactive.enabled && focus.phase !== 'focus') void speakUnasked(r.event)
  }, 30_000)

  setInterval(() => {
    const r = focusStep(focus, Date.now())
    if (!r.event) return
    // The focus break replaces the 90-minute nudge; its count starts again after it.
    if (r.event !== 'breakDone') proactive = { ...proactive, activeSince: null }
    setFocus(r.state)
    send({ type: 'say', text: t(settings.language, `focus.${r.event}`), kind: 'reminder' })
  }, 5_000)

  const fired = readFired()
  setInterval(() => {
    const now = Date.now()
    const due = dueReminders(settings.reminders, fired, now, startedAt)
    if (due.length === 0) return
    for (const r of due) {
      fired[r.id] = now
      send({ type: 'say', text: r.text, kind: 'reminder' })
    }
    fs.writeFileSync(FIRED_FILE, JSON.stringify(fired), 'utf8')
    // One-off reminders are done once they fired.
    if (due.some(r => r.kind === 'once'))
      applySettings({ ...settings, reminders: settings.reminders.filter(r => !(r.kind === 'once' && fired[r.id])) })
  }, 15_000)
}

// ---- Physics: falling, standing on windows, being thrown ------------------------------

let windowRects: Rect[] = []
/** Set while the pet is in the air; standing, its position is simply the window's. */
let body: Body | null = null
let dragSamples: { t: number; x: number; y: number }[] = []
let stopWindowWatch: (() => void) | null = null
let shown = { airborne: false, tilt: 0, stretch: 0 }
/** Walking: px still to go (the renderer asks 10 times a second), the speed, and the sub-pixel carry. */
const walk = { pending: 0, rate: 0, carry: 0 }

/**
 * Moves the pet window, always with its exact size: on a scaled display (125%, 150%)
 * setPosition can grow a window by a pixel per call, and dragging calls it 60 times a second.
 */
function movePet(x: number, y: number): void {
  pet?.setBounds({ x: pixel(x), y: pixel(y), width: petW(), height: petH() })
}

/** The pet's feet: bottom centre of its window. */
function feet(): { x: number; y: number } {
  const [x, y] = pet!.getPosition()
  return { x: x + petW() / 2, y: y + petH() }
}

/**
 * Tells the pet window how it moves: in the air or not, the lean it should swing
 * towards (degrees), how much a fast fall stretches it, and how hard it just hit a floor.
 */
function showFlight(airborne: boolean, lean: number, stretch = 0, impact = 0): void {
  const tilt = Math.round(Math.max(-30, Math.min(30, lean)))
  stretch = Math.round(stretch * 100) / 100
  if (!impact && airborne === shown.airborne && Math.abs(tilt - shown.tilt) < 2 && Math.abs(stretch - shown.stretch) < 0.02) return
  shown = { airborne, tilt, stretch }
  send({ type: 'physics', airborne, tilt, stretch, impact })
}

function startPhysics(): void {
  if (process.platform === 'win32')
    stopWindowWatch = watchWindows(list => {
      windowRects = list
        .map(([l, t, r, b]) => {
          const d = screen.screenToDipRect(null, { x: l, y: t, width: r - l, height: b - t })
          return { left: d.x, top: d.y, right: d.x + d.width, bottom: d.y + d.height }
        })
        // A window off every screen can convert to NaN; one such edge made the pet's position NaN.
        .filter(r => [r.left, r.top, r.right, r.bottom].every(Number.isFinite))
    })
  let last = Date.now()
  setInterval(() => {
    const now = Date.now()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!pet || dragTimer || !pet.isVisible()) return
    // Glide the window along the walk every frame instead of jumping 10 times a second.
    if (walk.pending) {
      const move = Math.sign(walk.pending) * Math.min(Math.abs(walk.pending), walk.rate * dt)
      walk.pending -= move
      walk.carry += move
      const whole = Math.trunc(walk.carry)
      if (whole) {
        walk.carry -= whole
        const [wx, wy] = pet.getPosition()
        movePet(wx + whole, wy)
      }
    }
    if (!settings.physics) return void ((body = null), showFlight(false, 0))
    const wa = screen.getDisplayMatching(pet.getBounds()).workArea
    // Walls a little inside the edges: the window is wider than the character.
    const area = { left: wa.x + 40, top: wa.y, right: wa.x + wa.width - 40, bottom: wa.y + wa.height }
    const r = physicsStep(body ?? { ...feet(), vx: 0, vy: 0, airborne: false }, dt, windowRects, area)
    body = r.body.airborne ? r.body : null
    const [wx, wy] = pet.getPosition()
    const nx = pixel(r.body.x - petW() / 2)
    const ny = pixel(r.body.y - petH())
    // Never hand Electron a non-number: drop the flight and stay put instead of crashing.
    if (![nx, ny].every(v => Number.isSafeInteger(v) && Math.abs(v) < 100_000)) return void ((body = null), showFlight(false, 0))
    if (nx !== wx || ny !== wy) movePet(nx, ny)
    const { airborne, vx, vy } = r.body
    // Leans into a throw, stretches in a fast fall.
    showFlight(airborne, airborne ? vx / 70 : 0, airborne ? Math.min(0.12, (Math.abs(vy) / 1900) * 0.12) : 0, r.impact)
    if (r.landed) savePosition()
  }, 16)
}

// ---- AI chat ----------------------------------------------------------------

// ---- Brain: an Obsidian-friendly folder of Markdown -------------------------------

function brainDir(): string {
  return settings.ai.brainDir || path.join(app.getPath('documents'), 'Pati Beyni')
}

const memoryFile = () => path.join(brainDir(), MEMORY_NOTE)

/** Read fresh every time: the user may have edited Memory.md in Obsidian meanwhile. */
function currentFacts(): Fact[] {
  return loadFacts(memoryFile())
}

/** v0.2 memory.json → Memory.md, once; the old file is kept as a backup. */
function migrateOldMemory(): void {
  if (!fs.existsSync(OLD_MEMORY_FILE) || fs.existsSync(memoryFile())) return
  try {
    const old = JSON.parse(fs.readFileSync(OLD_MEMORY_FILE, 'utf8')) as Fact[]
    saveFacts(memoryFile(), old.filter(f => typeof f?.text === 'string'), settings.language)
    fs.renameSync(OLD_MEMORY_FILE, `${OLD_MEMORY_FILE}.bak`)
  } catch (err) {
    console.error('memory migration failed:', err)
  }
}

/** Opens the brain in Obsidian when it lies inside a vault Obsidian knows, else the folder. */
async function openBrain(): Promise<'obsidian' | 'folder'> {
  const dir = brainDir()
  ensureBrain(dir, settings.language)
  try {
    const config = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'obsidian', 'obsidian.json'), 'utf8')) as {
      vaults?: Record<string, { path: string }>
    }
    const inVault = Object.values(config.vaults ?? {}).some(v => (dir + path.sep).toLowerCase().startsWith((v.path + path.sep).toLowerCase()))
    if (inVault) {
      await shell.openExternal(`obsidian://open?path=${encodeURIComponent(path.join(dir, 'Pati.md'))}`)
      return 'obsidian'
    }
  } catch {
    // no Obsidian, or never opened: fall back to the folder
  }
  await shell.openPath(dir)
  return 'folder'
}

/** Writes summaries for the last few days that have a chat but no summary yet. */
async function summarizePastDays(server: AiServer, model: string): Promise<void> {
  const lang = settings.language
  for (const day of pastDays(brainDir(), new Date(), 3)) {
    const text = transcript(day.md, lang)
    if (getSummary(day.md) || !text || exchangeCount(day.md) < MIN_SUMMARY_EXCHANGES) continue
    try {
      const summary = await chatWithTools(server, model, [{ role: 'system', content: SUMMARY_PROMPT[lang] }, { role: 'user', content: text }], [],
        async () => '', AbortSignal.timeout(180_000), 4, { temperature: 0.2 })
      // Re-read: the day's note may have changed while the model was summarizing.
      if (summary) fs.writeFileSync(day.file, withSummary(fs.readFileSync(day.file, 'utf8'), lang, capSummary(summary)), 'utf8')
    } catch (err) {
      console.error(`summary of ${day.key} failed:`, err)
      return
    }
  }
}


/** A message waiting for the user to type a server's API key into the balloon. */
let pendingKey: { text: string; server: number } | null = null

function askForKey(text: string, server: number): void {
  pendingKey = { text, server }
  const s = settings.ai.servers[server]
  const key = s.apiKey ? 'chat.badKey' : 'chat.needKey'
  send({ type: 'ai', event: 'needKey', text: t(settings.language, key, { url: s.baseUrl }) })
}

function setFacts(next: Fact[]): void {
  saveFacts(memoryFile(), next, settings.language)
  broadcastState()
}

function toolContext(): ToolContext {
  const { memory, tools } = settings.ai
  return {
    lang: settings.language,
    allowMemory: memory,
    allowClipboard: tools.clipboard,
    allowWeb: tools.web,
    now: () => new Date(),
    remember: text => setFacts(addFact(currentFacts(), text)),
    forget: text => {
      const r = forgetFacts(currentFacts(), text)
      setFacts(r.facts)
      return r.removed
    },
    addReminder: (text, at) =>
      applySettings({ ...settings, reminders: [...settings.reminders, { id: `once-${at}`, text, enabled: true, kind: 'once', at }] }),
    readClipboard: () => clipboard.readText(),
    fetchJson: async url => {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
    allowActions: tools.actions,
    confirm: confirmAction,
    openApp,
    // Re-checked here too: nothing but http(s) ever reaches the browser.
    openUrl: async url => {
      const safe = websiteUrl({ url })
      if (safe) await shell.openExternal(safe)
    },
    media: pressKeys,
    openFolder: async (which: Folder) => void (await shell.openPath(which === 'brain' ? brainDir() : app.getPath(which))),
    findPaths: (name, kind, where) =>
      findPaths(name, kind, where ? [app.getPath(where)] : [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')]),
    openPath: async p => {
      const err = await shell.openPath(p)
      if (err) throw new Error(err)
    },
    fileRoots: { desktop: app.getPath('desktop'), documents: app.getPath('documents'), downloads: app.getPath('downloads') },
    writeClipboard: text => clipboard.writeText(text),
    systemStatus,
    takeNote,
  }
}

// ---- Actions on the computer --------------------------------------------------------

const pendingConfirms = new Map<string, (answer: 'yes' | 'always' | 'no') => void>()

/** Asks in the balloon before an action; "always" is remembered per kind. */
function confirmAction(kind: ActionKind, what: string): Promise<boolean> {
  if (settings.ai.allowedActions.includes(kind)) return Promise.resolve(true)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  // Media actions are internal names; say them in words.
  const said = kind === 'media' ? t(settings.language, `media.${what as MediaAction}`) : what
  send({ type: 'confirm', id, text: t(settings.language, `confirm.${kind}`, { what: said }) })
  return new Promise(resolve => {
    const timer = setTimeout(() => (pendingConfirms.delete(id), resolve(false)), 60_000)
    pendingConfirms.set(id, answer => {
      clearTimeout(timer)
      if (answer === 'always') applySettings({ ...settings, ai: { ...settings.ai, allowedActions: [...settings.ai.allowedActions, kind] } })
      resolve(answer !== 'no')
    })
  })
}

/** A plain yes/no question in the balloon; no answer for ten minutes counts as no. */
function askYesNo(text: string): Promise<boolean> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  send({ type: 'confirm', id, text, yesNo: true })
  return new Promise(resolve => {
    const timer = setTimeout(() => (pendingConfirms.delete(id), resolve(false)), 600_000)
    pendingConfirms.set(id, answer => (clearTimeout(timer), resolve(answer === 'yes')))
  })
}

ipcMain.on('confirm-reply', (_e, id: string, answer: 'yes' | 'always' | 'no') => {
  pendingConfirms.get(id)?.(answer)
  pendingConfirms.delete(id)
})

/** Every Start Menu shortcut (machine and user), the places installed apps announce themselves. */
function startMenuShortcuts(): string[] {
  const roots = [
    path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ]
  const out: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 4 || !fs.existsSync(dir)) return
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, depth + 1)
      else if (/\.(lnk|url)$/i.test(e.name)) out.push(full)
    }
  }
  roots.forEach(r => walk(r, 0))
  return out
}

/** Store apps without a Start Menu shortcut file, reachable by their protocol. */
const APP_PROTOCOLS: Record<string, string> = {
  spotify: 'spotify:',
  discord: 'discord:',
  steam: 'steam:',
  ayarlar: 'ms-settings:',
  settings: 'ms-settings:',
}

/** Every app Windows lists in Start, Store apps included (they have no shortcut file). */
function startApps(): Promise<{ Name: string; AppID: string }[]> {
  return new Promise(resolve =>
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-StartApps | ConvertTo-Json -Compress'], { maxBuffer: 4 * 2 ** 20 }, (err, out) => {
      try {
        const list = JSON.parse(out)
        resolve(err ? [] : Array.isArray(list) ? list : [list])
      } catch {
        resolve([])
      }
    }),
  )
}

async function openApp(name: string): Promise<string | null> {
  const shortcut = findShortcut(name, startMenuShortcuts())
  if (shortcut && (await shell.openPath(shortcut)) === '') return path.basename(shortcut).replace(/\.(lnk|url)$/i, '')
  const listed = bestMatch(name, await startApps(), a => a.Name)
  if (listed) {
    execFile('explorer.exe', [`shell:AppsFolder\\${listed.AppID}`])
    return listed.Name
  }
  const protocol = APP_PROTOCOLS[name.trim().toLocaleLowerCase('tr')]
  if (protocol) {
    await shell.openExternal(protocol)
    return name
  }
  return null
}

function pressKeys(action: MediaAction): Promise<void> {
  const { vk, presses } = MEDIA_KEYS[action]
  // keybd_event through PowerShell: no native module to build or ship.
  const script =
    "$k = Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte b, byte s, uint f, UIntPtr e);' -Name K -Namespace P -PassThru; " +
    `1..${presses} | ForEach-Object { $k::keybd_event(${vk}, 0, 0, [UIntPtr]::Zero); $k::keybd_event(${vk}, 0, 2, [UIntPtr]::Zero) }`
  return new Promise(resolve => execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], () => resolve()))
}

async function systemStatus(): Promise<object> {
  const sample = () => os.cpus().reduce((a, c) => ({ idle: a.idle + c.times.idle, total: a.total + Object.values(c.times).reduce((x, y) => x + y, 0) }), { idle: 0, total: 0 })
  const a = sample()
  await new Promise(r => setTimeout(r, 400))
  const b = sample()
  const battery = await new Promise<number | null>(resolve =>
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery).EstimatedChargeRemaining'], (err, out) =>
      resolve(err || !out.trim() ? null : Number(out.trim())),
    ),
  )
  return {
    battery_percent: battery,
    charging: !powerMonitor.isOnBatteryPower(),
    cpu_percent: Math.round(100 * (1 - (b.idle - a.idle) / (b.total - a.total))),
    memory_used_gb: +((os.totalmem() - os.freemem()) / 2 ** 30).toFixed(1),
    memory_total_gb: +(os.totalmem() / 2 ** 30).toFixed(1),
    uptime_hours: +(os.uptime() / 3600).toFixed(1),
  }
}

function takeNote(text: string): void {
  const now = new Date()
  const stamp = `${now.toLocaleDateString('sv-SE')} ${now.toTimeString().slice(0, 5)}`
  const file = path.join(brainDir(), 'Notes.md')
  if (!fs.existsSync(file)) fs.writeFileSync(file, '# Notes\n\n', 'utf8')
  fs.appendFileSync(file, `- ${stamp}: ${text.replace(/\s+/g, ' ').trim()}\n`, 'utf8')
}

// ---- Speaking unasked ---------------------------------------------------------------

/** The first server on the list that answers, with its model. */
async function firstServer(): Promise<{ server: AiServer; model: string } | null> {
  for (const server of settings.ai.servers) {
    try {
      const model = server.model || (await listModels(server.baseUrl, server.apiKey))[0]
      if (model) return { server, model }
    } catch {
      // try the next one
    }
  }
  return null
}

/** Today's reminders as "HH:MM text", for the morning briefing. */
function remindersToday(now: Date): string[] {
  const hhmm = (d: Date) => d.toTimeString().slice(0, 5)
  return settings.reminders
    .filter(r => r.enabled && r.text.trim())
    .flatMap(r => {
      if (r.kind === 'daily' && (!r.days?.length || r.days.includes(now.getDay()))) return [`${r.time} ${r.text}`]
      if (r.kind === 'once' && new Date(r.at).toDateString() === now.toDateString()) return [`${hhmm(new Date(r.at))} ${r.text}`]
      return []
    })
    .sort()
}

async function briefingText(): Promise<string> {
  const lang = settings.language
  const now = new Date()
  const today = remindersToday(now)
  const yesterday = getSummary(pastDays(brainDir(), now, 1)[0]?.md ?? '')
  const none = lang === 'tr' ? 'yok' : 'none'
  const ask = lang === 'tr'
    ? `(Sistem: Kullanıcı güne yeni başladı. Ona 2-3 cümlelik kısa, sıcak bir günaydın brifingi ver. Bugünkü hatırlatıcılar: ${today.join('; ') || none}. Dünkü konuşmanın özeti: ${yesterday || none}. Açık kalan bir konu varsa nazikçe sor. Liste yapma.)`
    : `(System: The user just started their day. Give a short, warm 2-3 sentence morning briefing. Today's reminders: ${today.join('; ') || none}. Yesterday's chat summary: ${yesterday || none}. If something was left open, gently ask about it. No lists.)`
  const found = settings.ai.enabled ? await firstServer() : null
  if (found) {
    try {
      const memory = settings.ai.memory ? memoryBlock(currentFacts(), lang) : ''
      const text = await chatWithTools(found.server, found.model, [
        { role: 'system', content: systemPrompt(currentCharacter().persona[lang], lang, memory) },
        { role: 'user', content: withClock(ask, lang, now) },
      ], [], async () => '', AbortSignal.timeout(180_000))
      if (text) return text
    } catch (err) {
      console.error('briefing failed:', err)
    }
  }
  const l = currentCharacter().lines[lang]
  const greet = l.greet[Math.floor(Math.random() * l.greet.length)]
  return today.length ? `${greet} ${lang === 'tr' ? 'Bugün' : 'Today'}: ${today.join(', ')}.` : greet
}

async function speakUnasked(event: ProactiveEvent): Promise<void> {
  const l = currentCharacter().lines[settings.language]
  const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)]
  const text = event === 'briefing' ? await briefingText() : pick(event === 'lateNight' ? l.lateNight : l.breakTime)
  send({ type: 'say', text, kind: 'proactive' })
}

/** Adds servers found on the usual ports that the list does not have yet. */
async function discoverServers(): Promise<boolean> {
  const known = new Set(settings.ai.servers.map(s => s.baseUrl))
  const found = (await detectServers()).filter(f => !known.has(f.url))
  if (found.length === 0) return false
  // Servers that already answer go before ones still waiting for a key.
  found.sort((a, b) => Number(a.needsKey) - Number(b.needsKey))
  const added = found.map(f => ({ baseUrl: f.url, apiKey: '', model: '' }))
  applySettings({ ...settings, ai: { ...settings.ai, servers: [...settings.ai.servers, ...added] } })
  return true
}

// ---- Pati-4B: the managed local model ------------------------------------------

const localModel = new LocalModel()
localModel.onChange = url => setManagedServer(url)
let installing: AbortController | null = null
let offering = false
let modelError = ''
let progressText = ''

function modelState() {
  return { status: localModel.status(), running: localModel.url !== null, installing: installing !== null, progressText, error: modelError }
}

const gb = (bytes: number) => (bytes / 1e9).toLocaleString(settings.language === 'tr' ? 'tr-TR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Puts the running model server first in the server list, or takes its entry out. */
function setManagedServer(url: string | null): void {
  const servers = withManagedServer(settings.ai.servers, url)
  if (JSON.stringify(servers) !== JSON.stringify(settings.ai.servers)) applySettings({ ...settings, ai: { ...settings.ai, servers } })
  else broadcastState()
}

/** Starts or stops the model server to match the settings and what is installed; returns an error message or ''. */
async function syncBuiltIn(): Promise<string> {
  let url: string | null = null
  if (settings.ai.builtIn.enabled && localModel.status() === 'installed') {
    modelError = ''
    try {
      url = await localModel.start()
    } catch (err) {
      console.error('Pati-4B did not start:', err)
      if (settings.ai.builtIn.enabled) modelError = t(settings.language, 'model.error.start', { detail: (err as Error).message, log: path.join(localModel.dir, 'llama-server.log') })
    }
  } else await localModel.stop()
  setManagedServer(url)
  return modelError
}

async function installModel(pending?: string): Promise<void> {
  if (installing) return
  const abort = (installing = new AbortController())
  const lang = settings.language
  modelError = ''
  progressText = '…'
  let lastSent = 0
  if (!settings.ai.builtIn.enabled) applySettings({ ...settings, ai: { ...settings.ai, builtIn: { ...settings.ai.builtIn, enabled: true } } })
  else broadcastState()
  try {
    await localModel.install(p => {
      if (Date.now() - lastSent < 2000) return
      lastSent = Date.now()
      progressText = t(lang, 'model.progress', { pct: Math.floor((p.overallDone * 100) / p.overallTotal), done: gb(p.overallDone), total: gb(p.overallTotal) })
      send({ type: 'ai', event: 'status', text: progressText })
      broadcastState()
    }, abort.signal)
    const failed = await syncBuiltIn()
    if (failed) return send({ type: 'ai', event: 'error', text: failed })
    send({ type: 'ai', event: 'done', text: t(lang, 'model.ready') })
    if (pending) void chat(pending, false)
  } catch (err) {
    if (err instanceof InstallError && err.code === 'aborted') send({ type: 'ai', event: 'done', text: t(lang, 'model.stopped') })
    else {
      modelError = err instanceof InstallError ? t(lang, `model.error.${err.code}` as MessageKey, { detail: err.detail }) : String(err)
      send({ type: 'ai', event: 'error', text: modelError })
    }
  } finally {
    installing = null
    progressText = ''
    broadcastState()
  }
}

/** Asks in the balloon whether to download Pati-4B (once per chat message that found no server, and once on first start). */
async function offerModel(pending?: string): Promise<void> {
  const lang = settings.language
  if (installing) return send({ type: 'ai', event: 'error', text: t(lang, 'model.busy', { progress: progressText }) })
  if (offering) return
  offering = true
  if (!settings.ai.builtIn.offered) applySettings({ ...settings, ai: { ...settings.ai, builtIn: { ...settings.ai.builtIn, offered: true } } })
  const yes = await askYesNo(t(lang, 'model.offer'))
  offering = false
  if (yes) void installModel(pending)
  else send({ type: 'ai', event: 'done', text: t(lang, 'model.declined') })
}

const EXTRACT_PROMPT =
  'You save facts about the user. Read the user message and call the remember tool once for every lasting fact about the user ' +
  '(name, age, school, job, hobby, likes, dislikes, goals), written as a short sentence in the language of the message. ' +
  'Save the name as its own fact. In Turkish "ben" means "I" and is never a name. ' +
  'Lasting facts only: never moods, feelings or what they are doing today. ' +
  'Write each fact in the third person, in the same language as the message ("The user is called Sam.", "Kullanıcının adı Ali."). ' +
  'If there is no such fact, call nothing and reply "-".'

async function extractFacts(server: AiServer, model: string, text: string, ctx: ToolContext): Promise<void> {
  const rememberOnly = toolDefinitions({ allowMemory: true, allowClipboard: false, allowWeb: false }).filter(d => d.function.name === 'remember')
  try {
    await chatWithTools(server, model, [{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: text }], rememberOnly,
      (name, args) => runTool(name, args, ctx), AbortSignal.timeout(120_000), 2)
  } catch (err) {
    console.error('memory pass failed:', err)
  }
}

type ToolResult = {
  ok?: boolean; declined?: boolean; error?: string; opened?: string; name?: string; candidates?: { name: string }[]
  where?: string; created?: boolean; existed?: boolean; text?: string; truncated?: boolean
  entries?: { name: string; isDir: boolean }[]; total?: number; matches?: { name: string; path: string }[]
  from?: string; to?: string; path?: string
}

/** What a plain command did: the balloon text, the command that really ran, and its result as a tool turn. */
interface IntentOutcome {
  reply: string
  intent: Intent
  result: object
}

const FILE_TOOLS = ['create_file', 'append_to_file', 'read_file', 'list_folder', 'find_path', 'make_folder', 'rename_path', 'move_path', 'copy_path', 'undo_last_change']

/** What a file command did, in words; null for any other command. */
const FILE_ERRORS: Record<string, MessageKey> = {
  'only text files': 'intent.err.text', 'bad name': 'intent.err.name', exists: 'intent.err.exists', program: 'intent.err.program',
  'too big': 'intent.err.big', 'nothing to undo': 'intent.err.nothingToUndo', 'cannot undo': 'intent.err.cannotUndo',
}
const WHERE_LABELS: Record<string, MessageKey> = { desktop: 'folder.desktop', documents: 'folder.documents', downloads: 'folder.downloads' }

function fileIntentReply(lang: Settings['language'], intent: Intent, r: ToolResult): string | null {
  if (!FILE_TOOLS.includes(intent.tool)) return null
  const where = r.where && WHERE_LABELS[r.where] ? t(lang, WHERE_LABELS[r.where]) : ''
  if (r.error === 'not found') return t(lang, 'intent.noPath', { name: 'name' in intent.args ? intent.args.name : '' })
  if (r.candidates) return t(lang, 'intent.pathMany', { names: r.candidates.map(c => c.name).join(', ') })
  if (r.error) return t(lang, FILE_ERRORS[r.error] ?? 'intent.failed')
  const names = (r.entries ?? []).map(e => (e.isDir ? `${e.name}\\` : e.name)).join(', ')
  switch (intent.tool) {
    case 'create_file': return t(lang, 'intent.fileCreated', { name: r.name ?? '', where })
    case 'append_to_file': return t(lang, r.created ? 'intent.fileCreated' : 'intent.fileAppended', { name: r.name ?? '', where })
    case 'read_file': return r.text?.trim() ? t(lang, 'intent.fileRead', { name: r.name ?? '', text: r.text.trim().slice(0, 600) + (r.truncated || r.text.trim().length > 600 ? '…' : '') }) : t(lang, 'intent.fileEmpty', { name: r.name ?? '' })
    case 'list_folder': return names ? t(lang, 'intent.listed', { where, names, more: (r.total ?? 0) > (r.entries?.length ?? 0) ? '…' : '' }) : t(lang, 'intent.listEmpty', { where })
    case 'find_path': return t(lang, 'intent.found', { paths: (r.matches ?? []).map(m => m.path).join('\n') })
    case 'make_folder': return t(lang, r.existed ? 'intent.folderExists' : 'intent.folderMade', { name: r.name ?? '', where })
    case 'rename_path': return t(lang, 'intent.renamed', { from: r.from ?? '', to: r.to ?? '' })
    case 'move_path': return t(lang, 'intent.moved', { name: r.name ?? '', to: r.to ?? '' })
    case 'copy_path': return t(lang, 'intent.pathCopied', { name: r.name ?? '' })
    case 'undo_last_change': return t(lang, 'intent.undone', { name: r.name ?? '' })
  }
  return null
}

/** Carries out a plain command itself and answers from what really happened. */
async function runIntent(intent: Intent, ctx: ToolContext): Promise<IntentOutcome> {
  const lang = settings.language
  const run = async (i: Intent) => JSON.parse(await runTool(i.tool, JSON.stringify(i.args), ctx)) as ToolResult
  let result = await run(intent)
  // "Open X" is often a file or folder, not an app: look there before giving up.
  if (intent.tool === 'open_app' && result.error?.startsWith('no installed app matches')) {
    const asPath: Intent = { tool: 'open_path', args: { name: intent.args.name, kind: 'any' } }
    const found = await run(asPath)
    if (!found.error) [intent, result] = [asPath, found]
  }
  const done = (reply: string, stored: object = { ok: true }): IntentOutcome => ({ reply, intent, result: stored })
  if (result.declined) return done(t(lang, 'intent.declined'), { declined: true })
  const fileReply = fileIntentReply(lang, intent, result)
  if (fileReply) return done(fileReply, { ok: !result.error })
  if (intent.tool === 'open_path') {
    if (result.error) return done(t(lang, 'intent.noPath', { name: intent.args.name }), { error: result.error })
    if (result.candidates) return done(t(lang, 'intent.pathMany', { names: result.candidates.map(c => c.name).join(', ') }), { ok: false })
    if (result.ok) return done(t(lang, 'intent.path', { name: result.name ?? intent.args.name }))
  }
  if (result.error && intent.tool === 'open_app') return done(t(lang, 'intent.noApp', { name: intent.args.name }), { error: result.error })
  if (result.error || (!result.ok && intent.tool !== 'system_status')) return done(t(lang, 'intent.failed'), { error: result.error ?? 'failed' })
  if (intent.tool === 'take_note') return done(t(lang, 'intent.note', { text: intent.args.text }))
  if (intent.tool === 'open_folder') return done(t(lang, 'intent.folder', { which: t(lang, `folder.${intent.args.which}`) }))
  if (intent.tool === 'open_app') return done(t(lang, 'intent.app', { name: result.opened ?? intent.args.name }))
  if (intent.tool === 'system_status') {
    const s = result as unknown as { battery_percent: number | null; charging: boolean; cpu_percent: number; memory_used_gb: number; memory_total_gb: number }
    const battery = s.battery_percent === null ? t(lang, 'status.noBattery') : t(lang, s.charging ? 'status.charging' : 'status.onBattery', { p: s.battery_percent })
    return done(`${battery} ${t(lang, 'status.load', { cpu: s.cpu_percent, used: s.memory_used_gb, total: s.memory_total_gb })}`)
  }
  if (intent.tool === 'media_control') {
    // Asked once above; the extra step for "a lot" needs no second question.
    for (let i = 1; i < intent.times; i++) await ctx.media(intent.args.action)
    return done(t(lang, `intent.${intent.args.action}`))
  }
  return done(t(lang, 'intent.failed'), { error: 'unhandled' })
}

function setFocus(next: FocusState): void {
  focus = next
  broadcastState()
}

/** Starts (minutes) or stops focus mode; the reply for the balloon. */
function focusCommand(cmd: number | 'stop'): string {
  const lang = settings.language
  if (cmd === 'stop') {
    setFocus({ ...FOCUS_OFF, round: focus.round })
    return t(lang, 'focus.stopped')
  }
  setFocus(startFocus(focus, Date.now(), cmd))
  return t(lang, 'focus.started', { m: cmd })
}

/** Recent answers by id, so a 👍/👎 can save the whole conversation that produced one. */
const rateable = new Map<string, Omit<FeedbackRecord, 'rating'>>()

/** The screen the pet is on as a JPEG (base64), at most 1280 px wide, without the pet itself. */
async function captureScreen(): Promise<string> {
  const display = pet ? screen.getDisplayMatching(pet.getBounds()) : screen.getPrimaryDisplay()
  const width = Math.min(1280, display.size.width)
  pet?.setOpacity(0)
  try {
    await new Promise(r => setTimeout(r, 120)) // let the window actually disappear
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height: Math.round((width * display.size.height) / display.size.width) } })
    const source = sources.find(s => s.display_id === String(display.id)) ?? sources[0]
    if (!source) throw new Error('no screen to capture')
    return source.thumbnail.toJPEG(80).toString('base64')
  } finally {
    pet?.setOpacity(1)
  }
}

/** Asks first, takes one screenshot, shows it to the first server that can see. The image is never saved. */
async function lookAtScreen(question: string, signal: AbortSignal): Promise<string> {
  const lang = settings.language
  if (!(await confirmAction('screen', ''))) return t(lang, 'intent.declined')
  let jpeg: string
  try {
    jpeg = await captureScreen()
  } catch (err) {
    console.error('screen capture failed:', err)
    return t(lang, 'intent.failed')
  }
  const system = systemPrompt(currentCharacter().persona[lang], lang)
  for (const server of settings.ai.servers) {
    try {
      const model = server.model || (await listModels(server.baseUrl, server.apiKey))[0]
      if (model) return (await askAboutImage(server, model, system, withClock(question, lang, new Date()), jpeg, signal)) || '…'
    } catch (err) {
      if (signal.aborted) return ''
      console.error(`screen question via ${server.baseUrl} failed:`, err) // most often: not a vision model
    }
  }
  return t(lang, 'screen.noVision')
}

/** Tries each server in order; the first that answers wins. */
async function chat(text: string, mayDiscover = true): Promise<void> {
  chatAbort?.abort()
  const abort = (chatAbort = new AbortController())
  const lang = settings.language
  const ctx = toolContext()
  const now = new Date()
  const brain = brainDir()
  ensureBrain(brain, lang)
  const focusCmd = mayDiscover ? matchFocus(text) : null
  if (focusCmd !== null) {
    const reply = focusCommand(focusCmd)
    appendExchange(brain, new Date(), lang, currentCharacter().name, text, reply)
    return send({ type: 'ai', event: 'done', text: reply })
  }
  const screenQuestion = settings.ai.tools.actions && mayDiscover ? matchScreen(text) : null
  if (screenQuestion) {
    const reply = await lookAtScreen(screenQuestion, abort.signal)
    if (abort.signal.aborted) return
    appendExchange(brain, new Date(), lang, currentCharacter().name, text, reply)
    return send({ type: 'ai', event: 'done', text: reply })
  }
  const intent = settings.ai.tools.actions && mayDiscover ? matchIntent(text, lang) : null
  if (intent) {
    const { reply, intent: ran, result } = await runIntent(intent, ctx)
    appendExchange(brain, new Date(), lang, currentCharacter().name, text, reply, { tool: ran.tool, args: ran.args, result })
    return send({ type: 'ai', event: 'done', text: reply })
  }
  const known = [ctx.allowMemory ? memoryBlock(currentFacts(), lang) : '', pastBlock(pastDays(brain, now, 2), lang)].filter(Boolean).join('\n\n')
  // A cut can land inside a tool turn; history must open on a user message.
  const recent = dropLooped(todaysMessages(brain, now)).slice(-CHAT_MEMORY)
  const history = recent.slice(Math.max(0, recent.findIndex(m => m.role === 'user')))
  const earlier = history.filter(m => m.role === 'assistant' && m.content).slice(-3).map(m => m.content)
  const messages: HistoryMessage[] = [
    { role: 'system', content: systemPrompt(currentCharacter().persona[lang], lang, known) },
    ...history,
    { role: 'user', content: withClock(text, lang, now) },
  ]
  for (const [i, server] of settings.ai.servers.entries()) {
    try {
      const model = server.model || (await listModels(server.baseUrl, server.apiKey))[0]
      if (!model) continue
      let remembered = false
      let usedTool = false
      const run = (name: string, args: string) => ((usedTool = true), (remembered ||= name === 'remember'), runTool(name, args, ctx))
      const defs = toolDefinitions(ctx)
      let answer = await chatWithTools(server, model, messages, defs, run, abort.signal)
      // A small model copies its last reply; one hotter retry with a nudge breaks most loops.
      if (answer && !usedTool && isRepeat(answer, earlier)) {
        const again = await chatWithTools(server, model, messages, defs, run, abort.signal, 4, { temperature: 0.9, note: REPEAT_NOTE[lang] })
        if (again && closest(again, earlier) < closest(answer, earlier)) answer = again
      }
      if (currentCharacter().id !== 'atlas') answer = stripVocative(answer)
      answer ||= '…'
      appendExchange(brain, new Date(), lang, currentCharacter().name, text, answer)
      const id = String(Date.now())
      rateable.set(id, { time: new Date().toISOString(), character: currentCharacter().id, model, messages, answer })
      if (rateable.size > 20) rateable.delete(rateable.keys().next().value!)
      send({ type: 'ai', event: 'done', text: answer, id })
      void summarizePastDays(server, model)
      // Small models often chat past a self-introduction without saving it; a second,
      // memory-only pass after the reply is on screen catches those without a wait.
      if (ctx.allowMemory && !remembered && looksPersonal(text)) void extractFacts(server, model, text, ctx)
      return
    } catch (err) {
      if (abort.signal.aborted) return
      if (err instanceof UnauthorizedError) return askForKey(text, i)
      console.error(`chat via ${server.baseUrl} failed:`, err)
    }
  }
  // Nothing on the list answered: look on the usual ports before giving up.
  if (mayDiscover && (await discoverServers())) return chat(text, false)
  // Someone with servers of their own that are just off gets the offer once, not on every message.
  if (mayDiscover && localModel.status() !== 'installed' && (!settings.ai.builtIn.offered || settings.ai.servers.length === 0)) return offerModel(text)
  const url = settings.ai.servers[0]?.baseUrl ?? 'localhost'
  send({ type: 'ai', event: 'error', text: t(lang, 'chat.noServer', { url }) })
}

ipcMain.on('ai-chat', (_e, text: string) => void chat(String(text).slice(0, 2000)))
ipcMain.on('ai-key', (_e, key: string) => {
  const waiting = pendingKey
  pendingKey = null
  if (!waiting || !settings.ai.servers[waiting.server]) return
  const servers = settings.ai.servers.map((s, i) => (i === waiting.server ? { ...s, apiKey: String(key).trim() } : s))
  applySettings({ ...settings, ai: { ...settings.ai, servers } })
  void chat(waiting.text, false)
})
ipcMain.on('ai-stop', () => chatAbort?.abort())
ipcMain.on('rate', (_e, id: string, rating: 'up' | 'down') => {
  const entry = rateable.get(id)
  if (!entry || (rating !== 'up' && rating !== 'down')) return
  rateable.delete(id) // one rating per answer
  appendFeedback(brainDir(), { ...entry, rating })
})
ipcMain.handle('focus', (_e, on: boolean) => focusCommand(on ? FOCUS_MINUTES : 'stop'))
ipcMain.handle('ai-detect', () => detectServers())
ipcMain.handle('ai-models', (_e, server: { baseUrl: string; apiKey: string }) =>
  listModels(server.baseUrl, server.apiKey).catch(() => [] as string[]),
)
ipcMain.on('memory-delete', (_e, id: string) => setFacts(currentFacts().filter(f => f.id !== id)))
ipcMain.on('memory-clear', () => setFacts([]))
ipcMain.handle('brain-open', () => openBrain())
ipcMain.handle('brain-choose', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], defaultPath: brainDir() })
  if (r.canceled || !r.filePaths[0]) return stateForWindows()
  applySettings({ ...settings, ai: { ...settings.ai, brainDir: r.filePaths[0] } })
  ensureBrain(brainDir(), settings.language)
  return stateForWindows()
})
// Typing into the balloon needs keyboard focus, which an inactive pet window lacks.
ipcMain.on('focus-pet', () => pet?.focus())

// ---- Talking by voice ------------------------------------------------------------

let shortcutOk = true
let registeredShortcut = ''

/** (Re)binds the push-to-talk shortcut; a key another app holds leaves `shortcutOk` false for the settings window. */
function registerShortcut(): void {
  const want = settings.voice.enabled ? settings.voice.shortcut.trim() : ''
  if (want === registeredShortcut) return
  if (registeredShortcut) globalShortcut.unregister(registeredShortcut)
  registeredShortcut = ''
  shortcutOk = true
  if (!want) return
  try {
    shortcutOk = globalShortcut.register(want, () => {
      if (!pet) createPet()
      pet?.showInactive()
      send({ type: 'listen' })
    })
  } catch {
    shortcutOk = false // not a valid accelerator
  }
  if (shortcutOk) registeredShortcut = want
}

function voiceStatus() {
  const whisper = findWhisper(settings.voice.whisperPath)
  return { whisper, model: findModel(settings.voice.modelPath, whisper), shortcutOk }
}

ipcMain.handle('voice-transcribe', async (_e, wav: ArrayBuffer): Promise<{ text: string } | { error: string }> => {
  const lang = settings.language
  const { whisper, model } = voiceStatus()
  if (!whisper || !model) return { error: t(lang, whisper ? 'voice.noModel' : 'voice.noWhisper') }
  try {
    return { text: await transcribe(whisper, model, Buffer.from(wav), lang) }
  } catch (err) {
    console.error('whisper failed:', err)
    return { error: t(lang, 'voice.failed') }
  }
})
ipcMain.handle('voice-choose', async (_e, which: 'whisper' | 'model') => {
  const filters = which === 'whisper' ? [{ name: 'whisper-cli', extensions: ['exe'] }] : [{ name: 'ggml', extensions: ['bin'] }]
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters })
  if (!r.canceled && r.filePaths[0])
    applySettings({ ...settings, voice: { ...settings.voice, [which === 'whisper' ? 'whisperPath' : 'modelPath']: r.filePaths[0] } })
  return stateForWindows()
})

// ---- IPC --------------------------------------------------------------------

ipcMain.handle('get-state', () => stateForWindows())

ipcMain.on('set-interactive', (_e, isInteractive: boolean) => {
  pet?.setIgnoreMouseEvents(!isInteractive, { forward: true })
})

ipcMain.on('drag-start', (_e, offset: { x: number; y: number }) => {
  if (!pet || dragTimer) return
  body = null
  dragSamples = []
  // Follow the cursor from here: pointer events stop once it leaves the small window.
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint()
    dragSamples.push({ t: Date.now(), x: p.x, y: p.y })
    if (dragSamples.length > 12) dragSamples.shift()
    movePet(p.x - offset.x, p.y - offset.y)
    // Held by the scruff it swings behind the cursor like a pendulum.
    showFlight(false, throwVelocity(dragSamples).vx / 40)
  }, 16)
})

ipcMain.on('drag-end', () => {
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = null
  // Let go: it flies on with the cursor's last speed and falls.
  walk.pending = 0
  if (pet && settings.physics) body = { ...feet(), ...throwVelocity(dragSamples), airborne: true }
  savePosition()
})

ipcMain.handle('move-by', (_e, dx: number) => {
  if (!pet) return { atEdge: true }
  if (body) return { atEdge: false } // no walking in mid-air
  const [x, y] = pet.getPosition()
  // Where the walk is heading: the window may still be on its way from the last step.
  const from = x + walk.pending
  const area = screen.getDisplayNearestPoint({ x: from + petW() / 2, y: y + petH() / 2 }).workArea
  const to = Math.max(area.x - petW() / 4, Math.min(area.x + area.width - (petW() * 3) / 4, from + dx))
  walk.pending += to - from
  walk.rate = Math.abs(walk.pending) * 10 // arrive by the next step, 100 ms from now
  return { atEdge: to !== from + dx, moved: to - from }
})

ipcMain.on('walk-ended', savePosition)
ipcMain.on('open-settings', openSettings)
ipcMain.on('open-characters-folder', openCharactersFolder)
ipcMain.on('context-menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: pet ?? undefined }))
ipcMain.on('hide-pet', () => {
  pet?.hide()
  rebuildTray()
})

ipcMain.on('model-install', () => void installModel())
ipcMain.on('model-cancel', () => installing?.abort())
ipcMain.on('model-doc', () => void shell.openExternal('https://github.com/tungarix/pati/blob/main/docs/PATI-4B.md'))
ipcMain.on('model-remove', async () => {
  if (installing) return
  await localModel.uninstall()
  modelError = ''
  setManagedServer(null)
})

ipcMain.handle('save-settings', (_e, next: Settings) => {
  applySettings(next)
  void syncBuiltIn()
  return stateForWindows()
})

ipcMain.handle('reload-characters', () => {
  reloadCharacters()
  broadcastState()
  return stateForWindows()
})

// ---- Lifecycle --------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!pet) createPet()
    pet?.showInactive()
    send({ type: 'menu' })
  })

  app.whenReady().then(() => {
    settings = loadSettings(SETTINGS_FILE, detectLang(app.getLocale()))
    ensureBrain(brainDir(), settings.language)
    migrateOldMemory()
    reloadCharacters()
    if (characters.length === 0) {
      console.error('Hiç karakter paketi bulunamadı:', BUILT_IN_DIR, problems)
      app.quit()
      return
    }
    createPet()
    rebuildTray()
    registerShortcut()
    startTimers()
    startPhysics()
    void syncBuiltIn()
    // First start with no local AI anywhere: offer Pati-4B once, after the greeting.
    setTimeout(async () => {
      if (settings.ai.builtIn.offered || !settings.ai.enabled || localModel.status() === 'installed' || settings.ai.servers.length > 0) return
      if ((await detectServers()).length === 0) void offerModel()
    }, 10_000)
  })

  // The pet lives in the tray: closing the settings window must not quit.
  app.on('window-all-closed', () => {})
  app.on('will-quit', () => (globalShortcut.unregisterAll(), stopWindowWatch?.(), void localModel.stop()))
}
