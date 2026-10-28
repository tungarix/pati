// Downloads Piper + the Turkish voice into build/piper/ for the installer (electron-builder extraResources).
// Pinned by sha256; files that are already there with the right hash are skipped.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, '..', 'build', 'piper')
const VOICES = path.join(OUT, 'voices')
const ZIP = { url: 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip', sha256: 'f3c58906402b24f3a96d92145f58acba6d86c9b5db896d207f78dc80811efcea' }
const VOICE_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/tr/tr_TR/dfki/medium/'
const VOICE_FILES = [
  { name: 'tr_TR-dfki-medium.onnx', sha256: '2844717f524ab965d3fe86e60562cbb601d3e456836efcc2196cc3a14112a8fb' },
  { name: 'tr_TR-dfki-medium.onnx.json', sha256: '13ebd7810f1b61b5027583cf3131a0a233b6ea81c38f2200ebc4ff41c3cca039' },
  { name: 'MODEL_CARD', sha256: 'a3e08c57b9c6d428f8e4fb146512c8b1fb96a68c99d43820ed1dfea6d39cb35f' },
]

const sha = buf => createHash('sha256').update(buf).digest('hex')
const hashOf = file => (fs.existsSync(file) ? sha(fs.readFileSync(file)) : null)

async function download(url, want) {
  console.log('downloading', url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (sha(buf) !== want) throw new Error(`${url}: sha256 mismatch (got ${sha(buf)}, want ${want})`)
  return buf
}

async function fetchPiper() {
  const marker = path.join(OUT, '.zip-sha256') // the zip is not kept, so remember which one was unpacked
  if (fs.existsSync(path.join(OUT, 'piper.exe')) && fs.existsSync(marker) && fs.readFileSync(marker, 'utf8') === ZIP.sha256) return
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-piper-'))
  try {
    const zip = path.join(tmp, 'piper.zip')
    fs.writeFileSync(zip, await download(ZIP.url, ZIP.sha256))
    // Windows' own bsdtar reads zips; the zip has a top-level piper/ folder
    const tar = path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe')
    execFileSync(tar, ['-xf', zip, '--strip-components=1', '-C', OUT])
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  fs.writeFileSync(marker, ZIP.sha256)
}

async function fetchVoice() {
  for (const { name, sha256 } of VOICE_FILES) {
    const file = path.join(VOICES, name)
    if (hashOf(file) !== sha256) fs.writeFileSync(file, await download(VOICE_URL + name, sha256))
  }
}

const LICENSES = `Pati ships Piper and one voice so speech works without a download.

Piper (rhasspy/piper, release 2023.11.14-2)
  License: MIT. https://github.com/rhasspy/piper/blob/master/LICENSE.md
  Source:  https://github.com/rhasspy/piper

espeak-ng (bundled inside Piper: espeak-ng.dll and espeak-ng-data)
  License: GPL-3.0. https://github.com/espeak-ng/espeak-ng/blob/master/COPYING
  Source:  https://github.com/espeak-ng/espeak-ng
  Piper runs as a separate program; Pati only starts it and reads its WAV output.

Voice tr_TR-dfki-medium (voices/)
  License: CC BY-NC-SA 4.0 (non-commercial). https://creativecommons.org/licenses/by-nc-sa/4.0/
  Dataset: DFKI, https://github.com/marytts/dfki-ot-data
  From:    https://huggingface.co/rhasspy/piper-voices
`

fs.mkdirSync(VOICES, { recursive: true })
await fetchPiper()
await fetchVoice()
fs.writeFileSync(path.join(OUT, 'LICENSES.txt'), LICENSES)
console.log('piper ready in', OUT)
