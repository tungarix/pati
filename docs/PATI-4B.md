# Pati-4B

A small model fine-tuned for Pati's everyday work: reminders, remembering facts about you, opening apps, sites and
folders, music and volume, notes, battery status, and short small talk. Mostly Turkish, some English.

## What it is
- **Base:** [Qwen/Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B), Apache-2.0. This is a modified version: a LoRA
  (rank 16) trained on Pati conversations and merged into the base language model. The vision projector
  (`mmproj-4B-F16.gguf`) is unsloth's conversion of the unchanged base projector.
- **File:** GGUF, Q4_K_M, 2.5 GB, split in two parts for GitHub. Load the first part; llama.cpp reads both.
- **Managed install:** when Pati installs it (offer on first start, or Settings > AI > Pati-4B), the files and llama.cpp live in `%LOCALAPPDATA%\Pati\model` (`llama\` holds llama.cpp, `llama-server.log` the last run's log). Pati starts the server on `127.0.0.1:18080` (or the next free port up to 18085) and stops it on quit.
- **Data:** about 1,000 synthetic conversations built for Pati: the correct tool calls come from templates, the replies
  were written by a local Qwen3.5-9B and kept only if a local Qwen3.6-35B rated them 4 or 5 out of 5. No real user data.
  The 80 test cases below were kept out of the training data.
- **Training:** QLoRA, 1.6 epochs, about 80 minutes on an 8 GB laptop GPU. Only the assistant's tool calls and replies
  were trained.

## How it scores
Pati's test set (`eval/`, 80 Turkish cases, each run twice, same settings as the app):

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
- It sometimes asks you instead of using a fact it already has about you.
- It may still write Markdown or LaTeX now and then; Pati's balloon strips most of it.

## License
Apache-2.0, like the base model. The release includes Qwen's license text (`LICENSE-Qwen3.5.txt`).
