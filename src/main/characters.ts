import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Animation, AnimationName, Character, CharacterFile, CharacterLines, Lang, PackManifest } from '../shared/types.ts'

const LANGS: Lang[] = ['tr', 'en']

const DEFAULT_LINES: Record<Lang, CharacterLines> = {
  tr: {
    greet: ['Merhaba! Buradayım.'],
    menu: 'Senin için ne yapabilirim?',
    jokes: ['Programcı neden denize girmez? Çünkü dalgalardan "bug" çıkar.'],
    tips: ['Bir saattir ekrandasın, kısa bir mola iyi gelir.'],
    wake: ['Ooo, geri döndün!'],
    sleep: 'Biraz kestireyim…',
    thanks: 'Teşekkürler',
    hush: 'Tamam, bir saat sessizim.',
    lateNight: ['Saat epey geç oldu. Yarınki sen, şimdi yatmana teşekkür eder.', 'Gece yarısını çoktan geçtik. Bugünlük bu kadar yeter mi?'],
    breakTime: ['Bir buçuk saattir hiç ara vermedin. Kalk, biraz su iç, gözlerini dinlendir.', 'Uzun süredir ekrandasın. Beş dakikalık bir mola her şeyi tazeler.'],
  },
  en: {
    greet: ["Hi! I'm here."],
    menu: 'What can I do for you?',
    jokes: ['Why do programmers prefer dark mode? Because light attracts bugs.'],
    tips: ["You've been at the screen for a while. A short break helps."],
    wake: ["Oh, you're back!"],
    sleep: "I'll take a little nap…",
    thanks: 'Thanks',
    hush: "OK, I'll be quiet for an hour.",
    lateNight: ["It's really late. Tomorrow's you will thank you for going to bed now.", "We're well past midnight. Call it a day?"],
    breakTime: ["You've been going for an hour and a half straight. Stand up, drink some water, rest your eyes.", "Long time at the screen. A five-minute break freshens everything up."],
  },
}

/** Why a pack was skipped, so the settings window can show it. */
export interface PackProblem {
  id: string
  dir: string
  reason: string
}

function readJson<T>(file: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch (err) {
    throw new Error(`${path.basename(file)} okunamadı: ${(err as Error).message}`)
  }
}

/** Lines per language: flat lines belong to the pack's main language. */
function resolveLines(file: CharacterFile): Record<Lang, CharacterLines> {
  const main = file.language ?? 'tr'
  const raw = file.lines ?? {}
  const isPerLanguage = LANGS.some(l => typeof (raw as Record<string, unknown>)[l] === 'object')
  const own = (isPerLanguage ? raw : { [main]: raw }) as Partial<Record<Lang, Partial<CharacterLines>>>
  // A missing language borrows the pack's main one before the generic defaults,
  // so a Turkish-only character still sounds like itself in English mode.
  return Object.fromEntries(
    LANGS.map(l => [l, { ...DEFAULT_LINES[l], ...own[main], ...own[l] }]),
  ) as Record<Lang, CharacterLines>
}

/** The chat persona per language; a pack without one gets a friendly generic mascot. */
function resolvePersona(file: CharacterFile, name: string): Record<Lang, string> {
  const generic: Record<Lang, string> = {
    tr: `Sen ${name}, kullanıcının masaüstünde yaşayan sevimli bir maskotsun.`,
    en: `You are ${name}, a friendly mascot living on the user's desktop.`,
  }
  const own = typeof file.persona === 'string' ? { [file.language ?? 'tr']: file.persona } : (file.persona ?? {})
  const main = own[file.language ?? 'tr']
  return { tr: own.tr ?? main ?? generic.tr, en: own.en ?? main ?? generic.en }
}

export function readCharacterPack(dir: string, isBuiltIn: boolean): Character {
  const id = path.basename(dir)
  const manifestFile = path.join(dir, 'manifest.json')
  const manifest = fs.existsSync(manifestFile) ? readJson<PackManifest>(manifestFile) : null
  if (manifest && manifest.type !== 'character') throw new Error(`karakter paketi değil (type: ${manifest.type})`)

  const file = readJson<CharacterFile>(path.join(dir, 'character.json'))
  const name = manifest?.name ?? file.name
  if (!name) throw new Error('"name" eksik')
  if (!file.animations?.idle?.frames?.length) throw new Error('"animations.idle.frames" eksik')

  const root = path.resolve(dir)
  const animations = {} as Character['animations']
  for (const [anim, spec] of Object.entries(file.animations) as [AnimationName, Animation][]) {
    if (!spec?.frames?.length) continue
    const frames = spec.frames.map(f => {
      const full = path.resolve(dir, f)
      if (!full.startsWith(root + path.sep)) throw new Error(`kare paket dışında: ${f}`)
      if (!fs.existsSync(full)) throw new Error(`kare bulunamadı: ${f}`)
      return pathToFileURL(full).href
    })
    animations[anim] = { frames, fps: spec.fps > 0 ? spec.fps : 2 }
  }

  return {
    id,
    name,
    author: manifest?.author ?? file.author ?? '',
    version: manifest?.version ?? '1.0.0',
    description: manifest?.description ?? '',
    scale: file.scale && file.scale > 0 ? file.scale : 1,
    // Only a plain colour reaches CSS; anything else falls back to the default.
    accent: /^#[0-9a-f]{3,8}$/i.test(file.accent ?? '') ? file.accent! : '#7c8cff',
    isBuiltIn,
    animations,
    voice: { lang: file.voice?.lang ?? 'tr-TR', rate: file.voice?.rate ?? 1, pitch: file.voice?.pitch ?? 1 },
    lines: resolveLines(file),
    persona: resolvePersona(file, name),
  }
}

/**
 * Every pack under the built-in and the user's characters folders. A user pack
 * with the same id as a built-in one replaces it.
 */
export function loadCharacters(builtInDir: string, userDir: string): { characters: Character[]; problems: PackProblem[] } {
  const byId = new Map<string, Character>()
  const problems: PackProblem[] = []
  for (const [root, isBuiltIn] of [[builtInDir, true], [userDir, false]] as const) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      if (!fs.existsSync(path.join(dir, 'character.json'))) continue
      try {
        byId.set(entry.name, readCharacterPack(dir, isBuiltIn))
      } catch (err) {
        problems.push({ id: entry.name, dir, reason: (err as Error).message })
      }
    }
  }
  return { characters: [...byId.values()], problems }
}
