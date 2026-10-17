// Functions the chat model may call (OpenAI tool format). Everything outside the
// app goes through the context, so tests can stand in for it.

import type { Lang } from '../shared/types.ts'
import { cleanAppName, FOLDERS, MEDIA_ACTIONS, websiteUrl, type ActionKind, type Folder, type MediaAction } from './actions.ts'

export interface ToolContext {
  lang: Lang
  allowMemory: boolean
  allowClipboard: boolean
  allowWeb: boolean
  now: () => Date
  remember: (text: string) => void
  forget: (text: string) => number
  addReminder: (text: string, at: number) => void
  readClipboard: () => string
  fetchJson: (url: string) => Promise<unknown>
  allowActions: boolean
  /** Asks the user before an action, unless they said "always" for this kind. */
  confirm: (kind: ActionKind, what: string) => Promise<boolean>
  /** Launches the best matching app; resolves its shortcut name, or null if none matched. */
  openApp: (name: string) => Promise<string | null>
  openUrl: (url: string) => Promise<void>
  media: (action: MediaAction) => Promise<void>
  openFolder: (which: Folder) => Promise<void>
  systemStatus: () => Promise<object>
  takeNote: (text: string) => void
}

interface ToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

const tool = (name: string, description: string, properties: object = {}, required: string[] = []): ToolDef => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

/** Only the tools this user allowed; a model never hears of the rest. */
export function toolDefinitions(ctx: Pick<ToolContext, 'allowMemory' | 'allowClipboard' | 'allowWeb'> & { allowActions?: boolean }): ToolDef[] {
  const defs = [
    tool('set_reminder', 'Set a one-time reminder. Give either a clock time today/tomorrow ("17:30") or minutes from now.', {
      text: { type: 'string', description: 'What to remind' },
      at: { type: 'string', description: 'HH:MM, 24-hour' },
      in_minutes: { type: 'number' },
    }, ['text']),
  ]
  if (ctx.allowMemory) defs.push(
    tool('remember', 'Save one lasting fact the user just told you about themselves: name, age, school, job, hobby, likes/dislikes, goals. Call it once per fact, before answering. Not for small talk.', {
      fact: { type: 'string', description: 'The fact, short, in the user\'s language' },
    }, ['fact']),
    tool('forget', 'Delete saved facts that contain the given words, when the user asks you to forget something.', {
      text: { type: 'string' },
    }, ['text']),
  )
  if (ctx.allowActions) defs.push(
    tool('open_app', 'Open an app installed on the computer ("aç", "başlat"), e.g. Spotify, Discord, Visual Studio Code, Calculator.', {
      name: { type: 'string', description: 'The app name as the user said it' },
    }, ['name']),
    tool('open_website', 'Open a website in the browser, or search the web. For YouTube or Google searches pass a full URL with the query.', {
      url: { type: 'string', description: 'Full http(s) address' },
      query: { type: 'string', description: 'Words to search on Google when there is no address' },
    }),
    tool('media_control', 'Control the computer\'s sound and music: make the volume louder or quieter ("sesi aç", "sesi kıs"), mute, play or pause music ("müziği durdur"), next or previous track. Call it once per step; for "a lot" call it twice.', {
      action: { type: 'string', enum: MEDIA_ACTIONS },
    }, ['action']),
    tool('open_folder', 'Open a folder in File Explorer.', { which: { type: 'string', enum: FOLDERS } }, ['which']),
    tool('system_status', 'Battery level, CPU and memory use, and uptime of this computer.'),
    tool('take_note', 'Save a note when the user asks to note, write down or remember a task ("not al", "not et", "yaz bunu", "unutmayayım"). Always call it for such requests; you cannot keep notes without it.', {
      text: { type: 'string' },
    }, ['text']),
  )
  if (ctx.allowClipboard) defs.push(tool('read_clipboard', 'Read the text the user copied, when they ask about "this", "what I copied" or the clipboard.'))
  if (ctx.allowWeb) {
    defs.push(tool('get_weather', 'Current weather and today\'s high/low for a city.', { city: { type: 'string' } }, ['city']))
    defs.push(tool('wikipedia', 'Short encyclopedia summary of a topic, person or place. Use it instead of guessing facts.', {
      topic: { type: 'string' },
    }, ['topic']))
  }
  return defs
}

/** When a reminder should fire: "HH:MM" (tomorrow if already past) or minutes from now. */
export function reminderTime(args: { at?: string; in_minutes?: number }, now: Date): number | null {
  if (typeof args.in_minutes === 'number' && args.in_minutes > 0) return now.getTime() + Math.round(args.in_minutes * 60_000)
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(args.at?.trim() ?? '')
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  const at = new Date(now)
  at.setHours(Number(m[1]), Number(m[2]), 0, 0)
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
  return at.getTime()
}

async function weather(city: string, ctx: ToolContext): Promise<unknown> {
  const geo = (await ctx.fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=${ctx.lang}&name=${encodeURIComponent(city)}`,
  )) as { results?: { name: string; country?: string; latitude: number; longitude: number }[] }
  const place = geo.results?.[0]
  if (!place) return { error: `city not found: ${city}` }
  const f = (await ctx.fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto',
  )) as { current?: object; daily?: object }
  return { place: `${place.name}${place.country ? `, ${place.country}` : ''}`, current: f.current, today: f.daily, weather_code_doc: 'WMO codes' }
}

async function wikipedia(topic: string, ctx: ToolContext): Promise<unknown> {
  const base = `https://${ctx.lang}.wikipedia.org`
  const found = (await ctx.fetchJson(
    `${base}/w/api.php?action=opensearch&limit=1&format=json&search=${encodeURIComponent(topic)}`,
  )) as [string, string[]]
  const title = found?.[1]?.[0]
  if (!title) return { error: `no article for: ${topic}` }
  const page = (await ctx.fetchJson(`${base}/api/rest_v1/page/summary/${encodeURIComponent(title)}`)) as { title?: string; extract?: string }
  return { title: page.title, summary: page.extract?.slice(0, 1200) }
}

/** Runs one tool call and returns what the model reads back, always a string. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  let args: Record<string, unknown>
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return JSON.stringify({ error: 'arguments were not valid JSON' })
  }
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim() : '')
  try {
    switch (name) {
      case 'remember':
        if (!ctx.allowMemory) break
        if (!str('fact')) return JSON.stringify({ error: 'empty fact' })
        ctx.remember(str('fact'))
        return JSON.stringify({ ok: true })
      case 'forget':
        if (!ctx.allowMemory) break
        return JSON.stringify({ removed: ctx.forget(str('text')) })
      case 'set_reminder': {
        const at = reminderTime({ at: str('at') || undefined, in_minutes: args.in_minutes as number }, ctx.now())
        if (!str('text') || at === null) return JSON.stringify({ error: 'need text and a valid "at" (HH:MM) or in_minutes' })
        ctx.addReminder(str('text'), at)
        return JSON.stringify({ ok: true, at: new Date(at).toLocaleString(ctx.lang === 'tr' ? 'tr-TR' : 'en-GB') })
      }
      case 'open_app': {
        const appName = cleanAppName(str('name'))
        if (!ctx.allowActions || !appName) break
        if (!(await ctx.confirm('open_app', appName))) return JSON.stringify({ declined: true })
        const opened = await ctx.openApp(appName)
        return JSON.stringify(opened ? { ok: true, opened } : { error: `no installed app matches "${appName}"` })
      }
      case 'open_website': {
        if (!ctx.allowActions) break
        const url = websiteUrl({ url: str('url') || undefined, query: str('query') || undefined })
        if (!url) return JSON.stringify({ error: 'need an http(s) url or search words' })
        if (!(await ctx.confirm('open_website', new URL(url).host))) return JSON.stringify({ declined: true })
        await ctx.openUrl(url)
        return JSON.stringify({ ok: true, opened: url })
      }
      case 'media_control': {
        const action = str('action') as MediaAction
        if (!ctx.allowActions || !MEDIA_ACTIONS.includes(action)) break
        if (!(await ctx.confirm('media', action))) return JSON.stringify({ declined: true })
        await ctx.media(action)
        return JSON.stringify({ ok: true })
      }
      case 'open_folder': {
        const which = str('which') as Folder
        if (!ctx.allowActions || !FOLDERS.includes(which)) break
        if (!(await ctx.confirm('open_folder', which))) return JSON.stringify({ declined: true })
        await ctx.openFolder(which)
        return JSON.stringify({ ok: true })
      }
      case 'system_status':
        if (!ctx.allowActions) break
        return JSON.stringify(await ctx.systemStatus())
      case 'take_note':
        if (!ctx.allowActions || !str('text')) break
        ctx.takeNote(str('text'))
        return JSON.stringify({ ok: true })
      case 'read_clipboard':
        if (!ctx.allowClipboard) break
        return JSON.stringify({ text: ctx.readClipboard().slice(0, 4000) })
      case 'get_weather':
        if (!ctx.allowWeb) break
        return JSON.stringify(await weather(str('city'), ctx))
      case 'wikipedia':
        if (!ctx.allowWeb) break
        return JSON.stringify(await wikipedia(str('topic'), ctx))
    }
    return JSON.stringify({ error: `unknown or disabled tool: ${name}` })
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message })
  }
}
