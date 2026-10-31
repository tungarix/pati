import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { loadSettings } from '../src/main/settings.ts'

const write = (data: object) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pati-')), 'settings.json')
  fs.writeFileSync(file, JSON.stringify(data))
  return file
}

test('first run gets the defaults in the system language', () => {
  const s = loadSettings(path.join(os.tmpdir(), 'pati-yok', 'settings.json'), 'en')
  assert.equal(s.language, 'en')
  assert.deepEqual(s.ai.servers, [])
  assert.deepEqual(s.ai.tools, { clipboard: false, web: false, actions: true })
  assert.deepEqual(s.ai.allowedActions, [])
})

test('a v0.2 single server becomes the first of the list, keeping its key', () => {
  const s = loadSettings(write({ ai: { enabled: true, baseUrl: 'http://localhost:8081/v1', apiKey: 'local', model: '' } }), 'tr')
  assert.deepEqual(s.ai.servers, [{ baseUrl: 'http://localhost:8081/v1', apiKey: 'local', model: '' }])
  assert.equal(s.ai.memory, true)
})

test('settings from before voice get the voice defaults', () => {
  const s = loadSettings(write({ language: 'tr' }), 'tr')
  assert.deepEqual(s.voice, { enabled: true, shortcut: 'Control+Shift+Space', whisperPath: '', modelPath: '' })
})

test('size defaults to 1 and stays within 0.5-2', () => {
  assert.equal(loadSettings(write({ language: 'tr' }), 'tr').size, 1)
  assert.equal(loadSettings(write({ size: 9 }), 'tr').size, 2)
  assert.equal(loadSettings(write({ size: 0.1 }), 'tr').size, 0.5)
  assert.equal(loadSettings(write({ size: 1.4 }), 'tr').size, 1.4)
})

test('settings from before the built-in model get it enabled and not yet offered', () => {
  assert.deepEqual(loadSettings(write({ ai: { enabled: true, servers: [] } }), 'tr').ai.builtIn, { enabled: true, offered: false })
  assert.deepEqual(loadSettings(write({ ai: { builtIn: { offered: true } } }), 'tr').ai.builtIn, { enabled: true, offered: true })
  assert.deepEqual(loadSettings(write({ ai: { builtIn: { enabled: false, offered: true } } }), 'tr').ai.builtIn, { enabled: false, offered: true })
})

test('enemies default to rare, and a saved choice or a partial section merges', () => {
  assert.equal(loadSettings(write({}), 'tr').enemies.frequency, 'rare')
  assert.equal(loadSettings(write({ enemies: { frequency: 'often' } }), 'tr').enemies.frequency, 'often')
  assert.equal(loadSettings(write({ enemies: {} }), 'tr').enemies.frequency, 'rare')
})
