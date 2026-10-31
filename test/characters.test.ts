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

const FIGHTER = path.resolve(import.meta.dirname, 'fixtures', 'fighter')

test('a pack with a fight scene and enemies loads them as file URLs', () => {
  const c = readCharacterPack(FIGHTER, false)
  assert.deepEqual(c.notes, [])
  assert.equal(c.scenes.fight.frames.length, 3)
  assert.equal(c.scenes.fight.fps, 5)
  assert.equal(c.enemies.length, 1)
  assert.equal(c.enemies[0].name, 'Crab')
  assert.ok(c.enemies[0].frames.die[1].startsWith('file:'))
  assert.deepEqual(c.lines.tr.win, ['Done.'])
})

test('a pack without scenes or enemies has none and no notes', () => {
  const c = readCharacterPack(path.join(BUILT_IN, 'tungarix'), true)
  assert.deepEqual(c.enemies, [])
  assert.deepEqual(c.scenes, {})
  assert.deepEqual(c.notes, [])
})

/** The fighter pack as JSON with `change` applied, in a throwaway folder next to its pictures. */
function fighterWith(change: (j: Record<string, any>) => void): string {
  const j = JSON.parse(fs.readFileSync(path.join(FIGHTER, 'character.json'), 'utf8'))
  change(j)
  const dir = packDir({ 'character.json': JSON.stringify(j) })
  fs.cpSync(FIGHTER, dir, { recursive: true, filter: f => !f.endsWith('character.json') })
  return dir
}

test('enemies without a fight scene, or with missing frames, are off with a note; the pack still loads', () => {
  const noFight = readCharacterPack(fighterWith(j => delete j.scenes.fight), false)
  assert.deepEqual(noFight.enemies, [])
  assert.match(noFight.notes.join(), /scenes\.fight/)

  const noDie = readCharacterPack(fighterWith(j => delete j.enemies[0].frames.die), false)
  assert.deepEqual(noDie.enemies, [])
  assert.match(noDie.notes.join(), /crab/)

  const noFile = readCharacterPack(fighterWith(j => (j.enemies[0].frames.hit = ['enemy/yok.png'])), false)
  assert.deepEqual(noFile.enemies, [])

  const notAList = readCharacterPack(fighterWith(j => (j.enemies = 'crab')), false)
  assert.deepEqual(notAList.enemies, [])
  assert.equal(notAList.notes.length, 1)

  const badScene = readCharacterPack(fighterWith(j => (j.scenes.win = { frames: 'win.png' })), false)
  assert.equal(badScene.scenes.win, undefined)
  assert.ok(badScene.scenes.fight)
})

test('enemy and scene frames cannot leave the pack folder', () => {
  const c = readCharacterPack(fighterWith(j => (j.enemies[0].frames.walk = ['../../../etc/passwd'])), false)
  assert.deepEqual(c.enemies, [])
  assert.match(c.notes.join(), /paket dışında/)

  const scene = readCharacterPack(fighterWith(j => (j.scenes.fight = { frames: ['../escape.png'], fps: 5 })), false)
  assert.equal(scene.scenes.fight, undefined)
  assert.match(scene.notes.join(), /paket dışında/)
})

test('loadCharacters reports a feature-off pack as a soft problem but still loads it', () => {
  const dir = fighterWith(j => delete j.scenes.fight)
  const { characters, problems } = loadCharacters(BUILT_IN, path.dirname(dir))
  assert.ok(characters.some(c => c.id === 'kedi'))
  assert.ok(problems.some(p => p.id === 'kedi' && p.soft))
})

test('speed and weight are clamped to usable values', () => {
  const c = readCharacterPack(fighterWith(j => Object.assign(j.enemies[0], { speed: 99, weight: -3 })), false)
  assert.equal(c.enemies[0].speed, 8)
  assert.equal(c.enemies[0].weight, 1)
})
