import { test } from 'node:test'
import assert from 'node:assert/strict'

import { checkExpect, emojiCount, matches, sentences, styleFlags, validateCases } from '../eval/checks.ts'

test('matching is Turkish-aware on both sides and keeps regex escapes', () => {
  assert.ok(matches('ıspanak|IŞIK', 'Işık yılı bir mesafedir'))
  assert.ok(matches('İSTANBUL', "istanbul'da yaşıyorsun"))
  assert.ok(matches('^\\S+ \\d+$', 'saat 14'))
  assert.ok(!matches('ankara', 'İstanbul'))
})

test('in_minutes may be off by one, text args are regexes', () => {
  const call = (args: Record<string, unknown>) => [{ name: 'set_reminder', args }]
  const e = { tool: 'set_reminder', args: { in_minutes: 30, text: 'su' } }
  assert.ok(checkExpect(e, 'Tamam', call({ in_minutes: 31, text: 'Su içmek' })).every(c => c.ok))
  assert.ok(!checkExpect(e, 'Tamam', call({ in_minutes: 35, text: 'su' })).every(c => c.ok))
  assert.ok(!checkExpect(e, 'Tamam', []).every(c => c.ok))
  assert.ok(checkExpect({ tool: null }, 'Selam', []).every(c => c.ok))
  assert.ok(!checkExpect({ tool: null }, 'Selam', call({})).every(c => c.ok))
  // two facts may come from two calls
  const two = [{ name: 'remember', args: { fact: 'Adı Deniz' } }, { name: 'remember', args: { fact: '19 yaşında' } }]
  assert.ok(checkExpect({ tool: 'remember', args: { fact: ['deniz', '19'] } }, '', two).every(c => c.ok))
})

test('fireAt and fireIn score the fire time, not the argument used', () => {
  const call = (args: Record<string, unknown>) => [{ name: 'set_reminder', args: { text: 'x', ...args } }]
  const clock = new Date(2026, 9, 21, 14, 37)
  const ok = (e: object, args: Record<string, unknown>) => checkExpect({ tool: 'set_reminder', ...e }, '', call(args), clock).every(c => c.ok)
  assert.ok(ok({ fireAt: '19:00' }, { at: '19:00' }))
  assert.ok(ok({ fireAt: '19:00' }, { in_minutes: 263 }))
  assert.ok(ok({ fireIn: 30 }, { at: '15:07' }))
  assert.ok(ok({ fireIn: 30 }, { in_minutes: 30 }))
  assert.ok(!ok({ fireAt: '19:00' }, { in_minutes: 60 }))
  assert.ok(!ok({ fireIn: 30 }, { at: '19:00' }))
})

test('sentences are counted without splitting on a clock time', () => {
  assert.equal(sentences('Saat 14.37. Güzel bir gün! Değil mi?'), 3)
})

test('style flags catch markdown, LaTeX, emoji overload, English and rule quotes', () => {
  assert.deepEqual(styleFlags('Merhaba, nasılsın?'), [])
  assert.ok(styleFlags('**Kalın** yazı').includes('markdown'))
  assert.ok(styleFlags('Şunlar var:\n- bir\n- iki').includes('markdown'))
  assert.ok(styleFlags('f(x) = $x^2$').includes('latex'))
  assert.ok(styleFlags('Harika 😀🎉').includes('emoji'))
  assert.ok(styleFlags('Tamam!!!! Süper').includes('exclaim'))
  assert.ok(styleFlags('I think you can do this with the tool').includes('nonTurkish'))
  assert.ok(styleFlags('Gerçek bir arkadaş gibi konuşurum').includes('ruleLeak'))
  assert.ok(styleFlags('kanka bak kanka').includes('kanka'))
  assert.ok(styleFlags('  ').includes('empty'))
  assert.equal(emojiCount('a 😀 b 🎉 c'), 2)
})

test('cases.json validation reports bad regexes and cases the app handles itself', () => {
  const base = { category: 'sohbet', character: 'atlas' as const }
  const r = validateCases([
    { ...base, id: 'a', user: 'sesi kıs', expect: { tool: null } },
    { ...base, id: 'b', user: 'selam', expect: { contains: ['(açık'] } },
  ])
  assert.deepEqual(r.caught, ['a'])
  assert.equal(r.errors.length, 1)
})
