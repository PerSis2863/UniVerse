using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// CPU vertex-wind for the shared foliage meshes. Vertex colour R holds the sway weight
    /// (0 at the root, 1 on leaf clusters) and G a per-cluster phase. Because every tree instance
    /// shares one of a few meshes, hundreds of trees cost only a few vertex updates per frame.
    /// The source meshes are cloned at startup so the saved assets are never modified.
    /// </summary>
    public class FoliageWind : MonoBehaviour
    {
        public Mesh[] foliageMeshes;
        public Vector3 windDirection = new Vector3(1f, 0f, 0.35f);
        public float strength = 0.32f;
        public float frequency = 1.1f;
        public float gustStrength = 0.18f;

        class Entry
        {
            public Mesh mesh;
            public Vector3[] baseVerts, verts;
            public Color[] colors;
            public float seed;
        }

        readonly List<Entry> m_Entries = new List<Entry>();
        int m_Cursor;

        void Start()
        {
            if (foliageMeshes == null) return;
            var remap = new Dictionary<Mesh, Mesh>();
            foreach (var src in foliageMeshes)
            {
                if (src == null || remap.ContainsKey(src)) continue;
                var clone = Instantiate(src);
                clone.name = src.name + "_Wind";
                clone.MarkDynamic();
                var b = clone.bounds;
                b.Expand(new Vector3(1.5f, 0.5f, 1.5f));
                clone.bounds = b;
                remap[src] = clone;
                m_Entries.Add(new Entry
                {
                    mesh = clone,
                    baseVerts = clone.vertices,
                    verts = clone.vertices,
                    colors = clone.colors,
                    seed = m_Entries.Count * 1.7f
                });
            }
            foreach (var mf in FindObjectsByType<MeshFilter>())
                if (mf.sharedMesh != null && remap.TryGetValue(mf.sharedMesh, out var m)) mf.sharedMesh = m;
        }

        void Update()
        {
            if (m_Entries.Count == 0) return;
            // update at most two meshes per frame; at 60+ FPS each mesh still refreshes ~30x/s
            for (int k = 0; k < Mathf.Min(2, m_Entries.Count); k++)
            {
                var e = m_Entries[m_Cursor];
                m_Cursor = (m_Cursor + 1) % m_Entries.Count;
                Deform(e, Time.time);
            }
        }

        void Deform(Entry e, float t)
        {
            Vector3 dir = windDirection.normalized;
            Vector3 side = Vector3.Cross(Vector3.up, dir);
            float gust = Mathf.PerlinNoise(t * 0.25f + e.seed, 0.3f) * gustStrength;
            var bv = e.baseVerts; var v = e.verts; var c = e.colors;
            bool hasColors = c != null && c.Length == bv.Length;
            for (int i = 0; i < bv.Length; i++)
            {
                float w = hasColors ? c[i].r : Mathf.Clamp01(bv[i].y / 10f);
                if (w <= 0.001f) { v[i] = bv[i]; continue; }
                float phase = hasColors ? c[i].g * 6.2831f : 0f;
                float h = bv[i].y;
                float sway = Mathf.Sin(t * frequency + e.seed + h * 0.12f) * (strength + gust) * w * w;
                float swirl = Mathf.Sin(t * frequency * 1.7f + phase) * 0.06f * w;
                float flutter = w > 0.85f ? Mathf.Sin(t * 7.3f + phase * 3f + i * 0.37f) * 0.025f : 0f;
                v[i] = bv[i] + dir * (sway + gust * w * 0.8f) + side * swirl + Vector3.up * flutter;
            }
            e.mesh.vertices = v;
        }
    }
}
