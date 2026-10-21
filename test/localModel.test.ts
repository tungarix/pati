import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { InstallError, LocalModel, withManagedServer, type Manifest, type ModelFile } from '../src/main/localModel.ts'

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pati-lm-'))
const entry = (name: string, body: Buffer): ModelFile => ({ name, url: 'http://invalid.test/' + name, size: body.length, sha256: sha(body) })
const roomy = async () => ({ bavail: 2 ** 40, bsize: 1 })
const never = new AbortController().signal

// A tiny zip with llama-server.exe at its root, built with the same bsdtar that extracts it.
const src = tmp()
fs.writeFileSync(path.join(src, 'llama-server.exe'), 'fake exe')
const zipPath = path.join(src, 'llama.zip')
execFileSync(path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', zipPath, '-C', src, 'llama-server.exe'])

const bodies: Record<string, Buffer> = {
  'llama.zip': fs.readFileSync(zipPath),
  'a.gguf': crypto.randomBytes(300_000),
  'mmproj.gguf': crypto.randomBytes(50_000),
}
const manifest: Manifest = { zip: entry('llama.zip', bodies['llama.zip']), model: [entry('a.gguf', bodies['a.gguf']), entry('mmproj.gguf', bodies['mmproj.gguf'])] }

/** Serves `bodies`; `ranges: false` plays a server that ignores Range; `bad` serves wrong bytes for one file. */
async function serve(opts: { ranges?: boolean; bad?: string } = {}) {
  const requests: { name: string; range?: string }[] = []
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(req.url!.slice(1))
    requests.push({ name, range: req.headers.range })
    let body = bodies[name]
    if (!body) return res.writeHead(404).end()
    if (name === opts.bad) body = Buffer.alloc(body.length, 1)
    const m = /^bytes=(\d+)-/.exec(req.headers.range ?? '')
    if (m && opts.ranges !== false) return res.writeHead(206).end(body.subarray(Number(m[1])))
    res.writeHead(200).end(body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { mirror: `http://127.0.0.1:${(server.address() as { port: number }).port}/`, requests, close: () => server.close() }
}

const model = (dir: string, mirror: string, statfs = roomy) => new LocalModel({ dir, manifest, mirror, statfs })

test('full download: verified, zip extracted then removed, progress reaches 100%', async () => {
  const s = await serve()
  const dir = tmp()
  const m = model(dir, s.mirror)
  assert.equal(m.status(), 'not-installed')
  const seen: number[] = []
  await m.install(p => seen.push(p.overallDone / p.overallTotal), never)
  s.close()
  assert.equal(m.status(), 'installed')
  assert.ok(fs.existsSync(path.join(dir, 'llama', 'llama-server.exe')))
  assert.ok(!fs.existsSync(path.join(dir, 'llama.zip')))
  assert.deepEqual(fs.readFileSync(path.join(dir, 'a.gguf')), bodies['a.gguf'])
  assert.equal(seen.at(-1), 1)
  await m.install(() => assert.fail('nothing left to download'), never)
})

test('a .part file resumes with a Range header; a server ignoring Range restarts the file', async () => {
  for (const ranges of [true, false]) {
    const s = await serve({ ranges })
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'a.gguf.part'), bodies['a.gguf'].subarray(0, 100_000))
    const m = model(dir, s.mirror)
    assert.equal(m.status(), 'partial')
    await m.install(() => {}, never)
    s.close()
    assert.equal(s.requests.find(r => r.name === 'a.gguf')?.range, 'bytes=100000-')
    assert.deepEqual(fs.readFileSync(path.join(dir, 'a.gguf')), bodies['a.gguf'])
  }
})

test('a checksum mismatch fails and deletes the .part file', async () => {
  const s = await serve({ bad: 'a.gguf' })
  const dir = tmp()
  await assert.rejects(model(dir, s.mirror).install(() => {}, never), (e: InstallError) => e.code === 'checksum')
  s.close()
  assert.ok(!fs.existsSync(path.join(dir, 'a.gguf.part')))
  assert.ok(!fs.existsSync(path.join(dir, 'a.gguf')))
})

test('too little free disk space fails before downloading anything', async () => {
  const s = await serve()
  const dir = tmp()
  const total = Object.values(bodies).reduce((n, b) => n + b.length, 0)
  const tight = async () => ({ bavail: total + 100 * 2 ** 20, bsize: 1 }) // room for the files but not the 500 MB slack
  await assert.rejects(model(dir, s.mirror, tight).install(() => {}, never), (e: InstallError) => e.code === 'disk')
  s.close()
  assert.equal(s.requests.length, 0)
})

test('a network failure keeps the .part file; aborting reports "aborted"', async () => {
  const dir = tmp()
  await assert.rejects(model(dir, 'http://127.0.0.1:1/').install(() => {}, never), (e: InstallError) => e.code === 'network')
  const s = await serve()
  const stop = new AbortController()
  stop.abort()
  await assert.rejects(model(dir, s.mirror).install(() => {}, stop.signal), (e: InstallError) => e.code === 'aborted')
  s.close()
})

test('uninstall removes everything', async () => {
  const s = await serve()
  const dir = tmp()
  const m = model(dir, s.mirror)
  await m.install(() => {}, never)
  s.close()
  await m.uninstall()
  assert.ok(!fs.existsSync(dir))
  assert.equal(m.status(), 'not-installed')
})

test('the server list keeps the managed server first, once, and drops it when it is gone', () => {
  const mine = { baseUrl: 'http://localhost:8080/v1', apiKey: 'k', model: 'm' }
  const managed = (port: number) => ({ baseUrl: `http://127.0.0.1:${port}/v1`, apiKey: '', model: '' })
  assert.deepEqual(withManagedServer([mine], managed(18080).baseUrl), [managed(18080), mine])
  assert.deepEqual(withManagedServer([mine, managed(18080)], managed(18080).baseUrl), [managed(18080), mine])
  assert.deepEqual(withManagedServer([mine, managed(18080)], managed(18081).baseUrl), [managed(18081), mine])
  assert.deepEqual(withManagedServer([managed(18081), mine], null), [mine])
  assert.deepEqual(withManagedServer([], null), [])
})
