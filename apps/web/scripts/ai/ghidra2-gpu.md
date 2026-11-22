# Training Ghidra 2 on a rented graphics card

Ghidra 2 is UniVerse's own chat model (M368). This computer can train only a small version. A rented graphics card
trains the full "base" size (about 64 million numbers, like MiniMind-3) in about 3 hours. This costs money and needs
an account, so it is the owner's decision.

**Cost:** an RTX 3090 or 4090 rents for roughly US$0.25–0.70 an hour. A full run (about 3–4 hours with downloads) is
roughly **US$1–3**. Stop the machine when it's done: rental is charged while it runs.

## 1. Rent the machine

1. Make an account on a GPU rental site, for example **RunPod** (runpod.io) or **Vast.ai** (vast.ai), and add a few
   dollars of credit.
2. Start a machine ("pod") with **one RTX 3090 or RTX 4090** (24 GB), using a **PyTorch** template, with at least
   **40 GB of disk**.
3. Open its **terminal** (RunPod: Connect → "Start Web Terminal" or "Jupyter Lab" → Terminal).

## 2. Get UniVerse

Paste into the terminal and press Enter:

```
git clone --branch claude/youthful-fermi-sbdtcp --depth 1 https://github.com/PerSis2863/UniVerse.git && cd UniVerse/apps/web
```

(The repository is private: if it asks for a password, sign in with GitHub, or ask Claude for another way.)

## 3. Start the training

```
bash scripts/ai/ghidra2-gpu.sh
```

It prints what it is doing (six steps) and the score every 1,000 steps (lower is better). If the connection drops,
run the same command again: it carries on where it stopped.

## 4. Wait

About 3 hours for the default 15,000 steps. For a quicker first try: `STEPS=3000 bash scripts/ai/ghidra2-gpu.sh`
(about 40 minutes; a weaker model).

## 5. Bring the model home

The two files are in the folder `ghidra2-out` in the machine's home folder: `ghidra2.bin` (about 70 MB) and
`ghidra2.json`. In Jupyter Lab, find them in the file list on the left, right-click → **Download**. Keep them on your
computer and tell Claude: the next step (putting them where UniVerse can load them) is set up then. Then **stop or
delete the machine** so it stops charging.

## What it learns from (all free to use commercially)

- **TinyStories** (CDLA-Sharing-1.0): simple English stories, for fluent writing.
- **FineWeb-Edu**, one part (ODC-By 1.0): educational web pages, for knowledge.
- **UniVerse's own sentences** (if the machine has Node.js).
- **OpenAssistant oasst1** (Apache-2.0): people's questions with the best-rated answers, in English, plus
  Ghidra's own answers about UniVerse (`ghidra-qa.txt`), to learn to chat.

Hindi is not in it yet: that needs a commercially safe Hindi text collection, chosen separately.

## What to expect

Much better than the small Ghidra: short, mostly sensible answers in English and correct answers to its UniVerse
questions. Still far from ChatGPT: it will often be wrong about facts. In UniVerse, the big AI stays Ghidra's main
brain; this model is the private, on-the-device one.
