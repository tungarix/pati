// Shapes shared by the main process, the preload bridge and the windows.

/** Optional like the rest: `fall` (in the air; else `drag`), `dust` (after a landing), `guitar` (now and then when idle). */
export type AnimationName = 'idle' | 'walk' | 'sleep' | 'drag' | 'talk' | 'fall' | 'dust' | 'guitar' | 'fight' | 'win'

export interface Animation {
  frames: string[]
  fps: number
  /** Walk only: one step's length in frame pixels; frames then advance with the distance walked, so feet do not slide. */
  stride?: number
}

export type Lang = 'tr' | 'en'

/** manifest.json at the root of every v2 pack: who made it and what it is. */
export interface PackManifest {
  schema: 2
  type: 'character' | 'voice' | 'plugin'
  name: string
  version: string
  author?: string
  description?: string
  /** Lowest Pati version the pack works with, e.g. "0.2.0". */
  minAppVersion?: string
}

/** characters/<id>/character.json, as written by a pack author. */
export interface CharacterFile {
  /** v1 packs carry their name here; v2 packs in manifest.json. */
  name?: string
  author?: string
  /** The language of flat `lines`, and the one used when a language is missing. */
  language?: Lang
  /** Upscale factor for pixel art; frames are drawn with crisp edges. */
  scale?: number
  /** The character's colour in the modern balloon (CSS colour). */
  accent?: string
  animations: Partial<Record<AnimationName, Animation>> & { idle: Animation }
  voice?: { lang?: string; rate?: number; pitch?: number }
  /** System prompt that gives the character its voice in AI chat; one string or one per language. */
  persona?: string | Partial<Record<Lang, string>>
  /** Flat lines in `language`, or one set per language: `{ "tr": {...}, "en": {...} }`. */
  lines?: Partial<CharacterLines> | Partial<Record<Lang, Partial<CharacterLines>>>
  /** Extra scenes by name: `fight` and `win` play when an enemy comes; others are reserved. */
  scenes?: Record<string, Animation>
  /** Who turns up to fight; needs the `fight` scene, else no enemy ever comes. */
  enemies?: EnemyFile[]
}

/** One enemy as written in character.json; frame paths are relative to the pack folder. */
export interface EnemyFile {
  id: string
  name?: string
  frames: { walk: string[]; hit: string[]; die: string[] }
  /** Walking speed, 1-8 (times 25 px/s); default 4. */
  speed?: number
  /** Chance relative to the other enemies; default 1. */
  weight?: number
}

/** A loaded enemy: frames are file URLs. */
export interface Enemy {
  id: string
  name: string
  frames: { walk: string[]; hit: string[]; die: string[] }
  speed: number
  weight: number
}

export interface CharacterLines {
  greet: string[]
  menu: string
  jokes: string[]
  tips: string[]
  wake: string[]
  sleep: string
  thanks: string
  hush: string
  /** Said once a night when the user is still up between 01:00 and 05:00. */
  lateNight: string[]
  /** Said after 90 minutes at the computer without a pause. */
  breakTime: string[]
  /** Said after winning a fight; optional, a pack without it just wins silently. */
  win?: string[]
}

/** A loaded pack: frame paths resolved to file URLs, lines filled with defaults. */
export interface Character {
  id: string
  name: string
  author: string
  version: string
  description: string
  scale: number
  accent: string
  isBuiltIn: boolean
  animations: Partial<Record<AnimationName, Animation>> & { idle: Animation }
  voice: { lang: string; rate: number; pitch: number }
  /** Complete for every language: the pack's own lines, then its main language, then defaults. */
  lines: Record<Lang, CharacterLines>
  persona: Record<Lang, string>
  /** Scenes by name, frames as file URLs; `fight` + `win` + enemies = the character fights. */
  scenes: Record<string, Animation>
  enemies: Enemy[]
  /** Fields of the pack that were ignored (feature off), shown next to the pack problems. */
  notes: string[]
}

export type Reminder =
  | { id: string; text: string; enabled: boolean; kind: 'interval'; minutes: number }
  | { id: string; text: string; enabled: boolean; kind: 'daily'; time: string; days?: number[] }
  /** Fires once at `at` (ms since the epoch); set by the chat's reminder tool. */
  | { id: string; text: string; enabled: boolean; kind: 'once'; at: number }

/** One entry of the fan-pack index (packs.json in the packs repository's release). */
export interface PackInfo {
  id: string
  name: string
  description: string
  file: string
  size: number
  sha256: string
  icon?: string
}

/** What the settings window shows of the pack store; `packs` stays empty until the user loads the list. */
export interface PacksState {
  loaded: boolean
  packs: (PackInfo & { installed: boolean })[]
  /** Id being downloaded or removed, or ''. */
  busy: string
  /** 0-100 while a pack downloads. */
  percent: number
  /** One short, already-localized message, or ''. */
  error: string
}

/** One OpenAI-compatible server (llama.cpp, Ollama, LM Studio...); empty model = its first. */
export interface AiServer {
  baseUrl: string
  apiKey: string
  model: string
}

/** How often an enemy turns up: never, about every 20, 10 or 4 minutes. */
export type EnemyFrequency = 'off' | 'rare' | 'sometimes' | 'often'

export interface Settings {
  language: Lang
  /** Balloon style: today's card, or the cream XP assistant balloon. */
  look: 'modern' | 'classic'
  characterId: string
  /** Character size on screen, 0.5-2 times the pack's own size. */
  size: number
  /** piperPath and piperVoice (.onnx): empty = found on their own. */
  speech: { enabled: boolean; voiceName: string | null; rate: number; pitch: number; piperPath: string; piperVoice: string }
  /** Look for a new Pati on GitHub at start and every few hours; it always asks before installing. */
  updates: { check: boolean }
  tips: { enabled: boolean; minMinutes: number; maxMinutes: number }
  /**
   * Chat with local models: the first reachable server in `servers` answers, so a
   * user can list a smart big model first and a small fast one as fallback.
   */
  ai: {
    enabled: boolean
    servers: AiServer[]
    /** Remember facts the user shares, and show them to the model. */
    memory: boolean
    /** Tools that reach outside the app; both off until the user turns them on. */
    tools: { clipboard: boolean; web: boolean; actions: boolean }
    /** Action kinds the user answered "always" for; the rest ask each time. */
    allowedActions: string[]
    /** The brain folder (chats, summaries, Memory.md); empty = Documents/Pati Beyni. */
    brainDir: string
    /** The managed Pati-4B: start it with Pati when installed; `offered` = the install was offered once. */
    builtIn: { enabled: boolean; offered: boolean }
  }
  /** Talking by voice: a global shortcut starts listening, whisper.cpp writes it down; empty paths = found on their own. */
  voice: { enabled: boolean; shortcut: string; whisperPath: string; modelPath: string }
  /** Speaking unasked: morning briefing, a late-night word, break nudges. */
  /** Enemies that walk in and fight the character (only for packs that draw them). */
  enemies: { frequency: EnemyFrequency }
  proactive: { enabled: boolean; briefing: boolean; lateNight: boolean; breaks: boolean }
  sleepAfterSeconds: number
  wander: boolean
  /** Shimeji physics: falls onto the taskbar and window edges, can be thrown. */
  physics: boolean
  openAtLogin: boolean
  reminders: Reminder[]
  position: { x: number; y: number } | null
}

/** What the pet window is told to do by the main process. */
export type PetCommand =
  | { type: 'say'; text: string; kind: 'reminder' | 'info' | 'proactive' }
  | { type: 'idle'; seconds: number }
  | { type: 'menu' }
  | { type: 'ai'; event: 'token'; text: string }
  /** `id` is set on model answers, which can be rated 👍/👎. */
  | { type: 'ai'; event: 'done'; text: string; id?: string }
  | { type: 'ai'; event: 'error'; text: string }
  | { type: 'ai'; event: 'needKey'; text: string }
  /** A progress line that replaces the "thinking" label until the next answer. */
  | { type: 'ai'; event: 'status'; text: string }
  /** `yesNo`: only Yes / No, no "always". */
  | { type: 'confirm'; id: string; text: string; yesNo?: boolean; later?: boolean }
  /** The push-to-talk shortcut was pressed: start listening, or stop if already listening. */
  | { type: 'listen' }
  /** How the body moves: in the air (no walking, falling pose), the lean to swing towards (degrees), stretch of a fast fall, speed it just hit a floor with. */
  /** An enemy reached the pet (`arrived`) or is gone (`dead`); the pet plays its fight and win scenes. */
  | { type: 'enemy'; event: 'arrived' | 'dead'; /** Which side the enemy comes from: 1 right, -1 left. */ side?: 1 | -1 }
  | { type: 'physics'; airborne: boolean; tilt: number; stretch: number; impact: number }

/** What the enemy window draws now: a list of frames, looped or played once (the last stays). */
export interface EnemyShow {
  frames: string[]
  fps: number
  loop: boolean
  /** Enemies are drawn facing left; flipped when they walk right. */
  flip: boolean
  pixel: boolean
  /** The pet's size setting; frames are drawn for 100%. */
  scale: number
  /** Where the creature is drawn (frame pixels, 100%, unflipped); null = not to be touched. */
  box: { x: number; y: number; w: number; h: number } | null
}
