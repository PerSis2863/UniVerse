using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Stormfall
{
    /// <summary>Small helpers that build uGUI elements in code with the STORMFALL style.</summary>
    public static class HUDBuilder
    {
        public static readonly Color Amber = new Color(1f, 0.69f, 0.13f);
        public static readonly Color Cyan = new Color(0.25f, 0.9f, 1f);
        public static readonly Color OffWhite = new Color(0.94f, 0.95f, 0.93f);
        public static readonly Color Panel = new Color(0.03f, 0.04f, 0.05f, 0.55f);
        public static readonly Color Danger = new Color(1f, 0.22f, 0.18f);
        public static readonly Color Muted = new Color(0.7f, 0.73f, 0.75f, 0.8f);

        static Font s_Font;
        static readonly Dictionary<Texture2D, Sprite> s_Sprites = new Dictionary<Texture2D, Sprite>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { s_Font = null; s_Sprites.Clear(); }

        public static Font Font
        {
            get
            {
                if (s_Font == null) s_Font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                return s_Font;
            }
        }

        public static Sprite SpriteOf(Texture2D t)
        {
            if (t == null) return null;
            if (!s_Sprites.TryGetValue(t, out var s) || s == null)
            {
                s = Sprite.Create(t, new Rect(0, 0, t.width, t.height), new Vector2(0.5f, 0.5f), 100f);
                s_Sprites[t] = s;
            }
            return s;
        }

        public static RectTransform Rect(string name, Transform parent, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = pivot;
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            return rt;
        }

        public static RectTransform Stretch(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            return rt;
        }

        public static Image Img(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, Color color, Sprite sprite = null, Vector2? pivot = null)
        {
            var rt = Rect(name, parent, anchor, pivot ?? new Vector2(0.5f, 0.5f), pos, size);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        public static Image FullImg(string name, Transform parent, Color color, Sprite sprite = null)
        {
            var rt = Stretch(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        public static Text Txt(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, string text, int fontSize, Color color,
            TextAnchor align = TextAnchor.MiddleCenter, bool bold = false, Vector2? pivot = null, bool shadow = true)
        {
            var rt = Rect(name, parent, anchor, pivot ?? new Vector2(0.5f, 0.5f), pos, size);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Font;
            t.text = text;
            t.fontSize = fontSize;
            t.color = color;
            t.alignment = align;
            t.fontStyle = bold ? FontStyle.Bold : FontStyle.Normal;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            if (shadow)
            {
                var s = rt.gameObject.AddComponent<Shadow>();
                s.effectColor = new Color(0, 0, 0, 0.75f);
                s.effectDistance = new Vector2(1.5f, -1.5f);
            }
            return t;
        }

        /// <summary>Background + filled foreground bar. Returns the fill image.</summary>
        public static Image Bar(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, Color bg, Color fill, Vector2? pivot = null)
        {
            var back = Img(name, parent, anchor, pos, size, bg, null, pivot);
            var f = Img("Fill", back.transform, new Vector2(0, 0.5f), Vector2.zero, size, fill, WhiteSprite, new Vector2(0, 0.5f));
            f.type = Image.Type.Filled;
            f.fillMethod = Image.FillMethod.Horizontal;
            f.fillOrigin = 0;
            f.fillAmount = 1f;
            return f;
        }

        static Sprite s_White;
        public static Sprite WhiteSprite
        {
            get
            {
                if (s_White == null)
                {
                    var t = new Texture2D(4, 4, TextureFormat.RGBA32, false);
                    var px = new Color[16];
                    for (int i = 0; i < 16; i++) px[i] = Color.white;
                    t.SetPixels(px); t.Apply();
                    s_White = Sprite.Create(t, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
                }
                return s_White;
            }
        }

        public static Button Button(string name, Transform parent, Vector2 anchor, Vector2 pos, Vector2 size, string label, int fontSize, System.Action onClick)
        {
            var img = Img(name, parent, anchor, pos, size, new Color(0.08f, 0.1f, 0.12f, 0.85f));
            img.raycastTarget = true;
            var b = img.gameObject.AddComponent<Button>();
            var colors = b.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = new Color(1f, 0.85f, 0.55f);
            colors.pressedColor = Amber;
            b.colors = colors;
            b.onClick.AddListener(() => onClick());
            var t = Txt("Label", img.transform, new Vector2(0.5f, 0.5f), Vector2.zero, size - new Vector2(20, 8), label, fontSize, OffWhite, TextAnchor.MiddleLeft);
            t.supportRichText = true;
            return b;
        }

        /// <summary>Generic texture for a weapon silhouette (rasterised rectangles).</summary>
        public static Texture2D WeaponSilhouette(WeaponStyle style)
        {
            const int W = 256, H = 80;
            var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "Silhouette_" + style };
            var px = new Color[W * H];
            void Box(float x0, float y0, float x1, float y1, float slant = 0f)
            {
                for (int y = Mathf.Max(0, (int)y0); y < Mathf.Min(H, (int)y1); y++)
                {
                    float off = (y - y0) * slant;
                    for (int x = Mathf.Max(0, (int)(x0 + off)); x < Mathf.Min(W, (int)(x1 + off)); x++) px[y * W + x] = Color.white;
                }
            }
            switch (style)
            {
                case WeaponStyle.SMG:
                    Box(60, 38, 170, 58); Box(170, 46, 205, 52); Box(205, 44, 222, 54);
                    Box(95, 12, 112, 38, 0.15f); Box(132, 18, 146, 38); Box(20, 40, 60, 54); Box(14, 30, 24, 58);
                    Box(80, 58, 140, 64); Box(90, 64, 120, 70);
                    break;
                case WeaponStyle.Sniper:
                    Box(40, 36, 150, 52); Box(150, 42, 236, 48); Box(236, 38, 252, 52);
                    Box(80, 56, 160, 66); Box(70, 60, 82, 68); Box(150, 58, 170, 64);
                    Box(100, 18, 112, 36, 0.12f); Box(120, 22, 140, 36); Box(6, 26, 44, 50); Box(2, 22, 10, 52);
                    break;
                default:
                    Box(50, 38, 160, 56); Box(160, 44, 230, 52); Box(230, 42, 246, 54);
                    Box(150, 36, 210, 58); Box(90, 10, 106, 38, 0.18f); Box(118, 14, 134, 38, -0.12f);
                    Box(12, 38, 52, 56); Box(6, 28, 16, 58); Box(70, 56, 150, 62); Box(95, 62, 118, 70);
                    break;
            }
            t.SetPixels(px);
            t.Apply();
            return t;
        }

        /// <summary>Black scope mask with a clear circular eyepiece and fine crosshair.</summary>
        public static Texture2D ScopeMask()
        {
            const int S = 512;
            var t = new Texture2D(S, S, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "ScopeMask" };
            var px = new Color[S * S];
            for (int y = 0; y < S; y++)
                for (int x = 0; x < S; x++)
                {
                    float u = (x + 0.5f) / S - 0.5f, v = (y + 0.5f) / S - 0.5f;
                    float r = Mathf.Sqrt(u * u + v * v) * 2f;
                    float a = Mathf.Clamp01((r - 0.94f) * 40f);
                    float vign = Mathf.Clamp01((r - 0.75f) * 2.5f) * 0.6f;
                    bool cross = (Mathf.Abs(u) < 0.0012f && Mathf.Abs(v) > 0.015f) || (Mathf.Abs(v) < 0.0012f && Mathf.Abs(u) > 0.015f);
                    bool thick = (Mathf.Abs(u) < 0.004f && Mathf.Abs(v) > 0.25f) || (Mathf.Abs(v) < 0.004f && Mathf.Abs(u) > 0.25f);
                    bool mil = (Mathf.Abs(u) < 0.008f && Mathf.Abs(Mathf.Repeat(v + 0.025f, 0.05f) - 0.025f) < 0.0015f && Mathf.Abs(v) < 0.2f)
                               || (Mathf.Abs(v) < 0.008f && Mathf.Abs(Mathf.Repeat(u + 0.025f, 0.05f) - 0.025f) < 0.0015f && Mathf.Abs(u) < 0.2f);
                    float line = (cross || thick || mil) && r < 0.94f ? 0.95f : 0f;
                    float dot = r < 0.006f ? 1f : 0f;
                    Color c = new Color(0, 0, 0, Mathf.Max(a, vign, line));
                    if (dot > 0) c = new Color(1f, 0.15f, 0.1f, 1f);
                    px[y * S + x] = c;
                }
            t.SetPixels(px);
            t.Apply();
            return t;
        }

        /// <summary>Top-down island map: raycast colour + hillshade.</summary>
        public static Texture2D BuildMapTexture(int res, float halfSize)
        {
            var t = new Texture2D(res, res, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "IslandMap" };
            var px = new Color[res * res];
            var heights = new float[res * res];
            var kinds = new byte[res * res];
            for (int y = 0; y < res; y++)
                for (int x = 0; x < res; x++)
                {
                    float wx = (x + 0.5f) / res * 2f * halfSize - halfSize, wz = (y + 0.5f) / res * 2f * halfSize - halfSize;
                    float h = 0f; byte k = 0;
                    if (Physics.Raycast(new Vector3(wx, 700f, wz), Vector3.down, out var hit, 800f, ~0, QueryTriggerInteraction.Ignore))
                    {
                        h = hit.point.y;
                        k = hit.collider is TerrainCollider ? (byte)1 : (byte)2;
                    }
                    heights[y * res + x] = h;
                    kinds[y * res + x] = k;
                }
            Vector3 light = new Vector3(-0.6f, 0.7f, 0.4f).normalized;
            float cell = 2f * halfSize / res;
            for (int y = 0; y < res; y++)
                for (int x = 0; x < res; x++)
                {
                    int i = y * res + x;
                    float h = heights[i];
                    float hx = heights[y * res + Mathf.Min(res - 1, x + 1)] - heights[y * res + Mathf.Max(0, x - 1)];
                    float hz = heights[Mathf.Min(res - 1, y + 1) * res + x] - heights[Mathf.Max(0, y - 1) * res + x];
                    Vector3 n = new Vector3(-hx / (2f * cell), 1f, -hz / (2f * cell)).normalized;
                    float shade = 0.65f + 0.45f * Mathf.Clamp01(Vector3.Dot(n, light));
                    Color c;
                    if (h < WorldInfo.WaterLevel) c = Color.Lerp(new Color(0.05f, 0.16f, 0.24f), new Color(0.12f, 0.32f, 0.4f), Mathf.Clamp01((h + 10f) / 18f));
                    else if (kinds[i] == 2) c = new Color(0.52f, 0.52f, 0.5f) * shade;
                    else if (h < WorldInfo.WaterLevel + 2.5f) c = new Color(0.72f, 0.66f, 0.5f) * shade;
                    else c = Color.Lerp(new Color(0.26f, 0.36f, 0.2f), new Color(0.5f, 0.48f, 0.4f), Mathf.Clamp01((h - 20f) / 70f)) * shade;
                    c.a = 1f;
                    px[i] = c;
                }
            t.SetPixels(px);
            t.Apply();
            return t;
        }
    }
}
