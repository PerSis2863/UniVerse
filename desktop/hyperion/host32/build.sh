#!/bin/sh
# Builds Hyperion's 32-bit IBIS-AMI helper (M580) into desktop/hyperion/bin: Linux needs gcc-multilib, Windows is
# cross-built with mingw-w64 (i686). Run from anywhere; the GitHub workflow runs it before the installers are built.
set -e
here=$(cd "$(dirname "$0")" && pwd); out="$here/../bin"; mkdir -p "$out"
if [ "${1:-all}" != "win" ]; then gcc -m32 -O2 -Wall -o "$out/ami-host32-linux" "$here/ami-host32.c" -ldl; fi
if [ "${1:-all}" != "linux" ]; then i686-w64-mingw32-gcc -O2 -Wall -static -o "$out/ami-host32-win32.exe" "$here/ami-host32.c"; fi
ls -l "$out"
