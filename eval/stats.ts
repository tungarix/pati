// Paired bootstrap for compare.ts --pair: no I/O, deterministic, so test/eval.test.ts can cover it.

/** Small seeded PRNG (mulberry32): same seed, same resamples, same interval. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface PairDiff {
  n: number
  mean: number
  lo: number
  hi: number
  significant: boolean
}

/** Mean of b - a over matched cases, with a 95% percentile interval from `resamples` case resamples. */
export function pairedBootstrap(a: number[], b: number[], resamples = 2000, seed = 20261024): PairDiff {
  if (a.length !== b.length || !a.length) throw new Error('eşleşen vaka yok')
  const d = a.map((x, i) => b[i] - x)
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const rand = rng(seed)
  const means: number[] = []
  for (let r = 0; r < resamples; r++) {
    let sum = 0
    for (let i = 0; i < d.length; i++) sum += d[Math.floor(rand() * d.length)]
    means.push(sum / d.length)
  }
  means.sort((x, y) => x - y)
  const lo = means[Math.floor(0.025 * resamples)]
  const hi = means[Math.min(resamples - 1, Math.floor(0.975 * resamples))]
  return { n: d.length, mean: mean(d), lo, hi, significant: lo > 0 || hi < 0 }
}
