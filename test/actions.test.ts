import { test } from 'node:test'
import assert from 'node:assert/strict'

import { findShortcut, websiteUrl } from '../src/main/actions.ts'

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
