import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loadCharacters, readCharacterPack } from '../src/main/characters.ts'

const BUILT_IN = path.resolve(import.meta.dirname, '..', 'characters')

/** A throwaway characters folder with one pack built from `files`. */
function packDir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-'))
  const dir = path.join(root, 'kedi')
  fs.mkdirSync(dir)
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body)
  return dir
}

const idle = { animations: { idle: { frames: ['a.png'], fps: 1 } } }

test('the built-in Tungarix pack loads as v2 with both languages', () => {
  const c = readCharacterPack(path.join(BUILT_IN, 'tungarix'), true)
  assert.equal(c.name, 'Tungarix')
  assert.equal(c.version, '1.1.0')
  assert.equal(c.lines.tr.menu, 'Söyle kanka, ne lazım?')
  assert.equal(c.lines.en.menu, 'Talk to me, what do you need?')
  assert.ok(c.animations.walk?.frames[0].startsWith('file:'))
})

test('a v1 pack (no manifest, flat lines) still loads; missing language borrows its own', () => {
  const dir = packDir({
    'character.json': JSON.stringify({ name: 'Kedi', ...idle, lines: { menu: 'Miyav?' } }),
    'a.png': '',
  })
  const c = readCharacterPack(dir, false)
  assert.equal(c.name, 'Kedi')
  assert.equal(c.lines.tr.menu, 'Miyav?')
  assert.equal(c.lines.en.menu, 'Miyav?') // the character's own voice beats a generic default
  assert.equal(c.lines.en.thanks, 'Thanks') // never set anywhere: default
})

test('broken packs are reported, not loaded', () => {
  const noFrame = packDir({ 'character.json': JSON.stringify({ name: 'Kedi', ...idle }) })
  assert.throws(() => readCharacterPack(noFrame, false), /a\.png/)

  const escape = packDir({
    'character.json': JSON.stringify({ name: 'Kedi', animations: { idle: { frames: ['../../x.png'], fps: 1 } } }),
  })
  assert.throws(() => readCharacterPack(escape, false), /paket dışında/)

  const wrongType = packDir({
    'manifest.json': JSON.stringify({ schema: 2, type: 'plugin', name: 'X', version: '1.0.0' }),
    'character.json': JSON.stringify(idle),
    'a.png': '',
  })
  assert.throws(() => readCharacterPack(wrongType, false), /karakter paketi değil/)

  const { characters, problems } = loadCharacters(BUILT_IN, path.dirname(noFrame))
  assert.ok(characters.some(c => c.id === 'tungarix'))
  assert.equal(problems.length, 1)
})
