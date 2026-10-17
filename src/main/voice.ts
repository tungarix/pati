// Speech to text with whisper.cpp, run as a separate program on the user's machine.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { Lang } from '../shared/types.ts'

const EXE_NAMES = ['whisper-cli.exe', 'whisper-cli']

/** The chosen whisper-cli, else the first one on PATH; null when there is none. */
export function findWhisper(chosen: string, pathEnv = process.env.PATH ?? ''): string | null {
  if (chosen) return fs.existsSync(chosen) ? chosen : null
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean))
    for (const name of EXE_NAMES) {
      const file = path.join(dir, name)
      if (fs.existsSync(file)) return file
    }
  return null
}

/** The chosen model, else a ggml-*.bin in a models folder beside or above the program (largest first: usually the best). */
export function findModel(chosen: string, exe: string | null): string | null {
  if (chosen) return fs.existsSync(chosen) ? chosen : null
  if (!exe) return null
  const dirs = [path.join(path.dirname(exe), 'models'), path.join(path.dirname(exe), '..', 'models')]
  const models = dirs.flatMap(d => {
    try {
      return fs.readdirSync(d).filter(f => /^ggml-.*\.bin$/i.test(f)).map(f => path.join(d, f))
    } catch {
      return []
    }
  })
  return models.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0] ?? null
}

/** whisper's text output as one line, without the tags it writes for silence and noise. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[\d\d:\d\d[^\]]*\]/g, '') // timestamps, if any
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, '') // [BLANK_AUDIO], (müzik), *gülüyor*
    .replace(/\s+/g, ' ')
    .trim()
}

/** Writes the WAV to a temporary file, runs whisper on it and returns what was said ('' for silence). */
export function transcribe(exe: string, model: string, wav: Buffer, lang: Lang): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-voice-'))
  const input = path.join(dir, 'in.wav')
  fs.writeFileSync(input, wav)
  // The text goes to a file: the Windows console would mangle Turkish letters on stdout.
  const args = ['-m', model, '-f', input, '-l', lang, '-nt', '-np', '-otxt', '-of', path.join(dir, 'out')]
  return new Promise((resolve, reject) =>
    execFile(exe, args, { timeout: 120_000, windowsHide: true }, err => {
      try {
        if (err) return reject(err)
        resolve(cleanTranscript(fs.readFileSync(path.join(dir, 'out.txt'), 'utf8')))
      } catch (e) {
        reject(e)
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    }),
  )
}
