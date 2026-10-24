#!/bin/sh
# Installs REA (github.com/morluto/rea, MIT) with Ghidra as its native analysis engine and registers
# its MCP server and skill with Claude Code. Cloud sessions start from a fresh machine, so run this
# again in a new session when you want REA:  sh tools/setup-rea.sh
# What it does (all outside the project folder): Node 24 into /opt/node24 (REA needs 22.23.4 or newer;
# the project itself keeps the machine's Node), Ghidra 12.1.4 into /opt (both checked against their
# published SHA-256), REA cloned and built in ~/rea, then `rea setup` for Claude Code with Node 24
# pinned. Needs a 64-bit full JDK 21 or newer on PATH (javac), about 1.5 GB of disk and network access
# to nodejs.org, github.com and the npm registry. Restart Claude Code afterwards.
# For lawful analysis only: software you own or may examine (see REA's DISCLAIMER.md).
set -eu

NODE_V=v24.22.1
GHIDRA_DIR=/opt/ghidra_12.1.4_PUBLIC
GHIDRA_URL=https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip
GHIDRA_SHA=ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db # from REA's .github/workflows/ghidra-bridge-sources.yml
REA_DIR=${REA_DIR:-$HOME/rea}
JAVA_HOME=${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ ! -x /opt/node24/bin/node ]; then
  echo "Node $NODE_V…"
  curl -fsS -o "$tmp/node.tar.xz" "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-x64.tar.xz"
  curl -fsS -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/$NODE_V/SHASUMS256.txt"
  echo "$(grep " node-$NODE_V-linux-x64.tar.xz\$" "$tmp/SHASUMS256.txt" | cut -d' ' -f1)  $tmp/node.tar.xz" | sha256sum -c -
  tar -xJf "$tmp/node.tar.xz" -C /opt && ln -sfn "/opt/node-$NODE_V-linux-x64" /opt/node24
fi

if [ ! -f "$GHIDRA_DIR/Ghidra/application.properties" ]; then
  echo "Ghidra 12.1.4…"
  curl -fsSL -o "$tmp/ghidra.zip" "$GHIDRA_URL"
  echo "$GHIDRA_SHA  $tmp/ghidra.zip" | sha256sum -c -
  unzip -q "$tmp/ghidra.zip" -d /opt
fi

[ -d "$REA_DIR/.git" ] || git clone https://github.com/morluto/rea.git "$REA_DIR"
cd "$REA_DIR"
export PATH="/opt/node24/bin:$PATH" GHIDRA_INSTALL_DIR="$GHIDRA_DIR" JAVA_HOME
npm ci
npm install-scripts approve esbuild >/dev/null 2>&1 || true # esbuild's own binary download, held back by npm
npm rebuild esbuild
npm run build
node scripts/rea.mjs doctor --provider ghidra --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.healthy?"Ghidra engine: healthy":"Ghidra engine: NOT healthy, see rea doctor");process.exit(j.healthy?0:1)})'
node scripts/rea.mjs setup --client claude_code --yes >/dev/null

# Claude Code starts the server with `env node`, which is the machine's older Node: pin Node 24.
node -e '
const fs = require("fs"), p = process.env.HOME + "/.claude.json", c = JSON.parse(fs.readFileSync(p, "utf8"));
const r = c.mcpServers.rea;
c.mcpServers.rea = { command: "/opt/node24/bin/node", args: [process.argv[1] + "/scripts/rea.mjs", "mcp"], env: { ...r.env, PATH: "/opt/node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" } };
fs.writeFileSync(p, JSON.stringify(c, null, 2));
' "$REA_DIR"
echo "REA is set up with Ghidra. Restart Claude Code; its tools appear as the \"rea\" MCP server and the reverse-engineer-anything skill."
