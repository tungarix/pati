import { test } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { addFact, forgetFacts, loadFacts, looksPersonal, MEMORY_LIMIT, memoryBlock, saveFacts } from '../src/main/memory.ts'

test('facts are added once, trimmed and capped', () => {
  let facts = addFact([], '  Adım   Arda  ', 1)
  facts = addFact(facts, 'adım arda', 2) // same fact, other spacing and case
  assert.deepEqual(facts.map(f => f.text), ['Adım Arda'])

  for (let i = 0; i < MEMORY_LIMIT + 5; i++) facts = addFact(facts, `bilgi ${i}`, 10 + i)
  assert.equal(facts.length, MEMORY_LIMIT)
  assert.equal(facts.at(-1)?.text, `bilgi ${MEMORY_LIMIT + 4}`)
  assert.ok(!facts.some(f => f.text === 'Adım Arda')) // the oldest went first
})

test('forget removes matching facts, ignores empty input', () => {
  const facts = addFact(addFact([], 'Kedimin adı Duman'), 'EEM okuyorum')
  const r = forgetFacts(facts, 'kedi')
  assert.equal(r.removed, 1)
  assert.deepEqual(r.facts.map(f => f.text), ['EEM okuyorum'])
  assert.equal(forgetFacts(facts, '  ').removed, 0)
})

test('personal statements are spotted, small talk is not', () => {
  assert.ok(looksPersonal('Selam, ben Ali. Basketbolu çok severim.'))
  assert.ok(looksPersonal('Adım Zeynep, 24 yaşındayım'))
  assert.ok(looksPersonal("Hi, I'm Sam and I love chess"))
  assert.ok(!looksPersonal('Bugün hava nasıl?'))
  assert.ok(!looksPersonal('Bir şaka anlat'))
})

test('Memory.md round-trips, and lines added by hand are read', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pati-mem-')), 'Memory.md')
  saveFacts(file, addFact(addFact([], 'EEM okuyorum'), 'Çay sever'), 'tr')
  fs.appendFileSync(file, '- Kedisinin adı Duman\n')
  const facts = loadFacts(file)
  assert.deepEqual(facts.map(f => f.text), ['EEM okuyorum', 'Çay sever', 'Kedisinin adı Duman'])
  assert.equal(facts[0].id, loadFacts(file)[0].id) // ids stay stable across reloads
  assert.match(fs.readFileSync(file, 'utf8'), /^# Memory\n\n.*\n\n- EEM okuyorum\n/)
})

test('the prompt block lists facts, or is empty', () => {
  assert.equal(memoryBlock([], 'tr'), '')
  assert.equal(memoryBlock(addFact([], 'EEM okuyorum'), 'tr'), 'Kullanıcı hakkında bildiklerin:\n- EEM okuyorum')
})
