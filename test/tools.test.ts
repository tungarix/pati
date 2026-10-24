import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reminderTime, runTool, toolDefinitions, type ToolContext } from '../src/main/tools.ts'

const NOW = new Date(2026, 9, 15, 18, 0)

function ctx(over: Partial<ToolContext> = {}) {
  const log: string[] = []
  const c: ToolContext = {
    lang: 'tr',
    allowMemory: true,
    allowClipboard: true,
    allowWeb: false,
    now: () => NOW,
    remember: t => log.push(`remember:${t}`),
    forget: () => 2,
    addReminder: (t, at) => log.push(`reminder:${t}@${new Date(at).getHours()}:${new Date(at).getMinutes()}`),
    readClipboard: () => 'kopyalanan',
    fetchJson: async () => ({}),
    allowActions: true,
    confirm: async () => true,
    openApp: async name => (log.push(`open:${name}`), name === 'spotify' ? 'Spotify' : null),
    openUrl: async url => void log.push(`url:${url}`),
    media: async a => void log.push(`media:${a}`),
    openFolder: async w => void log.push(`folder:${w}`),
    findPaths: async () => [],
    openPath: async p => void log.push('path:' + p),
    systemStatus: async () => ({ battery: 80 }),
    takeNote: t => void log.push(`note:${t}`),
    ...over,
  }
  return { c, log }
}

test('only allowed tools are offered', () => {
  const names = (o: { allowMemory: boolean; allowClipboard: boolean; allowWeb: boolean }) => toolDefinitions(o).map(d => d.function.name)
  assert.deepEqual(names({ allowMemory: false, allowClipboard: false, allowWeb: false }), ['set_reminder'])
  assert.deepEqual(names({ allowMemory: true, allowClipboard: false, allowWeb: false }), ['set_reminder', 'remember', 'forget'])
  assert.ok(names({ allowMemory: true, allowClipboard: true, allowWeb: true }).includes('wikipedia'))
})

test('reminder time: clock time today, tomorrow when past, or minutes', () => {
  assert.equal(new Date(reminderTime({ at: '19:30' }, NOW)!).getDate(), 15)
  assert.equal(new Date(reminderTime({ at: '08:00' }, NOW)!).getDate(), 16)
  assert.equal(reminderTime({ in_minutes: 20 }, NOW), NOW.getTime() + 20 * 60_000)
  assert.equal(reminderTime({ at: '25:00' }, NOW), null)
  assert.equal(reminderTime({}, NOW), null)
})

test('tools act through the context and always answer a string', async () => {
  const { c, log } = ctx()
  assert.equal(await runTool('remember', '{"fact":"EEM okuyorum"}', c), '{"ok":true}')
  assert.match(await runTool('set_reminder', '{"text":"Ders","at":"19:30"}', c), /"ok":true/)
  assert.deepEqual(log, ['remember:EEM okuyorum', 'reminder:Ders@19:30'])
  assert.equal(await runTool('read_clipboard', '', c), '{"text":"kopyalanan"}')
  assert.match(await runTool('set_reminder', '{"text":"Ders"}', c), /error/)
  assert.match(await runTool('remember', 'not json', c), /not valid JSON/)
})

test('disabled tools refuse even if the model calls them anyway', async () => {
  const { c } = ctx({ allowClipboard: false })
  assert.match(await runTool('read_clipboard', '', c), /disabled/)
  assert.match(await runTool('get_weather', '{"city":"Ankara"}', c), /disabled/)
})

test('weather looks the city up, then the forecast', async () => {
  const urls: string[] = []
  const { c } = ctx({
    allowWeb: true,
    fetchJson: async url => {
      urls.push(url)
      return url.includes('geocoding')
        ? { results: [{ name: 'Ankara', country: 'Türkiye', latitude: 39.9, longitude: 32.8 }] }
        : { current: { temperature_2m: 14 } }
    },
  })
  const out = JSON.parse(await runTool('get_weather', '{"city":"Ankara"}', c))
  assert.equal(out.place, 'Ankara, Türkiye')
  assert.equal(out.current.temperature_2m, 14)
  assert.ok(urls[1].includes('latitude=39.9'))
})

test('actions run only after the user agrees, and only safe ones', async () => {
  const { c, log } = ctx()
  assert.match(await runTool('open_app', '{"name":"spotify"}', c), /"opened":"Spotify"/)
  assert.match(await runTool('open_app', '{"name":"photoshop"}', c), /no installed app/)
  assert.match(await runTool('open_website', '{"query":"lo-fi"}', c), /google\.com\/search\?q=lo-fi/)
  assert.match(await runTool('open_website', '{"url":"file:///C:/x.exe"}', c), /error/)
  assert.match(await runTool('media_control', '{"action":"volume_up"}', c), /ok/)
  assert.match(await runTool('media_control', '{"action":"format_disk"}', c), /disabled/)
  assert.ok(log.includes('url:https://www.google.com/search?q=lo-fi') && log.includes('media:volume_up'))

  const said: string[] = []
  const { c: no } = ctx({ confirm: async (kind, what) => (said.push(`${kind}:${what}`), false) })
  assert.equal(await runTool('open_app', '{"name":"spotify"}', no), '{"declined":true}')
  assert.deepEqual(said, ['open_app:spotify'])
  assert.match(await runTool('system_status', '', ctx({ allowActions: false }).c), /disabled/)
})

test('open_path opens the single best match after asking', async () => {
  const { c, log } = ctx({ findPaths: async () => [{ path: 'C:/D/tungarix.pdf', name: 'tungarix.pdf', isDir: false, score: 2 }, { path: 'C:/D/x tungarix y.pdf', name: 'x tungarix y.pdf', isDir: false, score: 1 }] })
  const r = JSON.parse(await runTool('open_path', JSON.stringify({ name: 'tungarix dosyasını' }), c))
  assert.deepEqual(r, { ok: true, opened: 'C:/D/tungarix.pdf', name: 'tungarix.pdf', isDir: false })
  assert.deepEqual(log, ['path:C:/D/tungarix.pdf'])
})

test('open_path: not found, tie and declined open nothing', async () => {
  const hit = (name: string, score: number) => ({ path: 'C:/D/' + name, name, isDir: false, score })
  let { c, log } = ctx()
  assert.deepEqual(JSON.parse(await runTool('open_path', '{"name":"yok"}', c)), { error: 'not found' })
  ;({ c, log } = ctx({ findPaths: async () => [hit('a.pdf', 3), hit('a.docx', 3), hit('ab.pdf', 2)] }))
  const tie = JSON.parse(await runTool('open_path', '{"name":"a"}', c))
  assert.equal(tie.ok, false)
  assert.equal(tie.candidates.length, 2)
  ;({ c, log } = ctx({ findPaths: async () => [hit('a.pdf', 3)], confirm: async () => false }))
  assert.deepEqual(JSON.parse(await runTool('open_path', '{"name":"a"}', c)), { declined: true })
  assert.deepEqual(log, [])
})

test('open_path never opens a program, even if the finder returns one', async () => {
  const { c, log } = ctx({ findPaths: async () => [{ path: 'C:/D/tungarix.exe', name: 'tungarix.exe', isDir: false, score: 3 }] })
  assert.deepEqual(JSON.parse(await runTool('open_path', '{"name":"tungarix"}', c)), { error: 'not found' })
  assert.deepEqual(log, [])
})
