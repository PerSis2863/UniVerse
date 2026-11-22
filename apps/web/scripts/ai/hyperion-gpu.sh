#!/usr/bin/env bash
# Hyperion's AI on a rented graphics card (M435; the owner's steps: scripts/ai/hyperion-gpu.md). One command, from
# apps/web:   bash scripts/ai/hyperion-gpu.sh
# It sets up the tools, writes and checks thousands of Hyperion lessons (every answer run in Hyperion's own engine),
# trains the LoRA add-on for Qwen2.5-Coder 32B, scores it before and after on requests it never saw, and saves the two
# files Cloudflare takes in ~/hyperion-ai-out. About 3–5 hours on one RTX 4090 (24 GB) or RTX A6000 (48 GB). Safe to
# run again: each stage that finished is skipped, and training carries on from its last save.
set -euo pipefail
WORK="${WORK:-$HOME/hyperion-ai}"
OUT="${OUT:-$HOME/hyperion-ai-out}"
PER="${PER:-6}"          # requests written for each of Hyperion's functions
EPOCHS="${EPOCHS:-2}"
mkdir -p "$WORK" "$OUT"
cd "$(dirname "$0")/../.."   # apps/web
H=scripts/ai/hyperion-ai.py

echo "== 1/5 Tools (the graphics card, Node.js for Hyperion's engine, the AI libraries)"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || { echo "No graphics card found: rent a machine with an NVIDIA GPU"; exit 1; }
MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
[ "$MEM" -ge 23000 ] || { echo "This card has ${MEM} MB: Hyperion's AI needs 24 GB or more (RTX 4090, RTX A6000, L40S)"; exit 1; }
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
fi
corepack enable >/dev/null 2>&1 || npm install -g pnpm
[ -d node_modules/tsx ] || (cd ../.. && pnpm install --frozen-lockfile --ignore-scripts)
node scripts/ai/hyperion-lab.mjs prompt >/dev/null   # Hyperion's engine works
python3 -m pip install --quiet uv
[ -x "$WORK/vllm/bin/python" ] || { python3 -m uv venv "$WORK/vllm" && VIRTUAL_ENV="$WORK/vllm" python3 -m uv pip install --quiet vllm; }
[ -x "$WORK/train/bin/python" ] || { python3 -m uv venv "$WORK/train" && VIRTUAL_ENV="$WORK/train" python3 -m uv pip install --quiet unsloth trl datasets; }

echo "== 2/5 Lessons: requests for every function, answers, each run in Hyperion, fixes from Hyperion's errors"
[ -s "$WORK/lessons.jsonl" ] || "$WORK/vllm/bin/python" $H data --dir "$WORK" --per "$PER"

echo "== 3/5 Training the add-on ($EPOCHS rounds over the lessons)"
[ -s "$WORK/lora/adapter_model.safetensors" ] || "$WORK/train/bin/python" $H train --dir "$WORK" --epochs "$EPOCHS"

echo "== 4/5 Score: of requests it never saw, how many answers run in Hyperion"
"$WORK/vllm/bin/python" $H score --dir "$WORK" | tee "$OUT/score.txt" | grep -E "answers ran" || true

echo "== 5/5 Saving"
"$WORK/vllm/bin/python" $H export --dir "$WORK" --to "$OUT"
cp "$WORK/lessons.jsonl" "$OUT/lessons.jsonl"
ls -la "$OUT"
echo "Done. Download adapter_model.safetensors, adapter_config.json and score.txt from $OUT (scripts/ai/hyperion-gpu.md, step 5)."
echo "Then STOP or DELETE this machine: it charges for every hour it is switched on."
