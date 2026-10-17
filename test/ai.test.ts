import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

import { chatWithTools, listModels, plainText, stripThinking, UnauthorizedError, withClock } from '../src/main/ai.ts'

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
    assert.equal(s.bodies.length, 2)
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
