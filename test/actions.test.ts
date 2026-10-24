import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { cleanPathName, findPaths, findShortcut, websiteUrl } from '../src/main/actions.ts'

const MENU = [
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Spotify.lnk',
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Discord Inc/Discord.lnk',
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Discord Inc/Uninstall Discord.lnk',
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Visual Studio Code/Visual Studio Code.lnk',
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Obsidian.lnk',
  'C:/ProgramData/Microsoft/Windows/Start Menu/Programs/Hesap Makinesi.lnk',
]

test('app names find their shortcut, loosely but never an uninstaller', () => {
  assert.match(findShortcut('spotify', MENU)!, /Spotify\.lnk$/)
  assert.match(findShortcut('Discord', MENU)!, /\/Discord\.lnk$/)
  assert.match(findShortcut('vs code', MENU) ?? findShortcut('visual studio', MENU)!, /Visual Studio Code/)
  assert.match(findShortcut('hesap makinesi', MENU)!, /Hesap Makinesi/)
  assert.equal(findShortcut('photoshop', MENU), null)
  assert.equal(findShortcut('  ', MENU), null)
})

test('only http(s) addresses open; words become a search', () => {
  assert.equal(websiteUrl({ url: 'youtube.com' }), 'https://youtube.com/')
  assert.equal(websiteUrl({ url: 'https://github.com/arda' }), 'https://github.com/arda')
  assert.equal(websiteUrl({ url: 'file:///C:/Windows/System32/cmd.exe' }), null)
  assert.equal(websiteUrl({ url: 'javascript:alert(1)' }), null)
  assert.equal(websiteUrl({ query: 'lo-fi müzik' }), 'https://www.google.com/search?q=lo-fi%20m%C3%BCzik')
  assert.equal(websiteUrl({}), null)
})

test('spoken app requests lose their command words and case endings', () => {
  assert.match(findShortcut("spotify'ı aç", MENU)!, /Spotify\.lnk$/)
  assert.match(findShortcut("Discord'u başlat", MENU)!, /\/Discord\.lnk$/)
  assert.match(findShortcut('obsidian uygulamasını aç', MENU)!, /Obsidian\.lnk$/)
})

test('common short names reach the real app', () => {
  assert.match(findShortcut('vs code', MENU)!, /Visual Studio Code\.lnk$/)
  assert.match(findShortcut('calc', MENU)!, /Hesap Makinesi\.lnk$/)
})

test('spoken file requests become a search', () => {
  assert.deepEqual(cleanPathName('masaüstündeki tungarix dosyasını'), { name: 'tungarix', where: 'desktop', kind: 'file' })
  assert.deepEqual(cleanPathName('ödev klasörünü'), { name: 'ödev', where: undefined, kind: 'folder' })
  assert.deepEqual(cleanPathName('rapor.pdf'), { name: 'rapor.pdf', where: undefined, kind: 'any' })
  assert.equal(cleanPathName("belgelerimdeki fatura pdf'ini aç").where, 'documents')
})

test('findPaths ranks, filters and survives bad roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pati-'))
  try {
    for (const f of ['tungarix.exe', 'tungarix.pdf', 'tungarix notlari.txt', 'eski tungarix.txt', 'a.txt']) await writeFile(join(root, f), '')
    await mkdir(join(root, 'Tüngarix')) // folded: matches 'tungarix'
    await mkdir(join(root, 'l1/l2/l3'), { recursive: true })
    await writeFile(join(root, 'l1/l2/l3/derin.txt'), '')
    await writeFile(join(root, 'l1/l2/yakin.txt'), '')
    const names = async (q: string, k: 'file' | 'folder' | 'any', o = {}) => (await findPaths(q, k, [root], { limit: 10, ...o })).map(m => m.name)
    assert.deepEqual(await names('tungarix', 'file'), ['tungarix.pdf', 'tungarix notlari.txt', 'eski tungarix.txt'])
    assert.deepEqual(await names('tungarix', 'folder'), ['Tüngarix'])
    assert.ok(!(await names('tungarix', 'any')).includes('tungarix.exe'))
    assert.deepEqual(await names('derin', 'any'), [])
    assert.deepEqual(await names('derin', 'any', { maxDepth: 4 }), ['derin.txt'])
    assert.deepEqual(await names('yakin', 'any'), ['yakin.txt'])
    const tie = await findPaths('tungarix', 'any', [root])
    assert.equal(tie[0].score, 3)
    assert.equal(tie[1].score, 3) // pdf and folder tie
    assert.deepEqual(await findPaths('x', 'any', [join(root, 'yok')]), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
