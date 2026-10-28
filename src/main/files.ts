// What the pet may do to the user's files: write plain text, never overwrite, never
// delete, never touch programs, and never leave the Desktop, Documents and Downloads.
// Every refusal is an Error whose message is a short code the caller turns into words.

import { appendFile, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

import { BLOCKED_EXT } from './actions.ts'

export const TEXT_EXT = ['.txt', '.md', '.csv']
export const READ_EXT = [...TEXT_EXT, '.json', '.log']
const MAX_WRITE = 100_000
const MAX_FILE = 5_000_000
export const MAX_READ = 20_000

/** A file or folder name without path tricks, reserved device names or characters Windows refuses. */
export function safeName(raw: string): string {
  const name = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|[. ]+$/g, '')
    .slice(0, 120)
  return /^(?:con|prn|aux|nul|com\d|lpt\d)(?:\..*)?$/i.test(name) ? '' : name
}

/** Is `p` inside one of the roots? The root itself counts only with `allowRoot`. */
export function within(p: string, roots: string[], allowRoot = false): boolean {
  const full = resolve(p)
  return roots.some(r => {
    const root = resolve(r)
    return full === root ? allowRoot : full.startsWith(root + sep)
  })
}

const ext = (p: string) => extname(p).toLowerCase()
/** ".pdf" at the end of a name is an extension; ".2" in "notlar 1.2" is not. */
const hasExt = (name: string) => /\.[a-z][a-z0-9]{0,4}$/i.test(name)

function need(ok: boolean, code: string): void {
  if (!ok) throw new Error(code)
}

const exists = (p: string) => stat(p).then(() => true, () => false)

/** The last rename or move, so "geri al" can put it back. */
let last: { from: string; to: string } | null = null

export async function createTextFile(dir: string, rawName: string, content: string, roots: string[]): Promise<{ path: string; name: string }> {
  need(within(dir, roots, true), 'outside')
  const name = safeName(rawName)
  need(!!name, 'bad name')
  need(!hasExt(name) || TEXT_EXT.includes(ext(name)), 'only text files')
  const full = hasExt(name) ? name : `${name}.txt`
  const e = extname(full)
  const base = full.slice(0, full.length - e.length)
  for (let n = 1; n <= 99; n++) {
    const target = join(dir, n === 1 ? full : `${base} (${n})${e}`)
    try {
      await writeFile(target, content.slice(0, MAX_WRITE), { flag: 'wx', encoding: 'utf8' })
      return { path: target, name: basename(target) }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new Error('exists')
}

export async function appendText(path: string, text: string, roots: string[]): Promise<void> {
  need(within(path, roots), 'outside')
  need(TEXT_EXT.includes(ext(path)), 'only text files')
  const st = await stat(path)
  need(st.isFile() && st.size <= MAX_FILE, 'too big')
  const old = await readFile(path, 'utf8')
  await appendFile(path, `${old === '' || old.endsWith('\n') ? '' : '\n'}${text.slice(0, MAX_WRITE)}\n`, 'utf8')
}

export async function readText(path: string, roots: string[]): Promise<{ text: string; truncated: boolean }> {
  need(within(path, roots), 'outside')
  need(READ_EXT.includes(ext(path)), 'only text files')
  const st = await stat(path)
  need(st.isFile() && st.size <= MAX_FILE, 'too big')
  const text = (await readFile(path, 'utf8')).replace(/^﻿/, '')
  return { text: text.slice(0, MAX_READ), truncated: text.length > MAX_READ }
}

/** The newest `limit` entries of a folder. */
export async function listDir(dir: string, roots: string[], limit = 10): Promise<{ entries: { name: string; isDir: boolean }[]; total: number }> {
  need(within(dir, roots, true), 'outside')
  const all = (await readdir(dir, { withFileTypes: true })).filter(e => !/^[.$]|^desktop\.ini$|^thumbs\.db$/i.test(e.name))
  const dated = await Promise.all(all.slice(0, 400).map(async e => ({ name: e.name, isDir: e.isDirectory(), time: (await stat(join(dir, e.name)).catch(() => null))?.mtimeMs ?? 0 })))
  dated.sort((a, b) => b.time - a.time)
  return { entries: dated.slice(0, limit).map(({ name, isDir }) => ({ name, isDir })), total: all.length }
}

export async function makeDir(parent: string, rawName: string, roots: string[]): Promise<{ path: string; existed: boolean }> {
  need(within(parent, roots, true), 'outside')
  const name = safeName(rawName)
  need(!!name, 'bad name')
  const path = join(parent, name)
  try {
    await mkdir(path)
    return { path, existed: false }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return { path, existed: true }
    throw err
  }
}

/** A name for a file keeps its extension when the new name has none; nothing becomes or stops being a program. */
export async function renameItem(from: string, rawNew: string, roots: string[]): Promise<{ from: string; to: string }> {
  need(within(from, roots), 'outside')
  const st = await stat(from)
  let name = safeName(rawNew)
  need(!!name, 'bad name')
  if (!st.isDirectory()) {
    need(!BLOCKED_EXT.includes(ext(from)), 'program')
    if (!hasExt(name)) name += extname(from)
    need(!BLOCKED_EXT.includes(ext(name)), 'program')
  }
  const to = join(dirname(from), name)
  need(to.toLowerCase() === from.toLowerCase() || !(await exists(to)), 'exists')
  await rename(from, to)
  last = { from, to }
  return { from, to }
}

export async function moveItem(from: string, destDir: string, roots: string[]): Promise<{ from: string; to: string }> {
  need(within(from, roots) && within(destDir, roots, true), 'outside')
  const st = await stat(from)
  need((await stat(destDir)).isDirectory(), 'not a folder')
  need(st.isDirectory() || !BLOCKED_EXT.includes(ext(from)), 'program')
  const src = resolve(from)
  need(!(st.isDirectory() && (resolve(destDir) === src || resolve(destDir).startsWith(src + sep))), 'into itself')
  need(resolve(dirname(from)) !== resolve(destDir), 'same place')
  const to = join(destDir, basename(from))
  need(!(await exists(to)), 'exists')
  try {
    await rename(from, to)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') throw new Error('other drive')
    throw err
  }
  last = { from, to }
  return { from, to }
}

/** Puts the last rename or move back, if the way back is still free. */
export async function undoLast(roots: string[]): Promise<{ from: string; to: string }> {
  need(!!last, 'nothing to undo')
  const { from, to } = last!
  need(within(from, roots) && within(to, roots), 'outside')
  need((await exists(to)) && !(await exists(from)), 'cannot undo')
  await rename(to, from)
  last = null
  return { from: to, to: from }
}

export function forgetUndo(): void {
  last = null
}
