import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Animation, AnimationName, Character, CharacterFile, CharacterLines, Enemy, EnemyFile, Lang, PackManifest } from '../shared/types.ts'

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
  /** The pack still loads; only an optional feature (enemies) is off. */
  soft?: boolean
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

/** Frame paths of a pack as file URLs; a path that leaves the pack folder or is missing throws. */
function frameUrls(root: string, frames: unknown): string[] {
  if (!Array.isArray(frames) || frames.length === 0 || frames.some(f => typeof f !== 'string')) throw new Error('kare listesi geçersiz')
  return (frames as string[]).map(f => {
    const full = path.resolve(root, f)
    if (!full.startsWith(root + path.sep)) throw new Error(`kare paket dışında: ${f}`)
    if (!fs.existsSync(full)) throw new Error(`kare bulunamadı: ${f}`)
    return pathToFileURL(full).href
  })
}

/** Optional scenes; a broken one is dropped with a note instead of failing the pack. */
function readScenes(root: string, file: CharacterFile, notes: string[]): Character['scenes'] {
  const scenes: Character['scenes'] = {}
  for (const [name, spec] of Object.entries(file.scenes ?? {})) {
    try {
      scenes[name] = { frames: frameUrls(root, spec?.frames), fps: spec.fps > 0 ? spec.fps : 2 }
    } catch (err) {
      notes.push(`sahne "${name}" kapalı: ${(err as Error).message}`)
    }
  }
  return scenes
}

/** Enemies need the `fight` scene; any broken enemy is skipped, and none valid = no fights. */
function readEnemies(root: string, file: CharacterFile, scenes: Character['scenes'], notes: string[]): Enemy[] {
  if (file.enemies === undefined) return []
  if (!Array.isArray(file.enemies)) return notes.push('"enemies" bir liste olmalı: düşmanlar kapalı'), []
  const enemies: Enemy[] = []
  for (const e of file.enemies as EnemyFile[]) {
    try {
      if (!e || typeof e.id !== 'string' || !e.id) throw new Error('"id" eksik')
      const frames = { walk: frameUrls(root, e.frames?.walk), hit: frameUrls(root, e.frames?.hit), die: frameUrls(root, e.frames?.die) }
      enemies.push({ id: e.id, name: e.name ?? e.id, frames, speed: Math.min(8, Math.max(1, Number(e.speed) || 4)), weight: Number(e.weight) > 0 ? Number(e.weight) : 1 })
    } catch (err) {
      notes.push(`düşman "${e?.id}" kapalı: ${(err as Error).message}`)
    }
  }
  if (enemies.length && !scenes.fight) return notes.push('"scenes.fight" yok: düşmanlar kapalı'), []
  return enemies
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
    animations[anim] = { frames: frameUrls(root, spec.frames), fps: spec.fps > 0 ? spec.fps : 2, ...(spec.stride && spec.stride > 0 ? { stride: spec.stride } : {}) }
  }
  const notes: string[] = []
  const scenes = readScenes(root, file, notes)
  const enemies = readEnemies(root, file, scenes, notes)

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
    scenes,
    enemies,
    notes,
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
        const pack = readCharacterPack(dir, isBuiltIn)
        byId.set(entry.name, pack)
        for (const reason of pack.notes) problems.push({ id: entry.name, dir, reason, soft: true })
      } catch (err) {
        problems.push({ id: entry.name, dir, reason: (err as Error).message })
      }
    }
  }
  return { characters: [...byId.values()], problems }
}
