# Changelog

All notable changes to Pati. Versions follow [semantic versioning](https://semver.org).

## 0.4.2 (2026-10-19)

### Fixed
- Tungarix no longer shows his eyes through see-through sunglasses while held; the lenses are dark like in every other pose.

## 0.4.1 (2026-10-18)

### Changed
- Settings window: the API key field now has the same height and border as the other fields (it had the browser's default look).
- Settings window: three type sizes instead of five, help text kept to a readable line length, spacing on a 4/8 grid.
- The delete and move-up buttons are line icons instead of the ✕ and ↑ characters, and screen readers now announce what they do.

## 0.4.0 (2026-10-17)

### Added
- Talk by voice: a global push-to-talk shortcut (`Ctrl+Shift+Space`, changeable in Settings) starts listening and a pause ends it. Speech is turned into text on the computer with whisper.cpp, found on `PATH` or picked in Settings, in Turkish or English; the text goes into the chat like a typed message and the answer is read aloud.
- A microphone button in the chat and a listening indicator with a level wave, in the modern and the classic balloon.
- Character size from 50% to 200%, in settings and in the right-click and tray menus.
- 👍/👎 under each AI answer in the modern balloon; rated answers are saved with their conversation to `Feedback.jsonl` in the brain, as fine-tuning data.
- Tungarix redrawn as a detailed chibi from a drawn sprite sheet, with new falling, dusting-off and guitar frames; `scripts/slice-tungarix.py` cuts a sheet into frames. Packs can add `fall`, `dust` and `guitar` animations; drawn (non-pixel) frames are no longer scaled with hard edges.
- Shimeji physics: the pet falls onto the taskbar and the top edges of windows, drops when a window closes or it walks off the edge, and can be thrown: it has weight, slows down in the air, bounces once on a hard landing, squashes, and dusts itself off. Off in settings if you prefer it fixed.
- Motion between the drawn frames: breathing, steps that bob in time and follow the distance walked (no sliding feet), a pendulum swing while held, a lean into throws.
- Looking at the screen on request ("what's on my screen?", "explain this error", or the menu): one screenshot, after asking, shown to a vision model and never saved.
- Focus mode: 25 minutes (or any length you say) of quiet, then a short break, a long one every fourth round. Tips, wandering and unasked talk pause meanwhile; reminders still come.

## 0.3.0 (2026-10-17)

### Added
- Chat with a local AI through any OpenAI-compatible server (llama.cpp, Ollama, LM Studio): a server list in order of preference, automatic discovery on the usual ports, and an API key prompt inside the chat balloon.
- Tools the model can use: reminders, memory, and optionally the clipboard, weather (Open-Meteo) and Wikipedia.
- The brain: an Obsidian-friendly Markdown folder with daily chats and their summaries, `Memory.md` and `Notes.md`. Earlier days' summaries give the pet continuity across days and restarts.
- Actions on the computer: open apps (Start Menu and Store apps), websites and folders, control music and volume, system status, take notes. Each kind asks first: "Yes / Always / No".
- Unasked talk: a morning briefing, a word late at night, a nudge after 90 minutes without a break.
- Modern balloon with a chat thread and typing indicator; the classic XP balloon stays as an option.
- Atlas, a calm holographic assistant, as a second built-in character.
- Character packs can set an `accent` colour, a `persona`, and `lateNight` / `breakTime` lines.

### Changed
- Plain commands (notes, music and volume, folders, apps, battery) are carried out by Pati itself instead of trusting a small model to call the tool.
- The current time travels with the user's message instead of the system prompt, so llama.cpp can reuse its prompt cache.
- The chat waits for slow models instead of giving up after two minutes.

### Fixed
- The model announced the wrong time and an invented battery level; both are now measured.
- Settings windows no longer overwrite changes made meanwhile from the chat.

## 0.2.0 (2026-10-15)

### Added
- Behaviour state machine, pack format v2 with `manifest.json`, Turkish and English interface.

## 0.1.0 (2026-10-15)

### Added
- First desktop mascot: transparent always-on-top window, dragging, wandering, sleeping, speech balloon with text-to-speech, reminders, character packs, settings window, Windows installer.
