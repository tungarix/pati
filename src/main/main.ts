import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, Tray } from 'electron'

import { detectLang, t } from '../shared/i18n.ts'
import type { AiServer, Character, PetCommand, Settings } from '../shared/types.ts'
import { chatWithTools, detectServers, listModels, systemPrompt, UnauthorizedError, withClock, type ChatMessage } from './ai.ts'
import { loadCharacters, type PackProblem } from './characters.ts'
import { addFact, forgetFacts, loadFacts, looksPersonal, memoryBlock, saveFacts, type Fact } from './memory.ts'
import { appendExchange, ensureBrain, getSummary, MEMORY_NOTE, pastBlock, pastDays, SUMMARY_PROMPT, todaysMessages, transcript, withSummary } from './brain.ts'
import { dueReminders, type FiredLog } from './reminders.ts'
import { loadSettings, saveSettings } from './settings.ts'
import { bestMatch, findShortcut, MEDIA_KEYS, websiteUrl, type ActionKind, type Folder, type MediaAction } from './actions.ts'
import { INITIAL_PROACTIVE, proactiveStep, type ProactiveEvent, type ProactiveState } from './proactive.ts'
import { matchIntent, type Intent } from './intents.ts'
import { runTool, toolDefinitions, type ToolContext } from './tools.ts'

const PET_W = 340
const PET_H = 460

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
/** How much of today's chat the model sees again. */
const CHAT_MEMORY = 20

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
  return { settings, character: currentCharacter(), characters, problems, userDir: USER_DIR, facts: currentFacts(), brainDir: brainDir() }
}

// ---- The pet window ---------------------------------------------------------

function startPosition(): { x: number; y: number } {
  const saved = settings.position
  if (saved) {
    // Keep it only if it still lands on a connected screen.
    const area = screen.getDisplayNearestPoint(saved).workArea
    if (saved.x >= area.x - PET_W / 2 && saved.x <= area.x + area.width - PET_W / 2 && saved.y >= area.y - PET_H / 2 && saved.y <= area.y + area.height - PET_H / 2)
      return saved
  }
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x + area.width - PET_W - 40, y: area.y + area.height - PET_H }
}

function createPet(): void {
  const { x, y } = startPosition()
  pet = new BrowserWindow({
    width: PET_W,
    height: PET_H,
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
  settings = next
  saveSettings(SETTINGS_FILE, settings)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.openAtLogin })
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
    if (settings.proactive.enabled) void speakUnasked(r.event)
  }, 30_000)

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
    if (getSummary(day.md) || !text) continue
    try {
      const summary = await chatWithTools(server, model, [{ role: 'system', content: SUMMARY_PROMPT[lang] }, { role: 'user', content: text }], [],
        async () => '', AbortSignal.timeout(180_000))
      // Re-read: the day's note may have changed while the model was summarizing.
      if (summary) fs.writeFileSync(day.file, withSummary(fs.readFileSync(day.file, 'utf8'), lang, summary), 'utf8')
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

/** Carries out a plain command itself and answers from what really happened. */
async function runIntent(intent: Intent, ctx: ToolContext): Promise<string> {
  const lang = settings.language
  const result = JSON.parse(await runTool(intent.tool, JSON.stringify(intent.args), ctx)) as { ok?: boolean; declined?: boolean; error?: string }
  if (result.declined) return t(lang, 'intent.declined')
  if (result.error && intent.tool === 'open_app') return t(lang, 'intent.noApp', { name: intent.args.name })
  if (result.error || (!result.ok && intent.tool !== 'system_status')) return t(lang, 'intent.failed')
  if (intent.tool === 'take_note') return t(lang, 'intent.note', { text: intent.args.text })
  if (intent.tool === 'open_folder') return t(lang, 'intent.folder', { which: t(lang, `folder.${intent.args.which}`) })
  if (intent.tool === 'open_app') return t(lang, 'intent.app', { name: (result as unknown as { opened: string }).opened })
  if (intent.tool === 'system_status') {
    const s = result as unknown as { battery_percent: number | null; charging: boolean; cpu_percent: number; memory_used_gb: number; memory_total_gb: number }
    const battery = s.battery_percent === null ? t(lang, 'status.noBattery') : t(lang, s.charging ? 'status.charging' : 'status.onBattery', { p: s.battery_percent })
    return `${battery} ${t(lang, 'status.load', { cpu: s.cpu_percent, used: s.memory_used_gb, total: s.memory_total_gb })}`
  }
  // Asked once above; the extra step for "a lot" needs no second question.
  for (let i = 1; i < intent.times; i++) await ctx.media(intent.args.action)
  return t(lang, `intent.${intent.args.action}`)
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
  const intent = settings.ai.tools.actions && mayDiscover ? matchIntent(text, lang) : null
  if (intent) {
    const reply = await runIntent(intent, ctx)
    appendExchange(brain, new Date(), lang, currentCharacter().name, text, reply)
    return send({ type: 'ai', event: 'done', text: reply })
  }
  const known = [ctx.allowMemory ? memoryBlock(currentFacts(), lang) : '', pastBlock(pastDays(brain, now, 3), lang)].filter(Boolean).join('\n\n')
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(currentCharacter().persona[lang], lang, known) },
    ...todaysMessages(brain, now).slice(-CHAT_MEMORY),
    { role: 'user', content: withClock(text, lang, now) },
  ]
  for (const [i, server] of settings.ai.servers.entries()) {
    try {
      const model = server.model || (await listModels(server.baseUrl, server.apiKey))[0]
      if (!model) continue
      let remembered = false
      const run = (name: string, args: string) => ((remembered ||= name === 'remember'), runTool(name, args, ctx))
      const answer = (await chatWithTools(server, model, messages, toolDefinitions(ctx), run, abort.signal)) || '…'
      appendExchange(brain, new Date(), lang, currentCharacter().name, text, answer)
      send({ type: 'ai', event: 'done', text: answer })
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

// ---- IPC --------------------------------------------------------------------

ipcMain.handle('get-state', () => stateForWindows())

ipcMain.on('set-interactive', (_e, isInteractive: boolean) => {
  pet?.setIgnoreMouseEvents(!isInteractive, { forward: true })
})

ipcMain.on('drag-start', (_e, offset: { x: number; y: number }) => {
  if (!pet || dragTimer) return
  // Follow the cursor from here: pointer events stop once it leaves the small window.
  dragTimer = setInterval(() => {
    const p = screen.getCursorScreenPoint()
    pet?.setPosition(Math.round(p.x - offset.x), Math.round(p.y - offset.y))
  }, 16)
})

ipcMain.on('drag-end', () => {
  if (dragTimer) clearInterval(dragTimer)
  dragTimer = null
  savePosition()
})

ipcMain.handle('move-by', (_e, dx: number) => {
  if (!pet) return { atEdge: true }
  const [x, y] = pet.getPosition()
  const area = screen.getDisplayNearestPoint({ x: x + PET_W / 2, y: y + PET_H / 2 }).workArea
  const nx = Math.max(area.x - PET_W / 4, Math.min(area.x + area.width - (PET_W * 3) / 4, x + dx))
  pet.setPosition(Math.round(nx), y)
  return { atEdge: nx !== x + dx }
})

ipcMain.on('walk-ended', savePosition)
ipcMain.on('open-settings', openSettings)
ipcMain.on('open-characters-folder', openCharactersFolder)
ipcMain.on('context-menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window: pet ?? undefined }))
ipcMain.on('hide-pet', () => {
  pet?.hide()
  rebuildTray()
})

ipcMain.handle('save-settings', (_e, next: Settings) => {
  applySettings(next)
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
    startTimers()
  })

  // The pet lives in the tray: closing the settings window must not quit.
  app.on('window-all-closed', () => {})
}
