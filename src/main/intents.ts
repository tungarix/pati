// Plain commands the pet carries out itself, without asking the model: local models
// often skip the tool for these and then claim they did it. Anything that does not
// match clearly goes to the model as usual.

import type { Lang } from '../shared/types.ts'
import { cleanAppName, cleanPathName, type Folder, type MediaAction, type PathRoot } from './actions.ts'

export type Intent =
  | { tool: 'take_note'; args: { text: string } }
  | { tool: 'media_control'; args: { action: MediaAction }; times: number }
  | { tool: 'open_folder'; args: { which: Folder } }
  | { tool: 'system_status'; args: Record<string, never> }
  | { tool: 'open_app'; args: { name: string } }
  | { tool: 'open_path'; args: { name: string; kind: 'file' | 'folder' | 'any'; where?: PathRoot } }

const FOLDER_WORDS: [RegExp, Folder][] = [
  [/^(?:masa ?üst(?:ü|üm|ümü|ünü|ün)?|desktop)$/, 'desktop'],
  [/^(?:belgeler(?:im|imi)?|documents)$/, 'documents'],
  [/^(?:indirilenler(?:im|imi)?|downloads)$/, 'downloads'],
  [/^(?:resimler(?:im|imi)?|fotoğraflar(?:ım|ımı)?|pictures|photos)$/, 'pictures'],
  [/^(?:müzik(?:ler(?:im|imi)?)?|music)$/, 'music'],
  [/^(?:videolar(?:ım|ımı)?|videos)$/, 'videos'],
  [/^(?:beyin(?:im|imi)?|brain)$/, 'brain'],
]

const lower = (s: string) => s.toLocaleLowerCase('tr').trim()

export function matchIntent(text: string, _lang: Lang): Intent | null {
  const t = lower(text).replace(/[.!?]+$/, '')

  // Numbers the model would otherwise make up.
  if (/^(pil|şarj|batarya|battery)( (durumu|seviyesi|level))?( (kaç|ne durumda|nasıl|ne kadar))?$|^(bilgisayar(ın)?|sistem) durumu$|^(ram|bellek|işlemci|cpu)( kullanımı)?( (kaç|ne kadar|ne durumda))?$|^(battery|system status)$/.test(t))
    return { tool: 'system_status', args: {} }

  const note = /^(?:bunu |şunu )?(?:not al|not et|not düş|kaydet|note|take a note|write down)(?: (?:ki|that))?\s*[:,-]?\s*(.+)$/i.exec(text.trim())
  if (note && note[1].trim().length > 1) return { tool: 'take_note', args: { text: note[1].trim() } }

  const media: [RegExp, MediaAction][] = [
    [/^(müziği |şarkıyı )?(durdur|duraklat|devam ettir|oynat)(ur musun|ır mısın|ar mısın)?$|^(pause|play|resume)( (the )?music)?$/, 'play_pause'],
    [/^(sonraki|diğer) (şarkı|parça)(ya geç)?$|^şarkıyı (geç|değiştir)$|^next (song|track)$|^skip$/, 'next'],
    [/^önceki (şarkı|parça)(ya dön)?$|^previous (song|track)$/, 'previous'],
    [/^sesi (biraz |epey |çok )?(kıs|azalt|düşür)(ar mısın|abilir misin)?$|^(turn (the )?volume down|volume down|quieter)$/, 'volume_down'],
    [/^sesi (biraz |epey |çok )?(aç|artır|yükselt)(ar mısın|abilir misin)?$|^(turn (the )?volume up|volume up|louder)$/, 'volume_up'],
    [/^sessize al$|^sesi kapat$|^mute$/, 'mute'],
  ]
  // "epey" / "a lot" means one more step of the same thing.
  const times = /\b(epey|çok|a lot)\b/.test(t) ? 2 : 1
  for (const [re, action] of media) if (re.test(t)) return { tool: 'media_control', args: { action }, times }

  const folder = /^(.+?)(?:ımı|imi|umu|ümü|ı|i|u|ü|yı|yi|yu|yü|ni|nı)? (?:klasörünü |klasörümü )?aç$|^open (?:my )?(.+?)(?: folder)?$/.exec(t)
  const name = folder?.[1] ?? folder?.[2]
  if (name) for (const [re, which] of FOLDER_WORDS) if (re.test(name)) return { tool: 'open_folder', args: { which } }

  // A file/folder word, a location prefix or a file extension means a path, not an app.
  if (/\s(?:aç|açar mısın|açabilir misin)$|^open /.test(t)) {
    const c = cleanPathName(t)
    if (c.name && (c.where || c.kind !== 'any' || /\.(?:pdf|docx?|xlsx?|txt|png|jpe?g|mp4|pptx?|zip)$/.test(c.name)))
      return { tool: 'open_path', args: { name: c.name, kind: c.kind, ...(c.where && { where: c.where }) } }
  }

  // "spotify'ı aç": a short name and an open word. Websites ("youtube'da ... aç") go to the model.
  const app = /^(.+?) (?:uygulamasını |programını )?(?:aç|başlat|çalıştır)(?:[aeıiuü]r m[ıiuü]s[ıiuü]n|[ae]bilir misin)?$/.exec(t)
  if (app && !/['’](?:da|de|ta|te)\b/.test(app[1]) && app[1].split(/\s+/).length <= 3) {
    const appName = cleanAppName(app[1])
    if (appName) return { tool: 'open_app', args: { name: appName } }
  }

  return null
}

/** "25 dakika odaklanacağım", "odak modu", "pomodoro başlat", "odağı bitir": minutes to focus, 'stop', or null. */
export function matchFocus(text: string): number | 'stop' | null {
  const t = lower(text).replace(/[.!?]+$/, '')
  if (/^(odağı|odak modunu|pomodoroyu|pomodoro'yu) (bitir|kapat|durdur)$|^(stop|end) (focus|the pomodoro|pomodoro)$/.test(t)) return 'stop'
  const m = /^(?:(\d{1,3}) ?(?:dakika|dk|minutes?|min) )?(?:odaklan(?:acağım|ıyorum|alım|mak istiyorum)?|odak modu(?:nu aç| aç)?|pomodoro(?: başlat)?|(?:start )?(?:a )?pomodoro|focus(?: mode)?)(?: for (\d{1,3}) ?(?:minutes?|min))?$/.exec(t)
  if (!m) return null
  const minutes = Number(m[1] ?? m[2] ?? 25)
  return minutes >= 1 && minutes <= 180 ? minutes : null
}

/** "Ekrana bak", "bu hatayı açıkla", "what's on my screen?": the question to ask about a screenshot, or null. */
export function matchScreen(text: string): string | null {
  const t = lower(text)
  const asks = /\bekran(?! kart)\S*\s(.*\s)?(bak|ne var|ne görüyorsun|oku|açıkla|anlat)|\bbu (hatayı|hata mesajını|ekranı) (açıkla|oku)|\b(look at|check) (my |the )?screen|\bwhat'?s on (my |the )?screen|\bexplain this (error|screen)/
  return asks.test(t) ? text.trim() : null
}
