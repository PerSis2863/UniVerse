using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Procedural textures for materials, particles, decals and UI. Cached per key.</summary>
    public static class TextureFactory
    {
        static readonly Dictionary<string, Texture2D> s_Cache = new Dictionary<string, Texture2D>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Cache.Clear();

        static Texture2D Make(string key, int w, int h, System.Func<float, float, Color> f, bool mips = true,
            TextureWrapMode wrap = TextureWrapMode.Repeat, bool linear = false)
        {
            if (s_Cache.TryGetValue(key, out var t) && t != null) return t;
            t = new Texture2D(w, h, TextureFormat.RGBA32, mips, linear) { name = key, wrapMode = wrap, filterMode = FilterMode.Bilinear, anisoLevel = 4 };
            var px = new Color[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                    px[y * w + x] = f((x + 0.5f) / w, (y + 0.5f) / h);
            t.SetPixels(px);
            t.Apply(mips, false);
            s_Cache[key] = t;
            return t;
        }

        // ---------- noise ----------
        static float Hash(int x, int y, int seed)
        {
            unchecked
            {
                uint h = (uint)(x * 374761393 + y * 668265263 + seed * 2246822519);
                h = (h ^ (h >> 13)) * 1274126177u;
                return ((h ^ (h >> 16)) & 0xFFFFFF) / 16777215f;
            }
        }

        /// <summary>Tileable value noise with period <paramref name="period"/> cells.</summary>
        public static float TileNoise(float u, float v, int period, int seed)
        {
            float x = u * period, y = v * period;
            int x0 = Mathf.FloorToInt(x), y0 = Mathf.FloorToInt(y);
            float fx = x - x0, fy = y - y0;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            int Wrap(int a) => ((a % period) + period) % period;
            float a00 = Hash(Wrap(x0), Wrap(y0), seed), a10 = Hash(Wrap(x0 + 1), Wrap(y0), seed);
            float a01 = Hash(Wrap(x0), Wrap(y0 + 1), seed), a11 = Hash(Wrap(x0 + 1), Wrap(y0 + 1), seed);
            return Mathf.Lerp(Mathf.Lerp(a00, a10, fx), Mathf.Lerp(a01, a11, fx), fy);
        }

        public static float TileFbm(float u, float v, int basePeriod, int octaves, int seed)
        {
            float sum = 0, amp = 0.5f, norm = 0;
            int p = basePeriod;
            for (int i = 0; i < octaves; i++)
            {
                sum += TileNoise(u, v, p, seed + i * 31) * amp;
                norm += amp; amp *= 0.5f; p *= 2;
            }
            return sum / norm;
        }

        // ---------- particle / UI shapes ----------
        public static Texture2D SoftCircle() => Make("SoftCircle", 64, 64, (u, v) =>
        {
            float d = Vector2.Distance(new Vector2(u, v), new Vector2(0.5f, 0.5f)) * 2f;
            float a = Mathf.Clamp01(1f - d); a = a * a * (3 - 2 * a);
            return new Color(1, 1, 1, a);
        }, true, TextureWrapMode.Clamp);

        public static Texture2D HardCircle() => Make("HardCircle", 64, 64, (u, v) =>
        {
            float d = Vector2.Distance(new Vector2(u, v), new Vector2(0.5f, 0.5f)) * 2f;
            return new Color(1, 1, 1, Mathf.Clamp01((1f - d) * 24f));
        }, true, TextureWrapMode.Clamp);

        public static Texture2D Ring(float thickness = 0.06f) => Make("Ring" + thickness, 256, 256, (u, v) =>
        {
            float d = Vector2.Distance(new Vector2(u, v), new Vector2(0.5f, 0.5f)) * 2f;
            float a = Mathf.Clamp01(1f - Mathf.Abs(d - (1f - thickness)) / thickness);
            return new Color(1, 1, 1, Mathf.Clamp01(a * 2f));
        }, true, TextureWrapMode.Clamp);

        public static Texture2D RadialEdge() => Make("RadialEdge", 128, 128, (u, v) =>
        {
            float dx = (u - 0.5f) * 2f, dy = (v - 0.5f) * 2f;
            float d = Mathf.Sqrt(dx * dx * 0.8f + dy * dy * 1.1f);
            float a = Mathf.Clamp01((d - 0.55f) / 0.75f);
            return new Color(1, 1, 1, a * a);
        }, false, TextureWrapMode.Clamp);

        /// <summary>Arc segment for directional damage indicators (points up).</summary>
        public static Texture2D DamageArc() => Make("DamageArc", 128, 64, (u, v) =>
        {
            float x = (u - 0.5f) * 2f, y = v * 1.6f - 1.4f;
            float r = Mathf.Sqrt(x * x + (y + 1.2f) * (y + 1.2f));
            float band = Mathf.Clamp01(1f - Mathf.Abs(r - 1.6f) / 0.16f);
            float side = Mathf.Clamp01(1f - Mathf.Abs(x) * 1.05f);
            return new Color(1, 1, 1, band * side * side);
        }, false, TextureWrapMode.Clamp);

        public static Texture2D Cone(float halfAngleDeg) => Make("Cone" + halfAngleDeg, 128, 128, (u, v) =>
        {
            float x = u - 0.5f, y = v - 0.5f;
            if (y <= 0) return Color.clear;
            float ang = Mathf.Abs(Mathf.Atan2(x, y)) * Mathf.Rad2Deg;
            float r = Mathf.Sqrt(x * x + y * y) * 2f;
            float a = ang < halfAngleDeg ? Mathf.Clamp01(1f - r) * 0.55f : 0f;
            return new Color(1, 1, 1, a);
        }, false, TextureWrapMode.Clamp);

        public static Texture2D Diamond() => Make("Diamond", 64, 64, (u, v) =>
        {
            float d = Mathf.Abs(u - 0.5f) + Mathf.Abs(v - 0.5f);
            return new Color(1, 1, 1, Mathf.Clamp01((0.48f - d) * 30f));
        }, true, TextureWrapMode.Clamp);

        public static Texture2D Triangle() => Make("Triangle", 64, 64, (u, v) =>
        {
            float halfW = (1f - v) * 0.45f;
            float inside = Mathf.Min((halfW - Mathf.Abs(u - 0.5f)) * 40f, (v - 0.08f) * 40f, (0.92f - v) * 40f);
            return new Color(1, 1, 1, Mathf.Clamp01(inside));
        }, true, TextureWrapMode.Clamp);

        public static Texture2D BulletHole() => Make("BulletHole", 64, 64, (u, v) =>
        {
            float dx = u - 0.5f, dy = v - 0.5f;
            float d = Mathf.Sqrt(dx * dx + dy * dy) * 2f;
            float ang = Mathf.Atan2(dy, dx);
            float cracks = Mathf.Pow(Mathf.Abs(Mathf.Sin(ang * 5f + Hash((int)(ang * 3), 1, 9) * 2f)), 12f) * Mathf.Clamp01(1f - d) * 0.6f;
            float core = Mathf.Clamp01((0.22f - d) * 18f);
            float ring = Mathf.Clamp01(1f - Mathf.Abs(d - 0.32f) / 0.2f) * 0.55f;
            float a = Mathf.Max(core, Mathf.Max(ring, cracks));
            float c = Mathf.Lerp(0.18f, 0.03f, core);
            return new Color(c, c * 0.95f, c * 0.9f, a);
        }, true, TextureWrapMode.Clamp);

        public static Texture2D Scorch() => Make("Scorch", 128, 128, (u, v) =>
        {
            float d = Vector2.Distance(new Vector2(u, v), new Vector2(0.5f, 0.5f)) * 2f;
            float n = TileFbm(u, v, 6, 4, 77);
            float a = Mathf.Clamp01((1f - d) * 1.6f - n * 0.6f);
            return new Color(0.04f, 0.035f, 0.03f, a * 0.9f);
        }, true, TextureWrapMode.Clamp);

        // ---------- surfaces ----------
        public static Texture2D Noise() => Make("BlightNoise", 256, 256, (u, v) =>
        {
            float n = TileFbm(u, v, 4, 5, 3);
            float streak = TileFbm(u * 1f, v, 2, 3, 11);
            float a = Mathf.Clamp01(n * 1.3f - 0.15f) * 0.85f + streak * 0.15f;
            return new Color(1, 1, 1, a);
        });

        public static Texture2D Grime(string key, Color a, Color b, int period, int seed, float contrast = 1f) => Make("Grime_" + key, 256, 256, (u, v) =>
        {
            float n = TileFbm(u, v, period, 5, seed);
            n = Mathf.Clamp01((n - 0.5f) * contrast + 0.5f);
            return Color.Lerp(a, b, n);
        });

        public static Texture2D Concrete() => Make("Concrete", 256, 256, (u, v) =>
        {
            float n = TileFbm(u, v, 8, 5, 21);
            float pits = TileNoise(u, v, 64, 5) > 0.93f ? 0.75f : 1f;
            float seam = (Mathf.Abs(u - 0.5f) < 0.004f || Mathf.Abs(v - 0.5f) < 0.004f) ? 0.7f : 1f;
            float c = (0.55f + n * 0.3f) * pits * seam;
            return new Color(c, c * 0.98f, c * 0.95f, 1);
        });

        public static Texture2D Corrugated() => Make("Corrugated", 256, 256, (u, v) =>
        {
            float rib = 0.82f + 0.18f * Mathf.Sin(u * Mathf.PI * 2f * 24f);
            float rust = Mathf.Clamp01(TileFbm(u, v, 6, 5, 41) * 1.8f - 1.0f);
            float g = TileFbm(u, v, 16, 3, 43) * 0.15f;
            var baseC = new Color(rib - g, rib - g, rib - g, 1);
            return Color.Lerp(baseC, new Color(0.55f, 0.32f, 0.18f, 1), rust * 0.7f);
        });

        public static Texture2D Bark() => Make("Bark", 128, 256, (u, v) =>
        {
            float n = TileFbm(u * 1f, v * 0.25f, 8, 4, 51);
            float groove = Mathf.Abs(Mathf.Sin((u + n * 0.3f) * Mathf.PI * 10f));
            float c = 0.25f + 0.25f * groove * (0.6f + n * 0.4f);
            return new Color(c * 1.15f, c * 0.92f, c * 0.7f, 1);
        });

        public static Texture2D Camo() => Make("Camo", 256, 256, (u, v) =>
        {
            float n1 = TileFbm(u, v, 4, 4, 61), n2 = TileFbm(u, v, 6, 4, 62);
            Color c = new Color(0.33f, 0.36f, 0.27f);
            if (n1 > 0.55f) c = new Color(0.22f, 0.24f, 0.18f);
            if (n2 > 0.6f) c = new Color(0.46f, 0.42f, 0.32f);
            return c;
        });

        public static Texture2D KnurlPolymer() => Make("Polymer", 128, 128, (u, v) =>
        {
            float k = (Mathf.Sin(u * 160f) * Mathf.Sin(v * 160f)) * 0.04f;
            float n = TileNoise(u, v, 32, 71) * 0.06f;
            float c = 0.9f + k + n;
            return new Color(c, c, c, 1);
        });

        public static Texture2D WaterNoise() => Make("Water", 256, 256, (u, v) =>
        {
            float n = TileFbm(u, v, 8, 4, 81);
            return new Color(0.8f + n * 0.2f, 0.9f + n * 0.1f, 1f, 1);
        });

        public static Texture2D Terrain(string kind) => Make("Terrain_" + kind, 256, 256, (u, v) =>
        {
            float n = TileFbm(u, v, 8, 5, kind.GetHashCode() & 1023);
            float fine = TileNoise(u, v, 64, 7);
            switch (kind)
            {
                case "Sand": return Color.Lerp(new Color(0.76f, 0.69f, 0.52f), new Color(0.86f, 0.8f, 0.62f), n * 0.7f + fine * 0.3f);
                case "Grass":
                {
                    float blade = Mathf.Pow(TileNoise(u, v, 96, 13), 3f);
                    return Color.Lerp(new Color(0.22f, 0.32f, 0.12f), new Color(0.38f, 0.46f, 0.2f), n * 0.6f + blade * 0.4f);
                }
                case "Dirt": return Color.Lerp(new Color(0.33f, 0.26f, 0.18f), new Color(0.46f, 0.38f, 0.27f), n * 0.7f + fine * 0.3f);
                default:
                {
                    float strata = Mathf.Abs(Mathf.Sin((v + n * 0.4f) * Mathf.PI * 6f));
                    return Color.Lerp(new Color(0.36f, 0.35f, 0.33f), new Color(0.56f, 0.54f, 0.5f), n * 0.6f + strata * 0.4f);
                }
            }
        });
    }
}
