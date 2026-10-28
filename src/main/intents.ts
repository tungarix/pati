// Plain commands the pet carries out itself, without asking the model: local models
// often skip the tool for these and then claim they did it. Anything that does not
// match clearly goes to the model as usual.

import type { Lang } from '../shared/types.ts'
import { cleanAppName, cleanPathName, rootOf, type Folder, type MediaAction, type PathRoot } from './actions.ts'

type Kind = 'file' | 'folder' | 'any'

export type Intent =
  | { tool: 'take_note'; args: { text: string } }
  | { tool: 'create_file'; args: { name: string; content: string; where?: PathRoot } }
  | { tool: 'append_to_file'; args: { name: string; text: string; create?: boolean } }
  | { tool: 'read_file'; args: { name: string } }
  | { tool: 'list_folder'; args: { where: PathRoot } }
  | { tool: 'find_path'; args: { name: string; kind: Kind } }
  | { tool: 'make_folder'; args: { name: string; where?: PathRoot } }
  | { tool: 'rename_path'; args: { name: string; new_name: string } }
  | { tool: 'move_path'; args: { name: string; to: string } }
  | { tool: 'copy_path'; args: { name: string } }
  | { tool: 'undo_last_change'; args: Record<string, never> }
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

const LOC = '(?:masaüst|belgeler|indirilen|desktop|documents|downloads)\\S*'
const QUOTE_ENDS = /^["'“”‘’]+|["'“”‘’]+$/g

/**
 * Plain file commands: create, append, read, list, find, folders, rename, move, copy
 * the path, undo. They match on the lower-cased text, but names and the text to write
 * are cut from the original so capitals and Turkish letters survive.
 */
function matchFileIntent(text: string): Intent | null {
  const orig = text.trim().replace(/[.!?]+$/, '')
  const t = lower(orig)
  const run = (re: RegExp) => {
    const m = re.exec(t)
    if (!m) return null
    const g = (k: string) => {
      const at = m.indices?.groups?.[k]
      return at ? orig.slice(at[0], at[1]).trim().replace(QUOTE_ENDS, '') : ''
    }
    return { m, g }
  }
  const ref = (name: string, word: string) => cleanPathName(`${name} ${word}`)

  if (/^(?:son (?:işlemi|taşımayı|değişikliği|adı değiştirmeyi) |taşımayı |adı değiştirmeyi )?geri al$|^undo$/.test(t)) return { tool: 'undo_last_change', args: {} }

  // "masaüstüne alışveriş.txt oluştur: süt, ekmek" / "notlar adlı dosya oluştur ve içine ... yaz"
  const split = /\s*:\s*|\s+(?:içine|içinde|içeriği)\s+/.exec(t)
  const head = split ? t.slice(0, split.index) : t
  const create = new RegExp(`^(?:(?<loc>${LOC})\\s+)?(?<name>.+?)\\s+(?:(?:adlı|isimli)\\s+)?(?:(?:txt|metin|not|markdown)\\s+)?(?<kw>dosyası|dosya|file)?\\s*(?:oluştur|yarat|yap|hazırla)(?:ar mısın|abilir misin)?(?:\\s+ve)?$`, 'd').exec(head)
  if (create?.groups && (create.groups.kw || /\.(?:txt|md|csv)$/.test(create.groups.name))) {
    const at = create.indices!.groups!
    const name = orig.slice(at.name[0], at.name[1]).trim().replace(QUOTE_ENDS, '')
    const body = split ? orig.slice(split.index + split[0].length).replace(/\s+yaz(?:sın)?$/i, '').trim() : ''
    const where = create.groups.loc ? rootOf(create.groups.loc) : null
    if (name) return { tool: 'create_file', args: { name, content: body, ...(where && { where }) } }
  }

  // "alışveriş listesine süt ekle", "notlar dosyasına şunu ekle: ..."
  const add =
    run(/^(?<name>.+?)\s+(?<kw>dosyasına|dosyaya|listesine|listeye|notuna)\s+(?:(?:şunu|bunu)\s+)?(?<text>.+?)\s+(?:ekle|yaz)$/d) ??
    run(/^(?<name>.+?)\s+(?<kw>dosyasına|dosyaya|listesine|listeye|notuna)\s+(?:(?:şunu|bunu)\s+)?(?:ekle|yaz)\s*[:,-]\s*(?<text>.+)$/d)
  if (add && add.g('text')) {
    const isList = /^(?:listesine|listeye|notuna)$/.test(add.m.groups!.kw)
    return { tool: 'append_to_file', args: { name: add.g('name'), text: add.g('text'), ...(isList && { create: true }) } }
  }

  const read = run(/^(?<name>.+?)\s+(?:dosyasını|dosyayı|notunu|listesini)\s+(?:oku|göster)$/d)
  if (read) return { tool: 'read_file', args: { name: read.g('name') } }

  const list = run(new RegExp(`^(?<loc>${LOC})\\s+(?:dosyalar\\S*\\s+)?(?:(?:neler|ne) var|listele|göster)$`, 'd'))
  const listRoot = list && rootOf(list.g('loc'))
  if (listRoot) return { tool: 'list_folder', args: { where: listRoot } }

  const find = run(/^(?<name>.+?)\s+(?<kw>dosyasını|dosyayı|klasörünü|klasörü|dosyası|dosya|klasör)?\s*(?:bul|nerede|nerde)$/d)
  if (find && (find.g('name') !== '' && (find.m.groups!.kw || /\.[a-z0-9]{2,4}$/.test(find.g('name'))))) {
    const kw = find.m.groups!.kw ?? ''
    const c = ref(find.g('name'), kw)
    if (c.name) return { tool: 'find_path', args: { name: find.g('name'), kind: /^klasör/.test(kw) ? 'folder' : c.kind } }
  }

  const mk = run(new RegExp(`^(?:(?<loc>${LOC})\\s+)?(?<name>.+?)\\s+(?:adlı\\s+)?klasör\\S*\\s+(?:oluştur|yarat|yap|hazırla)(?:ar mısın|abilir misin)?$`, 'd'))
  if (mk && mk.g('name')) {
    const where = mk.g('loc') ? rootOf(mk.g('loc')) : null
    return { tool: 'make_folder', args: { name: mk.g('name'), ...(where && { where }) } }
  }

  const rename =
    run(/^(?<name>.+?)\s+(?:dosyasının|klasörünün|dosyanın)\s+(?:adını|ismini)\s+(?<to>.+?)\s+(?:yap|olarak değiştir|olsun)$/d) ??
    run(/^(?<name>.+?)\s+(?:dosyasını|klasörünü|dosyayı)\s+(?<to>.+?)\s+olarak\s+(?:yeniden adlandır|adlandır|değiştir)$/d)
  if (rename && rename.g('to')) return { tool: 'rename_path', args: { name: `${rename.g('name')} ${/klasör/.test(rename.m[0]) ? 'klasörü' : 'dosyası'}`, new_name: rename.g('to') } }

  const move = run(/^(?<name>.+?)\s+(?:dosyasını|klasörünü|dosyayı)\s+(?<to>.+?)(?:\s+(?:klasörüne|klasörünün içine|içine))?\s+(?:taşı|at|koy)$/d)
  if (move && move.g('to')) return { tool: 'move_path', args: { name: `${move.g('name')} ${/klasörünü/.test(move.m[0]) ? 'klasörü' : 'dosyası'}`, to: move.g('to') } }

  const copy = run(/^(?<name>.+?)\s+(?:dosyasının|klasörünün)\s+yolunu\s+kopyala$/d)
  if (copy) return { tool: 'copy_path', args: { name: `${copy.g('name')} ${/klasörünün/.test(copy.m[0]) ? 'klasörü' : 'dosyası'}` } }

  return null
}

export function matchIntent(text: string, _lang: Lang): Intent | null {
  const t = lower(text).replace(/[.!?]+$/, '')

  // Numbers the model would otherwise make up.
  if (/^(pil|şarj|batarya|battery)( (durumu|seviyesi|level))?( (kaç|ne durumda|nasıl|ne kadar))?$|^(bilgisayar(ın)?|sistem) durumu$|^(ram|bellek|işlemci|cpu)( kullanımı)?( (kaç|ne kadar|ne durumda))?$|^(battery|system status)$/.test(t))
    return { tool: 'system_status', args: {} }

  const note = /^(?:bunu |şunu )?(?:not al|not et|not düş|kaydet|note|take a note|write down)(?: (?:ki|that))?\s*[:,-]?\s*(.+)$/i.exec(text.trim())
  if (note && note[1].trim().length > 1) return { tool: 'take_note', args: { text: note[1].trim() } }

  const fileIntent = matchFileIntent(text)
  if (fileIntent) return fileIntent

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
