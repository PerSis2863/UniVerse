#!/usr/bin/env bash
# Ghidra 2 on a rented graphics card (M368, M369; the steps for the owner: scripts/ai/ghidra2-gpu.md). One command, from
# apps/web:   bash scripts/ai/ghidra2-gpu.sh
# Default (MODE=minimind, about 30 minutes with downloads): starts from MiniMind-3's trained model (64 M numbers,
# Apache-2.0), teaches it to chat as Ghidra, then to think first and to write (GSM8K's worked maths, everyday writing),
# scores both stages on 100 school maths problems and saves it to ~/ghidra2-out. MODE=scratch builds a Ghidra 2 from
# nothing instead (about 3 hours). Safe to run again: every stage carries on where it stopped.
set -euo pipefail
MODE="${MODE:-minimind}"
CHAT_STEPS="${CHAT_STEPS:-1500}"     # the chat stage (both modes)
THINK_STEPS="${THINK_STEPS:-3600}"   # the thinking-and-writing stage (MODE=minimind)
STEPS="${STEPS:-15000}"              # pretraining from nothing (MODE=scratch): about 3 hours on one RTX 3090/4090
WORK="${WORK:-$HOME/ghidra2}"
OUT="${OUT:-$HOME/ghidra2-out}"
mkdir -p "$WORK/data" "$OUT"
cd "$(dirname "$0")/../.."   # apps/web
G=scripts/ai/ghidra2.py
HF=https://huggingface.co
get() { [ -s "$2" ] || curl -L --fail --retry 3 -o "$2" "$1"; }

echo "== 1/6 Tools"
python3 -c "import torch; assert torch.cuda.is_available(), 'No graphics card found: rent a machine with an NVIDIA GPU'; print('Graphics card:', torch.cuda.get_device_name(0))"
python3 -m pip install --quiet tokenizers pyarrow safetensors 'transformers==4.57.6'

echo "== 2/6 Texts and lessons (all free to use commercially: see scripts/ai/ghidra2-gpu.md)"
get "$HF/api/datasets/OpenAssistant/oasst1/parquet/default/train/0.parquet" "$WORK/data/oasst1.parquet"
get "$HF/datasets/HuggingFaceTB/smol-smoltalk/resolve/main/data/train-00000-of-00004.parquet" "$WORK/data/smoltalk.parquet"
if [ "$MODE" = minimind ]; then
  mkdir -p "$WORK/minimind3"
  for f in config.json model.safetensors tokenizer.json tokenizer_config.json special_tokens_map.json chat_template.jinja generation_config.json; do
    get "$HF/jingyaogong/minimind-3/resolve/main/$f" "$WORK/minimind3/$f"
  done
  get "$HF/datasets/openai/gsm8k/resolve/main/main/train-00000-of-00001.parquet" "$WORK/data/gsm8k-train.parquet"
  get "$HF/datasets/openai/gsm8k/resolve/main/main/test-00000-of-00001.parquet" "$WORK/data/gsm8k-test.parquet"

  echo "== 3/6 MiniMind-3 becomes Ghidra 2's starting point"
  [ -s "$WORK/state-pretrain.pt" ] || python3 $G adopt --hf "$WORK/minimind3" --dir "$WORK"
else
  get "$HF/datasets/roneneldan/TinyStories/resolve/main/TinyStories-train.txt" "$WORK/data/stories.txt"
  get "$HF/datasets/HuggingFaceFW/fineweb-edu/resolve/main/sample/10BT/000_00000.parquet" "$WORK/data/fineweb.parquet"
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
  [ -s "$WORK/tokenizer.json" ] || python3 $G tokenizer --out "$WORK" "${TEXTS[@]}"
fi

echo "== 4/6 Lessons: questions and answers, writing$([ "$MODE" = minimind ] && echo ', worked maths')"
[ -s "$WORK/chat.jsonl" ] || python3 $G chat --out "$WORK/chat.jsonl" --oasst "$WORK/data/oasst1.parquet"
[ -s "$WORK/write.jsonl" ] || python3 $G write --out "$WORK/write.jsonl" --smoltalk "$WORK/data/smoltalk.parquet" --tok "$WORK/tokenizer.json"
if [ "$MODE" = minimind ]; then
  [ -s "$WORK/reason.jsonl" ] || python3 $G reason --out "$WORK/reason.jsonl" --gsm8k "$WORK/data/gsm8k-train.parquet"

  echo "== 5/6 Training: chat ($CHAT_STEPS steps), then thinking and writing ($THINK_STEPS steps)"
  # --no-compile: the chat lessons differ in length, which would make the compiler start over again and again
  python3 $G sft --dir "$WORK" --stage sft --steps "$CHAT_STEPS" --every 300 --no-compile
  python3 $G sft --dir "$WORK" --stage think --from sft --data chat.jsonl,reason.jsonl,write.jsonl --steps "$THINK_STEPS" --every 300 --no-compile
  echo "-- School maths problems right (out of 100), before and after thinking:"
  python3 $G score --dir "$WORK" --gsm8k "$WORK/data/gsm8k-test.parquet" --stage sft --n 100 | tail -1
  python3 $G score --dir "$WORK" --gsm8k "$WORK/data/gsm8k-test.parquet" --stage think --n 100 | tail -1
  STAGE=think
else
  echo "== 5/6 Training ($STEPS steps, then $CHAT_STEPS chat steps)"
  python3 $G pretrain --dir "$WORK" --preset base --steps "$STEPS" --every 1000 "${TEXTS[@]}"
  python3 $G sft --dir "$WORK" --data chat.jsonl,write.jsonl --steps "$CHAT_STEPS" --every 500
  STAGE=sft
fi

echo "== 6/6 Saving"
python3 $G export --dir "$WORK" --stage "$STAGE" --to "$OUT"
ls -la "$OUT"
echo "Done. Download the files in $OUT (ghidra2.json and every ghidra2 part): see scripts/ai/ghidra2-gpu.md, step 5."
echo "Then STOP or DELETE this machine: it charges for every hour it is switched on."
