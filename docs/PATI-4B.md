# Pati-4B

A small model fine-tuned for Pati's everyday work: reminders, remembering facts about you, opening apps, sites and
folders, music and volume, notes, battery status, and short small talk. Mostly Turkish, some English.

## What it is
- **Base:** [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), Apache-2.0. This is a modified version: a LoRA
  (rank 16) trained on Pati conversations and merged into the base language model. The vision projector
  (`mmproj-4B-F16.gguf`) is unsloth's conversion of the unchanged base projector.
- **File:** GGUF, Q4_K_M, 2.5 GB, split in two parts for GitHub. Load the first part; llama.cpp reads both.
- **Managed install:** when Pati installs it (offer on first start, or Settings > AI > Pati-4B), the files and llama.cpp live in `%LOCALAPPDATA%\Pati\model` (`llama\` holds llama.cpp, `llama-server.log` the last run's log). Pati starts the server on `127.0.0.1:18080` (or the next free port up to 18085) and stops it on quit.
- **Data (v4.4):** about 2,400 synthetic conversations built for Pati: the 2,000 of v4.2 plus about 370 new ones. The
  v4.2 part is the 1,200 of v3 plus about 870 more. The correct tool calls come from templates; the replies in the v3
  part were first written by a local Qwen3.5-9B, then every one was scored for grammar, naturalness, invented facts and
  consistency with the tool results, and flawed ones were rewritten and re-checked. It includes conversations where the
  same question is asked again and gets a different answer, short multi-turn chats, opening files by name, and honest
  "I can't do that" answers. The v4.2 part teaches what v3 got wrong: not saving passing plans as facts, using the facts
  it already has, opening files from indirect requests, telling what it can and can't do, and not repeating a tool call
  when the user only says thanks. The new v4.4 part targets what v4.2 still got wrong: casual Turkish with slang and
  typos (about 205), using saved facts (about 64), honesty about what it can't do (about 56) and asking the same
  question again (about 43). The replies of both parts were written by Claude Haiku, checked by rules and scored by
  Claude Sonnet; only the ones scoring 4 of 5 or more were kept, and examples that looked like test cases were removed.
  No real user data. The test cases below were kept out of the training data.
- **Training:** QLoRA, 1.5 epochs (459 steps), from scratch with the same recipe as v4.2, about 3 hours on an 8 GB
  laptop GPU. Only the assistant's tool calls and replies after the last user message were trained (earlier turns of a
  conversation are context only, except in the repeat and multi-turn examples).

## How it scores
**v4.4** against v4.2 on the same 158 cases, each model measured twice (three runs per case each time) with the app's
settings. Pass rate, average of the two measurements:

| | v4.2 | v4.4 |
|---|---|---|
| Overall | 89% | **91%** |
| Reminders | 97% | 90% (weaker) |
| Saving facts (`remember`) | 100% | 98% |
| Using saved facts | 83% | 97% |
| Actions (notes, music, apps, sites) | 96% | 99% |
| Small talk | 92% | 97% |
| Honesty about what it can't do | 84% | 85% |
| Time and date | 92% | 96% |
| General knowledge | 92% | 85% (weaker) |
| Plain, short style | 96% | 94% |
| Multi-turn chat | 85% | 89% |
| Same question asked again | 67% | 86% |
| Casual Turkish with typos and slang | 80% | 93% |
| Opening a named file | 95% | 87% (weaker) |
| Routing (no model) | 100% | 100% |

The overall difference is small. Paired by case, it was +0.6 points in the first measurement (95% interval -3.2 to
+4.4, not significant) and +4.0 in the second (+0.4 to +7.8, significant). The gains in casual Turkish, repeated
questions and using saved facts are large; reminders, general knowledge and opening files are 7 to 8 points worse.
These are small samples per category and part of that is noise, but treat them as real until measured again.

On **48 new cases** that were never used in training or while building the data (`eval/cases-v3.json`), three runs each:

| | v4.2 | v4.4 |
|---|---|---|
| Overall | 81% | **89%** (+7.6 points, interval +1.4 to +14.6) |
| Casual Turkish with typos and slang | 73% | 81% |
| Same question asked again | 58% | 88% |
| Honesty about what it can't do | 96% | 92% |
| Using saved facts | 92% | 96% |
| Multi-turn chat | 96% | 96% |

Earlier, **v4.2** against v3 on the 158 cases, each measured twice (the cases were made stricter since the v3 numbers
further down, so v3 scores 83% here, not 82%):

| | v3 | v4.2 |
|---|---|---|
| Overall | 83% | **89%** (+5.9 and +5.5 points in the two measurements; the interval stays above zero) |
| Reminders | 96% | 97% |
| Actions (notes, music, apps, sites) | 93% | 96% |
| Honesty about what it can't do | 79% | 84% |
| Multi-turn chat | 69% | 85% |
| Casual Turkish with typos and slang | 75% | 79.6% (83% in one measurement, 76% in the other) |
| Using saved facts | 69% | 83% |
| Opening a named file | 74% | 95% |
| Time and date | 96% | 92% |
| Plain, short style | 100% | 96% |
| Same question asked again | 63% | 67% |

Per-model tables: [BENCHMARK.md](BENCHMARK.md).

Earlier, **v3** on Pati's stricter test set (`eval/cases.json` + `eval/cases-v2.json`, 158 Turkish cases, each run three times,
same settings as the app) against the first Pati-4B (v1) with the same settings:

| | v1 | v3 |
|---|---|---|
| Overall | 67% | **82%** (+14.1 points, 95% interval +8.4 to +20.0) |
| Actions (notes, music, apps, sites) | 86% | 97% |
| Small talk | 70% | 93% |
| Honesty about what it can't do | 58% | 81% |
| Casual Turkish with typos and slang | 64% | 88% |
| Opening a named file (model level) | 26% | 74% |
| Same question asked again: different reply | 97% | 100% |
| Replies that start with "Tamam" (no tool) | 33% | 0% |
| Using saved facts | 83% | 61% (weaker) |
| Multi-turn chat | 60% | 52% (weaker) |

The first version's table, on the original 80 cases:

| | Pati-4B | Qwen3.5-4B | Qwen3.5-9B | Qwen3.6-35B (2-bit) |
|---|---|---|---|---|
| Reminders | 96% | 71% | 4% | 83% |
| Saving facts (`remember`) | 100% | 0% | 0% | 0% |
| Using saved facts | 75% | 92% | 92% | 75% |
| Actions (notes, music, apps, sites) | 92% | 38% | 21% | 71% |
| Small talk | 90% | 45% | 45% | 75% |
| Honesty about what it can't do | 69% | 56% | 88% | 81% |
| Time and date | 100% | 75% | 100% | 100% |
| General knowledge | 85% | 75% | 95% | 85% |
| Plain, short style | 69% | 69% | 75% | 31% |
| **Overall** | **87%** | 54% | 49% | 65% |

The test set and the training data were made by the same people, so treat these numbers as a direction, not a promise.

## Known limits
- It knows what Qwen3.5-4B knows and no more; it can get facts wrong. Don't rely on it for facts, code or long answers.
- Asked for something it can't do (order food, live prices), it sometimes opens a web search instead of just saying so.
- Compared with v4.2, v4.4 is weaker at setting reminders (97% to 90%), at general knowledge questions (92% to 85%) and at opening a named file (95% to 87%) on the 158 cases. The samples are small and some of it may be noise, but check a reminder's time before you rely on it.
- Very casual messages (slang, dropped letters, "eyw ya sağol") improved a lot in v4.4 but are still its weakest area on the new cases (81%).
- If you installed Pati-4B earlier you keep running that version (v1, v3 or v4.2). To get v4.4: Settings > AI > Pati-4B > Remove, then Install (about 2.7 GB; the vision file and llama.cpp stay).
- It may still write Markdown or LaTeX now and then; Pati's balloon strips most of it.

## License
Apache-2.0, like the base model. The release includes Qwen's license text (`LICENSE-Qwen3.5.txt`).
