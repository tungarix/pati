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

// ---- Speaking with Piper (neural TTS, also a separate program) ------------------------

const PIPER_NAMES = ['piper.exe', 'piper']
export const TTS_MAX_CHARS = 2000

/** The chosen piper.exe, else the first one on PATH, else the copy bundled with Pati; null when there is none. */
export function findPiper(chosen: string, pathEnv = process.env.PATH ?? '', bundled = ''): string | null {
  if (chosen) return fs.existsSync(chosen) ? chosen : null
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean))
    for (const name of PIPER_NAMES) {
      const file = path.join(dir, name)
      if (fs.existsSync(file)) return file
    }
  return bundled && fs.existsSync(bundled) ? bundled : null
}

/** The chosen voice, else the first *.onnx in a voices folder beside piper.exe; its .onnx.json must be next to it. */
export function findPiperVoice(chosen: string, exe: string | null): string | null {
  let voice: string | undefined = chosen
  if (!voice) {
    if (!exe) return null
    const dir = path.join(path.dirname(exe), 'voices')
    try {
      voice = fs.readdirSync(dir).filter(f => /\.onnx$/i.test(f)).map(f => path.join(dir, f))[0]
    } catch {
      return null
    }
  }
  return voice && fs.existsSync(voice) && fs.existsSync(`${voice}.json`) ? voice : null
}

/** Piper's --length_scale: above 1 is slower, so it is the inverse of the speed, kept within a sane range. */
export function lengthScale(rate: number): number {
  return Math.min(2, Math.max(0.5, 1 / (rate > 0 ? rate : 1)))
}

/** Speaks `text` into a temporary WAV and returns its bytes. */
export function synthesize(exe: string, voice: string, text: string, rate: number): Promise<Buffer> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-tts-'))
  const out = path.join(dir, 'out.wav')
  const done = () => fs.rmSync(dir, { recursive: true, force: true })
  return new Promise((resolve, reject) => {
    const args = ['--model', voice, '--output_file', out, '--length_scale', String(lengthScale(rate))]
    const child = execFile(exe, args, { timeout: 60_000, windowsHide: true }, err => {
      try {
        if (err) return reject(err)
        resolve(fs.readFileSync(out))
      } catch (e) {
        reject(e)
      } finally {
        done()
      }
    })
    // piper treats each line as its own utterance, so keep the answer on one line
    child.stdin?.end(text.slice(0, TTS_MAX_CHARS).replace(/\s*\n\s*/g, ' ') + '\n', 'utf8')
  })
}
