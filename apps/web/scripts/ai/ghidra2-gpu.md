# Training Ghidra 2 on a rented graphics card

Ghidra 2 is UniVerse's own chat model (M368, M369). This computer has no graphics card, so it needs about 4 seconds for
each training step; a rented RTX 4090 needs about a tenth of a second. Renting costs money and needs an account, so it
is the owner's decision.

**What it does by default** (about 30 minutes, with the downloads): it starts from MiniMind-3's trained model (64
million numbers, Apache-2.0), teaches it to chat as Ghidra (1,500 steps), then to think before answering and to write
(3,600 steps), tests it on 100 school maths problems before and after, and saves it.

**Cost:** an RTX 4090 rents for roughly **US$0.30–0.70 an hour** (prices change: check the site). The default run is
about half an hour: **under US$0.50**. Most sites ask for US$5–10 of credit first; what you don't use stays in your
account. **Stop or delete the machine when it's done:** it charges for every hour it is switched on, even when idle.

## 1. Rent the machine

1. Make an account on a GPU rental site, for example **RunPod** (runpod.io) or **Vast.ai** (vast.ai), and add credit.
2. Start a machine ("pod") with **one RTX 4090** (or RTX 3090; 24 GB), using a **PyTorch** template, with at least
   **40 GB of disk**.
3. Open its **terminal** (RunPod: Connect → "Start Web Terminal" or "Jupyter Lab" → Terminal).

## 2. Get UniVerse

Paste into the terminal and press Enter:

```
git clone --branch claude/youthful-fermi-sbdtcp --depth 1 https://github.com/PerSis2863/UniVerse.git && cd UniVerse/apps/web
```

The repository is private, so it asks for your GitHub name and a password. GitHub doesn't take your normal password
here: make a token (GitHub → Settings → Developer settings → Personal access tokens → Fine-grained, read-only access to
this repository's contents, expiring in a day or so) and paste that. Type it only into the rented machine: never into a
chat, never into a file.

## 3. Start the training

```
bash scripts/ai/ghidra2-gpu.sh
```

It prints what it is doing (six steps) and a score every 300 steps (lower is better), then the maths results, for
example "think (step 3600): 12 of 100 right". If the connection drops, run the same command again: it carries on where
it stopped.

Other choices (put them before `bash`):

- `THINK_STEPS=7200 bash scripts/ai/ghidra2-gpu.sh`: train the thinking stage twice as long (about 15 more minutes).
- `MODE=scratch bash scripts/ai/ghidra2-gpu.sh`: build a Ghidra 2 from nothing instead of starting from MiniMind-3
  (about 3 hours, US$1–3). Usually weaker than the default.

## 4. Bring the model home

The files are in the folder `ghidra2-out` in the machine's home folder: `ghidra2.json` and the parts `ghidra2-0.bin`,
`ghidra2-1.bin`… (about 64 MB together). In Jupyter Lab, find them in the file list on the left, right-click →
**Download**. Keep them on your computer and tell Claude: putting them where UniVerse can load them is set up then.
Then **stop or delete the machine** so it stops charging.

## What it learns from (all free to use commercially)

- **MiniMind-3** (Apache-2.0): the trained starting point (default mode).
- **OpenAssistant oasst1** (Apache-2.0): people's questions with the best-rated answers, in English, plus Ghidra's own
  answers about UniVerse (`ghidra-qa.txt`), to learn to chat.
- **smol-smoltalk** (Apache-2.0): everyday writing: emails, rewrites, summaries, explanations, some code.
- **GSM8K** (MIT): school maths problems with worked steps, to learn to think first (default mode).
- From nothing only: **TinyStories** (CDLA-Sharing-1.0), one part of **FineWeb-Edu** (ODC-By 1.0) and UniVerse's own
  sentences (if the machine has Node.js).

Hindi is not in it yet: that needs a commercially safe Hindi text collection, chosen separately.

## What to expect

Short, mostly sensible answers in English and correct answers to its UniVerse questions; it gets some school maths
right by working it out. Still far from ChatGPT: it will often be wrong about facts. In UniVerse, the big AI stays
Ghidra's main brain; this model is the private, on-the-device one.
