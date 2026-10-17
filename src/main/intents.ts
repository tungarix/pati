// Plain commands the pet carries out itself, without asking the model: local models
// often skip the tool for these and then claim they did it. Anything that does not
// match clearly goes to the model as usual.

import type { Lang } from '../shared/types.ts'
import { cleanAppName, type Folder, type MediaAction } from './actions.ts'

export type Intent =
  | { tool: 'take_note'; args: { text: string } }
  | { tool: 'media_control'; args: { action: MediaAction }; times: number }
  | { tool: 'open_folder'; args: { which: Folder } }
  | { tool: 'system_status'; args: Record<string, never> }
  | { tool: 'open_app'; args: { name: string } }

const FOLDER_WORDS: [RegExp, Folder][] = [
  [/^masa ?üst|^desktop/, 'desktop'],
  [/^belge|^documents/, 'documents'],
  [/^indirilen|^downloads/, 'downloads'],
  [/^resim|^fotoğraf|^pictures|^photos/, 'pictures'],
  [/^müzik|^music/, 'music'],
  [/^video/, 'videos'],
  [/^beyin|^brain/, 'brain'],
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

  // "spotify'ı aç": a short name and an open word. Websites ("youtube'da ... aç") go to the model.
  const app = /^(.+?) (?:uygulamasını |programını )?(?:aç|başlat|çalıştır)(?:[aeıiuü]r m[ıiuü]s[ıiuü]n|[ae]bilir misin)?$/.exec(t)
  if (app && !/['’](?:da|de|ta|te)\b/.test(app[1]) && app[1].split(/\s+/).length <= 3) {
    const appName = cleanAppName(app[1])
    if (appName) return { tool: 'open_app', args: { name: appName } }
  }

  return null
}
