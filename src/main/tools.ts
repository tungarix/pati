// Functions the chat model may call (OpenAI tool format). Everything outside the
// app goes through the context, so tests can stand in for it.

import { basename } from 'node:path'

import type { Lang } from '../shared/types.ts'
import { BLOCKED_EXT, cleanAppName, cleanPathName, FOLDERS, MEDIA_ACTIONS, PATH_ROOTS, rootOf, websiteUrl, type ActionKind, type Folder, type MediaAction, type PathMatch, type PathRoot } from './actions.ts'
import { appendText, createTextFile, listDir, makeDir, moveItem, READ_EXT, readText, renameItem, TEXT_EXT, undoLast } from './files.ts'

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
  /** Files/folders on the Desktop, Documents and Downloads named like `name`, best first. */
  findPaths: (name: string, kind: 'file' | 'folder' | 'any', where?: PathRoot) => Promise<PathMatch[]>
  openPath: (p: string) => Promise<void>
  /** Absolute paths of the Desktop, Documents and Downloads: the only places files are written. */
  fileRoots: Record<PathRoot, string>
  writeClipboard: (text: string) => void
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
    tool('open_path', 'Open a file or folder BY NAME from the Desktop, Documents or Downloads. Use for "X dosyasını aç", "rapor klasörünü aç". For apps use open_app.', {
      name: { type: 'string', description: 'What the user called it' },
      kind: { type: 'string', enum: ['file', 'folder', 'any'] },
      where: { type: 'string', enum: [...PATH_ROOTS] },
    }, ['name']),
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

const extOf = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase()
const refuse = (error: string) => JSON.stringify({ error })

/** The one item a name means, or the reply to give instead: not found, or which of several. */
async function pick(
  ctx: ToolContext,
  name: string,
  kind: 'file' | 'folder' | 'any',
  where: PathRoot | undefined,
  allowed: (m: PathMatch) => boolean = () => true,
): Promise<{ match: PathMatch } | { reply: string }> {
  const found = (await ctx.findPaths(name, kind, where)).filter(m => (m.isDir || !BLOCKED_EXT.includes(extOf(m.name))) && allowed(m))
  if (!found.length) return { reply: refuse('not found') }
  const ties = found.filter(m => m.score === found[0].score)
  if (ties.length > 1) return { reply: JSON.stringify({ ok: false, candidates: ties.slice(0, 3).map(m => ({ name: m.name, path: m.path, isDir: m.isDir })) }) }
  return { match: found[0] }
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
      case 'open_path': {
        const c = cleanPathName(str('name'))
        const kind = ['file', 'folder', 'any'].includes(str('kind')) ? (str('kind') as 'file' | 'folder' | 'any') : c.kind
        const where = PATH_ROOTS.includes(str('where') as PathRoot) ? (str('where') as PathRoot) : c.where
        if (!ctx.allowActions || !c.name) break
        // Programs never open by name, whatever the finder returned.
        const found = (await ctx.findPaths(c.name, kind, where)).filter(m => m.isDir || !BLOCKED_EXT.includes(m.name.slice(m.name.lastIndexOf('.')).toLowerCase()))
        if (!found.length) return JSON.stringify({ error: 'not found' })
        const match = found[0]
        const ties = found.filter(m => m.score === match.score)
        if (ties.length > 1) return JSON.stringify({ ok: false, candidates: ties.slice(0, 3).map(m => ({ name: m.name, path: m.path, isDir: m.isDir })) })
        if (!(await ctx.confirm('open_path', match.name))) return JSON.stringify({ declined: true })
        await ctx.openPath(match.path)
        return JSON.stringify({ ok: true, opened: match.path, name: match.name, isDir: match.isDir })
      }
      // The file tools below are not offered to the model (the pet runs them from plain
      // commands, see intents.ts), but they stay behind the same switch and questions.
      case 'create_file': {
        if (!ctx.allowActions || !str('name')) break
        const where = rootOf(str('where')) ?? 'desktop'
        if (!(await ctx.confirm('create_file', `${str('name')} → ${basename(ctx.fileRoots[where])}`))) return JSON.stringify({ declined: true })
        const made = await createTextFile(ctx.fileRoots[where], str('name'), str('content'), Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, name: made.name, path: made.path, where })
      }
      case 'append_to_file': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name || !str('text')) break
        const roots = Object.values(ctx.fileRoots)
        const got = await pick(ctx, c.name, 'file', c.where, m => TEXT_EXT.includes(extOf(m.name)))
        if ('reply' in got) {
          // "alışveriş listesine süt ekle" with no list yet starts one.
          if (args.create !== true || !got.reply.includes('not found')) return got.reply
          if (!(await ctx.confirm('create_file', `${c.name} → ${basename(ctx.fileRoots[c.where ?? 'desktop'])}`))) return JSON.stringify({ declined: true })
          const made = await createTextFile(ctx.fileRoots[c.where ?? 'desktop'], c.name, str('text') + '\n', roots)
          return JSON.stringify({ ok: true, created: true, name: made.name, where: c.where ?? 'desktop' })
        }
        if (!(await ctx.confirm('append_file', got.match.name))) return JSON.stringify({ declined: true })
        await appendText(got.match.path, str('text'), roots)
        return JSON.stringify({ ok: true, name: got.match.name })
      }
      case 'read_file': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name) break
        const got = await pick(ctx, c.name, 'file', c.where, m => READ_EXT.includes(extOf(m.name)))
        if ('reply' in got) return got.reply
        if (!(await ctx.confirm('read_file', got.match.name))) return JSON.stringify({ declined: true })
        return JSON.stringify({ ok: true, name: got.match.name, ...(await readText(got.match.path, Object.values(ctx.fileRoots))) })
      }
      case 'list_folder': {
        if (!ctx.allowActions) break
        const where = rootOf(str('where')) ?? 'desktop'
        const listed = await listDir(ctx.fileRoots[where], Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, where, ...listed })
      }
      case 'find_path': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name) break
        const kind = ['file', 'folder', 'any'].includes(str('kind')) ? (str('kind') as 'file' | 'folder' | 'any') : c.kind
        const found = (await ctx.findPaths(c.name, kind, c.where)).filter(m => m.isDir || !BLOCKED_EXT.includes(extOf(m.name)))
        return found.length ? JSON.stringify({ ok: true, matches: found.map(m => ({ name: m.name, path: m.path, isDir: m.isDir })) }) : refuse('not found')
      }
      case 'make_folder': {
        if (!ctx.allowActions || !str('name')) break
        const where = rootOf(str('where')) ?? 'desktop'
        if (!(await ctx.confirm('make_folder', `${str('name')} → ${basename(ctx.fileRoots[where])}`))) return JSON.stringify({ declined: true })
        const made = await makeDir(ctx.fileRoots[where], str('name'), Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, name: basename(made.path), existed: made.existed, where })
      }
      case 'rename_path': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name || !str('new_name')) break
        const got = await pick(ctx, c.name, c.kind, c.where)
        if ('reply' in got) return got.reply
        if (!(await ctx.confirm('rename', `${got.match.name} → ${str('new_name')}`))) return JSON.stringify({ declined: true })
        const done = await renameItem(got.match.path, str('new_name'), Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, from: basename(done.from), to: basename(done.to) })
      }
      case 'move_path': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name || !str('to')) break
        const got = await pick(ctx, c.name, c.kind, c.where)
        if ('reply' in got) return got.reply
        const root = rootOf(str('to'))
        let dest: string
        if (root) dest = ctx.fileRoots[root]
        else {
          const folder = await pick(ctx, cleanPathName(str('to')).name, 'folder', undefined)
          if ('reply' in folder) return folder.reply
          dest = folder.match.path
        }
        if (!(await ctx.confirm('move', `${got.match.name} → ${basename(dest)}`))) return JSON.stringify({ declined: true })
        const done = await moveItem(got.match.path, dest, Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, name: basename(done.to), to: basename(dest) })
      }
      case 'copy_path': {
        const c = cleanPathName(str('name'))
        if (!ctx.allowActions || !c.name) break
        const got = await pick(ctx, c.name, c.kind, c.where)
        if ('reply' in got) return got.reply
        ctx.writeClipboard(got.match.path)
        return JSON.stringify({ ok: true, name: got.match.name, path: got.match.path })
      }
      case 'undo_last_change': {
        if (!ctx.allowActions) break
        if (!(await ctx.confirm('undo', ''))) return JSON.stringify({ declined: true })
        const back = await undoLast(Object.values(ctx.fileRoots))
        return JSON.stringify({ ok: true, name: basename(back.to) })
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
