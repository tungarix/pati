import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { cleanTranscript, findModel, findPiper, findPiperVoice, findWhisper, lengthScale } from '../src/main/voice.ts'
import { encodeWav } from '../src/shared/wav.ts'
import { PIPER_VOICE, piperWanted } from '../src/shared/voicePick.ts'

test('WAV header says 16 kHz, mono, 16-bit PCM and the right sizes', () => {
  const buf = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
  const v = new DataView(buf)
  const ascii = (at: number) => String.fromCharCode(...new Uint8Array(buf, at, 4))
  assert.equal(buf.byteLength, 44 + 8)
  assert.deepEqual([ascii(0), ascii(8), ascii(12), ascii(36)], ['RIFF', 'WAVE', 'fmt ', 'data'])
  assert.equal(v.getUint32(4, true), 36 + 8)
  assert.equal(v.getUint16(20, true), 1)
  assert.equal(v.getUint16(22, true), 1)
  assert.equal(v.getUint32(24, true), 16000)
  assert.equal(v.getUint32(28, true), 32000)
  assert.equal(v.getUint16(34, true), 16)
  assert.equal(v.getUint32(40, true), 8)
  // loud samples are clipped, not wrapped around
  assert.deepEqual([0, 1, 2, 3].map(i => v.getInt16(44 + i * 2, true)), [0, 32767, -32767, 32767])
})

test('whisper output becomes one clean line', () => {
  assert.equal(cleanTranscript(' Merhaba, saat kaç?\n'), 'Merhaba, saat kaç?')
  assert.equal(cleanTranscript('[BLANK_AUDIO]\n'), '')
  assert.equal(cleanTranscript(' (müzik) Spotify\'ı aç\n bir de sesi kıs.\n'), "Spotify'ı aç bir de sesi kıs.")
  assert.equal(cleanTranscript('[00:00:00.000 --> 00:00:02.000]  Selam'), 'Selam')
})

test('whisper and its model are found on PATH and in a models folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-whisper-'))
  const bin = path.join(root, 'Release')
  fs.mkdirSync(bin)
  fs.mkdirSync(path.join(root, 'models'))
  const exe = path.join(bin, 'whisper-cli.exe')
  fs.writeFileSync(exe, '')
  fs.writeFileSync(path.join(root, 'models', 'ggml-base.bin'), 'x')
  fs.writeFileSync(path.join(root, 'models', 'ggml-small.bin'), 'xxxx')
  assert.equal(findWhisper('', ['/nowhere', bin].join(path.delimiter)), exe)
  assert.equal(findWhisper('', '/nowhere'), null)
  assert.equal(findWhisper(path.join(root, 'yok.exe'), bin), null)
  assert.equal(findModel('', exe), path.join(bin, '..', 'models', 'ggml-small.bin'))
  assert.equal(findModel('', null), null)
})

test('Piper search order: chosen > PATH > bundled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-piper-'))
  const mk = (sub: string) => {
    fs.mkdirSync(path.join(dir, sub))
    fs.writeFileSync(path.join(dir, sub, 'piper.exe'), '')
    return path.join(dir, sub, 'piper.exe')
  }
  const [chosen, onPath, bundled] = [mk('a'), mk('b'), mk('c')]
  assert.equal(findPiper(chosen, path.dirname(onPath), bundled), chosen)
  assert.equal(findPiper('', path.dirname(onPath), bundled), onPath)
  assert.equal(findPiper('', '', bundled), bundled)
  assert.equal(findPiper('', '', path.join(dir, 'yok.exe')), null)
  assert.equal(findPiper(path.join(dir, 'yok.exe'), '', bundled), null) // a wrong choice is not silently replaced
  fs.rmSync(dir, { recursive: true, force: true })
})

test('Piper length_scale is the inverse of the speed, kept in range', () => {
  assert.equal(lengthScale(1), 1)
  assert.equal(lengthScale(2), 0.5)
  assert.equal(lengthScale(0.5), 2)
  assert.equal(lengthScale(10), 0.5)
  assert.equal(lengthScale(0), 1)
})

test('Piper is found by path or on PATH; its voice from the path or a voices folder beside it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-piper-'))
  const exe = path.join(dir, 'piper.exe')
  fs.writeFileSync(exe, '')
  assert.equal(findPiper('', dir), exe)
  assert.equal(findPiper(exe), exe)
  assert.equal(findPiper(path.join(dir, 'yok.exe')), null)
  assert.equal(findPiperVoice('', exe), null)
  fs.mkdirSync(path.join(dir, 'voices'))
  const voice = path.join(dir, 'voices', 'tr_TR-dfki-medium.onnx')
  fs.writeFileSync(voice, '')
  assert.equal(findPiperVoice('', exe), null) // no .onnx.json beside it
  fs.writeFileSync(`${voice}.json`, '{}')
  assert.equal(findPiperVoice('', exe), voice)
  assert.equal(findPiperVoice(voice, null), voice)
  assert.equal(findPiperVoice('', null), null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('piperWanted: piper always, a Windows voice never, auto keeps the bundled voice out of English', () => {
  assert.equal(piperWanted(PIPER_VOICE, 'en', true), true)
  assert.equal(piperWanted('Microsoft Tolga', 'tr', false), false)
  assert.equal(piperWanted(null, 'tr', true), true)
  assert.equal(piperWanted(null, 'en', true), false)
  assert.equal(piperWanted(null, 'en', false), true) // own Piper voice in English
})
