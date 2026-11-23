# Shared by the rented-card kits (hyperion-gpu.sh, agents-gpu.sh), sourced from apps/web: the switch-off safety and
# the tools (the graphics card checked, Node.js for the app's own code, two Python venvs in $VENVS: vLLM, Unsloth).
# On RunPod the machine switches itself off (stops) when this ends, finished or failed, and after MAX_HOURS at most, so
# the graphics card can't keep charging while nobody watches. A stopped pod keeps /workspace (the results) and pays only
# a little for that disk; terminate it once the files are downloaded. STOP_WHEN_DONE=0 keeps it running.
MAX_HOURS="${MAX_HOURS:-8}"
if [ -n "${RUNPOD_POD_ID:-}" ] && command -v runpodctl >/dev/null && [ "${STOP_WHEN_DONE:-1}" = 1 ]; then
  stop_pod() { echo "Switching this machine off (stopped: the results stay in $OUT)."; runpodctl pod stop "$RUNPOD_POD_ID" >/dev/null 2>&1 || runpodctl stop pod "$RUNPOD_POD_ID" >/dev/null 2>&1 || true; }
  trap stop_pod EXIT
  (sleep $((MAX_HOURS * 3600)); echo "Safety limit of $MAX_HOURS hours reached."; stop_pod) &
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || { echo "No graphics card found: rent a machine with an NVIDIA GPU"; exit 1; }
MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
[ "$MEM" -ge 23000 ] || { echo "This card has ${MEM} MB: the 32B model needs 24 GB or more (RTX 4090, RTX A6000, L40S)"; exit 1; }
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
fi
corepack enable >/dev/null 2>&1 || npm install -g pnpm
[ -d node_modules/tsx ] || (cd ../.. && pnpm install --frozen-lockfile --ignore-scripts)
node scripts/ai/hyperion-lab.mjs prompt >/dev/null   # Hyperion's engine works
python3 -m pip install --quiet --break-system-packages uv 2>/dev/null || python3 -m pip install --quiet uv
# --python names the venv: uv run as "python3 -m uv" otherwise installs into the system Python, which Ubuntu 24.04 refuses
"$VENVS/vllm/bin/python" -c "import vllm" 2>/dev/null || { python3 -m uv venv --allow-existing "$VENVS/vllm" && python3 -m uv pip install --quiet --python "$VENVS/vllm/bin/python" vllm; }
"$VENVS/train/bin/python" -c "import unsloth" 2>/dev/null || { python3 -m uv venv --allow-existing "$VENVS/train" && python3 -m uv pip install --quiet --python "$VENVS/train/bin/python" unsloth trl datasets; }

