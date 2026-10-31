import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

import { checkExtracted, PackError, PackStore, parseIndex, unsafeEntry } from '../src/main/packStore.ts'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pati-ps-'))
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex')
const good = { id: 'fighter', name: 'Fighter', description: 'd', file: 'fighter.zip', size: 10, sha256: 'a'.repeat(64) }
const index = (...packs: object[]) => ({ schema: 1, packs })
const refused = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof PackError)

test('parseIndex: a good index passes, defaults are filled', () => {
  const [p] = parseIndex(index({ ...good, description: undefined, icon: 'fighter.png' }))
  assert.equal(p.id, 'fighter')
  assert.equal(p.description, '')
  assert.equal(p.icon, 'fighter.png')
})

test('parseIndex: bad ids, traversal in file, bad size and hash are all refused', () => {
  refused(() => parseIndex({ schema: 2, packs: [] }))
  for (const id of ['../x', 'Up', 'a b', '', 'x'.repeat(41), 'a/b']) refused(() => parseIndex(index({ ...good, id })))
  for (const file of ['../fighter.zip', 'a/b.zip', 'a\\b.zip', '..\\x.zip', 'fighter.exe', 'C:evil.zip']) refused(() => parseIndex(index({ ...good, file })))
  for (const size of [0, -1, 1.5, 2 ** 40, '10']) refused(() => parseIndex(index({ ...good, size })))
  refused(() => parseIndex(index({ ...good, sha256: 'xyz' })))
  refused(() => parseIndex(index(good, good))) // duplicate id
})

test('unsafeEntry catches escapes', () => {
  for (const n of ['../x', 'a/../../x', '/etc/x', 'C:/x', '\\x', 'a\\..\\x']) assert.ok(unsafeEntry(n), n)
  for (const n of ['./manifest.json', 'frames/a.png', 'a..b/c.png']) assert.ok(!unsafeEntry(n), n)
})

const packDir = (extra: Record<string, string> = {}) => {
  const d = tmp()
  fs.cpSync(path.join(import.meta.dirname, 'fixtures', 'fighter'), d, { recursive: true })
  fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({ schema: 2, type: 'character', name: 'Fighter', description: 'fan pack', version: '1.0.0' }))
  for (const [f, body] of Object.entries(extra)) fs.writeFileSync(path.join(d, f), body)
  return d
}

test('checkExtracted: a plain pack passes; wrong types and missing files fail', () => {
  checkExtracted(packDir())
  refused(() => checkExtracted(packDir({ 'run.exe': 'x' })))
  const noManifest = packDir()
  fs.rmSync(path.join(noManifest, 'manifest.json'))
  refused(() => checkExtracted(noManifest))
  const nested = packDir()
  fs.mkdirSync(path.join(nested, 'enemy', 'deep'))
  fs.writeFileSync(path.join(nested, 'enemy', 'deep', 'x.bat'), 'x')
  refused(() => checkExtracted(nested))
})

test('checkExtracted: a link is refused', t => {
  const d = packDir()
  try {
    fs.symlinkSync(os.tmpdir(), path.join(d, 'link'), 'junction')
  } catch {
    return t.skip('cannot create links here')
  }
  refused(() => checkExtracted(d))
})

// ---- install / remove against a local server ----------------------------------------------

const WIN = { skip: process.platform !== 'win32' } // zips are made and read with Windows' bsdtar
const TAR = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
const never = new AbortController().signal

async function withServer(files: Record<string, Buffer>, fn: (base: string) => Promise<void>) {
  const server = http.createServer((req, res) => {
    const body = files[(req.url ?? '').slice(1)]
    if (!body) return void res.writeHead(404).end()
    res.writeHead(200).end(body)
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  try {
    await fn(`http://127.0.0.1:${(server.address() as { port: number }).port}/`)
  } finally {
    server.close()
  }
}

const zipOf = (dir: string) => {
  const zip = path.join(tmp(), 'p.zip')
  execFileSync(TAR, ['-a', '-c', '-f', zip, '-C', dir, '.'])
  return fs.readFileSync(zip)
}
const infoOf = (zip: Buffer, file = 'fighter.zip') => ({ id: 'fighter', name: 'Fighter', description: '', file, size: zip.length, sha256: sha(zip) })
const setup = (base?: string) => {
  const root = tmp()
  const userDir = path.join(root, 'characters')
  return { root, userDir, store: new PackStore({ userDir, recordFile: path.join(root, 'store.json'), base }) }
}

test('install: downloads, verifies, unpacks, records; remove deletes it', WIN, async () => {
  const zip = zipOf(packDir())
  const info = infoOf(zip)
  await withServer({ 'fighter.zip': zip }, async base => {
    const { root, userDir, store } = setup(base)
    let last = 0
    await store.install(info, done => (last = done), never)
    assert.equal(last, zip.length)
    assert.ok(fs.existsSync(path.join(userDir, 'fighter', 'character.json')))
    assert.deepEqual(store.record(), { fighter: info.sha256 })
    await store.install(info, () => {}, never) // reinstall replaces
    assert.deepEqual(fs.readdirSync(root).filter(n => n.startsWith('pack-')), []) // temp dirs are cleaned
    store.remove('fighter')
    assert.ok(!fs.existsSync(path.join(userDir, 'fighter')))
    assert.deepEqual(store.record(), {})
  })
})

test('install: a wrong hash installs nothing; a hand-made pack with the same id is left alone', WIN, async () => {
  const zip = zipOf(packDir())
  await withServer({ 'fighter.zip': zip }, async base => {
    const { userDir, store } = setup(base)
    await assert.rejects(store.install({ ...infoOf(zip), sha256: 'b'.repeat(64) }, () => {}, never), (e: PackError) => e.code === 'checksum')
    assert.ok(!fs.existsSync(path.join(userDir, 'fighter')))
    fs.mkdirSync(path.join(userDir, 'fighter'), { recursive: true })
    fs.writeFileSync(path.join(userDir, 'fighter', 'mine.txt'), 'mine')
    await assert.rejects(store.install(infoOf(zip), () => {}, never), (e: PackError) => e.code === 'exists')
    assert.ok(fs.existsSync(path.join(userDir, 'fighter', 'mine.txt')))
  })
})

test('install: a forbidden file type is refused and the old copy stays', WIN, async () => {
  const good = zipOf(packDir())
  const evil = zipOf(packDir({ 'run.exe': 'x' }))
  await withServer({ 'fighter.zip': good, 'evil.zip': evil }, async base => {
    const { userDir, store } = setup(base)
    await store.install(infoOf(good), () => {}, never)
    await assert.rejects(store.install(infoOf(evil, 'evil.zip'), () => {}, never), (e: PackError) => e.code === 'invalid')
    assert.ok(fs.existsSync(path.join(userDir, 'fighter', 'character.json')))
    assert.ok(!fs.existsSync(path.join(userDir, 'fighter', 'run.exe')))
  })
})

test('store.json bookkeeping: remove refuses packs the store did not install', () => {
  const { root, userDir, store } = setup()
  fs.mkdirSync(path.join(userDir, 'mine'), { recursive: true })
  fs.writeFileSync(path.join(userDir, 'mine', 'character.json'), '{}')
  fs.writeFileSync(path.join(root, 'store.json'), JSON.stringify({ other: 'a'.repeat(64), '../mine': 'x' }))
  for (const id of ['mine', '../mine', '']) refused(() => store.remove(id))
  assert.ok(fs.existsSync(path.join(userDir, 'mine', 'character.json')))
  assert.deepEqual(Object.keys(store.record()), ['other']) // junk ids in store.json are ignored
  fs.writeFileSync(path.join(root, 'store.json'), 'not json')
  assert.deepEqual(store.record(), {})
})
