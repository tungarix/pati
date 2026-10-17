import { test } from 'node:test'
import assert from 'node:assert/strict'

import { detectLang, missingKeys, t } from '../src/shared/i18n.ts'

test('every language has every key', () => {
  assert.deepEqual(missingKeys(), { tr: [], en: [] })
})

test('placeholders are filled, unknown ones left alone', () => {
  assert.equal(t('tr', 'balloon.time', { time: '17:05' }), 'Saat 17:05.')
  assert.equal(t('en', 'balloon.time', {}), "It's {time}.")
})

test('system locale picks the language, unknown ones get English', () => {
  assert.equal(detectLang('tr-TR'), 'tr')
  assert.equal(detectLang('en-GB'), 'en')
  assert.equal(detectLang('de-DE'), 'en')
})
