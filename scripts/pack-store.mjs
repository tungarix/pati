// Builds the release assets for the fan-packs repository: one <id>.zip per pack folder plus packs.json.
// Usage: node scripts/pack-store.mjs <folder of pack folders> [output dir (default: pack-store-out)]
// Each pack folder needs manifest.json (name, description) and character.json; the folder name is the id.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const [src, out = 'pack-store-out'] = process.argv.slice(2)
if (!src) (console.error('usage: node scripts/pack-store.mjs <folder of packs> [output dir]'), process.exit(1))
const tar = path.join(process.env.SystemRoot ?? 'C:\Windows', 'System32', 'tar.exe')

fs.mkdirSync(out, { recursive: true })
const packs = []
for (const e of fs.readdirSync(src, { withFileTypes: true })) {
  const dir = path.join(src, e.name)
  if (!e.isDirectory() || !fs.existsSync(path.join(dir, 'manifest.json'))) continue
  if (!/^[a-z0-9-]{1,40}$/.test(e.name)) throw new Error(`${e.name}: the folder name is the id (a-z, 0-9, -)`)
  if (!fs.existsSync(path.join(dir, 'character.json'))) throw new Error(`${e.name}: character.json missing`)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  const file = `${e.name}.zip`
  const zip = path.join(out, file)
  fs.rmSync(zip, { force: true })
  execFileSync(tar, ['-a', '-c', '-f', zip, '-C', dir, '.'])
  const bytes = fs.readFileSync(zip)
  packs.push({ id: e.name, name: manifest.name ?? e.name, description: manifest.description ?? '', file, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  console.log(`${file}  ${bytes.length} bytes`)
}
if (!packs.length) throw new Error(`no pack folders (with manifest.json) in ${src}`)
fs.writeFileSync(path.join(out, 'packs.json'), JSON.stringify({ schema: 1, packs }, null, 2) + '\n')
console.log(`packs.json: ${packs.length} pack(s) -> ${out}`)
