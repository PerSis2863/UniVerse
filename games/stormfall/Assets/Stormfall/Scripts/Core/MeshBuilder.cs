using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Stormfall
{
    /// <summary>
    /// Low-level mesh accumulator. Every primitive emits smooth normals where the surface is smooth
    /// and automatically orients triangles to agree with those normals, so callers never have to
    /// think about winding order.
    /// </summary>
    public class MeshBuilder
    {
        readonly List<Vector3> m_V = new List<Vector3>(4096);
        readonly List<Vector3> m_N = new List<Vector3>(4096);
        readonly List<Vector2> m_UV = new List<Vector2>(4096);
        readonly List<Color> m_C = new List<Color>(4096);
        readonly List<List<int>> m_Sub = new List<List<int>>();
        readonly Stack<Matrix4x4> m_Stack = new Stack<Matrix4x4>();

        public Matrix4x4 Matrix = Matrix4x4.identity;
        /// <summary>Vertex colour: r = wind weight, g = wind phase, b/a free.</summary>
        public Color VertexColor = new Color(0, 0, 0, 1);
        public float UVScale = 1f;
        int m_Submesh;

        public int VertexCount => m_V.Count;

        public MeshBuilder(int submeshes = 1)
        {
            for (int i = 0; i < submeshes; i++) m_Sub.Add(new List<int>(4096));
        }

        public int Submesh
        {
            get => m_Submesh;
            set { m_Submesh = value; while (m_Sub.Count <= value) m_Sub.Add(new List<int>()); }
        }

        public void Push(Matrix4x4 local) { m_Stack.Push(Matrix); Matrix = Matrix * local; }
        public void Push(Vector3 pos, Quaternion rot, Vector3 scale) => Push(Matrix4x4.TRS(pos, rot, scale));
        public void Push(Vector3 pos, Quaternion rot) => Push(Matrix4x4.TRS(pos, rot, Vector3.one));
        public void Pop() { Matrix = m_Stack.Pop(); }

        public int Vertex(Vector3 p, Vector3 n, Vector2 uv)
        {
            m_V.Add(Matrix.MultiplyPoint3x4(p));
            m_N.Add(Matrix.MultiplyVector(n).normalized);
            m_UV.Add(uv * UVScale);
            m_C.Add(VertexColor);
            return m_V.Count - 1;
        }

        public void SetVertexColor(int index, Color c) => m_C[index] = c;
        public Vector3 GetVertex(int index) => m_V[index];

        void Emit(int a, int b, int c)
        {
            var s = m_Sub[m_Submesh];
            s.Add(a); s.Add(b); s.Add(c);
        }

        /// <summary>Triangle oriented so its face normal agrees with the vertex normals.</summary>
        public void Tri(int a, int b, int c)
        {
            Vector3 fn = Vector3.Cross(m_V[b] - m_V[a], m_V[c] - m_V[a]);
            Vector3 want = m_N[a] + m_N[b] + m_N[c];
            if (Vector3.Dot(fn, want) >= 0f) Emit(a, b, c); else Emit(a, c, b);
        }

        /// <summary>Quad from a ring of four vertices (a,b,c,d), auto-oriented.</summary>
        public void Quad(int a, int b, int c, int d)
        {
            Vector3 fn = Vector3.Cross(m_V[b] - m_V[a], m_V[d] - m_V[a]) + Vector3.Cross(m_V[d] - m_V[c], m_V[b] - m_V[c]);
            Vector3 want = m_N[a] + m_N[b] + m_N[c] + m_N[d];
            if (Vector3.Dot(fn, want) >= 0f) { Emit(a, b, d); Emit(b, c, d); }
            else { Emit(a, d, b); Emit(b, d, c); }
        }

        // ------------------------------------------------------------------ primitives

        static void Basis(Vector3 axis, out Vector3 u, out Vector3 w)
        {
            axis.Normalize();
            Vector3 helper = Mathf.Abs(Vector3.Dot(axis, Vector3.up)) > 0.95f ? Vector3.right : Vector3.up;
            u = Vector3.Cross(axis, helper).normalized;
            w = Vector3.Cross(axis, u).normalized;
        }

        /// <summary>Rounded box by sphere-projection of a non-uniform face grid. Smooth corner normals.</summary>
        public void RoundedBox(Vector3 center, Vector3 size, float radius, int seg = 3) =>
            RoundedBox(center, Quaternion.identity, size, radius, seg);

        public void RoundedBox(Vector3 center, Quaternion rot, Vector3 size, float radius, int seg = 3)
        {
            Vector3 h = size * 0.5f;
            float r = Mathf.Min(radius, Mathf.Min(h.x, Mathf.Min(h.y, h.z)) * 0.999f);
            if (r < 0.0005f) { Box(center, rot, size); return; }
            seg = Mathf.Max(1, seg);
            Push(center, rot);
            Vector3 inner = h - Vector3.one * r;
            for (int axis = 0; axis < 3; axis++)
            {
                for (int sign = -1; sign <= 1; sign += 2)
                {
                    int ua = (axis + 1) % 3, wa = (axis + 2) % 3;
                    float[] lu = AxisPoints(h[ua], r, seg), lw = AxisPoints(h[wa], r, seg);
                    int nu = lu.Length, nw = lw.Length;
                    int start = m_V.Count;
                    for (int j = 0; j < nw; j++)
                        for (int i = 0; i < nu; i++)
                        {
                            Vector3 p = Vector3.zero;
                            p[axis] = sign * h[axis]; p[ua] = lu[i]; p[wa] = lw[j];
                            Vector3 c = new Vector3(Mathf.Clamp(p.x, -inner.x, inner.x), Mathf.Clamp(p.y, -inner.y, inner.y), Mathf.Clamp(p.z, -inner.z, inner.z));
                            Vector3 n = (p - c).normalized;
                            Vector3 v = c + n * r;
                            Vertex(v, n, new Vector2(v[ua], v[wa]));
                        }
                    for (int j = 0; j < nw - 1; j++)
                        for (int i = 0; i < nu - 1; i++)
                        {
                            int a = start + j * nu + i;
                            Quad(a, a + 1, a + nu + 1, a + nu);
                        }
                }
            }
            Pop();
        }

        static float[] AxisPoints(float H, float r, int seg)
        {
            var pts = new float[(seg + 1) * 2];
            for (int i = 0; i <= seg; i++)
            {
                float th = i / (float)seg * Mathf.PI * 0.5f;
                pts[i] = -(H - r) - r * Mathf.Cos(th);
                pts[seg + 1 + i] = (H - r) + r * Mathf.Sin(th);
            }
            return pts;
        }

        /// <summary>Hard-edged box (flat normals).</summary>
        public void Box(Vector3 center, Quaternion rot, Vector3 size)
        {
            Push(center, rot);
            Vector3 h = size * 0.5f;
            for (int axis = 0; axis < 3; axis++)
                for (int sign = -1; sign <= 1; sign += 2)
                {
                    int ua = (axis + 1) % 3, wa = (axis + 2) % 3;
                    Vector3 n = Vector3.zero; n[axis] = sign;
                    int s = m_V.Count;
                    for (int k = 0; k < 4; k++)
                    {
                        Vector3 p = Vector3.zero;
                        p[axis] = sign * h[axis];
                        p[ua] = (k == 1 || k == 2) ? h[ua] : -h[ua];
                        p[wa] = (k >= 2) ? h[wa] : -h[wa];
                        Vertex(p, n, new Vector2(p[ua], p[wa]));
                    }
                    Quad(s, s + 1, s + 2, s + 3);
                }
            Pop();
        }

        /// <summary>Tapered cylinder from a to b with smooth sides and optional flat caps.</summary>
        public void Cylinder(Vector3 a, Vector3 b, float ra, float rb, int seg = 16, bool capA = true, bool capB = true, int rings = 1)
        {
            Vector3 d = b - a;
            float len = d.magnitude;
            if (len < 1e-5f) return;
            Vector3 axis = d / len;
            Basis(axis, out var u, out var w);
            int start = m_V.Count;
            for (int ring = 0; ring <= rings; ring++)
            {
                float t = ring / (float)rings;
                Vector3 c = a + d * t;
                float r = Mathf.Lerp(ra, rb, t);
                for (int i = 0; i <= seg; i++)
                {
                    float ang = i / (float)seg * Mathf.PI * 2f;
                    Vector3 radial = u * Mathf.Cos(ang) + w * Mathf.Sin(ang);
                    Vector3 n = (radial * len + axis * (ra - rb)).normalized;
                    Vertex(c + radial * r, n, new Vector2(i / (float)seg * Mathf.PI * 2f * Mathf.Max(ra, rb), t * len));
                }
            }
            for (int ring = 0; ring < rings; ring++)
                for (int i = 0; i < seg; i++)
                {
                    int r0 = start + ring * (seg + 1) + i, r1 = r0 + seg + 1;
                    Quad(r0, r0 + 1, r1 + 1, r1);
                }
            if (capA && ra > 1e-4f) Disc(a, -axis, ra, seg);
            if (capB && rb > 1e-4f) Disc(b, axis, rb, seg);
        }

        public void Disc(Vector3 center, Vector3 normal, float radius, int seg = 16)
        {
            Basis(normal, out var u, out var w);
            int c = Vertex(center, normal, new Vector2(0.5f, 0.5f));
            int first = m_V.Count;
            for (int i = 0; i <= seg; i++)
            {
                float ang = i / (float)seg * Mathf.PI * 2f;
                Vector3 radial = u * Mathf.Cos(ang) + w * Mathf.Sin(ang);
                Vertex(center + radial * radius, normal, new Vector2(0.5f + Mathf.Cos(ang) * 0.5f, 0.5f + Mathf.Sin(ang) * 0.5f));
            }
            for (int i = 0; i < seg; i++) Tri(c, first + i, first + i + 1);
        }

        /// <summary>Hollow tube with annular end rings (muzzle bores, scope tubes).</summary>
        public void Tube(Vector3 a, Vector3 b, float rOuter, float rInner, int seg = 18)
        {
            Cylinder(a, b, rOuter, rOuter, seg, false, false);
            Vector3 axis = (b - a).normalized;
            // inner wall: build outward then flip by giving inward normals
            Basis(axis, out var u, out var w);
            int s = m_V.Count;
            for (int ring = 0; ring < 2; ring++)
            {
                Vector3 c = ring == 0 ? a : b;
                for (int i = 0; i <= seg; i++)
                {
                    float ang = i / (float)seg * Mathf.PI * 2f;
                    Vector3 radial = u * Mathf.Cos(ang) + w * Mathf.Sin(ang);
                    Vertex(c + radial * rInner, -radial, new Vector2(i / (float)seg, ring));
                }
            }
            for (int i = 0; i < seg; i++) Quad(s + i, s + i + 1, s + seg + 2 + i, s + seg + 1 + i);
            Annulus(a, -axis, rInner, rOuter, seg);
            Annulus(b, axis, rInner, rOuter, seg);
        }

        public void Annulus(Vector3 center, Vector3 normal, float rIn, float rOut, int seg)
        {
            Basis(normal, out var u, out var w);
            int s = m_V.Count;
            for (int i = 0; i <= seg; i++)
            {
                float ang = i / (float)seg * Mathf.PI * 2f;
                Vector3 radial = u * Mathf.Cos(ang) + w * Mathf.Sin(ang);
                Vertex(center + radial * rIn, normal, new Vector2(i / (float)seg, 0));
                Vertex(center + radial * rOut, normal, new Vector2(i / (float)seg, 1));
            }
            for (int i = 0; i < seg; i++) Quad(s + i * 2, s + i * 2 + 2, s + i * 2 + 3, s + i * 2 + 1);
        }

        /// <summary>UV sphere / ellipsoid with optional radial noise displacement (rocks, foliage clusters).</summary>
        public void Sphere(Vector3 center, Vector3 radii, int lat = 10, int lon = 16, float noise = 0f, int seed = 0)
        {
            int s = m_V.Count;
            for (int y = 0; y <= lat; y++)
            {
                float v = y / (float)lat;
                float phi = v * Mathf.PI;
                for (int x = 0; x <= lon; x++)
                {
                    float u = x / (float)lon;
                    float th = u * Mathf.PI * 2f;
                    Vector3 dir = new Vector3(Mathf.Sin(phi) * Mathf.Cos(th), Mathf.Cos(phi), Mathf.Sin(phi) * Mathf.Sin(th));
                    // Noise is a function of direction only, so the UV seam and poles stay watertight.
                    float disp = noise > 0f ? 1f + (Noise3(dir * 2.3f, seed) - 0.5f) * 2f * noise : 1f;
                    Vector3 p = Vector3.Scale(dir, radii) * disp;
                    Vector3 n = new Vector3(dir.x / radii.x, dir.y / radii.y, dir.z / radii.z).normalized;
                    Vertex(center + p, n, new Vector2(u * 2f, v));
                }
            }
            for (int y = 0; y < lat; y++)
                for (int x = 0; x < lon; x++)
                {
                    int a = s + y * (lon + 1) + x;
                    Quad(a, a + 1, a + lon + 2, a + lon + 1);
                }
            if (noise > 0f) RecalculateNormalsRange(s, m_V.Count);
        }

        public void Capsule(Vector3 a, Vector3 b, float r, int seg = 12)
        {
            Cylinder(a, b, r, r, seg, false, false);
            Vector3 axis = (b - a).normalized;
            Hemisphere(a, -axis, r, seg);
            Hemisphere(b, axis, r, seg);
        }

        public void Hemisphere(Vector3 center, Vector3 up, float r, int seg = 12)
        {
            Basis(up, out var u, out var w);
            int lat = Mathf.Max(3, seg / 3);
            int s = m_V.Count;
            for (int y = 0; y <= lat; y++)
            {
                float phi = y / (float)lat * Mathf.PI * 0.5f;
                for (int x = 0; x <= seg; x++)
                {
                    float th = x / (float)seg * Mathf.PI * 2f;
                    Vector3 dir = (u * Mathf.Cos(th) + w * Mathf.Sin(th)) * Mathf.Cos(phi) + up * Mathf.Sin(phi);
                    Vertex(center + dir * r, dir, new Vector2(x / (float)seg, phi));
                }
            }
            for (int y = 0; y < lat; y++)
                for (int x = 0; x < seg; x++)
                {
                    int a = s + y * (seg + 1) + x;
                    Quad(a, a + 1, a + seg + 2, a + seg + 1);
                }
        }

        /// <summary>Tube swept along a path with parallel-transport frames (trunks, branches, cables).</summary>
        public void TubePath(IList<Vector3> pts, IList<float> radii, int seg = 8, bool capEnd = true, IList<float> windWeights = null)
        {
            int count = pts.Count;
            if (count < 2) return;
            Vector3 t0 = (pts[1] - pts[0]).normalized;
            Basis(t0, out var u, out var w);
            int start = m_V.Count;
            float vAcc = 0f;
            Color baseColor = VertexColor;
            for (int k = 0; k < count; k++)
            {
                Vector3 tan = k == 0 ? pts[1] - pts[0] : k == count - 1 ? pts[k] - pts[k - 1] : pts[k + 1] - pts[k - 1];
                tan.Normalize();
                // parallel transport the frame
                u = Vector3.ProjectOnPlane(u, tan).normalized;
                w = Vector3.Cross(tan, u).normalized;
                if (k > 0) vAcc += Vector3.Distance(pts[k], pts[k - 1]);
                if (windWeights != null) VertexColor = new Color(windWeights[k], baseColor.g, baseColor.b, baseColor.a);
                for (int i = 0; i <= seg; i++)
                {
                    float ang = i / (float)seg * Mathf.PI * 2f;
                    Vector3 radial = u * Mathf.Cos(ang) + w * Mathf.Sin(ang);
                    Vertex(pts[k] + radial * radii[k], radial, new Vector2(i / (float)seg, vAcc * 0.5f));
                }
            }
            for (int k = 0; k < count - 1; k++)
                for (int i = 0; i < seg; i++)
                {
                    int r0 = start + k * (seg + 1) + i, r1 = r0 + seg + 1;
                    Quad(r0, r0 + 1, r1 + 1, r1);
                }
            if (capEnd && radii[count - 1] > 1e-4f) Disc(pts[count - 1], (pts[count - 1] - pts[count - 2]).normalized, radii[count - 1], seg);
            VertexColor = baseColor;
        }

        /// <summary>Extrudes a closed 2D profile (XY) along +Z. Flat-shaded edges, fan caps.</summary>
        public void Extrude(IList<Vector2> profile, float length, bool caps = true, bool smooth = false)
        {
            int n = profile.Count;
            Vector2 centroid = Vector2.zero;
            foreach (var p in profile) centroid += p;
            centroid /= n;
            for (int i = 0; i < n; i++)
            {
                Vector2 p0 = profile[i], p1 = profile[(i + 1) % n];
                Vector2 e = (p1 - p0);
                Vector3 nrm = new Vector3(e.y, -e.x, 0).normalized;
                Vector2 mid = (p0 + p1) * 0.5f - centroid;
                if (Vector2.Dot(new Vector2(nrm.x, nrm.y), mid) < 0) nrm = -nrm;
                Vector3 n0 = nrm, n1 = nrm;
                if (smooth)
                {
                    n0 = ((Vector3)(p0 - centroid)).normalized;
                    n1 = ((Vector3)(p1 - centroid)).normalized;
                }
                float u0 = 0, u1 = e.magnitude;
                int a = Vertex(new Vector3(p0.x, p0.y, 0), n0, new Vector2(u0, 0));
                int b = Vertex(new Vector3(p1.x, p1.y, 0), n1, new Vector2(u1, 0));
                int c = Vertex(new Vector3(p1.x, p1.y, length), n1, new Vector2(u1, length));
                int d = Vertex(new Vector3(p0.x, p0.y, length), n0, new Vector2(u0, length));
                Quad(a, b, c, d);
            }
            if (!caps) return;
            for (int side = 0; side < 2; side++)
            {
                float z = side == 0 ? 0 : length;
                Vector3 nrm = side == 0 ? Vector3.back : Vector3.forward;
                int c = Vertex(new Vector3(centroid.x, centroid.y, z), nrm, centroid);
                int s = m_V.Count;
                for (int i = 0; i < n; i++) Vertex(new Vector3(profile[i].x, profile[i].y, z), nrm, profile[i]);
                for (int i = 0; i < n; i++) Tri(c, s + i, s + (i + 1) % n);
            }
        }

        /// <summary>Single quad, optionally double-sided.</summary>
        public void Plane(Vector3 center, Vector3 right, Vector3 up, Vector2 uvSize, bool doubleSided = false)
        {
            Vector3 n = Vector3.Cross(up, right).normalized;
            for (int side = 0; side < (doubleSided ? 2 : 1); side++)
            {
                Vector3 nn = side == 0 ? n : -n;
                int a = Vertex(center - right - up, nn, new Vector2(0, 0));
                int b = Vertex(center + right - up, nn, new Vector2(uvSize.x, 0));
                int c = Vertex(center + right + up, nn, new Vector2(uvSize.x, uvSize.y));
                int d = Vertex(center - right + up, nn, new Vector2(0, uvSize.y));
                Quad(a, b, c, d);
            }
        }

        /// <summary>Subdivided ground grid with a height function (used for the island skirt / pads).</summary>
        public void HeightGrid(Vector3 origin, Vector2 size, int res, System.Func<float, float, float> height)
        {
            int s = m_V.Count;
            for (int y = 0; y <= res; y++)
                for (int x = 0; x <= res; x++)
                {
                    float px = origin.x + size.x * x / res, pz = origin.z + size.y * y / res;
                    Vertex(new Vector3(px, origin.y + height(px, pz), pz), Vector3.up, new Vector2(px, pz) * 0.1f);
                }
            for (int y = 0; y < res; y++)
                for (int x = 0; x < res; x++)
                {
                    int a = s + y * (res + 1) + x;
                    Quad(a, a + 1, a + res + 2, a + res + 1);
                }
            RecalculateNormalsRange(s, m_V.Count);
        }

        void RecalculateNormalsRange(int from, int to)
        {
            var acc = new Vector3[to - from];
            foreach (var sub in m_Sub)
                for (int i = 0; i < sub.Count; i += 3)
                {
                    int a = sub[i], b = sub[i + 1], c = sub[i + 2];
                    if (a < from || a >= to || b < from || c < from) continue;
                    Vector3 fn = Vector3.Cross(m_V[b] - m_V[a], m_V[c] - m_V[a]);
                    acc[a - from] += fn; acc[b - from] += fn; acc[c - from] += fn;
                }
            // weld seams by position so UV seams stay smooth
            var map = new Dictionary<Vector3Int, Vector3>();
            for (int i = from; i < to; i++)
            {
                var key = Quantize(m_V[i]);
                map.TryGetValue(key, out var sum);
                map[key] = sum + acc[i - from];
            }
            for (int i = from; i < to; i++)
            {
                var n = map[Quantize(m_V[i])];
                if (n.sqrMagnitude > 1e-12f) m_N[i] = n.normalized;
            }
        }

        static Vector3Int Quantize(Vector3 v) => new Vector3Int(Mathf.RoundToInt(v.x * 2000f), Mathf.RoundToInt(v.y * 2000f), Mathf.RoundToInt(v.z * 2000f));

        public static float Noise3(Vector3 p, int seed)
        {
            float a = Mathf.PerlinNoise(p.x + seed * 0.37f, p.y + 11.3f);
            float b = Mathf.PerlinNoise(p.y + seed * 0.71f, p.z + 3.7f);
            float c = Mathf.PerlinNoise(p.z + seed * 0.13f, p.x + 7.1f);
            return (a + b + c) / 3f;
        }

        /// <summary>Appends another builder's geometry (keeps submesh indices).</summary>
        public void Append(MeshBuilder other)
        {
            int offset = m_V.Count;
            for (int i = 0; i < other.m_V.Count; i++)
            {
                m_V.Add(Matrix.MultiplyPoint3x4(other.m_V[i]));
                m_N.Add(Matrix.MultiplyVector(other.m_N[i]).normalized);
                m_UV.Add(other.m_UV[i]);
                m_C.Add(other.m_C[i]);
            }
            for (int s = 0; s < other.m_Sub.Count; s++)
            {
                while (m_Sub.Count <= s) m_Sub.Add(new List<int>());
                foreach (int idx in other.m_Sub[s]) m_Sub[s].Add(idx + offset);
            }
        }

        public Mesh ToMesh(string name, bool markDynamic = false)
        {
            var mesh = new Mesh { name = name };
            if (m_V.Count > 65000) mesh.indexFormat = IndexFormat.UInt32;
            mesh.SetVertices(m_V);
            mesh.SetNormals(m_N);
            mesh.SetUVs(0, m_UV);
            mesh.SetColors(m_C);
            int subCount = m_Sub.Count;
            while (subCount > 1 && m_Sub[subCount - 1].Count == 0) subCount--;
            mesh.subMeshCount = subCount;
            for (int i = 0; i < subCount; i++) mesh.SetTriangles(m_Sub[i], i, false);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            if (markDynamic) mesh.MarkDynamic();
            return mesh;
        }
    }
}
