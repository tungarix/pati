// Bundles the main process, the preload bridge and the two windows into dist/.
import { build } from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })
mkdirSync('dist/renderer', { recursive: true })

const common = { bundle: true, sourcemap: true, logLevel: 'warning' }

await Promise.all([
  build({ ...common, entryPoints: ['src/main/main.ts'], outfile: 'dist/main.js', platform: 'node', format: 'cjs', external: ['electron', 'electron-updater'] }),
  build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.js', platform: 'node', format: 'cjs', external: ['electron'] }),
  build({ ...common, entryPoints: ['src/renderer/pet.ts', 'src/renderer/settings.ts'], outdir: 'dist/renderer', platform: 'browser', format: 'iife' }),
])

for (const f of ['pet.html', 'pet.css', 'settings.html', 'settings.css']) cpSync(`src/renderer/${f}`, `dist/renderer/${f}`)
console.log('dist/ hazır')
