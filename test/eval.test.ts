import { test } from 'node:test'
import assert from 'node:assert/strict'

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkExpect, checkRoute, emojiCount, matches, sentences, styleFlags, turnsOf, validateCases, type Case } from '../eval/checks.ts'
import { distinctReplies, grammarFlags, lengthFlags, openerStats, trigramJaccard } from '../eval/hidden.ts'
import { answerKey, buildPrompt, failed, parseScores } from '../eval/judge.ts'
import { pairedBootstrap } from '../eval/stats.ts'
import { historyFrom } from '../eval/turn.ts'

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

test('multi-turn cases: turns replace user, expectAll fills every turn, bad shapes are reported', () => {
  const base = { category: 'cok_tur', character: 'atlas' as const }
  const ok = { ...base, id: 'm1', expectAll: { tool: null }, turns: [{ user: 'selam' }, { user: 'nasılsın', expect: { maxSentences: 2 } }] }
  assert.deepEqual(turnsOf(ok).map(t => t.expect), [{ tool: null }, { tool: null, maxSentences: 2 }])
  assert.deepEqual(validateCases([ok]), { errors: [], caught: [] })
  const bad = validateCases([
    { ...base, id: 'm2', user: 'x', turns: [{ user: 'y', expect: { tool: null } }] },
    { ...base, id: 'm3', turns: [{ user: 'y' }] },
    { ...base, id: 'm4', turns: [{ user: 'sesi kıs', expect: { tool: null } }] },
  ])
  assert.equal(bad.errors.length, 2) // user together with turns, and no expect anywhere
  assert.deepEqual(bad.caught, ['m4']) // a turn the router would swallow
})

test('route cases are checked against matchIntent, not the model', () => {
  assert.ok(checkRoute('tungarix dosyasını aç', { tool: 'open_path', args: { name: 'tungarix', kind: 'file' } }).ok)
  assert.ok(checkRoute('masaüstünü aç', { tool: 'open_folder', args: { which: 'desktop' } }).ok)
  assert.ok(!checkRoute('masaüstünü aç', { tool: 'open_app' }).ok)
  assert.ok(checkRoute('dosya nedir', null).ok)
  assert.ok(!checkRoute('sesi kıs', null).ok)
  const r = validateCases([{ id: 'r', category: 'rota', character: 'atlas', user: 'sesi kıs', expect: { route: { tool: 'media_control' } } }])
  assert.deepEqual(r, { errors: [], caught: [] })
})

test('admits accepts a stated limit and rejects a pretend answer', () => {
  assert.ok(checkExpect({ admits: true }, 'Canlı veriye bakamıyorum, kurun için bir bankaya bak.', []).every(c => c.ok))
  assert.ok(!checkExpect({ admits: true }, 'Dolar şu an 34 lira civarı.', []).every(c => c.ok))
})

test('history is built like the app: plain user texts, own answers, loops dropped, opens on a user', () => {
  const prior = [{ user: 'a', answer: 'x', calls: [] }, { user: 'b', answer: 'x', calls: [] }, { user: 'c', answer: 'y', calls: [] }]
  const h = historyFrom([], prior)
  assert.deepEqual(h.map(m => m.content), ['b', 'x', 'c', 'y']) // the first "x" turn is dropped as a loop
  assert.equal(h[0].role, 'user')
  assert.deepEqual(historyFrom([{ role: 'assistant', content: 'kuyruk' }], []), [])
})

test('distinctReplies fails on the real "iyiyim sen nasılsın" copies and passes varied replies', () => {
  const same = ['Ben de iyiyim, teşekkür ederim. Sen bugün nasılsın?', 'Ben de iyiyim, teşekkür ederim! Sen bugün nasılsın?']
  assert.ok(!distinctReplies(same, 0.6).ok)
  assert.ok(!distinctReplies(['Hadi bakalım, bugün neler yaptın anlat', 'Hadi bakalım, bugün neler planlıyorsun?'], 0.99).ok) // same first four words
  assert.ok(distinctReplies(['Sevindim, ben de gayet iyiyim.', 'Valla keyfim yerinde, sana ne lazım?', 'Fena değil, kahvem hazır.'], 0.6).ok)
  assert.equal(trigramJaccard('aynı metin', 'AYNI metin!'), 1)
})

test('openerStats counts the top first word, distinct two-word openers and Tamam among tool-free answers', () => {
  const s = openerStats(['Tamam, hallettim.', 'Tamam tamam.', 'Selam, nasılsın?', 'Tamam, kurdum.'], [true, false, false, true])
  assert.equal(s.topWord, 'tamam')
  assert.equal(s.topShare, 0.75)
  assert.equal(s.twoWordOpeners, 4)
  assert.equal(s.tamamShare, 0.5) // 1 of the 2 answers without tools
  assert.equal(openerStats([], []).tamamShare, 0)
})

test('grammarFlags catch the failures real users hit and leave clean Turkish alone', () => {
  assert.deepEqual(grammarFlags('Sen nasıl gidiyor hayat?'), ['sen_nasıl_gidiyor'])
  assert.deepEqual(grammarFlags('Tamam tamam, hallettim.'), ['çift_kelime'])
  assert.deepEqual(grammarFlags('Tamamdı, kurdum.'), ['tamamdı'])
  assert.deepEqual(grammarFlags('Yarın seni hatırlat bana.'), ['seni_hatırlat'])
  assert.ok(grammarFlags('Orada var mı mı?').includes('çift_mi'))
  assert.deepEqual(grammarFlags('selam, nasılsın?'), ['küçük_harfle_başlıyor'])
  assert.deepEqual(grammarFlags('Gerçekten mi?! Harika.'), ['ünlem_soru_karışık'])
  assert.deepEqual(grammarFlags('Olur.. bakarız.'), ['iki_nokta'])
  for (const ok of ['Yavaş yavaş ilerliyoruz.', 'Selam! Nasılsın?', 'Sana yarın hatırlatırım.', 'Bekle…', '14.37 oldu.']) assert.deepEqual(grammarFlags(ok), [], ok)
})

test('lengthFlags only limit the chatty categories', () => {
  const long = 'Bir. İki. Üç. Dört.'
  assert.deepEqual(lengthFlags(long, 'tekrar'), ['3_cümleden_uzun'])
  assert.deepEqual(lengthFlags(long, 'bilgi'), [])
  assert.deepEqual(lengthFlags('Bir. İki. Üç.', 'dil'), [])
})

test('paired bootstrap is deterministic and sees a clear difference', () => {
  const a = [0, 0, 1, 0, 0, 1, 0, 0, 0, 1]
  const b = [1, 1, 1, 1, 0, 1, 1, 1, 0, 1]
  const x = pairedBootstrap(a, b)
  assert.deepEqual(x, pairedBootstrap(a, b))
  assert.ok(Math.abs(x.mean - 0.5) < 1e-9)
  assert.ok(x.lo > 0 && x.significant)
  assert.ok(!pairedBootstrap([1, 0, 1, 0], [0, 1, 0, 1]).significant)
  assert.throws(() => pairedBootstrap([1], [1, 0]))
})

test('judge prompt carries persona, history and answer; scores parse strictly', () => {
  const p = buildPrompt({ persona: 'Tungarix bir kedi.', earlier: [{ user: 'selam', answer: 'Selam!' }], user: 'nasılsın', answer: 'İyiyim, sen?' })
  for (const s of ['Tungarix bir kedi.', 'Kullanıcı: selam', 'Pati: Selam!', 'nasılsın', 'İyiyim, sen?']) assert.ok(p.user.includes(s), s)
  assert.ok(p.system.includes('dilbilgisi') && p.system.includes('karakter'))
  const ok = parseScores('```json\n{"dilbilgisi":2,"dogallik":1,"baglam":2,"karakter":0,"neden":"kalıp"}\n```')
  assert.deepEqual(ok, { dilbilgisi: 2, dogallik: 1, baglam: 2, karakter: 0, neden: 'kalıp' })
  assert.ok(failed(ok!))
  assert.ok(!failed(parseScores('{"dilbilgisi":1,"dogallik":1,"baglam":2,"karakter":2}')!))
  assert.equal(parseScores('{"dilbilgisi":3,"dogallik":1,"baglam":2,"karakter":2}'), null)
  assert.equal(parseScores('{"dilbilgisi":2}'), null)
  assert.equal(parseScores('puan veremem'), null)
  assert.notEqual(answerKey('a', 1, 0, 'x'), answerKey('a', 1, 0, 'y'))
})

test('the training-data generator never imports the hidden checks', () => {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'pati-model', 'scripts', 'uret')
  if (!fs.existsSync(dir)) return
  // Test files are left out: uret.test.ts may name the path while guarding against it.
  const offenders = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && fs.readFileSync(path.join(dir, f), 'utf8').includes('eval/hidden'))
  assert.deepEqual(offenders, [])
})

test('cases-v2.json is valid, unique against cases.json and every model-level turn reaches the model', () => {
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'eval', f), 'utf8')) as Case[]
  const v2 = read('cases-v2.json')
  assert.deepEqual(validateCases([...read('cases.json'), ...v2]), { errors: [], caught: [] })
  assert.ok(v2.length >= 70)
  for (const c of v2.filter(x => x.expect?.route !== undefined)) assert.ok(checkRoute(c.user!, c.expect!.route ?? null).ok, c.id)
})
