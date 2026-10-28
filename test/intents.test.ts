import { test } from 'node:test'
import assert from 'node:assert/strict'

import { matchFocus, matchIntent, matchScreen } from '../src/main/intents.ts'

const m = (s: string) => matchIntent(s, 'tr')

test('notes are taken with their text', () => {
  assert.deepEqual(m('Not al: yarın saat 10da ekip toplantısı'), { tool: 'take_note', args: { text: 'yarın saat 10da ekip toplantısı' } })
  assert.deepEqual(m('Bunu not et, oyun için yeni boss fikri: Tepegöz'), { tool: 'take_note', args: { text: 'oyun için yeni boss fikri: Tepegöz' } })
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

test('focus mode starts with an optional length and stops', () => {
  assert.equal(matchFocus('25 dakika odaklanacağım'), 25)
  assert.equal(matchFocus('Odaklan'), 25)
  assert.equal(matchFocus('pomodoro başlat'), 25)
  assert.equal(matchFocus('50 dk odaklanalım!'), 50)
  assert.equal(matchFocus('focus for 40 minutes'), 40)
  assert.equal(matchFocus('odağı bitir'), 'stop')
  assert.equal(matchFocus('odaklanamıyorum hiç'), null)
  assert.equal(matchFocus('500 dakika odaklan'), null)
})

test('questions about the screen are recognised, other mentions of it are not', () => {
  assert.equal(matchScreen('Ekrana bak, ne görüyorsun?'), 'Ekrana bak, ne görüyorsun?')
  assert.equal(matchScreen('ekrandaki hatayı açıkla'), 'ekrandaki hatayı açıkla')
  assert.equal(matchScreen('bu hatayı açıkla'), 'bu hatayı açıkla')
  assert.equal(matchScreen('ekranı oku'), 'ekranı oku')
  assert.equal(matchScreen('ekranada ne var'), 'ekranada ne var') // typos too
  assert.equal(matchScreen('ekran kartında ne var'), null)
  assert.equal(matchScreen("what's on my screen?"), "what's on my screen?")
  assert.equal(matchScreen('yeni ekran kartı almalı mıyım'), null)
  assert.equal(matchScreen('ekranım çok parlak'), null)
})

test('files and folders by name are not apps and not the Desktop', () => {
  assert.deepEqual(m('masaüstündeki tungarix dosyasını aç'), { tool: 'open_path', args: { name: 'tungarix', kind: 'file', where: 'desktop' } })
  assert.deepEqual(m('tungarix dosyasını aç'), { tool: 'open_path', args: { name: 'tungarix', kind: 'file' } })
  assert.deepEqual(m('tungarix adlı dosyayı aç'), { tool: 'open_path', args: { name: 'tungarix', kind: 'file' } })
  assert.deepEqual(m('tungarix dosya aç'), { tool: 'open_path', args: { name: 'tungarix', kind: 'file' } })
  assert.deepEqual(m('ödev klasörünü aç'), { tool: 'open_path', args: { name: 'ödev', kind: 'folder' } })
  assert.deepEqual(m("'rapor' dosyasını aç"), { tool: 'open_path', args: { name: 'rapor', kind: 'file' } })
  assert.deepEqual(m('rapor.pdf aç'), { tool: 'open_path', args: { name: 'rapor.pdf', kind: 'any' } })
  assert.deepEqual(m('masaüstünü aç'), { tool: 'open_folder', args: { which: 'desktop' } })
  assert.deepEqual(m('belgelerimi aç'), { tool: 'open_folder', args: { which: 'documents' } })
  assert.deepEqual(m("spotify'ı aç"), { tool: 'open_app', args: { name: 'spotify' } })
  assert.deepEqual(m('visual studio code aç'), { tool: 'open_app', args: { name: 'visual studio code' } })
})

test('file commands: create, append, read, list, find, folders, rename, move, copy path, undo', () => {
  assert.deepEqual(m('masaüstüne Alışveriş.txt oluştur: süt, ekmek'), { tool: 'create_file', args: { name: 'Alışveriş.txt', content: 'süt, ekmek', where: 'desktop' } })
  assert.deepEqual(m('notlar adlı dosya oluştur ve içine yarın toplantı var yaz'), { tool: 'create_file', args: { name: 'notlar', content: 'yarın toplantı var' } })
  assert.deepEqual(m('rapor.txt oluştur'), { tool: 'create_file', args: { name: 'rapor.txt', content: '' } })
  assert.equal(m('bir rapor oluştur'), null)
  assert.deepEqual(m('alışveriş listesine peynir ekle'), { tool: 'append_to_file', args: { name: 'alışveriş', text: 'peynir', create: true } })
  assert.deepEqual(m('notlar dosyasına şunu ekle: Pazartesi sınav'), { tool: 'append_to_file', args: { name: 'notlar', text: 'Pazartesi sınav' } })
  assert.deepEqual(m('rapor.txt dosyasını oku'), { tool: 'read_file', args: { name: 'rapor.txt' } })
  assert.deepEqual(m('indirilenlerde ne var'), { tool: 'list_folder', args: { where: 'downloads' } })
  assert.deepEqual(m('masaüstündeki dosyaları listele'), { tool: 'list_folder', args: { where: 'desktop' } })
  assert.deepEqual(m('aktenak dosyasını bul'), { tool: 'find_path', args: { name: 'aktenak', kind: 'file' } })
  assert.equal(m('annem nerede'), null)
  assert.deepEqual(m('masaüstüne Proje klasörü oluştur'), { tool: 'make_folder', args: { name: 'Proje', where: 'desktop' } })
  assert.deepEqual(m('rapor dosyasının adını final yap'), { tool: 'rename_path', args: { name: 'rapor dosyası', new_name: 'final' } })
  assert.deepEqual(m('rapor dosyasını ödev klasörüne taşı'), { tool: 'move_path', args: { name: 'rapor dosyası', to: 'ödev' } })
  assert.deepEqual(m('rapor dosyasının yolunu kopyala'), { tool: 'copy_path', args: { name: 'rapor dosyası' } })
  assert.deepEqual(m('geri al'), { tool: 'undo_last_change', args: {} })
})

test('"aktenak dosya klasör aç" means the folder, in either word order', () => {
  assert.deepEqual(m('aktenak dosya klasör aç'), { tool: 'open_path', args: { name: 'aktenak', kind: 'folder' } })
  assert.deepEqual(m('aktenak klasör dosya aç'), { tool: 'open_path', args: { name: 'aktenak', kind: 'folder' } })
})
