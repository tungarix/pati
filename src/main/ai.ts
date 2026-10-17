// Talks to a local model through the OpenAI-compatible API that llama.cpp
// (llama-server), Ollama (/v1) and LM Studio all serve.

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Where local servers listen by default: llama.cpp, a second llama.cpp, Ollama, LM Studio. */
export const CANDIDATE_URLS = [
  'http://localhost:8080/v1',
  'http://localhost:8081/v1',
  'http://localhost:11434/v1',
  'http://localhost:1234/v1',
]

const trimSlash = (url: string) => url.replace(/\/+$/, '')

// Small local models drift into stiff role-play, catchphrases and invented abilities.
// These rules ask for a warm, natural way of talking and keep the tools honest. No
// example dialogues: small models copy them word for word.
const RULES = {
  tr: [
    'Nasıl konuşursun:',
    '- Gerçek bir arkadaş gibi, doğal ve sıcak konuş. Karakterin bir tat katar ama asıl olan kullanıcıyı dinlemek ve ona yardım etmek.',
    '- Kullanıcının tonuna uy: o kısa ve şakacıysa sen de öyle ol; dertliyse yavaşla, önce anladığını göster, sonra yardım et.',
    '- Uzunluğu konuya göre ayarla: sohbette 1-2 cümle; bir şey açıklaman ya da tavsiye vermen gerekirse 3-5 cümle. Liste ya da başlık kullanma, konuşur gibi yaz.',
    '- Cevabın düz metin bir balonda görünür: formülleri düz yaz (f(x) = x², türevi 2x gibi); LaTeX, $ işareti, kalın yazı ya da başka Markdown kullanma.',
    '- Ünlemi ve emojiyi az kullan; emoji ancak gerçekten yakışırsa, en fazla bir tane. Her cümleye lakap ya da hitap ("kanka" gibi) koyma; arada bir yeter.',
    '- Aynı kalıpları ve benzetmeleri tekrarlama; karakterine ait göndermeleri her cevaba sokma. Zorlama espri yapma; komiklik doğal gelirse gelsin.',
    '- Merak et: konu ilgini çekiyorsa ya da kullanıcı bir şey paylaştıysa, bazen tek bir doğal soru sor. Her cevabı soruyla bitirme.',
    '- Kullanıcı hakkında bildiklerini ve önceki günlerin özetini doğal yerinde kullan, ama hepsini bir anda sıralama. Sana verilmemiş bir geçmişten asla bahsetme.',
    '- Tavsiye istenirse genel laf etme; o kişiye ve duruma uygun 1-2 somut adım öner.',
    '',
    'Dürüstlük ve araçlar:',
    '- Sadece sohbet edebilir ve sana verilen araçları kullanabilirsin. Kullanıcının dosyalarını, ekranını ya da bilgisayarını göremezsin; araç yoksa yapıyormuş gibi davranma, açıkça söyle.',
    '- Kullanıcı kendisi hakkında kalıcı bir bilgi verirse (adı, yaşı, okulu, işi, hobisi, sevdiği ya da sevmediği bir şey, hedefi) ve remember aracın varsa, cevap vermeden önce her bilgi için remember aracını çağır. Çağırmadıysan asla "kaydettim" ya da "hatırlayacağım" deme.',
    '- Hatırlatma istenirse set_reminder aracını kullan ve kurduğunu kısaca söyle.',
    '- Bilgisayarda bir şey yapman istenirse (uygulama açmak, ses, müzik, not almak, klasör) ilgili aracı çağır. Bir aracı gerçekten çağırıp başarılı sonuç almadıysan asla "yaptım", "açtım", "kıstım" ya da "not aldım" deme.',
    '- Emin olmadığın olgu, tarih ya da isim uydurma; araç varsa ona bak, yoksa bilmediğini söyle.',
    '- Mesajın sonundaki (Bilgi: ...) satırı sana saati ve tarihi söyler. Saati ya da tarihi yalnızca sorulursa ya da gerçekten gerekirse söyle; söylerken bu satırdakini aynen kullan.',
  ].join('\n'),
  en: [
    'How you talk:',
    '- Talk like a real friend, natural and warm. Your character adds flavour, but what matters is listening to the user and helping them.',
    '- Match their tone: if they are brief and playful, be that too; if they are having a hard time, slow down, show you understand first, then help.',
    '- Fit the length to the topic: 1-2 sentences for small talk, 3-5 when you explain or give advice. No lists or headings; write the way you would speak.',
    '- Your reply shows in a plain-text balloon: write formulas plainly (f(x) = x², derivative 2x); no LaTeX, no $ signs, no bold or other Markdown.',
    '- Go easy on exclamation marks and emoji; an emoji only when it truly fits, at most one. Do not put a nickname in every sentence; once in a while is enough.',
    "- Do not repeat the same phrases or metaphors, and keep your character's references out of most replies. No forced jokes; let humour come naturally.",
    '- Be curious: when something interests you or the user shared something, sometimes ask one natural question. Do not end every reply with a question.',
    '- Bring up what you know about the user and the summaries of earlier days where it fits naturally, never as a list. Never mention a past you were not given.',
    '- When asked for advice, skip the generic lines; suggest 1-2 concrete steps that fit this person and situation.',
    '',
    'Honesty and tools:',
    "- You can only chat and use the tools you are given. You cannot see the user's files, screen or computer; without a tool, never pretend, say so plainly.",
    '- If the user shares a lasting fact about themselves (name, age, school, job, hobby, something they like or dislike, a goal) and you have the remember tool, call remember for each fact before you answer. Never say you saved or will remember something unless you called it.',
    '- When asked for a reminder, use set_reminder and briefly confirm it.',
    '- When asked to do something on the computer (open an app, volume, music, take a note, a folder), call the matching tool. Never say you did, opened, lowered or noted something unless a tool call actually succeeded.',
    "- Never make up facts, dates or names; check with a tool if you have one, otherwise say you don't know.",
    '- The (Info: ...) line at the end of a message tells you the time and date. Mention them only when asked or truly needed, and then use exactly what that line says.',
  ].join('\n'),
}

/**
 * The character's persona, what it knows about the user and the rules. No clock here:
 * the prompt must stay byte-identical between messages so llama.cpp can reuse its cache,
 * which turns a slow re-read of everything into reading only the new message.
 */
export function systemPrompt(persona: string, lang: 'tr' | 'en', memory = ''): string {
  return [persona, memory, RULES[lang]].filter(Boolean).join('\n\n')
}

const PART_OF_DAY = {
  tr: ['gece', 'sabah', 'öğleden sonra', 'akşam'],
  en: ['night', 'morning', 'afternoon', 'evening'],
}

/**
 * The user's message with the current time attached, where it does not spoil the cache.
 * Spelled out with words around the numbers: small models read "17 Ekim ... 04:11" as 17:10.
 */
export function withClock(text: string, lang: 'tr' | 'en', now: Date): string {
  const h = now.getHours()
  const part = PART_OF_DAY[lang][h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3]
  const clock = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const locale = lang === 'tr' ? 'tr-TR' : 'en-GB'
  const date = now.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  const weekday = now.toLocaleDateString(locale, { weekday: 'long' })
  return lang === 'tr'
    ? `${text}\n\n(Bilgi: saat ${clock}, ${part}. Bugün ${weekday}, ${date}.)`
    : `${text}\n\n(Info: the time is ${clock}, ${part}. Today is ${weekday}, ${date}.)`
}

/** A non-2xx answer; `status` lets callers tell "no tools here" (400) from the rest. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

/** Thrown when the server wants an API key (llama-server --api-key) we lack or got wrong. */
export class UnauthorizedError extends HttpError {}

/** One OpenAI-compatible server the pet may talk to. */
export interface Server {
  baseUrl: string
  apiKey: string
  /** Empty: the server's first model. */
  model: string
}

const headers = (apiKey: string) => ({
  'Content-Type': 'application/json',
  ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
})

function check(res: Response): void {
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError(res.status)
  if (!res.ok) throw new HttpError(res.status)
}

export async function listModels(baseUrl: string, apiKey = '', timeoutMs = 2500): Promise<string[]> {
  const res = await fetch(`${trimSlash(baseUrl)}/models`, { headers: headers(apiKey), signal: AbortSignal.timeout(timeoutMs) })
  check(res)
  const body = (await res.json()) as { data?: { id: string }[] }
  return (body.data ?? []).map(m => m.id)
}

export interface FoundServer {
  url: string
  models: string[]
  needsKey: boolean
}

/** Every candidate server that answers, with its models; a locked one is still reported. */
export async function detectServers(apiKey = ''): Promise<FoundServer[]> {
  const found = await Promise.all(
    CANDIDATE_URLS.map(url =>
      listModels(url, apiKey, 1500).then(
        models => ({ url, models, needsKey: false }),
        err => (err instanceof UnauthorizedError ? { url, models: [], needsKey: true } : null),
      ),
    ),
  )
  return found.filter(f => f !== null)
}

/**
 * What the balloon can show: no reasoning block, no LaTeX math delimiters, no bold
 * markers. Models write these even when told not to; the balloon prints them raw.
 */
export function plainText(text: string): string {
  return stripThinking(text)
    .replace(/\$\$?([^$\n]+?)\$\$?/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .trim()
}

/** Drops reasoning a thinking model writes before its answer, closed or still open. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart()
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type WireMessage = ChatMessage | { role: 'assistant'; content: string; tool_calls: ToolCall[] } | { role: 'tool'; tool_call_id: string; content: string }

async function complete(
  server: Server,
  model: string,
  messages: WireMessage[],
  tools: object[],
  signal: AbortSignal,
): Promise<{ content?: string | null; tool_calls?: ToolCall[] }> {
  const res = await fetch(`${trimSlash(server.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: headers(server.apiKey),
    signal,
    body: JSON.stringify({
      model,
      messages,
      ...(tools.length ? { tools } : {}),
      temperature: 0.5,
      max_tokens: 400,
      // Without these Qwen-style models on llama.cpp spend the budget thinking
      // (empty answer) or fall into repetition loops; other servers ignore them.
      frequency_penalty: 0.5,
      chat_template_kwargs: { enable_thinking: false },
    }),
  })
  check(res)
  const body = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] }
  return body.choices?.[0]?.message ?? {}
}

/**
 * Asks the model, runs whatever tools it calls, feeds the results back, and
 * returns its final answer. A server that rejects tools gets the plain question.
 */
export async function chatWithTools(
  server: Server,
  model: string,
  messages: ChatMessage[],
  tools: object[],
  runTool: (name: string, args: string) => Promise<string>,
  signal: AbortSignal,
  maxRounds = 4,
): Promise<string> {
  const convo: WireMessage[] = [...messages]
  let offered = tools
  for (let round = 0; round < maxRounds; round++) {
    let msg
    try {
      msg = await complete(server, model, convo, offered, signal)
    } catch (err) {
      // Servers started without tool support answer 400/500 to the tools field.
      if (offered.length && err instanceof HttpError && !(err instanceof UnauthorizedError)) {
        offered = []
        continue
      }
      throw err
    }
    if (!offered.length || !msg.tool_calls?.length) return plainText(msg.content ?? '')
    convo.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls })
    for (const call of msg.tool_calls)
      convo.push({ role: 'tool', tool_call_id: call.id, content: await runTool(call.function.name, call.function.arguments) })
  }
  // Out of rounds: one last answer with what it has, no more tools.
  return plainText((await complete(server, model, convo, [], signal)).content ?? '')
}
