// "Gizli" kontroller: ölçüm bunlara bakar, eğitim verisi üreticisi ASLA içe aktarmaz
// (pati-model/scripts/uret/*.ts ... test/eval.test.ts bunu denetler). Üretici bunlara karşı
// süzerse ölçüm, modelin değil süzgecin ürününü ölçer (Goodhart).

import { sentences, type Check } from './checks.ts'

const lower = (s: string) => s.toLocaleLowerCase('tr')
const norm = (s: string) => lower(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const words = (s: string) => (norm(s) ? norm(s).split(' ') : [])

function trigrams(s: string): Set<string> {
  const t = ` ${norm(s)} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3))
  return out
}

/** Character-trigram Jaccard overlap: 1 identical, 0 nothing shared. */
export function trigramJaccard(a: string, b: string): number {
  const x = trigrams(a)
  const y = trigrams(b)
  if (!x.size && !y.size) return 1
  let both = 0
  for (const g of x) if (y.has(g)) both++
  return both / (x.size + y.size - both)
}

/** Fails when two replies of a case are near copies (trigram Jaccard >= threshold) or open with the same four words. */
export function distinctReplies(replies: string[], threshold: number): Check {
  for (let i = 0; i < replies.length; i++)
    for (let j = i + 1; j < replies.length; j++) {
      const sim = trigramJaccard(replies[i], replies[j])
      if (sim >= threshold) return { name: 'distinct', ok: false, reason: `${i + 1}. ve ${j + 1}. cevap birbirine çok benziyor (${sim.toFixed(2)} >= ${threshold})` }
      const a = words(replies[i])
      const b = words(replies[j])
      if (a.length >= 4 && b.length >= 4 && a.slice(0, 4).join(' ') === b.slice(0, 4).join(' '))
        return { name: 'distinct', ok: false, reason: `${i + 1}. ve ${j + 1}. cevap aynı dört kelimeyle başlıyor: "${a.slice(0, 4).join(' ')}"` }
    }
  return { name: 'distinct', ok: true, reason: '' }
}

export interface OpenerStats {
  n: number
  /** The most common first word and the share of answers it opens. */
  topWord: string
  topShare: number
  /** How many different two-word openers there are. */
  twoWordOpeners: number
  /** Share of answers without tool calls that begin with "Tamam...". */
  tamamShare: number
}

export function openerStats(answers: string[], toolFlags: boolean[]): OpenerStats {
  const first = answers.map(a => words(a)[0] ?? '')
  const count = new Map<string, number>()
  for (const w of first) count.set(w, (count.get(w) ?? 0) + 1)
  const [topWord, top] = [...count].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  const plain = answers.filter((_, i) => !toolFlags[i])
  const tamam = plain.filter(a => (words(a)[0] ?? '').startsWith('tamam')).length
  return {
    n: answers.length,
    topWord,
    topShare: answers.length ? top / answers.length : 0,
    twoWordOpeners: new Set(answers.map(a => words(a).slice(0, 2).join(' ')).filter(Boolean)).size,
    tamamShare: plain.length ? tamam / plain.length : 0,
  }
}

// Reduplications that are real Turkish ("yavaş yavaş", "tek tek"); anything else doubled is a slip.
const DOUBLE_OK = new Set(['yavaş', 'ağır', 'az', 'tek', 'adım', 'ara'])

const RULES: [string, (a: string, la: string) => boolean][] = [
  ['tamamdı', (_, la) => /(?<!\p{L})tamamdı(?!\p{L})/u.test(la)],
  ['sen_nasıl_gidiyor', (_, la) => /(?<!\p{L})sen nasıl gidiyor/u.test(la)],
  ['çift_kelime', (_, la) => [...la.matchAll(/(?<!\p{L})(\p{L}+) \1(?!\p{L})/gu)].some(m => !DOUBLE_OK.has(m[1]))],
  ['seni_hatırlat', (_, la) => /(?<!\p{L})seni hatırlat(?!\p{L})/u.test(la)],
  ['çift_mi', (_, la) => /(?<!\p{L})m[ıiuü](?:s[ıiuü]n(?:[ıiuü]z)?|y[ıiuü]m|y[ıiuü]z)?[ ,]+m[ıiuü](?:s[ıiuü]n(?:[ıiuü]z)?|y[ıiuü]m|y[ıiuü]z)?(?!\p{L})/u.test(la)],
  ['küçük_harfle_başlıyor', a => /^\p{Ll}/u.test(a.trim())],
  ['ünlem_soru_karışık', a => /!\?|\?!/.test(a)],
  ['iki_nokta', a => /(?<!\.)\.\.(?!\.)/.test(a)],
]

/** Names of the cheap grammar rules an answer breaks. Empty array = clean. */
export function grammarFlags(answer: string): string[] {
  const a = answer.trim()
  const la = lower(a)
  return RULES.filter(([, f]) => f(a, la)).map(([name]) => name)
}

const SHORT = ['sohbet', 'selam', 'tekrar', 'dil']

/** Chatty categories get at most three sentences. */
export function lengthFlags(answer: string, category: string): string[] {
  return SHORT.includes(category) && sentences(answer) > 3 ? ['3_cümleden_uzun'] : []
}
