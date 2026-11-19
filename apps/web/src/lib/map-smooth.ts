import type { Map as MLMap, MapOptions } from 'maplibre-gl';

// M335 (the owner, 19 Nov: "specially the maps it doesn't feel that smooth"): the same smooth settings for every
// MapLibre map (Travel's, Green's places, Relief's alerts). Tiles that only aged are not fetched again, more tiles are
// kept while moving about, tile requests for zooms passed through are dropped, and labels fade in quickly. A fling
// glides on longer and softer before it stops, closer to Apple Maps (MapLibre's own: 1400 px/s at most, slowing at
// 2500 px/s², on a sharp ease-out).

export const SMOOTH_MAP: Partial<MapOptions> = { refreshExpiredTiles: false, maxTileCacheZoomLevels: 6, cancelPendingTileRequestsWhileZooming: true, fadeDuration: 150 };

/** An ease-out that keeps moving a little longer before it settles (cubic-bezier(0.2, 0.7, 0.3, 1) by eye). */
export const glideOut = (t: number) => 1 - (1 - t) ** 3.2;

/** The fling: up to 1800 px/s, slowing at 1700 px/s², so it carries about half as far again as MapLibre's own. */
export function smoothGestures(map: MLMap) {
  map.dragPan.enable({ linearity: 0.28, easing: glideOut, maxSpeed: 1800, deceleration: 1700 });
}
