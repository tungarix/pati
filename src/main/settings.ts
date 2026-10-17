import fs from 'node:fs'
import path from 'node:path'

import type { Lang, Settings } from '../shared/types.ts'

export const DEFAULT_SETTINGS: Settings = {
  language: 'tr',
  look: 'modern',
  characterId: 'tungarix',
  speech: { enabled: true, voiceName: null, rate: 1, pitch: 1 },
  tips: { enabled: true, minMinutes: 20, maxMinutes: 40 },
  // No servers yet: the first chat looks for one on the usual local ports.
  ai: { enabled: true, servers: [], memory: true, tools: { clipboard: false, web: false, actions: true }, allowedActions: [], brainDir: '' },
  proactive: { enabled: true, briefing: true, lateNight: true, breaks: true },
  sleepAfterSeconds: 120,
  wander: true,
  openAtLogin: false,
  reminders: [
    { id: 'su', text: 'Su içmeyi unutma!', enabled: true, kind: 'interval', minutes: 60 },
    { id: 'goz', text: 'Gözlerini dinlendir: 20 saniye uzağa bak.', enabled: false, kind: 'interval', minutes: 45 },
  ],
  position: null,
}

type SavedAi = Partial<Settings['ai']> & { baseUrl?: string; apiKey?: string; model?: string }

/** v0.2 kept one server inline (`baseUrl`, `apiKey`, `model`); it becomes the first of the list. */
function migrateAi(saved: SavedAi | undefined): Settings['ai'] {
  const d = DEFAULT_SETTINGS.ai
  const servers = Array.isArray(saved?.servers)
    ? saved.servers
    : saved?.baseUrl
      ? [{ baseUrl: saved.baseUrl, apiKey: saved.apiKey ?? '', model: saved.model ?? '' }]
      : []
  return {
    enabled: saved?.enabled ?? d.enabled,
    servers,
    memory: saved?.memory ?? d.memory,
    tools: { ...d.tools, ...saved?.tools },
    allowedActions: Array.isArray(saved?.allowedActions) ? saved.allowedActions : d.allowedActions,
    brainDir: typeof saved?.brainDir === 'string' ? saved.brainDir : d.brainDir,
  }
}

/** Settings from disk, every missing field filled from the defaults; first run takes `firstRunLang`. */
export function loadSettings(file: string, firstRunLang: Lang): Settings {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Settings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      speech: { ...DEFAULT_SETTINGS.speech, ...saved.speech },
      tips: { ...DEFAULT_SETTINGS.tips, ...saved.tips },
      ai: migrateAi(saved.ai),
      proactive: { ...DEFAULT_SETTINGS.proactive, ...saved.proactive },
      reminders: Array.isArray(saved.reminders) ? saved.reminders : DEFAULT_SETTINGS.reminders,
    }
  } catch {
    return { ...structuredClone(DEFAULT_SETTINGS), language: firstRunLang }
  }
}

export function saveSettings(file: string, settings: Settings): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf8')
}
