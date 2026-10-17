import { test } from 'node:test'
import assert from 'node:assert/strict'

import { matchIntent } from '../src/main/intents.ts'

const m = (s: string) => matchIntent(s, 'tr')

test('notes are taken with their text', () => {
  assert.deepEqual(m('Not al: yarın saat 10da Aktenak toplantısı'), { tool: 'take_note', args: { text: 'yarın saat 10da Aktenak toplantısı' } })
  assert.deepEqual(m('Bunu not et, KAM için yeni boss fikri: Tepegöz'), { tool: 'take_note', args: { text: 'KAM için yeni boss fikri: Tepegöz' } })
  assert.equal(m('not al'), null) // nothing to write yet: let the model ask
})

test('music and volume commands', () => {
  assert.deepEqual(m('Müziği durdur'), { tool: 'media_control', args: { action: 'play_pause' }, times: 1 })
  assert.deepEqual(m('sesi biraz kıs'), { tool: 'media_control', args: { action: 'volume_down' }, times: 1 })
  assert.deepEqual(m('Sesi epey aç!'), { tool: 'media_control', args: { action: 'volume_up' }, times: 2 })
  assert.deepEqual(m('sonraki şarkı'), { tool: 'media_control', args: { action: 'next' }, times: 1 })
  assert.deepEqual(m('sessize al'), { tool: 'media_control', args: { action: 'mute' }, times: 1 })
})

test('folders by name; apps and questions are left to the model', () => {
  assert.deepEqual(m('Masaüstümü aç'), { tool: 'open_folder', args: { which: 'desktop' } })
  assert.deepEqual(m('indirilenler klasörünü aç'), { tool: 'open_folder', args: { which: 'downloads' } })
  assert.equal(m('Sesi kısmalı mıyım sence?'), null)
  assert.equal(m('Bugün çok yorgunum'), null)
})

test('polite forms still match, questions about it do not', () => {
  assert.deepEqual(m('Sesi kısar mısın?'), { tool: 'media_control', args: { action: 'volume_down' }, times: 1 })
  assert.deepEqual(m('müziği durdurur musun'), { tool: 'media_control', args: { action: 'play_pause' }, times: 1 })
  assert.equal(m('sesi açmak istemiyorum'), null)
})

test('battery and system questions are measured, not guessed', () => {
  for (const q of ['pil', 'Pil kaç?', 'pil durumu nasıl', 'şarj ne durumda', 'bilgisayar durumu', 'ram kullanımı ne kadar'])
    assert.deepEqual(m(q), { tool: 'system_status', args: {} }, q)
  assert.equal(m('pil almam lazım'), null)
})

test('opening an app by name; websites still go to the model', () => {
  assert.deepEqual(m("spotify'ı aç"), { tool: 'open_app', args: { name: 'spotify' } })
  assert.deepEqual(m("Discord'u başlatır mısın"), { tool: 'open_app', args: { name: 'discord' } })
  assert.equal(m("YouTube'da lo-fi müzik aç"), null)
  assert.deepEqual(m('Masaüstümü aç'), { tool: 'open_folder', args: { which: 'desktop' } })
})
