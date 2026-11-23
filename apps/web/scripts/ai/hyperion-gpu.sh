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
# On RunPod the machine switches itself off (stops) when this ends, finished or failed, and after MAX_HOURS at most, so
# the graphics card can't keep charging while nobody watches. A stopped pod keeps /workspace (the results) and pays only
# a little for that disk; terminate it once the files are downloaded. STOP_WHEN_DONE=0 keeps it running.
MAX_HOURS="${MAX_HOURS:-8}"
if [ -n "${RUNPOD_POD_ID:-}" ] && command -v runpodctl >/dev/null && [ "${STOP_WHEN_DONE:-1}" = 1 ]; then
  stop_pod() { echo "Switching this machine off (stopped: the results stay in $OUT)."; runpodctl pod stop "$RUNPOD_POD_ID" >/dev/null 2>&1 || runpodctl stop pod "$RUNPOD_POD_ID" >/dev/null 2>&1 || true; }
  trap stop_pod EXIT
  (sleep $((MAX_HOURS * 3600)); echo "Safety limit of $MAX_HOURS hours reached."; stop_pod) &
fi
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
python3 -m pip install --quiet --break-system-packages uv 2>/dev/null || python3 -m pip install --quiet uv
# --python names the venv: uv run as "python3 -m uv" otherwise installs into the system Python, which Ubuntu 24.04 refuses
"$WORK/vllm/bin/python" -c "import vllm" 2>/dev/null || { python3 -m uv venv --allow-existing "$WORK/vllm" && python3 -m uv pip install --quiet --python "$WORK/vllm/bin/python" vllm; }
"$WORK/train/bin/python" -c "import unsloth" 2>/dev/null || { python3 -m uv venv --allow-existing "$WORK/train" && python3 -m uv pip install --quiet --python "$WORK/train/bin/python" unsloth trl datasets; }

echo "== 2/5 Lessons: requests for every function, answers, each run in Hyperion, fixes from Hyperion's errors"
[ -s "$WORK/lessons.jsonl" ] || "$WORK/vllm/bin/python" $H data --dir "$WORK" --per "$PER"

echo "== 3/5 Training the add-on ($EPOCHS rounds over the lessons)"
[ -s "$WORK/lora/adapter_model.safetensors" ] || "$WORK/train/bin/python" $H train --dir "$WORK" --epochs "$EPOCHS"

echo "== 4/5 Score: of requests it never saw, how many answers run in Hyperion"
"$WORK/vllm/bin/python" $H score --dir "$WORK" | tee "$OUT/score.txt" | grep --line-buffered -E "answers ran|^-- " || true
cp "$WORK/score-answers.json" "$OUT/" 2>/dev/null || true   # every test answer, with Hyperion's error when it failed

echo "== 5/5 Saving"
"$WORK/vllm/bin/python" $H export --dir "$WORK" --to "$OUT"
cp "$WORK/lessons.jsonl" "$OUT/lessons.jsonl"
ls -la "$OUT"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "== Then: sending the add-on to your Cloudflare account, with one test question"
  "$WORK/vllm/bin/python" $H upload --from "$OUT" || true
fi
echo "Done. Download adapter_model.safetensors, adapter_config.json and score.txt from $OUT (scripts/ai/hyperion-gpu.md, step 5)."
echo "Then TERMINATE this machine (Pods → Terminate): until then its disk is still charged a little."
