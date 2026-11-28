# Hyperion for computers

Hyperion's own app for Windows, Mac and Linux (M412). It opens Hyperion (`https://universeimpact.com/hyperion`) in a
window of its own, with its Σ icon, menus (File → Code, Simulate, Learn), an offline page and safe defaults: other sites open
in the normal browser, and only Hyperion's site may use the camera or microphone. Every new Hyperion feature reaches
the app the moment it is on the website.

This folder is not part of the website's build (it is outside the pnpm workspace).

## Chip and circuit simulators (M569)

`simulators.js` runs a simulator already installed on the computer on files Hyperion wrote: Verilator, Cadence Xcelium
(`xrun`), Synopsys VCS or Siemens Questa (`qrun`) on a `dpigen` testbench; ngspice, Xyce, Cadence Spectre or Synopsys
HSPICE on a netlist (its raw results file comes back to Hyperion). Found on the PATH only (no licence is checked out to
look); the person is asked before each run, as for a program. In a script: `cosim` lists them, `cosim('verilator',
'name_tb')` runs one.

## Julia, C++ and Rust (M470)

In the app, Hyperion's Code window also runs `.jl`, `.cpp` and `.rs` scripts with the tools installed on the computer
(`julia`; `g++` or `clang++`; `rustc`): `runner.js` writes the script to a fresh temporary folder, builds it (C++17
with -O2, Rust 2021 with -O), runs it for at most 5 minutes with at most 2 MB of output, streams the output back and
deletes the folder. Only Hyperion's own site, in the window's main frame, may ask (`preload.js`, checked in `main.js`),
and the person is asked before each new program runs (or ticks "Don't ask again for … until Hyperion is closed").
When a tool is missing, Hyperion says how to install it for that system. Python and R need nothing installed: they run
inside Hyperion itself, sealed off from the site (`public/sandbox/run.html` in the website).

## IBIS-AMI models (M577)

Chip makers ship their SerDes equalisers as IBIS-AMI models: a compiled library (`.dll`, `.so`, `.dylib`) and an `.ami`
settings file. A browser can't run them; the app can. In a script, `amiModel('rx.dll', 'rx.ami')` and
`eyeDiagram(S, rate, 'TxModel', tx, 'RxModel', rx)` (or `amiSimulate`). How it works: the engine's worker asks the app
synchronously at its private address `hyperion-native://` with this launch's secret token (given only to Hyperion's
own site in the main frame); `ami.js` checks the request and asks the person before a model loads (once per model,
by its fingerprint); `ami-host.js` loads it with koffi (a foreign-function library, no compiler needed) in Electron's
utility process, so a crashing or hanging model (stopped after 2 minutes) never takes the app down. The model must be
built for the computer's processor (on Apple chips an ARM build). Older 32-bit models (M580) run through a small
32-bit helper, `bin/ami-host32-*` (source `host32/ami-host32.c`, built by `host32/build.sh` and the workflow; Linux
needs the 32-bit system libraries; Macs can't run 32-bit programs). Back-channel links (M579) run both models in one
process in turns, in a private shared folder. Tests: `npm test` (builds the tiny model in
`test/` with gcc). When the Mac app is signed, its entitlements need `com.apple.security.cs.disable-library-validation`
so it may load makers' libraries signed by someone else.

## Build the installers

GitHub → Actions → **Hyperion desktop** → Run workflow. Tick **publish** to put them online as the release
`hyperion-latest`; the download links are then:

- Windows: `https://github.com/PerSis2863/UniVerse/releases/download/hyperion-latest/Hyperion-Setup.exe`
- Mac: `https://github.com/PerSis2863/UniVerse/releases/download/hyperion-latest/Hyperion-mac.dmg`
- Linux: `https://github.com/PerSis2863/UniVerse/releases/download/hyperion-latest/Hyperion-linux.AppImage`

On a computer: `npm ci`, then `npm start` (runs it) or `npm run build` (makes this computer's installer in `dist/`).
`HYPERION_URL=http://localhost:3000/hyperion npm start` opens a local copy of the site.

## Signing (the owner's accounts, paid)

Without signing, Windows shows "Windows protected your PC" (More info → Run anyway) and a Mac refuses a first double
click (right-click → Open). To sign, buy the certificates and add them as GitHub secrets (Settings → Secrets and
variables → Actions); the workflow then signs on its own:

- Windows (a code-signing certificate, about $100–400 a year): `HYPERION_WIN_CERT` (the .pfx as base64) and
  `HYPERION_WIN_CERT_PASSWORD`.
- Mac (Apple Developer Program, $99 a year; a "Developer ID Application" certificate): `HYPERION_MAC_CERT` (the .p12
  as base64), `HYPERION_MAC_CERT_PASSWORD`, and for Apple's notarisation `HYPERION_APPLE_ID`,
  `HYPERION_APPLE_APP_PASSWORD` (an app-specific password) and `HYPERION_APPLE_TEAM_ID`.
