#!/bin/sh
# Installs the Apple design skill (github.com/dickwu/apple-design-skill) for Claude Code on this machine,
# at the owner's request (8 Nov 2026). It stays out of the project: the repository has no licence and
# most of it is Apple's Human Interface Guidelines text, which belongs to Apple. Cloud sessions start
# from a fresh machine, so run this again in a new session when you want it:
#   sh tools/setup-apple-design.sh
# What it does: a shallow clone of one pinned commit into ~/.claude/skills/apple-design (Markdown only;
# its scripts/pull-hig.mjs, which downloads the guidelines from developer.apple.com, is never run).
# Restart Claude Code afterwards. Project rules (AGENTS.md §8) win where they differ.
set -eu

COMMIT=ff4ebddf0488598723a82bfdce1afb04de0b1c44
DEST="$HOME/.claude/skills/apple-design"

if [ -f "$DEST/SKILL.md" ]; then echo "Already installed: $DEST"; exit 0; fi
mkdir -p "$DEST"
git -C "$DEST" init -q
git -C "$DEST" remote add origin https://github.com/dickwu/apple-design-skill
git -C "$DEST" fetch -q --depth 1 origin "$COMMIT"
git -C "$DEST" checkout -q FETCH_HEAD
rm -rf "$DEST/.git" "$DEST/.github" "$DEST/scripts"
echo "Installed the Apple design skill in $DEST. Restart Claude Code to use it."
