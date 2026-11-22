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
template, with **Container Disk 50 GB** and **Volume Disk 150 GB** (the kit keeps its work and the ~40 GB of
downloads on the volume, `/workspace`, by itself). Open its terminal (RunPod: Connect → "Start Web Terminal" or Jupyter Lab →
Terminal).

## 2. Get UniVerse

```
cd /workspace && git clone --branch claude/youthful-fermi-sbdtcp --depth 1 https://github.com/PerSis2863/UniVerse.git && cd UniVerse/apps/web
```

GitHub asks for your name and a password: use a short-lived, read-only token (GitHub → Settings → Developer settings →
Personal access tokens → Fine-grained, this repository's contents, read-only, expiring in a day). Type it only into
the rented machine: never into a chat or a file.

## 3. Start

```
apt-get update -qq && apt-get install -y -qq tmux && tmux new -s hyperion
bash scripts/ai/hyperion-gpu.sh
```

`tmux` keeps it running if the browser tab closes: to see it again, open a terminal and type `tmux attach -t hyperion`.
It shows five steps. The first takes 10–20 minutes (it downloads the tools and the model, about 40 GB). If the
connection drops, run the same command again: it carries on.

## 4. Wait, then read the score

At the end it prints two lines like `before (no add-on): 92 of 150 answers ran in Hyperion` and
`after (with the add-on): 131 of 150 …`. The second number should be higher: that is what the add-on learnt.

## 5. Bring the files home

In the folder `hyperion-ai-out` (in `/workspace`, the first folder Jupyter Lab shows): **adapter_model.safetensors**, **adapter_config.json**
and **score.txt** (and `lessons.jsonl`, the lessons it learnt from). In Jupyter Lab: right-click → Download. Then
**terminate the machine** (Pods → your pod → Terminate).

**It can't run up your money:** on RunPod the kit switches the machine off by itself when it finishes, when it fails,
and after 8 hours at most (`MAX_HOURS`). A switched-off ("stopped") machine keeps your files and pays only a little for
its disk. To get the files later, press **Start** on the pod, download them (a few minutes), then **Terminate**. If your
balance ever reaches US$0, RunPod stops everything, and a machine without a network volume is deleted with its files:
download within a few days.

## 6. The add-on goes to Cloudflare (by itself, or by hand)

**By itself (easiest):** before the run, make a Cloudflare key: dash.cloudflare.com → your profile (top right) → **API
Tokens** → **Create Token** → **Create Custom Token**: name `runpod-hyperion`, permission **Account · Workers AI · Edit**,
your account, a short **TTL** (a week) → **Create** and copy it. In RunPod → **Secrets** → **Create Secret**: name
`cloudflare_token`, paste it. Give the machine `CLOUDFLARE_API_TOKEN={{ RUNPOD_SECRET_cloudflare_token }}`. After the score,
the kit uploads the add-on, asks it one test question, and prints `In Cloudflare, set the variable HYPERION_LORA to: …`
(also in `hyperion-ai-out/cloudflare.txt`). No download needed. Delete the key in Cloudflare afterwards.

**By hand:** in the UniVerse folder on your computer (where you set it up, see AGENTS.md section 5), put the two files in a new
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
