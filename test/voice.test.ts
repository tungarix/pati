import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { cleanTranscript, findModel, findWhisper } from '../src/main/voice.ts'
import { encodeWav } from '../src/shared/wav.ts'

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
