// Pure helpers behind the "do something on the computer" tools, kept apart from
// Electron so they can be tested: which shortcut a spoken app name means, and
// which web address a request may open.

export type MediaAction = 'play_pause' | 'next' | 'previous' | 'volume_up' | 'volume_down' | 'mute'
export const MEDIA_ACTIONS: MediaAction[] = ['play_pause', 'next', 'previous', 'volume_up', 'volume_down', 'mute']

export type Folder = 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos' | 'brain'
export const FOLDERS: Folder[] = ['desktop', 'documents', 'downloads', 'pictures', 'music', 'videos', 'brain']

/** Kinds of action that ask the user first (once, or every time). */
export type ActionKind = 'open_app' | 'open_website' | 'media' | 'open_folder'

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
