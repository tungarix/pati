// The recommended local model (Pati-4B) and the llama.cpp that runs it: downloads both into
// %LOCALAPPDATA%\Pati\model, checks them, starts llama-server for Pati and stops it again.
// No Electron in here, so it can be tested on its own.

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import { once } from 'node:events'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import type { AiServer } from '../shared/types.ts'

export interface ModelFile {
  name: string
  url: string
  size: number
  sha256: string
}

export interface Manifest {
  /** llama.cpp for Windows (Vulkan build); extracted flat, `llama-server.exe` at its root. */
  zip: ModelFile
  /** The model's first shard (what `-m` gets), the second shard, and the `mmproj*` vision file. */
  model: ModelFile[]
  /** An earlier model set that is still good to run: kept working, never downloaded again, dropped once `model` is complete. */
  legacy?: ModelFile[]
}

const RELEASE_V1 = 'https://github.com/tungarix/pati/releases/download/pati-4b-v1/'
const RELEASE_V3 = 'https://github.com/tungarix/pati/releases/download/pati-4b-v3/'
const file = (name: string, size: number, sha256: string, url = RELEASE_V3 + name): ModelFile => ({ name, url, size, sha256 })
const MMPROJ = file('mmproj-4B-F16.gguf', 672423616, 'cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864', RELEASE_V1 + 'mmproj-4B-F16.gguf')

export const MANIFEST: Manifest = {
  zip: file(
    'llama-b11799-bin-win-vulkan-x64.zip',
    36840310,
    '45640f66af6baaa51da03bb8e37a22b8ea35535307e4b5a792080f2828f77127',
    'https://github.com/ggml-org/llama.cpp/releases/download/b11799/llama-b11799-bin-win-vulkan-x64.zip',
  ),
  model: [
    file('Pati-4B-v3-Q4_K_M-00001-of-00002.gguf', 1901243232, '832250202dca759d726827a233f27c34e2ddbfbbf3cc6c3b61fa6ea152087e0c'),
    file('Pati-4B-v3-Q4_K_M-00002-of-00002.gguf', 807561120, '0eb187efe46f60acd71115fa39d0937b7a7f271834b7bd9eb02d47746e7b2534'),
    MMPROJ,
  ],
  // Pati 0.4.5/0.4.6 installs hold v1; they keep running it until the user reinstalls (Settings > AI > Pati-4B > Remove, Install).
  legacy: [
    file('Pati-4B-Q4_K_M-00001-of-00002.gguf', 1901243136, '85beb3a5013cfe300f834a26526fca4da666a48cd341d6a141672817f3695179', RELEASE_V1 + 'Pati-4B-Q4_K_M-00001-of-00002.gguf'),
    file('Pati-4B-Q4_K_M-00002-of-00002.gguf', 807561120, 'bcd6553508354f8d91b45d555786f55196ea2b0380f3382f7ecd8469b34e593b', RELEASE_V1 + 'Pati-4B-Q4_K_M-00002-of-00002.gguf'),
    MMPROJ,
  ],
}

export type Status = 'not-installed' | 'partial' | 'installed'

export interface Progress {
  file: string
  done: number
  total: number
  overallDone: number
  overallTotal: number
  bytesPerSec: number
}

/** `code` tells the UI which message to show; `detail` is for that message's blanks. */
export class InstallError extends Error {
  readonly code: 'disk' | 'network' | 'checksum' | 'extract' | 'aborted'
  readonly detail: string
  constructor(code: InstallError['code'], detail = '') {
    super(`${code}: ${detail}`)
    this.code = code
    this.detail = detail
  }
}

export interface Options {
  dir?: string
  manifest?: Manifest
  /** Base URL that replaces the host part of every file's URL (tests, manual checks). */
  mirror?: string
  statfs?: (dir: string) => Promise<{ bavail: number; bsize: number }>
}

const BASE_PORT = 18080
const PORT_TRIES = 6
const SLACK = 500 * 2 ** 20
const EXE = 'llama-server.exe'
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** The server entry this module manages: loopback, one of the ports above. */
const MANAGED_URL = /^http:\/\/127\.0\.0\.1:1808[0-5]\/v1$/

/** The server list with the managed server (if running) first, and no stale copy of it. */
/**
 * Offer the Pati-4B download only to someone with no AI server at all. A user whose own
 * server is listed but off (llama.cpp not started yet) is told it is off instead: they
 * already have a model and may have no room for a second 3.4 GB copy.
 */
export function shouldOfferModel(status: Status, serverCount: number): boolean {
  return status !== 'installed' && serverCount === 0
}

export function withManagedServer(servers: AiServer[], url: string | null): AiServer[] {
  const rest = servers.filter(s => !MANAGED_URL.test(s.baseUrl))
  return url ? [{ baseUrl: url, apiKey: '', model: '' }, ...rest] : rest
}

async function freePort(): Promise<number> {
  for (let port = BASE_PORT; port < BASE_PORT + PORT_TRIES; port++) {
    const free = await new Promise<boolean>(resolve => {
      const s = net.createServer()
      s.once('error', () => resolve(false))
      s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)))
    })
    if (free) return port
  }
  throw new Error('no free port')
}

export class LocalModel {
  readonly dir: string
  private manifest: Manifest
  private mirror: string | undefined
  private statfs: NonNullable<Options['statfs']>
  private child: ChildProcess | null = null
  private starting: Promise<string> | null = null
  private restarts = 0
  /** Where the running server listens (`.../v1`), or null. */
  url: string | null = null
  /** Called when the server comes up on a new address or goes away unexpectedly. */
  onChange: (url: string | null) => void = () => {}

  constructor(opts: Options = {}) {
    this.dir = opts.dir ?? process.env.PATI_MODEL_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Pati', 'model')
    this.manifest = opts.manifest ?? MANIFEST
    this.mirror = opts.mirror ?? process.env.PATI_MODEL_MIRROR
    this.statfs = opts.statfs ?? (d => fs.promises.statfs(d))
  }

  private p = (...parts: string[]) => path.join(this.dir, ...parts)
  private sizeOf = (name: string): number => {
    try {
      return fs.statSync(this.p(name)).size
    } catch {
      return -1
    }
  }
  private llamaReady = () => this.sizeOf(path.join('llama', EXE)) >= 0

  private complete = (files: ModelFile[]) => files.every(f => this.sizeOf(f.name) === f.size)

  /** The model set to run: the current one when complete, else a complete older one, else none. */
  private active(): ModelFile[] | null {
    const { model, legacy } = this.manifest
    return this.complete(model) ? model : legacy && this.complete(legacy) ? legacy : null
  }

  status(): Status {
    const { zip, model } = this.manifest
    if (this.llamaReady() && this.active()) return 'installed'
    const any = [zip, ...model].some(f => this.sizeOf(f.name) >= 0 || this.sizeOf(f.name + '.part') >= 0)
    return any || this.llamaReady() ? 'partial' : 'not-installed'
  }

  /** Bytes still to download, counting what a `.part` file already holds. */
  private remaining(): number {
    const { zip, model } = this.manifest
    return [zip, ...model].reduce((sum, f) => {
      if (this.sizeOf(f.name) === f.size || (f === zip && this.llamaReady())) return sum
      return sum + f.size - Math.min(f.size, Math.max(0, this.sizeOf(f.name + '.part')))
    }, 0)
  }

  async install(onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void> {
    fs.mkdirSync(this.dir, { recursive: true })
    const need = this.remaining() + SLACK
    const st = await this.statfs(this.dir)
    if (st.bavail * st.bsize < need) throw new InstallError('disk', (need / 1e9).toFixed(1))
    const all = [this.manifest.zip, ...this.manifest.model]
    const total = all.reduce((s, f) => s + f.size, 0)
    let done = 0
    for (const f of all) {
      const isZip = f === this.manifest.zip
      if (isZip ? this.llamaReady() : this.sizeOf(f.name) === f.size) {
        done += f.size
        continue
      }
      if (this.sizeOf(f.name) !== f.size) await this.download(f, done, total, onProgress, signal)
      if (isZip) await this.extract()
      done += f.size
    }
    // The current set is complete: the older one's shards (same names never overlap, mmproj is shared) are dead weight.
    const keep = new Set(this.manifest.model.map(f => f.name))
    for (const f of this.manifest.legacy ?? []) if (!keep.has(f.name)) fs.rmSync(this.p(f.name), { force: true })
  }

  private async download(f: ModelFile, before: number, total: number, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<void> {
    const part = this.p(f.name + '.part')
    let have = Math.max(0, this.sizeOf(f.name + '.part'))
    if (have > f.size) (fs.rmSync(part), (have = 0))
    if (have < f.size) {
      const url = this.mirror ? this.mirror.replace(/\/*$/, '/') + f.name : f.url
      let ws: fs.WriteStream | undefined
      try {
        const res = await fetch(url, { headers: have > 0 ? { Range: `bytes=${have}-` } : {}, signal })
        if (!res.body || !(res.status === 206 || res.status === 200)) throw new InstallError('network', `HTTP ${res.status}`)
        if (res.status === 200) have = 0 // the server ignored Range: start over
        ws = fs.createWriteStream(part, { flags: have > 0 ? 'a' : 'w' })
        const from = have
        const t0 = Date.now()
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          if (!ws.write(chunk)) await once(ws, 'drain')
          have += chunk.length
          onProgress({ file: f.name, done: have, total: f.size, overallDone: before + have, overallTotal: total, bytesPerSec: ((have - from) * 1000) / Math.max(1, Date.now() - t0) })
        }
        ws.end()
        await once(ws, 'finish')
      } catch (err) {
        ws?.destroy()
        if (signal.aborted) throw new InstallError('aborted')
        if (err instanceof InstallError) throw err
        const e = err as NodeJS.ErrnoException
        throw new InstallError(e.code === 'ENOSPC' ? 'disk' : 'network', e.cause ? String((e.cause as Error).message ?? e.cause) : e.message)
      }
      if (have !== f.size) throw new InstallError('network', `${f.name}: ${have}/${f.size}`)
    }
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(part)) hash.update(chunk)
    if (hash.digest('hex') !== f.sha256) {
      fs.rmSync(part)
      throw new InstallError('checksum', f.name)
    }
    fs.renameSync(part, this.p(f.name))
  }

  /** Windows ships bsdtar, which reads zip; no extra dependency. */
  private async extract(): Promise<void> {
    const zip = this.p(this.manifest.zip.name)
    const tmp = this.p('llama.tmp')
    fs.rmSync(tmp, { recursive: true, force: true })
    fs.mkdirSync(tmp)
    try {
      await new Promise<void>((resolve, reject) => execFile(TAR, ['-xf', zip, '-C', tmp], { windowsHide: true }, err => (err ? reject(err) : resolve())))
      if (!fs.existsSync(path.join(tmp, EXE))) throw new Error(`${EXE} missing in the zip`)
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true })
      throw new InstallError('extract', (err as Error).message)
    }
    fs.rmSync(this.p('llama'), { recursive: true, force: true })
    fs.renameSync(tmp, this.p('llama'))
    fs.rmSync(zip)
  }

  async uninstall(): Promise<void> {
    await this.stop()
    fs.rmSync(this.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }

  /** Starts llama-server (or returns the running one) and resolves with its `.../v1` address once /health is ok. */
  start(): Promise<string> {
    if (this.url) return Promise.resolve(this.url)
    if (!this.starting) {
      this.restarts = 0
      this.starting = this.boot().finally(() => (this.starting = null))
    }
    return this.starting
  }

  private async boot(): Promise<string> {
    const port = await freePort()
    const base = `http://127.0.0.1:${port}`
    const set = this.active() ?? this.manifest.model
    const mmproj = set.find(f => f.name.startsWith('mmproj'))
    const args = ['-m', this.p(set[0].name), ...(mmproj ? ['--mmproj', this.p(mmproj.name)] : []), '--jinja', '-ngl', '99', '--ctx-size', '16384', '--parallel', '1', '--host', '127.0.0.1', '--port', String(port)]
    // Only the last run's log is kept.
    const log = fs.openSync(this.p('llama-server.log'), 'w')
    const child = spawn(this.p('llama', EXE), args, { cwd: this.p('llama'), windowsHide: true, stdio: ['ignore', log, log] })
    fs.closeSync(log)
    this.child = child
    child.on('exit', () => {
      if (this.child !== child) return // we stopped it on purpose
      this.child = null
      this.url = null
      this.onChange(null)
      if (this.restarts++ < 1) this.boot().then(url => this.onChange(url), () => {})
    })
    child.on('error', () => {})
    const deadline = Date.now() + 120_000
    for (;;) {
      if (this.child !== child) throw new Error('llama-server stopped')
      if (Date.now() > deadline) {
        void this.stop()
        throw new Error('llama-server did not become ready in 120 s')
      }
      try {
        if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1500) })).ok) break
      } catch {}
      await sleep(500)
    }
    return (this.url = base + '/v1')
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.url = null
    if (!child || child.exitCode !== null) return
    const exited = once(child, 'exit')
    child.kill()
    await Promise.race([exited, sleep(5000)])
  }
}
