import en from '../../locales/en.json' with { type: 'json' }
import tr from '../../locales/tr.json' with { type: 'json' }

import type { Lang } from './types.ts'

export type { Lang }
export const LANGUAGES: Record<Lang, string> = { tr: 'Türkçe', en: 'English' }
export type MessageKey = keyof typeof tr

const TABLES: Record<Lang, Record<string, string>> = { tr, en }

/** The system language when we have it, else English. */
export function detectLang(locale: string): Lang {
  const code = locale.slice(0, 2).toLowerCase()
  return code in LANGUAGES ? (code as Lang) : 'en'
}

/** A message in `lang`, `{name}` placeholders filled from `vars`; falls back to English, then the key. */
export function t(lang: Lang, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const text = TABLES[lang][key] ?? TABLES.en[key] ?? key
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

/** Every key missing from a table, for the test that keeps the languages in step. */
export function missingKeys(): Record<Lang, string[]> {
  const all = new Set(Object.values(TABLES).flatMap(Object.keys))
  return Object.fromEntries(
    (Object.keys(TABLES) as Lang[]).map(lang => [lang, [...all].filter(k => !(k in TABLES[lang]))]),
  ) as Record<Lang, string[]>
}
