#!/usr/bin/env bash
# Ghidra 2 on a rented graphics card (M368; the steps for the owner: scripts/ai/ghidra2-gpu.md). One command, from
# apps/web:   bash scripts/ai/ghidra2-gpu.sh
# It installs what it needs, downloads the free texts, learns the word-pieces, trains the "base" Ghidra 2 (~64 M
# numbers) and teaches it to chat, then saves it to ~/ghidra2-out (ghidra2.bin and ghidra2.json). Safe to run again:
# every stage carries on where it stopped. STEPS and CHAT_STEPS change how long it trains.
set -euo pipefail
STEPS="${STEPS:-15000}"          # about 3 hours on one RTX 3090/4090 (32 × 1,024 word-pieces a step)
CHAT_STEPS="${CHAT_STEPS:-2000}"
WORK="${WORK:-$HOME/ghidra2}"
OUT="${OUT:-$HOME/ghidra2-out}"
mkdir -p "$WORK/data" "$OUT"
cd "$(dirname "$0")/../.."   # apps/web

echo "== 1/6 Tools"
python3 -c "import torch; assert torch.cuda.is_available(), 'No graphics card found: rent a machine with an NVIDIA GPU'; print('Graphics card:', torch.cuda.get_device_name(0))"
python3 -m pip install --quiet tokenizers pyarrow

echo "== 2/6 Texts (free licences: TinyStories CDLA-Sharing-1.0, FineWeb-Edu ODC-By 1.0, OpenAssistant Apache-2.0)"
HF=https://huggingface.co/datasets
get() { [ -s "$2" ] || curl -L --fail --retry 3 -o "$2" "$1"; }
get "$HF/roneneldan/TinyStories/resolve/main/TinyStories-train.txt" "$WORK/data/stories.txt"
get "$HF/HuggingFaceFW/fineweb-edu/resolve/main/sample/10BT/000_00000.parquet" "$WORK/data/fineweb.parquet"
get "https://huggingface.co/api/datasets/OpenAssistant/oasst1/parquet/default/train/0.parquet" "$WORK/data/oasst1.parquet"
[ -s "$WORK/data/fineweb.txt" ] || python3 -I - "$WORK/data/fineweb.parquet" "$WORK/data/fineweb.txt" <<'PY'
import sys, pyarrow.parquet as pq
t = pq.read_table(sys.argv[1], columns=['text', 'score'])
with open(sys.argv[2], 'w', encoding='utf-8') as out:
    for text, score in zip(t.column('text').to_pylist(), t.column('score').to_pylist()):
        if score >= 3 and len(text) < 20000: out.write(text.strip() + '\n<|endoftext|>\n')
PY
TEXTS=("$WORK/data/stories.txt" "$WORK/data/fineweb.txt")
if command -v node >/dev/null; then node scripts/ai/ghidra-corpus.mjs "$WORK/data/universe.txt" && TEXTS+=("$WORK/data/universe.txt:4"); fi

echo "== 3/6 Word-pieces"
[ -s "$WORK/tokenizer.json" ] || python3 scripts/ai/ghidra2.py tokenizer --out "$WORK" "${TEXTS[@]}"

echo "== 4/6 Questions and answers"
[ -s "$WORK/chat.jsonl" ] || python3 scripts/ai/ghidra2.py chat --out "$WORK/chat.jsonl" --oasst "$WORK/data/oasst1.parquet"

echo "== 5/6 Training ($STEPS steps, then $CHAT_STEPS chat steps)"
python3 scripts/ai/ghidra2.py pretrain --dir "$WORK" --preset base --steps "$STEPS" --every 1000 "${TEXTS[@]}"
python3 scripts/ai/ghidra2.py sft --dir "$WORK" --steps "$CHAT_STEPS" --every 500

echo "== 6/6 Saving"
python3 scripts/ai/ghidra2.py export --dir "$WORK" --to "$OUT"
ls -la "$OUT"
echo "Done. Download the two files in $OUT (ghidra2.bin and ghidra2.json): see scripts/ai/ghidra2-gpu.md, step 5."
