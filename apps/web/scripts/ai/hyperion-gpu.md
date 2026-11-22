# Training Hyperion's AI on a rented graphics card

Hyperion's AI (M435) writes, explains and fixes MATLAB / Octave code that runs in Hyperion. It is **Qwen2.5-Coder 32B**
(Apache-2.0, one of the best open coding models), which Cloudflare already runs, plus UniVerse's own **add-on** (a
"LoRA": a file of about 135 MB that changes how the model answers). The rented card makes only the add-on.

**How it learns:** the model writes about 3,000 requests people might make for Hyperion's 543 functions and answers
each one twice. **Hyperion's own engine runs every answer**: only code that really runs is kept, and a failed answer
gets one chance to be fixed from Hyperion's error message. That becomes a lesson in fixing code too. The add-on learns
from those lessons. At the end it is tested on 25 functions it never saw while learning, without the add-on and with
it, and you see both scores.

**Cost:** about 3–5 hours on one card.

| Card | Price an hour (check the site) | One run |
|---|---|---|
| RTX 4090 (24 GB) | about US$0.35–0.70 | about **US$1.50–3.50** |
| RTX A6000 or L40S (48 GB) | about US$0.50–1.00 | about **US$2–5** |

The 4090 is at the edge of what a 32B model needs while it learns. If the run stops with "CUDA out of memory", rent a
48 GB card and run the same command again: what was finished is kept. US$10 of credit covers a run plus a retry.
**Stop or delete the machine when it's done:** it charges for every hour it is switched on, even when idle.

Not tried on a real card yet: if anything stops with an error, copy the last lines it printed and send them to Claude.

## 1. Rent the machine

On **RunPod** (runpod.io) or **Vast.ai** (vast.ai): one **RTX 4090** (or **RTX A6000 / L40S**, 48 GB), a **PyTorch**
template, at least **120 GB of disk**. Open its terminal (RunPod: Connect → "Start Web Terminal" or Jupyter Lab →
Terminal).

## 2. Get UniVerse

```
git clone --branch claude/youthful-fermi-sbdtcp --depth 1 https://github.com/PerSis2863/UniVerse.git && cd UniVerse/apps/web
```

GitHub asks for your name and a password: use a short-lived, read-only token (GitHub → Settings → Developer settings →
Personal access tokens → Fine-grained, this repository's contents, read-only, expiring in a day). Type it only into
the rented machine: never into a chat or a file.

## 3. Start

```
bash scripts/ai/hyperion-gpu.sh
```

It shows five steps. The first takes 10–20 minutes (it downloads the tools and the model, about 40 GB). If the
connection drops, run the same command again: it carries on.

## 4. Wait, then read the score

At the end it prints two lines like `before (no add-on): 92 of 150 answers ran in Hyperion` and
`after (with the add-on): 131 of 150 …`. The second number should be higher: that is what the add-on learnt.

## 5. Bring the files home

In the folder `hyperion-ai-out` (in the machine's home folder): **adapter_model.safetensors**, **adapter_config.json**
and **score.txt** (and `lessons.jsonl`, the lessons it learnt from). In Jupyter Lab: right-click → Download. Then
**stop or delete the machine**.

## 6. Give the add-on to Cloudflare (on your own computer)

In the UniVerse folder on your computer (where you set it up, see AGENTS.md section 5), put the two files in a new
folder `hyperion-lora`, then:

```
cd apps/web
npx wrangler login
npx wrangler ai finetune create @cf/qwen/qwen2.5-coder-32b-instruct hyperion ../../hyperion-lora
```

`wrangler login` opens your browser to sign in to Cloudflare (no key to copy anywhere). If Cloudflare refuses the
files, send Claude its message.

## What it costs to use afterwards

Each question to Hyperion's AI is paid to Cloudflare at the model's price (US$0.66 per million word-pieces in, US$1.00
per million out): about **US$0.001 a question**, so US$1 is roughly 1,000 questions, after Workers AI's free daily
amount. It is off until you turn on its switch in the owner console.
