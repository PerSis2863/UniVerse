using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    public static partial class ProceduralMeshBuilder
    {
        // =====================================================================
        // World props (submesh 0 = primary material, 1 = trim/secondary)
        // =====================================================================

        /// <summary>20ft shipping container (6.06 x 2.59 x 2.44), corrugated walls, corner castings, door bars.</summary>
        public static Mesh Container()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            Vector3 size = new Vector3(2.44f, 2.59f, 6.06f);
            b.RoundedBox(new Vector3(0, size.y * 0.5f, 0), size - new Vector3(0.06f, 0.0f, 0.0f), 0.03f, 1);
            // corrugation ribs on the long walls and roof
            for (float z = -2.85f; z <= 2.85f; z += 0.28f)
            {
                b.Box(new Vector3(size.x * 0.5f - 0.015f, size.y * 0.5f, z), Quaternion.identity, new Vector3(0.05f, size.y - 0.3f, 0.1f));
                b.Box(new Vector3(-size.x * 0.5f + 0.015f, size.y * 0.5f, z), Quaternion.identity, new Vector3(0.05f, size.y - 0.3f, 0.1f));
                b.Box(new Vector3(0, size.y + 0.005f, z), Quaternion.identity, new Vector3(size.x - 0.3f, 0.03f, 0.08f));
            }
            b.Submesh = 1;
            // frame rails + corner castings
            foreach (float y in new[] { 0.08f, size.y - 0.08f })
                foreach (float x in new[] { -size.x * 0.5f + 0.06f, size.x * 0.5f - 0.06f })
                    b.RoundedBox(new Vector3(x, y, 0), new Vector3(0.14f, 0.16f, size.z + 0.02f), 0.01f, 1);
            foreach (float x in new[] { -1, 1 })
                foreach (float y in new[] { 0, 1 })
                    foreach (float z in new[] { -1, 1 })
                        b.RoundedBox(new Vector3(x * (size.x * 0.5f - 0.06f), 0.09f + y * (size.y - 0.18f), z * (size.z * 0.5f - 0.05f)), new Vector3(0.18f, 0.18f, 0.18f), 0.02f, 1);
            // door locking bars
            for (int i = 0; i < 4; i++)
            {
                float x = -0.9f + i * 0.6f;
                b.Cylinder(new Vector3(x, 0.15f, size.z * 0.5f + 0.04f), new Vector3(x, size.y - 0.15f, size.z * 0.5f + 0.04f), 0.025f, 0.025f, 8);
                b.RoundedBox(new Vector3(x + 0.08f, 1.1f, size.z * 0.5f + 0.06f), new Vector3(0.14f, 0.05f, 0.04f), 0.01f, 1);
            }
            return b.ToMesh("Container");
        }

        public static Mesh CacheBody(bool legendary)
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            float w = legendary ? 1.2f : 1.0f;
            b.RoundedBox(new Vector3(0, 0.25f, 0), new Vector3(w, 0.5f, 0.6f), 0.05f, 2);
            b.Submesh = 1;
            foreach (float x in new[] { -w * 0.3f, w * 0.3f })
                b.RoundedBox(new Vector3(x, 0.25f, 0), new Vector3(0.06f, 0.52f, 0.62f), 0.015f, 1);
            b.RoundedBox(new Vector3(0, 0.49f, 0), new Vector3(w + 0.02f, 0.03f, 0.62f), 0.01f, 1);
            // handles
            b.Cylinder(new Vector3(-w * 0.5f - 0.03f, 0.3f, -0.12f), new Vector3(-w * 0.5f - 0.03f, 0.3f, 0.12f), 0.015f, 0.015f, 8);
            b.Cylinder(new Vector3(w * 0.5f + 0.03f, 0.3f, -0.12f), new Vector3(w * 0.5f + 0.03f, 0.3f, 0.12f), 0.015f, 0.015f, 8);
            return b.ToMesh(legendary ? "CacheBodyVault" : "CacheBody");
        }

        /// <summary>Lid with its hinge at the local origin (rotate about X to open).</summary>
        public static Mesh CacheLid(bool legendary)
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            float w = legendary ? 1.2f : 1.0f;
            b.RoundedBox(new Vector3(0, 0.07f, 0.3f), new Vector3(w, 0.14f, 0.6f), 0.05f, 2);
            b.Submesh = 1;
            b.RoundedBox(new Vector3(0, 0.15f, 0.3f), new Vector3(w * 0.5f, 0.02f, 0.25f), 0.01f, 1);
            b.RoundedBox(new Vector3(0, 0.07f, 0.605f), new Vector3(0.12f, 0.06f, 0.02f), 0.008f, 1);
            return b.ToMesh(legendary ? "CacheLidVault" : "CacheLid");
        }

        public static Mesh SupplyTerminal()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.RoundedBox(new Vector3(0, 0.08f, 0), new Vector3(1.0f, 0.16f, 0.7f), 0.03f, 2);
            b.RoundedBox(new Vector3(0, 0.95f, -0.05f), new Vector3(0.85f, 1.6f, 0.5f), 0.06f, 2);
            b.RoundedBox(new Vector3(0, 1.85f, 0.05f), Quaternion.Euler(-12, 0, 0), new Vector3(0.95f, 0.3f, 0.55f), 0.05f, 2);
            b.RoundedBox(new Vector3(0, 0.95f, 0.22f), new Vector3(0.7f, 0.08f, 0.12f), 0.02f, 1); // counter
            // antenna
            b.Cylinder(new Vector3(0.35f, 2.0f, -0.1f), new Vector3(0.35f, 2.6f, -0.1f), 0.012f, 0.006f, 8);
            b.Submesh = 1;
            b.Plane(new Vector3(0, 1.35f, 0.205f), Vector3.right * 0.32f, new Vector3(0, 0.26f, -0.04f), Vector2.one);
            b.RoundedBox(new Vector3(0, 1.98f, 0.27f), new Vector3(0.8f, 0.05f, 0.02f), 0.01f, 1);
            b.Sphere(new Vector3(0.35f, 2.62f, -0.1f), Vector3.one * 0.03f, 6, 8);
            return b.ToMesh("SupplyTerminal");
        }

        public static Mesh FieldTablet()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Cylinder(new Vector3(0, 0, 0), new Vector3(0, 0.95f, 0), 0.03f, 0.025f, 10);
            b.Cylinder(new Vector3(0, 0, 0), new Vector3(0, 0.03f, 0), 0.22f, 0.2f, 16);
            b.RoundedBox(new Vector3(0, 1.0f, 0.02f), Quaternion.Euler(-35, 0, 0), new Vector3(0.36f, 0.26f, 0.03f), 0.012f, 2);
            b.Submesh = 1;
            b.RoundedBox(new Vector3(0, 1.0f, 0.03f), Quaternion.Euler(-35, 0, 0), new Vector3(0.32f, 0.22f, 0.025f), 0.006f, 1);
            return b.ToMesh("FieldTablet");
        }

        /// <summary>Jersey barrier (waist-high, ~0.95 m) for ADS cover and mounting.</summary>
        public static Mesh JerseyBarrier(float length = 3f)
        {
            var b = new MeshBuilder(1);
            var profile = new List<Vector2>
            {
                new Vector2(-0.32f, 0f), new Vector2(0.32f, 0f), new Vector2(0.32f, 0.08f), new Vector2(0.2f, 0.33f),
                new Vector2(0.1f, 0.95f), new Vector2(-0.1f, 0.95f), new Vector2(-0.2f, 0.33f), new Vector2(-0.32f, 0.08f)
            };
            b.Push(new Vector3(0, 0, -length * 0.5f), Quaternion.identity);
            b.Extrude(profile, length);
            b.Pop();
            return b.ToMesh("JerseyBarrier");
        }

        public static Mesh Sandbags(int columns = 5, int rows = 3)
        {
            var b = new MeshBuilder(1);
            var rnd = new System.Random(columns * 31 + rows);
            for (int r = 0; r < rows; r++)
                for (int c = 0; c < columns - (r % 2); c++)
                {
                    float x = (c - (columns - 1) * 0.5f) * 0.58f + (r % 2) * 0.29f;
                    float yaw = (float)rnd.NextDouble() * 6f - 3f;
                    b.RoundedBox(new Vector3(x, 0.09f + r * 0.16f, 0), Quaternion.Euler(0, yaw, 0), new Vector3(0.6f, 0.18f, 0.36f), 0.08f, 3);
                }
            return b.ToMesh("Sandbags");
        }

        public static Mesh Rock(int seed, Vector3 size)
        {
            var b = new MeshBuilder(1);
            b.Sphere(Vector3.up * size.y * 0.25f, size * 0.5f, 10, 14, 0.32f, seed);
            return b.ToMesh("Rock_" + seed);
        }

        public static Mesh OilDrum()
        {
            var b = new MeshBuilder(1);
            b.Cylinder(Vector3.zero, Vector3.up * 0.88f, 0.29f, 0.29f, 20);
            foreach (float y in new[] { 0.29f, 0.59f })
                b.Cylinder(Vector3.up * (y - 0.015f), Vector3.up * (y + 0.015f), 0.3f, 0.3f, 20);
            b.Cylinder(Vector3.up * 0.86f, Vector3.up * 0.9f, 0.295f, 0.29f, 20);
            return b.ToMesh("OilDrum");
        }

        public static Mesh WoodCrate(float s = 1.0f)
        {
            var b = new MeshBuilder(1);
            for (int i = 0; i < 4; i++)
                b.RoundedBox(new Vector3(0, s * (0.125f + i * 0.25f), 0), new Vector3(s * 0.98f, s * 0.235f, s * 0.98f), 0.01f, 1);
            foreach (float x in new[] { -1, 1 })
                foreach (float z in new[] { -1, 1 })
                    b.RoundedBox(new Vector3(x * s * 0.47f, s * 0.5f, z * s * 0.47f), new Vector3(s * 0.08f, s, s * 0.08f), 0.01f, 1);
            b.RoundedBox(new Vector3(0, s * 0.5f, s * 0.495f), Quaternion.Euler(0, 0, 45), new Vector3(s * 1.25f, s * 0.08f, s * 0.03f), 0.008f, 1);
            return b.ToMesh("WoodCrate");
        }

        /// <summary>Corrugated arched roof shell (hangars). Arch spans X, length along Z.</summary>
        public static Mesh ArchedRoof(float span, float rise, float length, int segments = 18)
        {
            var b = new MeshBuilder(1);
            float halfSpan = span * 0.5f;
            // circle through (-h,0), (h,0), (0,rise)
            float radius = (halfSpan * halfSpan + rise * rise) / (2f * rise);
            float cy = rise - radius;
            float a0 = Mathf.Atan2(-cy, -halfSpan), a1 = Mathf.Atan2(-cy, halfSpan);
            for (int i = 0; i < segments; i++)
            {
                float t0 = i / (float)segments, t1 = (i + 1) / (float)segments;
                float am = Mathf.Lerp(a0, a1, (t0 + t1) * 0.5f);
                Vector3 p0 = new Vector3(Mathf.Cos(Mathf.Lerp(a0, a1, t0)) * radius, cy + Mathf.Sin(Mathf.Lerp(a0, a1, t0)) * radius, 0);
                Vector3 p1 = new Vector3(Mathf.Cos(Mathf.Lerp(a0, a1, t1)) * radius, cy + Mathf.Sin(Mathf.Lerp(a0, a1, t1)) * radius, 0);
                Vector3 mid = (p0 + p1) * 0.5f;
                float segLen = Vector3.Distance(p0, p1);
                var rot = Quaternion.Euler(0, 0, am * Mathf.Rad2Deg - 90f);
                b.RoundedBox(mid, rot, new Vector3(segLen * 1.02f, 0.08f, length), 0.02f, 1);
                if (i % 3 == 0) b.RoundedBox(mid + rot * new Vector3(0, -0.12f, 0), rot, new Vector3(segLen, 0.16f, 0.14f), 0.02f, 1);
            }
            return b.ToMesh("ArchedRoof");
        }

        public static Mesh Door(float w = 1.0f, float h = 2.1f)
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            // hinge at origin, door extends along +X
            b.RoundedBox(new Vector3(w * 0.5f, h * 0.5f, 0), new Vector3(w, h, 0.05f), 0.012f, 1);
            b.RoundedBox(new Vector3(w * 0.5f, h * 0.72f, 0.03f), new Vector3(w * 0.7f, h * 0.32f, 0.02f), 0.01f, 1);
            b.RoundedBox(new Vector3(w * 0.5f, h * 0.28f, 0.03f), new Vector3(w * 0.7f, h * 0.32f, 0.02f), 0.01f, 1);
            b.Submesh = 1;
            foreach (float z in new[] { 0.06f, -0.06f })
            {
                b.Cylinder(new Vector3(w * 0.88f, h * 0.48f, z * 0.5f), new Vector3(w * 0.88f, h * 0.48f, z), 0.01f, 0.01f, 8);
                b.Cylinder(new Vector3(w * 0.88f, h * 0.48f, z), new Vector3(w * 0.78f, h * 0.48f, z), 0.012f, 0.012f, 8);
            }
            return b.ToMesh("Door");
        }

        public static Mesh UpdraftVent()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Tube(Vector3.zero, Vector3.up * 0.4f, 2.2f, 1.9f, 32);
            b.Submesh = 1;
            for (int i = -4; i <= 4; i++)
                b.Box(new Vector3(i * 0.42f, 0.3f, 0), Quaternion.identity, new Vector3(0.06f, 0.08f, 3.8f * Mathf.Sqrt(1f - (i * 0.42f / 2f) * (i * 0.42f / 2f))));
            return b.ToMesh("UpdraftVent");
        }

        public static Mesh ArmorCellMesh()
        {
            var b = new MeshBuilder(1);
            b.RoundedBox(Vector3.zero, Quaternion.Euler(-8, 0, 0), new Vector3(0.22f, 0.28f, 0.02f), 0.008f, 2);
            b.RoundedBox(new Vector3(0, 0, 0.012f), new Vector3(0.16f, 0.2f, 0.01f), 0.004f, 1);
            return b.ToMesh("ArmorCell");
        }

        public static Mesh Grenade()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Sphere(Vector3.zero, new Vector3(0.032f, 0.038f, 0.032f), 8, 12);
            b.Submesh = 1;
            b.Cylinder(new Vector3(0, 0.03f, 0), new Vector3(0, 0.05f, 0), 0.012f, 0.012f, 10);
            b.RoundedBox(new Vector3(0.018f, 0.025f, 0), Quaternion.Euler(0, 0, -20), new Vector3(0.008f, 0.06f, 0.012f), 0.002f, 1);
            return b.ToMesh("Grenade");
        }

        public static Mesh BrassShell()
        {
            var b = new MeshBuilder(1);
            b.Cylinder(Vector3.zero, Vector3.forward * 0.03f, 0.0048f, 0.0042f, 8);
            b.Cylinder(Vector3.forward * 0.03f, Vector3.forward * 0.038f, 0.0042f, 0.0032f, 8);
            return b.ToMesh("Brass");
        }

        public static Mesh LootBeam()
        {
            var b = new MeshBuilder(1);
            b.Cylinder(Vector3.zero, Vector3.up * 3.5f, 0.12f, 0.03f, 10, false, false);
            return b.ToMesh("LootBeam");
        }

        public static Mesh KitPod()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Capsule(new Vector3(0, 0.6f, 0), new Vector3(0, 1.9f, 0), 0.55f, 20);
            for (int i = 0; i < 4; i++)
            {
                var rot = Quaternion.Euler(0, i * 90f, 0);
                b.RoundedBox(rot * new Vector3(0, 0.5f, 0.6f), rot, new Vector3(0.06f, 1.0f, 0.5f), 0.02f, 1);
            }
            b.Submesh = 1;
            b.Cylinder(new Vector3(0, 2.4f, 0), new Vector3(0, 2.55f, 0), 0.08f, 0.06f, 12);
            for (int i = 0; i < 3; i++)
                b.Cylinder(new Vector3(0, 0.9f + i * 0.45f, 0), new Vector3(0, 0.94f + i * 0.45f, 0), 0.565f, 0.565f, 20, false, false);
            return b.ToMesh("KitPod");
        }

        public static Mesh UplinkBeacon()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Cylinder(Vector3.zero, Vector3.up * 0.2f, 0.6f, 0.5f, 16);
            b.Cylinder(Vector3.up * 0.2f, Vector3.up * 2.6f, 0.06f, 0.04f, 10);
            for (int i = 0; i < 3; i++)
            {
                var rot = Quaternion.Euler(0, i * 120f, 0);
                b.Cylinder(Vector3.up * 1.2f, rot * new Vector3(0.6f, 0.0f, 0), 0.025f, 0.025f, 6);
            }
            b.Submesh = 1;
            b.Sphere(Vector3.up * 2.7f, Vector3.one * 0.12f, 8, 12);
            return b.ToMesh("UplinkBeacon");
        }

        // =====================================================================
        // Vehicles & drones
        // =====================================================================

        /// <summary>Four-engine cargo aircraft, ~30 m long. Nose toward +Z.</summary>
        public static Mesh CargoAircraft()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            var path = new List<Vector3>(); var rad = new List<float>();
            float[] zs = { -15f, -12f, -8f, 0f, 8f, 11.5f, 13.5f, 14.6f };
            float[] rs = { 0.6f, 1.6f, 2.1f, 2.2f, 2.2f, 1.9f, 1.2f, 0.25f };
            float[] ys = { 2.2f, 1.2f, 0.3f, 0f, 0f, -0.1f, -0.25f, -0.3f };
            for (int i = 0; i < zs.Length; i++) { path.Add(new Vector3(0, ys[i], zs[i])); rad.Add(rs[i]); }
            b.TubePath(path, rad, 20, true);
            // high wing
            b.RoundedBox(new Vector3(0, 2.25f, 2f), new Vector3(40f, 0.35f, 4.2f), 0.15f, 2);
            b.RoundedBox(new Vector3(0, 2.0f, 2f), new Vector3(3.2f, 0.6f, 4.6f), 0.25f, 2);
            // engines + props
            foreach (float x in new[] { -13f, -6.5f, 6.5f, 13f })
            {
                b.Cylinder(new Vector3(x, 1.8f, -1.5f), new Vector3(x, 1.8f, 4.8f), 0.55f, 0.65f, 16);
                b.Sphere(new Vector3(x, 1.8f, 4.9f), new Vector3(0.4f, 0.4f, 0.6f), 8, 12);
                b.Submesh = 1;
                for (int p = 0; p < 4; p++)
                    b.RoundedBox(new Vector3(x, 1.8f, 5.2f), Quaternion.Euler(0, 0, p * 90f + 20f), new Vector3(0.2f, 3.6f, 0.06f), 0.03f, 1);
                b.Submesh = 0;
            }
            // tail: fin + stabilisers
            b.RoundedBox(new Vector3(0, 5.0f, -12.5f), Quaternion.Euler(-15, 0, 0), new Vector3(0.35f, 6f, 4f), 0.12f, 2);
            b.RoundedBox(new Vector3(0, 2.6f, -13.5f), new Vector3(14f, 0.25f, 3f), 0.1f, 2);
            // landing gear sponsons
            b.RoundedBox(new Vector3(2.2f, -1.3f, 0), new Vector3(1.0f, 1.2f, 7f), 0.4f, 2);
            b.RoundedBox(new Vector3(-2.2f, -1.3f, 0), new Vector3(1.0f, 1.2f, 7f), 0.4f, 2);
            // cockpit glazing
            b.Submesh = 1;
            b.RoundedBox(new Vector3(0, 0.9f, 12.4f), Quaternion.Euler(20, 0, 0), new Vector3(2.4f, 0.6f, 1.6f), 0.2f, 2);
            return b.ToMesh("CargoAircraft");
        }

        /// <summary>Rear ramp, hinged at the local origin, extending toward -Z.</summary>
        public static Mesh AircraftRamp()
        {
            var b = new MeshBuilder(1);
            b.RoundedBox(new Vector3(0, 0, -2.4f), new Vector3(3.2f, 0.15f, 4.8f), 0.05f, 1);
            for (int i = 0; i < 8; i++) b.Box(new Vector3(0, 0.09f, -0.4f - i * 0.55f), Quaternion.identity, new Vector3(3f, 0.04f, 0.08f));
            return b.ToMesh("AircraftRamp");
        }

        /// <summary>Ram-air parachute canopy with cells and suspension lines (harness at origin).</summary>
        public static Mesh ParachuteCanopy()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            const int cells = 9;
            float span = 7.5f, arc = 1.2f;
            for (int i = 0; i < cells; i++)
            {
                float t = (i + 0.5f) / cells - 0.5f;
                float x = t * span;
                float y = 6f - (t * t) * arc * 4f;
                float roll = -t * 55f;
                b.RoundedBox(new Vector3(x, y, 0), Quaternion.Euler(0, 0, roll), new Vector3(span / cells * 1.02f, 0.38f, 2.6f), 0.17f, 2);
            }
            b.Submesh = 1;
            for (int i = 0; i <= cells; i += 2)
            {
                float t = i / (float)cells - 0.5f;
                Vector3 top = new Vector3(t * span, 6f - t * t * arc * 4f - 0.2f, 0);
                b.Cylinder(new Vector3(0, 0.6f, 0.15f), top + Vector3.forward * 0.9f, 0.008f, 0.008f, 4, false, false);
                b.Cylinder(new Vector3(0, 0.6f, -0.15f), top - Vector3.forward * 0.9f, 0.008f, 0.008f, 4, false, false);
            }
            return b.ToMesh("Parachute");
        }

        public static Mesh SentryDroneMesh()
        {
            var b = new MeshBuilder(2) { Submesh = 0 };
            b.Sphere(Vector3.zero, new Vector3(0.32f, 0.22f, 0.36f), 10, 16);
            for (int i = 0; i < 4; i++)
            {
                float a = (i * 90f + 45f) * Mathf.Deg2Rad;
                Vector3 tip = new Vector3(Mathf.Cos(a), 0.05f, Mathf.Sin(a)) * 0.62f;
                b.Cylinder(Vector3.zero, tip, 0.035f, 0.03f, 8);
                b.Tube(tip + Vector3.up * 0.02f, tip + Vector3.up * 0.08f, 0.26f, 0.23f, 20);
                b.Cylinder(tip, tip + Vector3.up * 0.1f, 0.04f, 0.03f, 8);
            }
            b.Cylinder(new Vector3(0, -0.12f, 0.15f), new Vector3(0, -0.12f, 0.5f), 0.025f, 0.02f, 10); // gun
            b.Submesh = 1;
            b.Sphere(new Vector3(0, 0.0f, 0.33f), Vector3.one * 0.08f, 8, 12);
            return b.ToMesh("SentryDrone");
        }

        // =====================================================================
        // Soldier body parts (submesh: 0 camo, 1 gear, 2 skin, 3 visor)
        // =====================================================================

        public static Mesh SoldierHead()
        {
            var b = new MeshBuilder(4) { Submesh = 2 };
            b.Sphere(Vector3.zero, new Vector3(0.095f, 0.115f, 0.105f), 10, 14);
            b.Submesh = 1;
            b.Hemisphere(new Vector3(0, 0.02f, -0.005f), Vector3.up, 0.128f, 16);
            b.Cylinder(new Vector3(0, 0.0f, -0.005f), new Vector3(0, 0.025f, -0.005f), 0.132f, 0.13f, 16, false, false);
            b.RoundedBox(new Vector3(0, 0.1f, 0.09f), new Vector3(0.05f, 0.03f, 0.03f), 0.01f, 1); // NVG mount
            b.Submesh = 3;
            b.RoundedBox(new Vector3(0, -0.005f, 0.1f), Quaternion.Euler(8, 0, 0), new Vector3(0.17f, 0.055f, 0.03f), 0.02f, 2);
            b.Submesh = 0;
            b.RoundedBox(new Vector3(0, -0.13f, 0.0f), new Vector3(0.1f, 0.06f, 0.1f), 0.03f, 1); // neck gaiter
            return b.ToMesh("SoldierHead");
        }

        public static Mesh SoldierTorso()
        {
            var b = new MeshBuilder(4) { Submesh = 0 };
            b.RoundedBox(new Vector3(0, 0.22f, 0), new Vector3(0.36f, 0.44f, 0.2f), 0.07f, 3);
            b.Submesh = 1;
            b.RoundedBox(new Vector3(0, 0.25f, 0.02f), new Vector3(0.38f, 0.36f, 0.25f), 0.04f, 2); // plate carrier
            for (int i = 0; i < 3; i++)
                b.RoundedBox(new Vector3(-0.1f + i * 0.1f, 0.13f, 0.155f), new Vector3(0.085f, 0.12f, 0.06f), 0.015f, 1); // mag pouches
            b.RoundedBox(new Vector3(0.12f, 0.33f, 0.15f), new Vector3(0.07f, 0.09f, 0.04f), 0.012f, 1); // radio
            b.Cylinder(new Vector3(0.12f, 0.37f, 0.15f), new Vector3(0.14f, 0.55f, 0.12f), 0.006f, 0.004f, 6); // antenna
            b.RoundedBox(new Vector3(0, 0.25f, -0.17f), new Vector3(0.3f, 0.34f, 0.14f), 0.04f, 2); // pack
            return b.ToMesh("SoldierTorso");
        }

        public static Mesh SoldierPelvis()
        {
            var b = new MeshBuilder(4) { Submesh = 0 };
            b.RoundedBox(new Vector3(0, -0.06f, 0), new Vector3(0.33f, 0.16f, 0.2f), 0.06f, 2);
            b.Submesh = 1;
            b.RoundedBox(new Vector3(0, 0.0f, 0), new Vector3(0.35f, 0.05f, 0.22f), 0.015f, 1); // belt
            b.RoundedBox(new Vector3(0.17f, -0.05f, 0.05f), new Vector3(0.05f, 0.1f, 0.08f), 0.012f, 1);
            return b.ToMesh("SoldierPelvis");
        }

        /// <summary>Limb segment from origin downward (-Y) of given length.</summary>
        public static Mesh SoldierLimb(float length, float r0, float r1, bool boot, bool glove)
        {
            var b = new MeshBuilder(4) { Submesh = 0 };
            b.Cylinder(Vector3.zero, Vector3.down * length, r0, r1, 12, false, false);
            b.Sphere(Vector3.zero, Vector3.one * r0, 6, 12);
            b.Sphere(Vector3.down * length, Vector3.one * r1, 6, 12);
            if (boot)
            {
                b.Submesh = 1;
                b.RoundedBox(new Vector3(0, -length - 0.02f, 0.04f), new Vector3(0.11f, 0.1f, 0.26f), 0.035f, 2);
            }
            if (glove)
            {
                b.Submesh = 1;
                b.RoundedBox(new Vector3(0, -length - 0.04f, 0), new Vector3(0.07f, 0.09f, 0.05f), 0.02f, 2);
            }
            if (!boot && !glove && length > 0.3f)
            {
                b.Submesh = 1;
                b.RoundedBox(new Vector3(0, -length * 0.98f, 0.05f), new Vector3(0.11f, 0.1f, 0.05f), 0.02f, 1); // knee pad
            }
            return b.ToMesh("SoldierLimb");
        }
    }
}
