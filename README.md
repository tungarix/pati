# Pati

**A desktop companion that lives on your screen, talks with a local AI, remembers you, and gets things done.**
Think of the old desktop assistants, rebuilt for today: no ads, no tracking, and the AI runs on your own computer.

[Türkçe](README.tr.md)

- **Lives on your desktop.** A small character above every window. It stands on the taskbar and on the top edges of your windows, walks off them and falls; drag it anywhere or throw it across the screen. It wanders around and falls asleep when you step away.
- **Chats with a local AI.** Connects to [llama.cpp](https://github.com/ggml-org/llama.cpp), [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) running on your machine. Each character has its own personality.
- **Remembers you.** It keeps a *brain*: a folder of plain Markdown with your daily chats, a summary of each day and the facts you shared. Open it in [Obsidian](https://obsidian.md) and edit what it knows.
- **Gets things done.** "Open Spotify", "turn the volume down", "take a note: …", "how's my battery?". It asks before acting, and you can say "always".
- **Works with your files.** "Create `list.txt` on the desktop: milk, bread", "add cheese to the shopping list", "what's in Downloads?", "move the report into the homework folder", "undo". Desktop, Documents and Downloads only, text files only (txt, md, csv); it asks first and never overwrites, deletes or touches programs and scripts.
- **Talks by voice.** Press the shortcut (`Ctrl+Shift+Space` by default) and speak; [whisper.cpp](https://github.com/ggml-org/whisper.cpp) turns it into text on your computer, and you see and hear the answer.
- **Speaks up when it matters.** A short briefing when you sit down in the morning, a nudge after 90 minutes without a break, a word when it is very late.
- **Looks at your screen when you ask.** "What's on my screen?", "explain this error" or **Look at my screen** in the menu: after asking, it takes one screenshot and shows it to a vision model (llama.cpp with `--mmproj`, or `qwen2.5vl` in Ollama). The image is never saved.
- **Focus mode.** "Focus" (or "focus for 50 minutes") starts a pomodoro: it stays quiet, then calls a 5-minute break, and a long one every fourth round.
- **Reminders.** "Every 60 minutes, drink water", "every day at 17:00, study", or just tell it in chat: "remind me in 20 minutes".
- **Make it yours.** Add your own character with a folder of PNG frames and one JSON file. Turkish and English, modern or classic look.

Built-in characters: **Tungarix**, a rock wolf in sunglasses, and **Atlas**, a calm holographic assistant.

## Install

Download `Pati Setup x.y.z.exe` from Releases, or build it yourself (below). The installer is not code-signed, so Windows SmartScreen asks "Run anyway".

Pati lives in the system tray: right-click the tray icon for settings, characters and quit.

| Do this | What happens |
| --- | --- |
| Click the character | Menu: chat, joke, time, tip, settings, quiet for an hour, hide |
| Drag | Move it; it remembers where |
| Double-click | It jumps |
| Right-click | Settings, character, hide, quit |

## Connect a local AI

Pati talks to any OpenAI-compatible server on your computer. It looks on the usual ports by itself (`8080`, `8081`, `11434`, `1234`); you can also list servers in **Settings > AI**, in order of preference: put a smart, big model on top and a small, fast one below it. Pati uses the first one that is running.

- **llama.cpp:** `llama-server -m model.gguf --jinja`. `--jinja` enables tools. If you start it with `--api-key`, Pati asks for the key in the chat balloon the first time.
- **Ollama:** install it and `ollama pull` a model; Pati finds it on port 11434.
- **LM Studio:** load a model and start the local server.

### Recommended model: Pati-4B

Pati-4B is a small model fine-tuned for Pati: setting reminders, remembering what you tell it, opening apps and sites,
controlling music, taking notes, and short, warm small talk, mostly in Turkish. It is Qwen3.5-4B (Apache-2.0) with a
LoRA trained on about 1,200 example conversations. It needs about 5 GB of graphics memory (it also runs on the
processor, slowly). On Pati's own test set (158 cases) it scores 82%, against 67% for the first Pati-4B; details in
[docs/PATI-4B.md](docs/PATI-4B.md). It is made for chat and small tasks, not for long answers, code or facts you
need to rely on.

Pati offers to download it on first start (about 3.4 GB, with llama.cpp), or use **Settings > AI > Pati-4B > Install**.
It downloads with progress, checks the files, starts the model when Pati starts and stops it when Pati quits. Files go to
`%LOCALAPPDATA%\Pati\model`; **Remove** in the same place deletes them.

**Advanced / do it yourself:** download [llama.cpp](https://github.com/ggml-org/llama.cpp/releases) (CUDA build for an
NVIDIA card, Vulkan for others) and, from the [`pati-4b-v3` release](https://github.com/tungarix/pati/releases/tag/pati-4b-v3),
the two model files `Pati-4B-v3-Q4_K_M-0000{1,2}-of-00002.gguf` plus `mmproj-4B-F16.gguf` (from the
[`pati-4b-v1` release](https://github.com/tungarix/pati/releases/tag/pati-4b-v1); the vision file did not change) into one
folder, then run
`llama-server -m Pati-4B-v3-Q4_K_M-00001-of-00002.gguf --mmproj mmproj-4B-F16.gguf --jinja -ngl 99 --port 8080`.
Pati finds it on port 8080 by itself.

## Talk by voice

Your voice never leaves your computer: [whisper.cpp](https://github.com/ggml-org/whisper.cpp) turns it into text locally.
Download `whisper-cli.exe` from its releases and put a multilingual model in a `models` folder next to it (`ggml-small.bin`
is a good start; models ending in `.en` only know English). Pati finds `whisper-cli.exe` on `PATH` and the model in a
`models` folder beside or above it; if it can't, pick both in **Settings > Talking by voice**, where you can also change
the shortcut. Press, speak; Pati stops listening when you pause (or press the shortcut again).

## Better voice (Piper)

The Turkish neural voice comes built in: the installer includes [Piper](https://github.com/rhasspy/piper) and the `tr_TR-dfki-medium` voice, so nothing to download.
In English, Pati speaks with the Windows voice (the built-in voice is Turkish only). You can still point **Settings > Speech** at your own `piper.exe` and voice
(any voice from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)); a voice you pick is used in every language. If Piper fails, the Windows voice speaks. Piper has no pitch setting.

Credits: Piper (MIT), espeak-ng inside it (GPL-3.0, [source](https://github.com/espeak-ng/espeak-ng); Piper runs as a separate program), and the voice from [DFKI](https://github.com/marytts/dfki-ot-data) (CC BY-NC-SA 4.0, non-commercial). Details in `LICENSES.txt` next to the bundled Piper.

A model of about 8-9B parameters is a good start on an 8 GB GPU. Pati works around the habits of small models: it handles plain commands itself instead of trusting the model to call a tool, and checks numbers (battery, time) instead of letting the model guess.

## The brain

By default `Documents\Pati Beyni`, changeable in settings:

- `Chats/2026-10-17.md`: one note per day of chat. Pati writes a short summary at the top and reads the last few to pick up where you left off.
- `Memory.md`: what Pati knows about you, one line per fact. Add a line and it learns; delete one and it forgets.
- `Notes.md`: notes you asked it to take.
- `Feedback.jsonl`: answers you rated 👍 or 👎 in the chat, each with the whole conversation behind it. A few hundred of these are enough to fine-tune a small model in your character's style.

Open the folder as a vault in Obsidian once; after that **Settings > Memory > Open in Obsidian** takes you there.

## Privacy

- The AI runs on your computer; chats, memory and notes stay in local files.
- Tools that reach outside the app are **off** until you turn them on: reading the clipboard, and looking things up online (weather from Open-Meteo, Wikipedia).
- Actions on the computer (opening apps, websites, files and folders, writing and moving files, music and volume) ask first. Only `http(s)` addresses are ever opened.
- The only thing Pati does on its own online is look for a new version on GitHub (a few hours apart, only in the installed app). You can turn it off in **Settings > Updates**; it always asks before installing.
- No telemetry, no accounts, no ads.

## Your own character

**Settings > Character > Open folder** opens `%APPDATA%\pati\characters`. Put a folder there for your character and press **Reload**. The folder name is the character's id.

```
characters/
  my-cat/
    manifest.json
    character.json
    stand.png  walk1.png  walk2.png  sleep.png
```

`manifest.json`:

```json
{ "schema": 2, "type": "character", "name": "My Cat", "version": "1.0.0", "author": "You" }
```

`character.json`:

```json
{
  "language": "en",
  "scale": 4,
  "accent": "#f59e0b",
  "animations": {
    "idle":  { "frames": ["stand.png"], "fps": 1 },
    "walk":  { "frames": ["walk1.png", "walk2.png"], "fps": 4 },
    "talk":  { "frames": ["talk.png", "stand.png"], "fps": 6 },
    "sleep": { "frames": ["sleep.png"], "fps": 1 },
    "drag":  { "frames": ["held.png"], "fps": 1 },
    "fall":  { "frames": ["fall.png"], "fps": 1 },
    "dust":  { "frames": ["dust1.png", "dust2.png"], "fps": 6 }
  },
  "voice": { "lang": "en-US", "rate": 1, "pitch": 1.2 },
  "persona": "You are My Cat, a sleepy but curious cat who lives on the user's desktop.",
  "lines": {
    "greet": ["Meow! I'm here."],
    "menu": "What shall we do?",
    "jokes": ["..."],
    "tips": ["..."],
    "wake": ["I'm awake!"],
    "sleep": "Nap time…",
    "thanks": "Thanks",
    "hush": "OK, I'll be quiet.",
    "lateNight": ["It's late. Bed?"],
    "breakTime": ["Time for a short break."]
  }
}
```

- Only `animations.idle` (and a name) is required. `fall` plays in the air (else `drag`), `dust` once after a landing, `guitar` now and then when idle. Give `walk` a `stride` (one step's length in frame pixels) and its frames follow the distance walked, so the feet do not slide. A missing animation falls back to `idle`; missing lines fall back to defaults.
- `lines` can be one set in `language`, or one per language: `{ "tr": {...}, "en": {...} }`. `persona` works the same way; it is the system prompt that gives the character its voice in chat.
- `scale` enlarges pixel art with crisp edges; leave it at `1` for drawn images. Keep the character under about 150 px wide.
- `accent` colours the modern balloon.
- A pack with the same id as a built-in one replaces it.

Tungarix's frames are cut from one drawn sprite sheet (`art/tungarix-sheet.webp`) by `scripts/slice-tungarix.py`: it removes the background, finds the poses and puts every frame on the same canvas with the feet on one line, so it works for any sheet laid out the same way. Atlas is drawn with geometry by `scripts/make-atlas.py`.

## Development

```bash
npm install
npm start
```

| Command | What it does |
| --- | --- |
| `npm start` | Builds and runs the app |
| `npm test` | Unit tests (Node's built-in runner) |
| `npm run typecheck` | TypeScript check |
| `npm run dist` | Builds the Windows installer into `release/` |

Layout: `src/main` (windows, tray, AI, brain, tools, reminders, settings), `src/core` (behaviour state machine), `src/preload.ts` (the only bridge between windows and the main process), `src/renderer` (pet and settings windows), `characters/` (built-in packs), `locales/` (Turkish and English).

## Releasing

Update `version` in `package.json`, run `npm run dist` (it first downloads Piper and the Turkish voice into `build/piper/` once, hash-checked, which makes the installer about 85 MB bigger), and attach the installer, `latest.yml` and the `.exe.blockmap` from `release/` to the GitHub Release (tag `v<version>`); without `latest.yml` installed copies won't see the update. Four-part hotfix versions (built with `-c.buildVersion=0.4.4.1`) keep the three-part `package.json` version in `latest.yml`, so updaters won't see them: bump the patch number when an auto-update is wanted.

Plans: [docs/ROADMAP.md](docs/ROADMAP.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
