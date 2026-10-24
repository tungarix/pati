// Pure helpers behind the "do something on the computer" tools, kept apart from
// Electron so they can be tested: which shortcut a spoken app name means, and
// which web address a request may open.

import { readdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

export type MediaAction = 'play_pause' | 'next' | 'previous' | 'volume_up' | 'volume_down' | 'mute'
export const MEDIA_ACTIONS: MediaAction[] = ['play_pause', 'next', 'previous', 'volume_up', 'volume_down', 'mute']

export type Folder = 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos' | 'brain'
export const FOLDERS: Folder[] = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos', 'brain']

/** Kinds of action that ask the user first (once, or every time). */
export type ActionKind = 'open_app' | 'open_website' | 'media' | 'open_folder' | 'screen' | 'open_path'

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')

/** "spotify'ı aç" → "spotify": drops the command words and the Turkish case ending. */
export function cleanAppName(name: string): string {
  return name
    .trim()
    .replace(/[.!?]+$/, '')
    .replace(/\s+(?:uygulamasını\s+|programını\s+)?(?:aç|açar mısın|açabilir misin|başlat|çalıştır|open|launch|start)$/i, '')
    .replace(/['’](?:y?[ıiuü]|n[ıiuü])$/i, '')
    .trim()
}

/**
 * The item whose label best matches a spoken app name: an exact name wins, then one
 * that starts with it, then one that contains it, the shortest label on a tie;
 * uninstallers never.
 */
/** Short names people say for apps whose real names are longer. */
const ALIASES: Record<string, string> = {
  vscode: 'visualstudiocode',
  code: 'visualstudiocode',
  calc: 'hesapmakinesi',
  calculator: 'hesapmakinesi',
  hesapmakinasi: 'hesapmakinesi',
  notepad: 'notdefteri',
}

export function bestMatch<T>(name: string, items: T[], label: (item: T) => string): T | null {
  const spoken = fold(cleanAppName(name))
  const want = ALIASES[spoken] ?? spoken
  if (!want) return null
  let best: { item: T; score: number; len: number } | null = null
  for (const item of items) {
    const have = fold(label(item))
    if (!have || /uninstall|kaldir/.test(have)) continue
    const score = have === want ? 3 : have.startsWith(want) ? 2 : have.includes(want) ? 1 : 0
    if (score && (!best || score > best.score || (score === best.score && have.length < best.len))) best = { item, score, len: have.length }
  }
  return best?.item ?? null
}

/** The Start Menu shortcut (.lnk/.url path) for a spoken app name. */
export function findShortcut(name: string, shortcuts: string[]): string | null {
  return bestMatch(name, shortcuts, f => f.split(/[\\/]/).pop()!.replace(/\.(lnk|url)$/i, ''))
}

/** The address to open: a given http(s) URL, or a web search for the words. Anything else is refused. */
export function websiteUrl(args: { url?: string; query?: string }): string | null {
  if (args.url) {
    try {
      const u = new URL(/^[a-z]+:/i.test(args.url) ? args.url : `https://${args.url}`)
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
    } catch {
      return null
    }
  }
  const q = args.query?.trim()
  return q ? `https://www.google.com/search?q=${encodeURIComponent(q)}` : null
}

/** Windows virtual-key codes for media keys, and how many presses one request means. */
export const MEDIA_KEYS: Record<MediaAction, { vk: number; presses: number }> = {
  play_pause: { vk: 0xb3, presses: 1 },
  next: { vk: 0xb0, presses: 1 },
  previous: { vk: 0xb1, presses: 1 },
  volume_up: { vk: 0xaf, presses: 5 }, // 5 presses ≈ +10%
  volume_down: { vk: 0xae, presses: 5 },
  mute: { vk: 0xad, presses: 1 },
}

export const PATH_ROOTS = ['desktop', 'documents', 'downloads'] as const
export type PathRoot = (typeof PATH_ROOTS)[number]

/** A file or folder found by name. `score` (3 exact, 2 starts with, 1 contains) lets callers see ties. */
export interface PathMatch {
  path: string
  name: string
  isDir: boolean
  score?: number
}

/** Programs, scripts and shortcuts: never opened by name, since opening runs them. */
export const BLOCKED_EXT = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.psm1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
  '.scr', '.lnk', '.url', '.reg', '.dll', '.jar', '.hta', '.cpl', '.msc', '.appx', '.msix',
]

const SKIP_NAMES = new Set(['node_modules', '$recycle.bin', 'desktop.ini', 'thumbs.db'])

/** Breadth-first search of the given folders for files/folders named like `query`, best matches first. */
export async function findPaths(
  query: string,
  kind: 'file' | 'folder' | 'any',
  roots: string[],
  opts: { maxDepth?: number; maxItems?: number; maxMs?: number; limit?: number } = {},
): Promise<PathMatch[]> {
  const { maxDepth = 3, maxItems = 5000, maxMs = 1500, limit = 3 } = opts
  const want = fold(query)
  if (!want) return []
  const deadline = Date.now() + maxMs
  const hits: (PathMatch & { score: number; depth: number })[] = []
  const queue = roots.map(dir => ({ dir, depth: 0 }))
  let seen = 0
  for (let i = 0; i < queue.length; i++) {
    const { dir, depth } = queue[i]
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      if (++seen > maxItems || Date.now() > deadline) i = queue.length
      if (i >= queue.length) break
      const name = ent.name
      if (name.startsWith('.') || name.startsWith('$') || SKIP_NAMES.has(name.toLowerCase())) continue
      const isDir = ent.isDirectory()
      if (!isDir && !ent.isFile()) continue // symlinks and devices: loops, surprises
      if (isDir && depth + 1 < maxDepth) queue.push({ dir: join(dir, name), depth: depth + 1 })
      const ext = extname(name).toLowerCase()
      if (!isDir && BLOCKED_EXT.includes(ext)) continue
      if (kind === (isDir ? 'file' : 'folder')) continue
      let score = 0
      for (const have of isDir ? [fold(name)] : [fold(name), fold(name.slice(0, name.length - ext.length))])
        score = Math.max(score, have === want ? 3 : have.startsWith(want) ? 2 : have.includes(want) ? 1 : 0)
      if (score) hits.push({ path: join(dir, name), name, isDir, score, depth: depth + 1 })
    }
  }
  hits.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.depth - b.depth)
  return hits.slice(0, limit).map(({ depth: _depth, ...m }) => m)
}

const LOCATIONS: [RegExp, PathRoot][] = [
  [/^masaüst\S*$|^desktop\S*$/, 'desktop'],
  [/^belgeler\S*$|^documents?$/, 'documents'],
  [/^indirilen\S*$|^downloads?$/, 'downloads'],
]
const QUOTES = '[\'’"“”‘]'

/** "masaüstündeki tungarix dosyasını" → search for "tungarix", a file, on the Desktop. */
export function cleanPathName(name: string): { name: string; where?: PathRoot; kind: 'file' | 'folder' | 'any' } {
  const words = name
    .toLocaleLowerCase('tr')
    .replace(/masa üst/g, 'masaüst')
    .replace(/[.!?]+$/, '')
    .replace(/\s+(?:aç|açar mısın|açabilir misin|open)$/, '')
    .replace(/^open\s+(?:my\s+)?/, '')
    .split(/\s+/)
    .filter(Boolean)
  let where: PathRoot | undefined
  let kind: 'file' | 'folder' | 'any' = 'any'
  const rest: string[] = []
  for (const raw of words) {
    const w = raw.replace(new RegExp(QUOTES, 'g'), '')
    if (/^klasör|^folder$/.test(w)) kind = 'folder'
    else if (/^(?:dosya|belge(?!ler)|pdf|sunum|resim|file|document)/.test(w)) kind = kind === 'folder' ? kind : 'file'
    else if (/^(?:adlı|adındaki|adında|isimli|isminde|ismindeki|olan|named|called)$/.test(w)) continue
    else if (!where && words.length > 1 && LOCATIONS.some(([re]) => re.test(w))) where = LOCATIONS.find(([re]) => re.test(w))![1]
    else rest.push(raw.replace(new RegExp(`^${QUOTES}+|${QUOTES}+$`, 'g'), '').replace(/['’]\w+$/, ''))
  }
  return { name: rest.join(' ').trim(), where, kind }
}
