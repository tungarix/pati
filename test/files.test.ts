import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendText, createTextFile, forgetUndo, listDir, makeDir, moveItem, readText, renameItem, safeName, undoLast, within } from '../src/main/files.ts'
import { runTool, type ToolContext } from '../src/main/tools.ts'
import type { PathMatch } from '../src/main/actions.ts'

async function sandbox() {
  const base = await mkdtemp(join(tmpdir(), 'pati-files-'))
  const desktop = join(base, 'Desktop')
  const documents = join(base, 'Documents')
  await mkdir(desktop)
  await mkdir(documents)
  forgetUndo()
  return { base, desktop, documents, roots: [desktop, documents], done: () => rm(base, { recursive: true, force: true }) }
}

test('names lose path tricks and reserved words; roots hold the files in', () => {
  assert.equal(safeName('..\\..\\Windows\\x.txt'), 'Windowsx.txt')
  assert.equal(safeName('  a<b>c?.txt  '), 'abc.txt')
  assert.equal(safeName('con'), '')
  assert.equal(safeName('nul.txt'), '')
  assert.ok(within('C:/U/Desktop/a.txt', ['C:/U/Desktop']))
  assert.ok(!within('C:/U/Desktop', ['C:/U/Desktop']))
  assert.ok(within('C:/U/Desktop', ['C:/U/Desktop'], true))
  assert.ok(!within('C:/U/Desktop/../Secret/a.txt', ['C:/U/Desktop']))
  assert.ok(!within('C:/U/DesktopX/a.txt', ['C:/U/Desktop']))
})

test('a text file is created, never overwritten, and only as text', async () => {
  const s = await sandbox()
  const a = await createTextFile(s.desktop, 'liste', 'süt\nekmek', s.roots)
  assert.equal(a.name, 'liste.txt')
  assert.equal(await readFile(a.path, 'utf8'), 'süt\nekmek')
  const b = await createTextFile(s.desktop, 'liste.txt', 'yeni', s.roots)
  assert.equal(b.name, 'liste (2).txt')
  assert.equal(await readFile(a.path, 'utf8'), 'süt\nekmek')
  await assert.rejects(createTextFile(s.desktop, 'kurulum.bat', 'x', s.roots), /only text files/)
  await assert.rejects(createTextFile(s.desktop, 'foto.png', 'x', s.roots), /only text files/)
  await assert.rejects(createTextFile(s.desktop, 'con', 'x', s.roots), /bad name/)
  await assert.rejects(createTextFile(s.base, 'x', 'x', s.roots), /outside/)
  assert.equal((await createTextFile(s.desktop, 'notlar 1.5', '', s.roots)).name, 'notlar 1.5.txt')
  await s.done()
})

test('append adds a line, read returns the start, other types are refused', async () => {
  const s = await sandbox()
  const f = await createTextFile(s.desktop, 'n', 'bir', s.roots)
  await appendText(f.path, 'iki', s.roots)
  assert.equal(await readFile(f.path, 'utf8'), 'bir\niki\n')
  assert.deepEqual(await readText(f.path, s.roots), { text: 'bir\niki\n', truncated: false })
  const big = join(s.desktop, 'b.txt')
  await writeFile(big, 'x'.repeat(25_000))
  const r = await readText(big, s.roots)
  assert.equal(r.text.length, 20_000)
  assert.ok(r.truncated)
  const exe = join(s.desktop, 'a.exe')
  await writeFile(exe, 'MZ')
  await assert.rejects(appendText(exe, 'x', s.roots), /only text files/)
  await assert.rejects(readText(join(s.base, 'x.txt'), s.roots), /outside/)
  await s.done()
})

test('a folder listing is newest first and hides system files', async () => {
  const s = await sandbox()
  await writeFile(join(s.desktop, 'eski.txt'), '1')
  await writeFile(join(s.desktop, 'desktop.ini'), '1')
  await mkdir(join(s.desktop, 'klasor'))
  const old = new Date(2020, 0, 1)
  await import('node:fs/promises').then(fs => fs.utimes(join(s.desktop, 'eski.txt'), old, old))
  const l = await listDir(s.desktop, s.roots)
  assert.deepEqual(l.entries, [{ name: 'klasor', isDir: true }, { name: 'eski.txt', isDir: false }])
  assert.equal(l.total, 2)
  await s.done()
})

test('folders, renames and moves stay inside, keep extensions, and can be undone', async () => {
  const s = await sandbox()
  const m = await makeDir(s.desktop, 'ödev', s.roots)
  assert.equal(m.existed, false)
  assert.equal((await makeDir(s.desktop, 'ödev', s.roots)).existed, true)
  const f = await createTextFile(s.desktop, 'rapor', 'x', s.roots)

  const renamed = await renameItem(f.path, 'final', s.roots)
  assert.equal(renamed.to, join(s.desktop, 'final.txt'))
  const moved = await moveItem(renamed.to, m.path, s.roots)
  assert.equal(moved.to, join(s.desktop, 'ödev', 'final.txt'))
  assert.ok((await stat(moved.to)).isFile())

  const back = await undoLast(s.roots)
  assert.equal(back.to, join(s.desktop, 'final.txt'))
  await assert.rejects(undoLast(s.roots), /nothing to undo/)

  await writeFile(join(s.desktop, 'a.txt'), '1')
  await writeFile(join(s.desktop, 'b.txt'), '1')
  await assert.rejects(renameItem(join(s.desktop, 'a.txt'), 'b', s.roots), /exists/)
  await assert.rejects(renameItem(join(s.desktop, 'a.txt'), 'a.bat', s.roots), /program/)
  await assert.rejects(renameItem(join(s.desktop, 'a.txt'), '', s.roots), /bad name/)
  await assert.rejects(moveItem(join(s.desktop, 'a.txt'), s.base, s.roots), /outside/)
  await assert.rejects(moveItem(m.path, m.path, s.roots), /into itself|same place/)
  await writeFile(join(s.desktop, 'run.exe'), 'MZ')
  await assert.rejects(moveItem(join(s.desktop, 'run.exe'), s.documents, s.roots), /program/)
  await assert.rejects(renameItem(s.desktop, 'x', s.roots), /outside/) // a root itself is never renamed
  await s.done()
})

function ctxFor(s: { desktop: string; documents: string; roots: string[] }, found: PathMatch[], over: Partial<ToolContext> = {}) {
  const asked: string[] = []
  const c = {
    lang: 'tr', allowMemory: false, allowClipboard: false, allowWeb: false, now: () => new Date(), remember() {}, forget: () => 0, addReminder() {},
    readClipboard: () => '', fetchJson: async () => ({}), allowActions: true,
    confirm: async (kind: string, what: string) => (asked.push(`${kind}:${what}`), true),
    openApp: async () => null, openUrl: async () => {}, media: async () => {}, openFolder: async () => {},
    findPaths: async () => found, openPath: async () => {}, writeClipboard: (t: string) => void asked.push(`clip:${t}`),
    fileRoots: { desktop: s.desktop, documents: s.documents, downloads: join(s.desktop, '..', 'Downloads') },
    systemStatus: async () => ({}), takeNote() {}, ...over,
  } as unknown as ToolContext
  return { c, asked }
}

test('file tools ask first, and stay behind the actions switch', async () => {
  const s = await sandbox()
  const { c, asked } = ctxFor(s, [])
  const made = JSON.parse(await runTool('create_file', JSON.stringify({ name: 'alışveriş.txt', content: 'süt' }), c))
  assert.equal(made.ok, true)
  assert.equal(made.where, 'desktop')
  assert.deepEqual(asked, ['create_file:alışveriş.txt → Desktop'])
  assert.equal(await readFile(join(s.desktop, 'alışveriş.txt'), 'utf8'), 'süt')

  const { c: no } = ctxFor(s, [], { confirm: async () => false })
  assert.deepEqual(JSON.parse(await runTool('create_file', '{"name":"x"}', no)), { declined: true })
  const { c: off } = ctxFor(s, [], { allowActions: false })
  assert.match(await runTool('create_file', '{"name":"x"}', off), /disabled/)
  assert.match(await runTool('create_file', '{"name":"x.bat"}', c), /only text files/)
  await s.done()
})

test('append finds the file by name, or starts a list when asked to', async () => {
  const s = await sandbox()
  const f = join(s.desktop, 'alışveriş.txt')
  await writeFile(f, 'süt\n')
  const hit: PathMatch = { path: f, name: 'alışveriş.txt', isDir: false, score: 3 }
  const { c, asked } = ctxFor(s, [hit])
  assert.deepEqual(JSON.parse(await runTool('append_to_file', '{"name":"alışveriş dosyası","text":"peynir"}', c)), { ok: true, name: 'alışveriş.txt' })
  assert.equal(await readFile(f, 'utf8'), 'süt\npeynir\n')
  assert.deepEqual(asked, ['append_file:alışveriş.txt'])

  const { c: none } = ctxFor(s, [])
  assert.deepEqual(JSON.parse(await runTool('append_to_file', '{"name":"yok dosyası","text":"x"}', none)), { error: 'not found' })
  const made = JSON.parse(await runTool('append_to_file', '{"name":"yeni liste","text":"x","create":true}', none))
  assert.equal(made.created, true)
  assert.equal(await readFile(join(s.desktop, 'yeni liste.txt'), 'utf8'), 'x\n')
  await s.done()
})

test('rename and move ask, name both sides, and tell ties apart', async () => {
  const s = await sandbox()
  const f = join(s.desktop, 'rapor.txt')
  await writeFile(f, 'x')
  await mkdir(join(s.documents, 'ödev'))
  const file: PathMatch = { path: f, name: 'rapor.txt', isDir: false, score: 3 }
  const folder: PathMatch = { path: join(s.documents, 'ödev'), name: 'ödev', isDir: true, score: 3 }
  const { c, asked } = ctxFor(s, [file], {
    findPaths: async (name: string, kind: string) => (kind === 'folder' ? [folder] : [file]),
  })
  assert.deepEqual(JSON.parse(await runTool('move_path', '{"name":"rapor dosyası","to":"ödev"}', c)), { ok: true, name: 'rapor.txt', to: 'ödev' })
  assert.deepEqual(asked, ['move:rapor.txt → ödev'])
  const moved = join(s.documents, 'ödev', 'rapor.txt')
  assert.ok((await stat(moved)).isFile())

  const { c: c2 } = ctxFor(s, [], { findPaths: async () => [{ path: moved, name: 'rapor.txt', isDir: false, score: 3 }] })
  assert.deepEqual(JSON.parse(await runTool('rename_path', '{"name":"rapor dosyası","new_name":"son"}', c2)), { ok: true, from: 'rapor.txt', to: 'son.txt' })
  assert.deepEqual(JSON.parse(await runTool('undo_last_change', '', c2)), { ok: true, name: 'rapor.txt' })

  const hit = (name: string): PathMatch => ({ path: join(s.desktop, name), name, isDir: false, score: 3 })
  const { c: tie } = ctxFor(s, [hit('a.txt'), hit('a.md')])
  assert.equal(JSON.parse(await runTool('rename_path', '{"name":"a","new_name":"b"}', tie)).candidates.length, 2)
  await s.done()
})

test('copy_path and find_path never touch the files', async () => {
  const s = await sandbox()
  const f: PathMatch = { path: join(s.desktop, 'aktenak.png'), name: 'aktenak.png', isDir: false, score: 3 }
  const { c, asked } = ctxFor(s, [f, { path: join(s.desktop, 'Aktenak'), name: 'Aktenak', isDir: true, score: 3 }])
  assert.equal(JSON.parse(await runTool('find_path', '{"name":"aktenak"}', c)).matches.length, 2)
  const { c: one } = ctxFor(s, [f])
  assert.equal(JSON.parse(await runTool('copy_path', '{"name":"aktenak dosyası"}', one)).ok, true)
  assert.deepEqual(asked, [])
  await s.done()
})
