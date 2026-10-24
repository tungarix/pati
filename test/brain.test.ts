import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { appendExchange, appendFeedback, capSummary, dayFile, dropLooped, exchangeCount, FEEDBACK_FILE, ensureBrain, getSummary, parseExchanges, parseHistory, pastBlock, pastDays, todaysMessages, withSummary } from '../src/main/brain.ts'

const brain = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-brain-'))
  ensureBrain(dir, 'tr')
  return dir
}

test('exchanges are written as a day note and read back as chat history', () => {
  const dir = brain()
  const t = new Date(2026, 9, 15, 20, 5)
  appendExchange(dir, t, 'tr', 'Tungarix', 'Selam,\nnasılsın?', 'İyiyim kanka.')
  appendExchange(dir, new Date(2026, 9, 15, 20, 7), 'tr', 'Tungarix', 'Sınavım var yarın', 'Hangi ders?')
  const md = fs.readFileSync(dayFile(dir, t), 'utf8')
  assert.match(md, /^# 2026-10-15\n\n### 20:05\n\*\*Sen:\*\* Selam, nasılsın\?\n\n\*\*Tungarix:\*\* İyiyim kanka\.\n/)
  assert.deepEqual(todaysMessages(dir, t), [
    { role: 'user', content: 'Selam, nasılsın?' },
    { role: 'assistant', content: 'İyiyim kanka.' },
    { role: 'user', content: 'Sınavım var yarın' },
    { role: 'assistant', content: 'Hangi ders?' },
  ])
})

test('a summary goes under the title, is replaced, and leaves the chat intact', () => {
  const md = '# 2026-10-14\n\n### 10:00\n**Sen:** a\n\n**Pati:** b\n'
  const once = withSummary(md, 'tr', 'Kullanıcı sınavdan bahsetti.')
  assert.equal(getSummary(once), 'Kullanıcı sınavdan bahsetti.')
  const twice = withSummary(once, 'tr', 'Yeni özet.')
  assert.equal(getSummary(twice), 'Yeni özet.')
  assert.equal((twice.match(/## Özet/g) ?? []).length, 1)
  assert.match(twice, /### 10:00\n\*\*Sen:\*\* a/)
})

test('earlier days come newest first without today; the prompt block lists summaries oldest first', () => {
  const dir = brain()
  for (const [d, s] of [[12, 'Birinci gün.'], [13, ''], [14, 'Üçüncü gün.']] as const) {
    const day = new Date(2026, 9, d, 9, 0)
    appendExchange(dir, day, 'tr', 'Pati', 'x', 'y')
    if (s) fs.writeFileSync(dayFile(dir, day), withSummary(fs.readFileSync(dayFile(dir, day), 'utf8'), 'tr', s))
  }
  appendExchange(dir, new Date(2026, 9, 15, 9, 0), 'tr', 'Pati', 'bugün', 'evet')
  const days = pastDays(dir, new Date(2026, 9, 15), 5)
  assert.deepEqual(days.map(d => d.key), ['2026-10-14', '2026-10-13', '2026-10-12'])
  assert.equal(pastBlock(days, 'tr'), 'Önceki günlerde konuştuklarınız (eskiden yeniye):\n- 2026-10-12: Birinci gün.\n- 2026-10-14: Üçüncü gün.')
})

test('rated answers pile up in Feedback.jsonl, one per line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pati-fb-'))
  const base = { time: 't', character: 'atlas', model: 'm', messages: [{ role: 'user' as const, content: 'selam' }], answer: 'Merhaba!' }
  appendFeedback(dir, { ...base, rating: 'up' })
  appendFeedback(dir, { ...base, answer: 'Ne?', rating: 'down' })
  const rows = fs.readFileSync(path.join(dir, FEEDBACK_FILE), 'utf8').trim().split('\n').map(l => JSON.parse(l))
  assert.deepEqual(rows.map(r => [r.answer, r.rating]), [['Merhaba!', 'up'], ['Ne?', 'down']])
  assert.deepEqual(rows[0].messages, base.messages)
})

test('a plain command is stored with an invisible intent line and read back as a tool turn', () => {
  const dir = brain()
  const t = new Date(2026, 9, 22, 10, 0)
  appendExchange(dir, t, 'tr', 'Pati', 'spotify aç', 'Spotify açıldı.', { tool: 'open_app', args: { name: 'spotify' }, result: { ok: true } })
  appendExchange(dir, new Date(2026, 9, 22, 10, 1), 'tr', 'Pati', 'selam', 'Selam!')
  const md = fs.readFileSync(dayFile(dir, t), 'utf8')
  assert.match(md, /\*\*Pati:\*\* Spotify açıldı\.\n<!-- pati-intent: \{"tool":"open_app","args":\{"name":"spotify"\},"result":\{"ok":true\}\} -->\n/)
  assert.deepEqual(todaysMessages(dir, t), [
    { role: 'user', content: 'spotify aç' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'open_app', arguments: '{"name":"spotify"}' } }] },
    { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' },
    { role: 'assistant', content: 'Spotify açıldı.' },
    { role: 'user', content: 'selam' },
    { role: 'assistant', content: 'Selam!' },
  ])
  // Old callers still see a plain chat.
  assert.deepEqual(parseExchanges(md).map(m => m.content), ['spotify aç', 'Spotify açıldı.', 'selam', 'Selam!'])
})

test('without a stored result the tool answers ok, and notes without intent lines parse as before', () => {
  const md = '# d\n\n### 10:00\n**Sen:** a\n\n**Pati:** b\n<!-- pati-intent: {"tool":"open_folder","args":{"which":"desktop"}} -->\n\n### 10:01\n**Sen:** c\n\n**Pati:** d\n'
  const h = parseHistory(md)
  assert.equal(h.length, 6)
  assert.deepEqual(h[2], { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' })
  assert.deepEqual(parseHistory('# d\n\n### 10:01\n**Sen:** c\n\n**Pati:** d\n'), [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }])
  assert.equal(parseHistory('### 1\n**Sen:** x\n\n**Pati:** y\n<!-- pati-intent: {broken -->\n').length, 2)
})

test('an earlier turn whose reply a later turn repeats is dropped with its question', () => {
  const turn = (q: string, a: string) => [{ role: 'user' as const, content: q }, { role: 'assistant' as const, content: a }]
  const h = [...turn('nasılsın', 'İyiyim!'), ...turn('ne yapıyorsun', 'Takılıyorum.'), ...turn('nasılsın dedim', 'İyiyim!')]
  assert.deepEqual(dropLooped(h).map(m => m.content), ['ne yapıyorsun', 'Takılıyorum.', 'nasılsın dedim', 'İyiyim!'])
})

test('summaries are capped at a sentence or word boundary, and short days are not summarized', () => {
  const long = 'Kullanıcı sınavdan bahsetti. ' + 'Çok çalışması gerektiğini söyledi ve yorgun olduğunu anlattı. '.repeat(6)
  const cap = capSummary(long)
  assert.ok(cap.length <= 250)
  assert.match(cap, /[.]$/)
  assert.equal(capSummary('Kısa.'), 'Kısa.')
  assert.ok(capSummary('kelime '.repeat(80)).length <= 250)
  assert.ok(!capSummary('kelime '.repeat(80)).endsWith(' '))
  const dir = brain()
  const day = new Date(2026, 9, 20, 9, 0)
  for (let i = 0; i < 3; i++) appendExchange(dir, day, 'tr', 'Pati', `q${i}`, `a${i}`)
  assert.equal(exchangeCount(fs.readFileSync(dayFile(dir, day), 'utf8')), 3)
  appendExchange(dir, day, 'tr', 'Pati', 'q3', 'a3')
  assert.equal(exchangeCount(fs.readFileSync(dayFile(dir, day), 'utf8')), 4)
})
