# M237: the map's labels in Inter (the site's own font, the nearest to Apple's San Francisco) instead of the map
# service's Noto Sans. MapLibre reads a font as "glyph" files: each character as a 24 px signed distance field with a
# 3 px margin, 256 characters a file (the format of mapbox/glyph-pbf-composite's glyphs.proto). This makes them from
# public/fonts/inter (Latin and extended Latin; other scripts stay with the map service's Noto) into
# public/fonts/map/<stack>/<range>.pbf, and prints the ranges for map-style.ts (GLYPH_RANGES).
#
# Run once when the fonts change (needs Python 3 with fonttools brotli freetype-py numpy scipy):
#   python3 scripts/map-glyphs.py
import io, os, sys
import freetype, numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from scipy.ndimage import distance_transform_edt

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'fonts')
SOURCES = [os.path.join(ROOT, 'inter', f) for f in ('inter-latin.woff2', 'inter-latin-ext.woff2')]
STACKS = {'InterRegular': 460, 'InterBold': 640}  # Apple's map labels: a touch heavier than regular; semibold for "bold"
SIZE, BUFFER, RADIUS, CUTOFF, S = 24, 3, 8, 0.25, 4  # as MapLibre's own glyphs; drawn at 4x for a clean field

def varint(n):
    o = bytearray()
    while True:
        c = n & 0x7F; n >>= 7
        if n: o.append(c | 0x80)
        else: o.append(c); return bytes(o)
key = lambda f, t: varint((f << 3) | t)
vi = lambda f, n: key(f, 0) + varint(n)
ln = lambda f, b: key(f, 2) + varint(len(b)) + b
zz = lambda n: (n << 1) ^ (n >> 31)

def glyph(face, cp):
    face.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
    g = face.glyph; bm = g.bitmap; adv = round(g.advance.x / 64 / S)
    if bm.width == 0 or bm.rows == 0:
        return {'id': cp, 'bitmap': b'', 'w': 0, 'h': 0, 'left': 0, 'top': -SIZE, 'adv': adv}
    hi = np.array(bm.buffer, dtype=np.uint8).reshape(bm.rows, bm.pitch)[:, :bm.width]
    lh, th = g.bitmap_left, g.bitmap_top  # in 4x pixels, from the pen and the baseline
    x0, x1 = int(np.floor(lh / S)), int(np.ceil((lh + bm.width) / S))
    yt, yb = int(np.ceil(th / S)), int(np.floor((th - bm.rows) / S))
    w, h = x1 - x0, yt - yb
    canvas = np.zeros(((h + 2 * BUFFER) * S, (w + 2 * BUFFER) * S), dtype=np.uint8)
    ox, oy = lh - (x0 - BUFFER) * S, (yt + BUFFER) * S - th
    canvas[oy:oy + bm.rows, ox:ox + bm.width] = hi
    inside = canvas >= 128
    d = (distance_transform_edt(~inside) - distance_transform_edt(inside)) / S  # px, outside positive
    d = d[S // 2::S, S // 2::S][: h + 2 * BUFFER, : w + 2 * BUFFER]
    v = np.clip(255 - 255 * (d / RADIUS + CUTOFF), 0, 255).astype(np.uint8)
    return {'id': cp, 'bitmap': v.tobytes(), 'w': w, 'h': h, 'left': x0, 'top': yt - SIZE - 2, 'adv': adv}  # -2: as the map service's own files (Noto's A is -8)

def encode(name, rng, gs):
    body = ln(1, name.encode()) + ln(2, rng.encode())
    for g in gs:
        body += ln(3, vi(1, g['id']) + (ln(2, g['bitmap']) if g['bitmap'] else b'') + vi(3, g['w']) + vi(4, g['h']) + vi(5, zz(g['left'])) + vi(6, zz(g['top'])) + vi(7, g['adv']))
    return ln(1, body)

ranges = set()
for stack, weight in STACKS.items():
    faces = []
    for src in SOURCES:
        f = TTFont(src); cmap = set(f.getBestCmap())
        f = instantiateVariableFont(f, {'wght': weight}); f.flavor = None
        buf = io.BytesIO(); f.save(buf)
        face = freetype.Face(io.BytesIO(buf.getvalue())); face.set_pixel_sizes(0, SIZE * S)
        faces.append((cmap, face))
    by = {}
    for cmap, face in faces:
        for cp in sorted(cmap):
            if cp < 32 or cp > 0xFFFF: continue
            r = cp // 256
            if cp not in {g['id'] for g in by.get(r, [])}: by.setdefault(r, []).append(glyph(face, cp))
    out = os.path.join(ROOT, 'map', stack); os.makedirs(out, exist_ok=True)
    for r, gs in sorted(by.items()):
        rng = f'{r * 256}-{r * 256 + 255}'; ranges.add(rng)
        with open(os.path.join(out, f'{rng}.pbf'), 'wb') as fh: fh.write(encode(stack, rng, sorted(gs, key=lambda g: g['id'])))
print(sorted(ranges, key=lambda x: int(x.split('-')[0])))
