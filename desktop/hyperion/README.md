# Hyperion for computers

Hyperion's own app for Windows, Mac and Linux (M412). It opens Hyperion (`https://universeimpact.com/hyperion`) in a
window of its own, with its Σ icon, menus (File → Code, Simulate), an offline page and safe defaults: other sites open
in the normal browser, and only Hyperion's site may use the camera or microphone. Every new Hyperion feature reaches
the app the moment it is on the website.

This folder is not part of the website's build (it is outside the pnpm workspace).

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
