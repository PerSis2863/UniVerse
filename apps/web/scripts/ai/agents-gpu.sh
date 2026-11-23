#!/usr/bin/env bash
# The app agents' own AI on a rented graphics card (M437; the steps: scripts/ai/hyperion-gpu.md, "The agents' add-on").
# One command, from apps/web:   bash scripts/ai/agents-gpu.sh
# Writes requests for Ghidra's Customer Support, Travel Planner, Research Assistant and Social Media Manager, keeps the
# teacher's answers that pass each agent's rules, trains the add-on for Qwen2.5-Coder 32B, scores it before and after on
# requests it never saw, and sends it to Cloudflare (with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID). About 2–3 hours
# on a 48 GB card. On a machine that ran hyperion-gpu.sh, VENVS=<its work folder> reuses its tools. Safe to run again.
set -euo pipefail
BIG="$HOME"; [ -d /workspace ] && [ -w /workspace ] && BIG=/workspace
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$BIG/.cache}"
WORK="${WORK:-$BIG/agents-ai}"
OUT="${OUT:-$BIG/agents-ai-out}"
VENVS="${VENVS:-$BIG/hyperion-ai}"
SCALE="${SCALE:-1}"      # 1: about 3,900 requests (2,000 support, 900 travel, 500 research, 500 posts)
EPOCHS="${EPOCHS:-2}"
mkdir -p "$WORK" "$OUT" "$VENVS"
cd "$(dirname "$0")/../.."   # apps/web
A=scripts/ai/agents-ai.py; H=scripts/ai/hyperion-ai.py

echo "== 1/5 Tools"
source scripts/ai/gpu-tools.sh
echo "== 2/5 Lessons: requests for each agent, the teacher's answers, each checked against that agent's rules"
[ -s "$WORK/lessons.jsonl" ] || "$VENVS/vllm/bin/python" $A data --dir "$WORK" --scale "$SCALE"
echo "== 3/5 Training the add-on ($EPOCHS rounds over the lessons)"
[ -s "$WORK/lora/adapter_model.safetensors" ] || "$VENVS/train/bin/python" $H train --dir "$WORK" --epochs "$EPOCHS"
echo "== 4/5 Score: of requests it never saw, how many answers pass their agent's rules"
"$VENVS/vllm/bin/python" $A score --dir "$WORK" | tee "$OUT/score.txt" | grep --line-buffered -E "passed their agent" || true
cp "$WORK/score-answers.json" "$OUT/" 2>/dev/null || true
echo "== 5/5 Saving"
"$VENVS/vllm/bin/python" $H export --dir "$WORK" --to "$OUT"
cp "$WORK/lessons.jsonl" "$OUT/lessons.jsonl"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "== Then: sending the add-on to your Cloudflare account, with one test question"
  "$VENVS/vllm/bin/python" $H upload --from "$OUT" --prefix agents --var AGENTS_LORA --question 'Tips for 2 days in Lisbon for 2 people.' || true
fi
ls -la "$OUT"
echo "Done. In Cloudflare set AGENTS_LORA to the name above, then turn on \"Agents’ own AI on Cloudflare\" (console → Server)."
