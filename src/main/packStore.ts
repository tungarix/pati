// Optional character packs from a separate GitHub repository: fetch the index, download a pack
// zip, check it, unpack it into the user's characters folder. Nothing here runs until the user
// asks (Settings > Characters > Fan packs). No Electron in here, so it can be tested on its own.

import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'

import type { PackInfo } from '../shared/types.ts'
import { readCharacterPack } from './characters.ts'

/** The one place the packs live: the latest release of this repository. */
export const PACKS_BASE = 'https://github.com/tungarix/pati-fan-packs/releases/latest/download/'

const ID = /^[a-z0-9-]{1,40}$/
const ZIP_NAME = /^[A-Za-z0-9._-]{1,100}\.zip$/
const PLAIN_NAME = /^[A-Za-z0-9._-]{1,100}$/
const MAX_PACK = 200 * 2 ** 20
const MAX_INDEX = 1 << 20
const ALLOWED = new Set(['.png', '.json', '.md', '.txt'])
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

/** `code` picks the message the UI shows; `detail` fills its blank. */
export class PackError extends Error {
  readonly code: 'network' | 'checksum' | 'extract' | 'invalid' | 'exists' | 'aborted'
  readonly detail: string
  constructor(code: PackError['code'], detail = '') {
    super(`${code}: ${detail}`)
    this.code = code
    this.detail = detail
  }
}

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.length >= 1 && v.length <= max ? v : null)

/** The index is remote data: every field is checked, and one bad entry rejects the whole index. */
export function parseIndex(json: unknown): PackInfo[] {
  const bad = (why: string) => new PackError('invalid', why)
  const root = json as { schema?: unknown; packs?: unknown } | null
  if (!root || root.schema !== 1 || !Array.isArray(root.packs)) throw bad('schema')
  const seen = new Set<string>()
  return root.packs.map((p: Record<string, unknown>, i) => {
    const id = str(p?.id, 40)
    const name = str(p?.name, 80)
    const file = str(p?.file, 105)
    const sha256 = str(p?.sha256, 64)
    const size = p?.size
    if (!id || !ID.test(id)) throw bad(`packs[${i}].id`)
    if (seen.has(id)) throw bad(`${id}: duplicate`)
    seen.add(id)
    if (!name) throw bad(`${id}: name`)
    if (!file || !ZIP_NAME.test(file) || file.includes('..')) throw bad(`${id}: file`)
    if (!sha256 || !/^[0-9a-f]{64}$/i.test(sha256)) throw bad(`${id}: sha256`)
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > MAX_PACK) throw bad(`${id}: size`)
    const description = typeof p.description === 'string' ? p.description.slice(0, 300) : ''
    const icon = typeof p.icon === 'string' && PLAIN_NAME.test(p.icon) ? p.icon : undefined
    return { id, name, description, file, size, sha256: sha256.toLowerCase(), ...(icon ? { icon } : {}) }
  })
}

export async function fetchIndex(base = PACKS_BASE): Promise<PackInfo[]> {
  try {
    const res = await fetch(base.replace(/\/*$/, '/') + 'packs.json', { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new PackError('network', `HTTP ${res.status}`)
    const text = await res.text()
    if (text.length > MAX_INDEX) throw new PackError('invalid', 'too large')
    return parseIndex(JSON.parse(text))
  } catch (err) {
    if (err instanceof PackError) throw err
    throw new PackError('network', (err as Error).message)
  }
}

/** A zip entry name that could write outside the target folder (absolute, drive letter, `..`). */
export function unsafeEntry(name: string): boolean {
  return /^([/\\]|[A-Za-z]:)/.test(name) || name.split(/[/\\]/).includes('..')
}

/**
 * The unpacked folder must be a plain pack: nothing outside it (symlinks, escapes), only
 * images and text, with manifest.json and character.json at the top.
 */
export function checkExtracted(dir: string): void {
  const root = fs.realpathSync(dir)
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isSymbolicLink() || path.relative(root, path.resolve(full)).startsWith('..')) throw new PackError('invalid', `outside: ${e.name}`)
      if (e.isDirectory()) walk(full)
      else if (!e.isFile() || !ALLOWED.has(path.extname(e.name).toLowerCase())) throw new PackError('invalid', `file type: ${e.name}`)
    }
  }
  walk(root)
  for (const need of ['manifest.json', 'character.json']) if (!fs.existsSync(path.join(root, need))) throw new PackError('invalid', `${need} missing`)
}

const run = (args: string[]) =>
  new Promise<string>((resolve, reject) => execFile(TAR, args, { windowsHide: true, maxBuffer: 8 << 20 }, (err, out) => (err ? reject(err) : resolve(out))))

/** Streams `url` into `dest`, hashing as it goes; the size and sha256 must both match. */
async function download(url: string, dest: string, pack: PackInfo, onProgress: (done: number) => void, signal: AbortSignal): Promise<void> {
  let ws: fs.WriteStream | undefined
  try {
    const res = await fetch(url, { signal })
    if (!res.ok || !res.body) throw new PackError('network', `HTTP ${res.status}`)
    ws = fs.createWriteStream(dest)
    const hash = crypto.createHash('sha256')
    let have = 0
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      have += chunk.length
      if (have > pack.size) throw new PackError('checksum', pack.file)
      hash.update(chunk)
      if (!ws.write(chunk)) await once(ws, 'drain')
      onProgress(have)
    }
    ws.end()
    await once(ws, 'finish')
    if (have !== pack.size || hash.digest('hex') !== pack.sha256) throw new PackError('checksum', pack.file)
  } catch (err) {
    ws?.destroy()
    if (signal.aborted) throw new PackError('aborted')
    if (err instanceof PackError) throw err
    throw new PackError('network', (err as Error).message)
  }
}

export interface StoreOptions {
  /** `<userData>/characters`: where installed packs live. */
  userDir: string
  /** Remembers which packs the store installed (`store.json`). */
  recordFile: string
  base?: string
}

export class PackStore {
  private opts: StoreOptions
  constructor(opts: StoreOptions) {
    this.opts = opts
  }

  /** Ids installed by the store, with the sha256 of the zip they came from. */
  record(): Record<string, string> {
    try {
      const r = JSON.parse(fs.readFileSync(this.opts.recordFile, 'utf8')) as Record<string, unknown>
      return Object.fromEntries(Object.entries(r).filter(([id, sha]) => ID.test(id) && typeof sha === 'string')) as Record<string, string>
    } catch {
      return {}
    }
  }

  private writeRecord(r: Record<string, string>) {
    fs.mkdirSync(path.dirname(this.opts.recordFile), { recursive: true })
    fs.writeFileSync(this.opts.recordFile, JSON.stringify(r, null, 2))
  }

  async install(pack: PackInfo, onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<void> {
    const dest = path.join(this.opts.userDir, pack.id)
    const record = this.record()
    // A folder with this id that the store did not make is the user's own work: never replaced.
    if (fs.existsSync(dest) && !(pack.id in record)) throw new PackError('exists', pack.id)
    // Next to userDir (same volume) so the final move is a rename, and outside it so a half-done install is never loaded.
    const parent = path.dirname(this.opts.userDir)
    fs.mkdirSync(parent, { recursive: true })
    const tmp = fs.mkdtempSync(path.join(parent, 'pack-'))
    try {
      const zip = path.join(tmp, 'pack.zip')
      await download((this.opts.base ?? PACKS_BASE).replace(/\/*$/, '/') + pack.file, zip, pack, done => onProgress(done, pack.size), signal)
      const fresh = path.join(tmp, pack.id)
      fs.mkdirSync(fresh)
      try {
        // List first: a hostile entry name is refused before anything is written.
        const bad = (await run(['-tf', zip])).split(/\r?\n/).find(n => n && unsafeEntry(n))
        if (bad) throw new PackError('invalid', `entry: ${bad}`)
        await run(['-xf', zip, '-C', fresh])
        checkExtracted(fresh)
        readCharacterPack(fresh, false) // loads like a real pack, or throws
      } catch (err) {
        throw err instanceof PackError ? err : new PackError('extract', (err as Error).message)
      }
      fs.mkdirSync(this.opts.userDir, { recursive: true })
      const old = path.join(tmp, 'old')
      if (fs.existsSync(dest)) fs.renameSync(dest, old)
      try {
        fs.renameSync(fresh, dest)
      } catch (err) {
        if (fs.existsSync(old)) fs.renameSync(old, dest)
        throw new PackError('extract', (err as Error).message)
      }
      this.writeRecord({ ...record, [pack.id]: pack.sha256 })
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  }

  /** Deletes a pack the store installed; anything else (a hand-made pack) is refused. */
  remove(id: string): void {
    const record = this.record()
    if (!ID.test(id) || !(id in record)) throw new PackError('exists', id)
    fs.rmSync(path.join(this.opts.userDir, id), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    delete record[id]
    this.writeRecord(record)
  }
}
