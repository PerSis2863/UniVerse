#!/usr/bin/env bash
# Ghidra's add-on on a rented graphics card (M446; STAGE-5-PLAN.md, "Ghidra, the one AI", step 4).
# One command, from apps/web:   bash scripts/ai/ghidra-gpu.sh
# The teacher (Qwen2.5-72B) writes new material and answers other questions from the exam's papers; only answers that
# pass each skill's rules are kept; the add-on for Qwen2.5-Coder 32B is trained on them; the exam is asked with and
# without it (wins.json: the skills it does better); it is sent to Cloudflare (with CLOUDFLARE_API_TOKEN). Needs an
# 80 GB card (A100 80GB, H100) and about 150 GB of disk; about 4 hours. The machine switches itself off at the end
# (gpu-tools.sh). Safe to run again: finished steps are skipped.
set -euo pipefail
BIG="$HOME"; [ -d /workspace ] && [ -w /workspace ] && BIG=/workspace
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$BIG/.cache}" HF_HOME="${HF_HOME:-$BIG/hf}"
WORK="${WORK:-$BIG/ghidra-ai}"
OUT="${OUT:-$BIG/ghidra-ai-out}"
VENVS="${VENVS:-$BIG/hyperion-ai}"
PER="${PER:-80}"
EPOCHS="${EPOCHS:-2}"
MAX_HOURS="${MAX_HOURS:-6}"
mkdir -p "$WORK" "$OUT" "$VENVS"
cd "$(dirname "$0")/../.."   # apps/web
G=scripts/ai/ghidra-ai.py; H=scripts/ai/hyperion-ai.py

echo "== 1/6 Tools"
source scripts/ai/gpu-tools.sh
MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
[ "$MEM" -ge 70000 ] || { echo "This card has ${MEM} MB: the 72B teacher needs an 80 GB card"; exit 1; }
echo "== 2/6 New material from the teacher"
"$VENVS/vllm/bin/python" $G material --dir "$WORK"
echo "== 3/6 Lessons: other questions from the exam's papers, the teacher's answers, each checked against its skill's rules"
"$VENVS/vllm/bin/python" $G data --dir "$WORK" --per "$PER"
echo "== 4/6 Training the add-on ($EPOCHS rounds over the lessons)"
[ -s "$WORK/lora/adapter_model.safetensors" ] || "$VENVS/train/bin/python" $H train --dir "$WORK" --epochs "$EPOCHS" --seq 4096
echo "== 5/6 The exam, without and with the add-on"
"$VENVS/vllm/bin/python" $G score --dir "$WORK" | tee "$OUT/score.txt"
cp -r "$WORK/exam-base" "$WORK/exam-ghidra" "$WORK/wins.json" "$WORK/lessons.jsonl" "$WORK/material.json" "$OUT/"
echo "== 6/6 Saving"
"$VENVS/vllm/bin/python" $H export --dir "$WORK" --to "$OUT"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  "$VENVS/vllm/bin/python" $H upload --from "$OUT" --prefix ghidra --var GHIDRA_LORA --question 'Tips for 2 days in Lisbon for 2 people.' || true
fi
ls -la "$OUT"
echo "Done."
