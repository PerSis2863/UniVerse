// Webpack loader for Excalidraw's bundle: it loads fonts from EXCALIDRAW_ASSET_PATH and always
// adds its CDN (esm.sh) as a second source, which our Content-Security-Policy blocks (noisy
// console errors, and we don't want the whiteboard calling a third-party CDN). Point that second
// source at this site's copy too (public/excalidraw-assets, see copy-excalidraw-assets.mjs).
const CDN = /"ASSETS_FALLBACK_URL",\s*`https:\/\/esm\.sh\/\$\{[^`]*`[^`]*`[^}]*\}\/dist\/prod\/`/;
const SELF = '"ASSETS_FALLBACK_URL", (typeof window !== "undefined" ? window.location.origin : "http://localhost") + "/excalidraw-assets/"';

module.exports = function excalidrawAssetsLoader(source) {
  return CDN.test(source) ? source.replace(CDN, SELF) : source;
};
