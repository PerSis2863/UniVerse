"""M328: the landing Earth's pictures (public/geo/earth-*.jpg, earth-water-1024.png, clouds.webp).

The Earth: Natural Earth's public-domain rasters (naturalearthdata.com, 1:50m): "Cross Blended Hypso with Shaded
Relief and Water" for the land (greens where it's wet, tans where it's dry, relief shading) and "Ocean Bottom" for the
sea floor, which becomes the deep blue sea; the coastline from the app's own public/geo/world-50m.json.
Run: download HYP_50M_SR_W.zip and OB_50M.zip from https://naciscdn.org/naturalearth/50m/raster/, unzip them into
one folder, then: python3 scripts/assets/earth-pictures.py <that folder> public/geo
The clouds are drawn here (no picture needed).
"""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

Image.MAX_IMAGE_PIXELS = None
src, out = sys.argv[1], sys.argv[2]
W, H = 4096, 2048


def land_mask():
    t = json.load(open('public/geo/world-50m.json'))
    sx, sy = t['transform']['scale']
    tx, ty = t['transform']['translate']
    arcs = []
    for a in t['arcs']:
        x = y = 0
        pts = []
        for dx, dy in a:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(idx):
        pts = []
        for i in idx:
            p = arcs[i] if i >= 0 else arcs[~i][::-1]
            pts.extend(p if not pts else p[1:])
        return pts

    s = 2
    img = Image.new('L', (W * s, H * s), 0)
    dr = ImageDraw.Draw(img)
    for g in t['objects']['land']['geometries']:
        for poly in (g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]):
            for k, r in enumerate(poly):
                rr = ring(r)
                if len(rr) < 3:
                    continue
                # Longitudes kept continuous across the date line, then drawn at -360, 0 and +360.
                un = [rr[0][0]]
                for (lo, _), (lp, _) in zip(rr[1:], rr[:-1]):
                    d = lo - lp
                    un.append(un[-1] + d - 360 * round(d / 360))
                for shift in (-360, 0, 360):
                    dr.polygon([((lon + shift + 180) / 360 * W * s, (90 - lat) / 180 * H * s) for lon, (_, lat) in zip(un, rr)], fill=0 if k else 255)
    return img.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))


def earth():
    land = land_mask()
    lm = np.asarray(land).astype(np.float32)[..., None] / 255.0
    hyp = Image.open(f'{src}/HYP_50M_SR_W.tif').convert('RGB').resize((W, H), Image.LANCZOS)
    hyp = np.asarray(ImageEnhance.Contrast(ImageEnhance.Color(hyp).enhance(1.45)).enhance(1.12)).astype(np.float32)
    ob = np.asarray(Image.open(f'{src}/OB_50M/OB_50M.tif').convert('L').resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0
    v = np.clip((ob - 0.35) / 0.42, 0, 1)
    near = np.asarray(land.filter(ImageFilter.GaussianBlur(18))).astype(np.float32) / 255.0  # shallow seas by the coasts
    sea = np.stack([8 + 34 * v ** 1.7 + 40 * near, 38 + 82 * v ** 1.35 + 60 * near, 96 + 118 * v ** 0.95 + 40 * near], axis=2)
    img = Image.fromarray(np.clip(hyp * lm + sea * (1 - lm), 0, 255).astype(np.uint8))
    img.save(f'{out}/earth-4096.jpg', quality=84, optimize=True, progressive=True)
    img.resize((2048, 1024), Image.LANCZOS).save(f'{out}/earth-2048.jpg', quality=85, optimize=True, progressive=True)
    Image.fromarray(((1 - lm[..., 0]) * 255).astype(np.uint8)).resize((1024, 512), Image.LANCZOS).save(f'{out}/earth-water-1024.png', optimize=True)


def clouds():
    """A band of heaped clouds, lit from the top left: dense along the middle, fading out below."""
    cw, ch = 2400, 720
    rng = np.random.default_rng(7)
    d = np.zeros((ch, cw), np.float32)
    yy, xx = np.mgrid[0:ch, 0:cw]

    def blob(cx, cy, r, k=1.0, sharp=2.6):
        x0, x1, y0, y1 = max(0, int(cx - 1.6 * r)), min(cw, int(cx + 1.6 * r)), max(0, int(cy - 1.6 * r)), min(ch, int(cy + 1.6 * r))
        if x0 >= x1 or y0 >= y1:
            return
        q = ((xx[y0:y1, x0:x1] - cx) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2) / (r * r)
        np.maximum(d[y0:y1, x0:x1], k * np.exp(-q * sharp), out=d[y0:y1, x0:x1])  # a union of round puffs: a bumpy edge

    line = lambda x: 330 + 55 * np.sin(x / 300 + 0.6) + 25 * np.sin(x / 97)
    for _ in range(90):  # the heaps' bodies
        cx = rng.uniform(-100, cw + 100); r = rng.uniform(110, 210)
        blob(cx, line(cx) + r * 0.95, r, 1.0, 1.0)
    for _ in range(380):  # cauliflower puffs on their tops
        cx = rng.uniform(-40, cw + 40); r = rng.uniform(34, 96)
        blob(cx, line(cx) + rng.uniform(-10, 90) + r * 0.25, r, 1.0, 1.0)
    for _ in range(60):  # small puffs at the edge
        cx = rng.uniform(0, cw); r = rng.uniform(22, 44)
        blob(cx, line(cx) + rng.uniform(-24, 16), r, 1.0, 1.0)
    for _ in range(140):  # the lower mass
        blob(rng.uniform(-100, cw + 100), rng.uniform(470, 720), rng.uniform(120, 240), 1.0, 1.0)
    a = np.clip((d - 0.24) / 0.22, 0, 1)
    a = a * a * (3 - 2 * a)
    h = np.clip(d, 0, 1.4)
    gy, gx = np.gradient(h)
    shade = np.clip(-(gx * -0.6 + gy * -0.8) * 14.0, -1, 1)  # flanks facing the top-left light are lit
    low = np.clip((yy - line(xx)) / 380.0, 0, 1)  # the base is greyer than the tops
    t = np.clip(0.55 + 0.45 * shade - 0.35 * low, 0, 1)[..., None]
    lit, dark = np.array([255, 255, 255], np.float32), np.array([196, 206, 222], np.float32)
    rgb = dark + (lit - dark) * t
    fade = np.clip((ch - yy) / 170.0, 0, 1)
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * fade * 255]).astype(np.uint8), 'RGBA')
    img = img.filter(ImageFilter.GaussianBlur(3.5))  # soft edges: cloud, not foam
    img.save(f'{out}/clouds.webp', quality=82, method=6)


if __name__ == '__main__':
    if src != '-':
        earth()
    clouds()
