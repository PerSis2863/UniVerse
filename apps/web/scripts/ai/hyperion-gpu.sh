#!/usr/bin/env bash
# Hyperion's AI on a rented graphics card (M435; the owner's steps: scripts/ai/hyperion-gpu.md). One command, from
# apps/web:   bash scripts/ai/hyperion-gpu.sh
# It sets up the tools, writes and checks thousands of Hyperion lessons (every answer run in Hyperion's own engine),
# trains the LoRA add-on for Qwen2.5-Coder 32B, scores it before and after on requests it never saw, and saves the two
# files Cloudflare takes in ~/hyperion-ai-out. About 3–5 hours on one RTX 4090 (24 GB) or RTX A6000 (48 GB). Safe to
# run again: each stage that finished is skipped, and training carries on from its last save.
set -euo pipefail
# On RunPod the big disk is /workspace (the home folder's disk is small): keep the work, the downloads and the tools there.
BIG="$HOME"; [ -d /workspace ] && [ -w /workspace ] && BIG=/workspace
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$BIG/.cache}"   # the model downloads (~40 GB) and the tools' caches
WORK="${WORK:-$BIG/hyperion-ai}"
OUT="${OUT:-$BIG/hyperion-ai-out}"
PER="${PER:-6}"          # requests written for each of Hyperion's functions
EPOCHS="${EPOCHS:-2}"
mkdir -p "$WORK" "$OUT"
cd "$(dirname "$0")/../.."   # apps/web
VENVS="${VENVS:-$WORK}"
H=scripts/ai/hyperion-ai.py

echo "== 1/5 Tools (the graphics card, Node.js for Hyperion's engine, the AI libraries)"
source scripts/ai/gpu-tools.sh
echo "== 2/5 Lessons: requests for every function, answers, each run in Hyperion, fixes from Hyperion's errors"
[ -s "$WORK/lessons.jsonl" ] || "$VENVS/vllm/bin/python" $H data --dir "$WORK" --per "$PER"

echo "== 3/5 Training the add-on ($EPOCHS rounds over the lessons)"
[ -s "$WORK/lora/adapter_model.safetensors" ] || "$VENVS/train/bin/python" $H train --dir "$WORK" --epochs "$EPOCHS"

echo "== 4/5 Score: of requests it never saw, how many answers run in Hyperion"
"$VENVS/vllm/bin/python" $H score --dir "$WORK" | tee "$OUT/score.txt" | grep --line-buffered -E "answers ran|^-- " || true
cp "$WORK/score-answers.json" "$OUT/" 2>/dev/null || true   # every test answer, with Hyperion's error when it failed

echo "== 5/5 Saving"
"$VENVS/vllm/bin/python" $H export --dir "$WORK" --to "$OUT"
cp "$WORK/lessons.jsonl" "$OUT/lessons.jsonl"
ls -la "$OUT"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "== Then: sending the add-on to your Cloudflare account, with one test question"
  "$VENVS/vllm/bin/python" $H upload --from "$OUT" || true
fi
echo "Done. Download adapter_model.safetensors, adapter_config.json and score.txt from $OUT (scripts/ai/hyperion-gpu.md, step 5)."
echo "Then TERMINATE this machine (Pods → Terminate): until then its disk is still charged a little."
