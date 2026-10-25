# Pati-4B

A small model fine-tuned for Pati's everyday work: reminders, remembering facts about you, opening apps, sites and
folders, music and volume, notes, battery status, and short small talk. Mostly Turkish, some English.

## What it is
- **Base:** [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), Apache-2.0. This is a modified version: a LoRA
  (rank 16) trained on Pati conversations and merged into the base language model. The vision projector
  (`mmproj-4B-F16.gguf`) is unsloth's conversion of the unchanged base projector.
- **File:** GGUF, Q4_K_M, 2.5 GB, split in two parts for GitHub. Load the first part; llama.cpp reads both.
- **Managed install:** when Pati installs it (offer on first start, or Settings > AI > Pati-4B), the files and llama.cpp live in `%LOCALAPPDATA%\Pati\model` (`llama\` holds llama.cpp, `llama-server.log` the last run's log). Pati starts the server on `127.0.0.1:18080` (or the next free port up to 18085) and stops it on quit.
- **Data (v3):** about 1,200 synthetic conversations built for Pati: the correct tool calls come from templates; the
  replies were first written by a local Qwen3.5-9B, then every one was scored for grammar, naturalness, invented facts
  and consistency with the tool results, and flawed ones were rewritten and re-checked. It includes conversations where
  the same question is asked again and gets a different answer, short multi-turn chats, opening files by name, and honest
  "I can't do that" answers. No real user data. The test cases below were kept out of the training data.
- **Training:** QLoRA, 1.5 epochs (225 steps), about 100 minutes on an 8 GB laptop GPU. Only the assistant's tool calls
  and replies after the last user message were trained (earlier turns of a conversation are context only, except in
  the repeat and multi-turn examples).

## How it scores
**v3** on Pati's stricter test set (`eval/cases.json` + `eval/cases-v2.json`, 158 Turkish cases, each run three times,
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
- It sometimes asks you instead of using a fact it already has about you; v3 is weaker at this than v1.
- If you installed Pati-4B with Pati 0.4.5 or 0.4.6 you keep running v1. To get v3: Settings > AI > Pati-4B > Remove, then Install (about 2.7 GB; the vision file and llama.cpp stay).
- It may still write Markdown or LaTeX now and then; Pati's balloon strips most of it.

## License
Apache-2.0, like the base model. The release includes Qwen's license text (`LICENSE-Qwen3.5.txt`).
