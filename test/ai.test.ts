import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { chatWithTools, isRepeat, listModels, plainText, SAMPLING, similarity, stripThinking, stripVocative, UnauthorizedError, withClock } from '../src/main/ai.ts'

test('thinking blocks are dropped, closed or still open', () => {
  assert.equal(stripThinking('<think>hmm</think>\nSelam!'), 'Selam!')
  assert.equal(stripThinking('<think>still going'), '')
  assert.equal(stripThinking('Düz cevap'), 'Düz cevap')
})

/** A fake OpenAI-compatible server; `reply` decides each chat answer from the request body. */
async function fakeServer(reply: (body: any, n: number) => { status?: number; message?: object }) {
  const bodies: any[] = []
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer k') return res.writeHead(401).end()
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'qwen-9b' }] }))
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      const body = JSON.parse(raw)
      bodies.push(body)
      const r = reply(body, bodies.length)
      res.writeHead(r.status ?? 200).end(JSON.stringify({ choices: [{ message: r.message }] }))
    })
  })
  await new Promise<void>(r => server.listen(0, r))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  return { url, bodies, close: () => server.close() }
}

const ask = [{ role: 'user' as const, content: 'adım Arda, hatırla' }]
const tools = [{ type: 'function', function: { name: 'remember', parameters: {} } }]

test('runs the tool the model calls, then returns its answer', async () => {
  const s = await fakeServer((_b, n) =>
    n === 1
      ? { message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'remember', arguments: '{"fact":"Adı Arda"}' } }] } }
      : { message: { content: 'Tamam Arda, aklımda!' } },
  )
  try {
    const calls: string[] = []
    const answer = await chatWithTools({ baseUrl: s.url, apiKey: 'k', model: 'qwen-9b' }, 'qwen-9b', ask, tools,
      async (name, args) => (calls.push(`${name} ${args}`), '{"ok":true}'), new AbortController().signal)
    assert.equal(answer, 'Tamam Arda, aklımda!')
    assert.deepEqual(calls, ['remember {"fact":"Adı Arda"}'])
    assert.deepEqual(s.bodies[1].messages.at(-1), { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' })
  } finally {
    s.close()
  }
})

test('a server without tool support gets the plain question', async () => {
  const s = await fakeServer(body => (body.tools ? { status: 400 } : { message: { content: 'Selam!' } }))
  try {
    const answer = await chatWithTools({ baseUrl: s.url, apiKey: 'k', model: '' }, 'qwen-9b', ask, tools, async () => '', new AbortController().signal)
    assert.equal(answer, 'Selam!')
    // With tools; again without the llama.cpp-only fields (a 400 could be them); then without tools.
    assert.equal(s.bodies.length, 3)
    assert.ok(!('tools' in s.bodies[2]))
  } finally {
    s.close()
  }
})

test('a server that dislikes the llama.cpp-only sampling fields gets the standard ones', async () => {
  const s = await fakeServer(body => ('dry_multiplier' in body ? { status: 400 } : { message: { content: 'Selam!' } }))
  try {
    const server = { baseUrl: s.url, apiKey: 'k', model: '' }
    assert.equal(await chatWithTools(server, 'qwen-9b', ask, [], async () => '', new AbortController().signal), 'Selam!')
    assert.equal(s.bodies.length, 2)
    assert.ok(!('dry_multiplier' in s.bodies[1]) && 'top_p' in s.bodies[1])
    // Remembered: the next question skips the extras straight away.
    await chatWithTools(server, 'qwen-9b', ask, [], async () => '', new AbortController().signal)
    assert.equal(s.bodies.length, 3)
  } finally {
    s.close()
  }
})

test('a missing or wrong key is reported as such', async () => {
  const s = await fakeServer(() => ({ message: { content: 'x' } }))
  try {
    assert.deepEqual(await listModels(s.url, 'k'), ['qwen-9b'])
    await assert.rejects(listModels(s.url, 'yanlis'), UnauthorizedError)
  } finally {
    s.close()
  }
})

test('the clock is spelled out so the date cannot be read as a time', () => {
  const night = withClock('selam', 'tr', new Date(2026, 9, 17, 4, 11))
  assert.equal(night, 'selam\n\n(Bilgi: saat 04:11, gece. Bugün Cumartesi, 17 Ekim 2026.)')
  assert.match(withClock('hi', 'en', new Date(2026, 9, 17, 17, 5)), /the time is 17:05, afternoon\. Today is Saturday, 17 October 2026\./)
})

test('answers lose LaTeX delimiters and bold markers, keep real dollar amounts', () => {
  assert.equal(plainText('Örneğin $f(x) = x^2$ fonksiyonunun türevi $2x$ olur.'), 'Örneğin f(x) = x^2 fonksiyonunun türevi 2x olur.')
  assert.equal(plainText('<think>x</think>Bu **çok** önemli.'), 'Bu çok önemli.')
  assert.equal(plainText('Fiyatı 5 dolar.'), 'Fiyatı 5 dolar.')
})

test('markdown headings, list markers, backticks and math delimiters are flattened', () => {
  assert.equal(plainText('## Başlık\nMetin burada.'), 'Başlık\nMetin burada.')
  assert.equal(plainText('Şunları yap:\n- su iç\n* yürü\n1. uyu'), 'Şunları yap: su iç yürü uyu')
  assert.equal(plainText('`npm test` çalıştır'), 'npm test çalıştır')
  assert.equal(plainText('Sonuç \\(x^2\\) ve \\[y\\] ve \\frac{1}{2}'), 'Sonuç x^2 ve y ve 1/2')
  assert.equal(plainText('**kalın** yazı - tire ortada'), 'kalın yazı - tire ortada')
})

test('a leading "Atlas," is dropped and the sentence still starts with a capital', () => {
  assert.equal(stripVocative('Atlas, bugün hava güzel.'), 'Bugün hava güzel.')
  assert.equal(stripVocative('Atlas selam'), 'Selam')
  assert.equal(stripVocative('Atlasım güzel bir şey'), 'Atlasım güzel bir şey')
  assert.equal(stripVocative('Bugün Atlas, iyi'), 'Bugün Atlas, iyi')
})

test('near-identical replies are repeats, different greetings are not', () => {
  const looped = 'Tamam Arda, iyiyim! Sen nasıl gidiyor hayat?'
  assert.equal(similarity(looped, looped), 1)
  assert.ok(isRepeat(looped, ['Merhaba!', looped]))
  assert.ok(isRepeat('Tamam Arda, iyiyim! Sen nasıl gidiyor hayat', [looped]))
  assert.ok(!isRepeat('Selam Arda! Bugün neler yaptın?', ['Merhaba, nasılsın bakalım?']))
  assert.ok(!isRepeat('Selam!', []))
})

test('the sampling constant carries the anti-repetition fields and reaches the request', async () => {
  for (const key of ['temperature', 'top_p', 'min_p', 'presence_penalty', 'frequency_penalty', 'repeat_penalty', 'repeat_last_n', 'dry_multiplier', 'dry_base', 'dry_allowed_length', 'dry_penalty_last_n'])
    assert.ok(key in SAMPLING, key)
  const s = await fakeServer(() => ({ message: { content: 'Selam!' } }))
  try {
    const server = { baseUrl: s.url, apiKey: 'k', model: '' }
    const sys = [{ role: 'system' as const, content: 'Sen Pati' }, ...ask]
    await chatWithTools(server, 'm', sys, [], async () => '', new AbortController().signal)
    assert.equal(s.bodies[0].temperature, 0.7)
    assert.equal(s.bodies[0].dry_multiplier, 0.8)
    assert.equal(s.bodies[0].max_tokens, 400)
    await chatWithTools(server, 'm', sys, [], async () => '', new AbortController().signal, 4, { temperature: 0.9, note: 'farklı yaz' })
    assert.equal(s.bodies[1].temperature, 0.9)
    assert.equal(s.bodies[1].messages[0].content, 'Sen Pati\n\nfarklı yaz')
    assert.equal(sys[0].content, 'Sen Pati') // the note is for that call only
  } finally {
    s.close()
  }
})
