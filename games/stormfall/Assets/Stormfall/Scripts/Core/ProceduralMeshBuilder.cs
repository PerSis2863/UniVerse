using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    public enum WeaponStyle { Carbine, SMG, Sniper }

    [System.Flags]
    public enum AttachmentFlags
    {
        None = 0,
        Suppressor = 1 << 0,
        LongBarrel = 1 << 1,
        Optic = 1 << 2,
        Grip = 1 << 3,
        ExtMag = 1 << 4,
    }

    /// <summary>Generated weapon geometry plus the sockets the rig needs.</summary>
    public class WeaponModel
    {
        public Mesh body, mag, bolt;
        public Vector3 sightPoint, muzzle, ejectPort, magPos, boltPos, leftHand;
        public float eyeDistance;
        public bool scoped;
        /// <summary>Submesh material order for <see cref="body"/>.</summary>
        public static readonly Mat[] BodyMaterials = { Mat.GunMetal, Mat.GunPolymer, Mat.GunTan, Mat.OpticGlass, Mat.ReticleRed, Mat.ScopeLens };
    }

    /// <summary>
    /// High-detail procedural models: firearms (cylindrical barrels, ventilated handguards,
    /// picatinny rails, holographic optic housings, scopes) and branched foliage with wind weights.
    /// Props, characters and vehicles live in ProceduralMeshBuilder.Props.cs.
    /// </summary>
    public static partial class ProceduralMeshBuilder
    {
        const int SubMetal = 0, SubPolymer = 1, SubTan = 2, SubGlass = 3, SubReticle = 4, SubLens = 5;

        // =====================================================================
        // Weapon parts
        // =====================================================================

        /// <summary>Picatinny rail along +Z: base, cross-slots and recoil lugs.</summary>
        public static void PicatinnyRail(MeshBuilder b, Vector3 start, float length, float width = 0.021f)
        {
            b.Submesh = SubMetal;
            b.RoundedBox(start + new Vector3(0, 0.003f, length * 0.5f), new Vector3(width, 0.006f, length), 0.0015f, 1);
            const float pitch = 0.01f, tooth = 0.0052f;
            int teeth = Mathf.FloorToInt(length / pitch);
            for (int i = 0; i < teeth; i++)
            {
                float z = start.z + i * pitch + pitch * 0.5f;
                b.Box(new Vector3(start.x, start.y + 0.0078f, z), Quaternion.identity, new Vector3(width, 0.0036f, tooth));
                // dovetail flare
                b.Box(new Vector3(start.x, start.y + 0.0062f, z), Quaternion.identity, new Vector3(width + 0.003f, 0.0016f, tooth));
            }
        }

        /// <summary>Octagonal free-float handguard with alternating vent slots and end collars.</summary>
        public static void VentedHandguard(MeshBuilder b, Vector3 center, float radius, float z0, float z1, int sub, int rows = 7)
        {
            const int sides = 8;
            float len = z1 - z0;
            float rowLen = len / rows;
            float panelW = 2f * radius * Mathf.Tan(Mathf.PI / sides) * 0.98f;
            b.Submesh = sub;
            for (int r = 0; r < rows; r++)
            {
                for (int i = 0; i < sides; i++)
                {
                    bool sidePanel = i != 2 && i != 6 && i != 0 && i != 4; // keep top/bottom/left/right solid (rails)
                    bool vent = sidePanel && r % 2 == 1 && r > 0 && r < rows - 1;
                    if (vent)
                    {
                        // slot: two thin bars framing an opening
                        float ang = i * Mathf.PI * 2f / sides;
                        Vector3 dir = new Vector3(Mathf.Cos(ang), Mathf.Sin(ang), 0);
                        var rot = Quaternion.LookRotation(Vector3.forward, dir);
                        Vector3 tangent = rot * Vector3.right;
                        Vector3 c = center + dir * radius + Vector3.forward * (z0 + (r + 0.5f) * rowLen);
                        b.RoundedBox(c + tangent * panelW * 0.4f, rot, new Vector3(panelW * 0.2f, 0.0035f, rowLen), 0.001f, 1);
                        b.RoundedBox(c - tangent * panelW * 0.4f, rot, new Vector3(panelW * 0.2f, 0.0035f, rowLen), 0.001f, 1);
                        continue;
                    }
                    {
                        float ang = i * Mathf.PI * 2f / sides;
                        Vector3 dir = new Vector3(Mathf.Cos(ang), Mathf.Sin(ang), 0);
                        var rot = Quaternion.LookRotation(Vector3.forward, dir);
                        Vector3 c = center + dir * radius + Vector3.forward * (z0 + (r + 0.5f) * rowLen);
                        b.RoundedBox(c, rot, new Vector3(panelW, 0.0035f, rowLen * 1.001f), 0.0012f, 1);
                    }
                }
            }
            b.Submesh = SubMetal;
            b.Tube(center + Vector3.forward * z0, center + Vector3.forward * (z0 + 0.012f), radius * 1.06f, radius * 0.6f, 16);
            b.Tube(center + Vector3.forward * (z1 - 0.008f), center + Vector3.forward * z1, radius * 1.04f, radius * 0.5f, 16);
        }

        /// <summary>Holographic sight: base clamp, hood, window glass and an emissive reticle at the sight point.</summary>
        public static Vector3 HoloSight(MeshBuilder b, Vector3 railTop, out float eyeDistance)
        {
            float baseY = railTop.y;
            b.Submesh = SubMetal;
            b.RoundedBox(new Vector3(0, baseY + 0.008f, railTop.z), new Vector3(0.036f, 0.016f, 0.075f), 0.003f, 2);
            // battery housing + buttons
            b.Cylinder(new Vector3(0f, baseY + 0.009f, railTop.z - 0.04f), new Vector3(0, baseY + 0.009f, railTop.z - 0.02f), 0.009f, 0.009f, 12);
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0.016f, baseY + 0.012f, railTop.z - 0.015f), new Vector3(0.006f, 0.006f, 0.01f), 0.002f, 1);
            b.RoundedBox(new Vector3(0.016f, baseY + 0.012f, railTop.z - 0.002f), new Vector3(0.006f, 0.006f, 0.01f), 0.002f, 1);
            // hood
            b.Submesh = SubMetal;
            float wy = baseY + 0.016f;
            float winH = 0.03f, winW = 0.034f;
            float hz = railTop.z + 0.008f;
            b.RoundedBox(new Vector3(-winW * 0.5f - 0.003f, wy + winH * 0.5f, hz), new Vector3(0.006f, winH + 0.004f, 0.05f), 0.0025f, 2);
            b.RoundedBox(new Vector3(winW * 0.5f + 0.003f, wy + winH * 0.5f, hz), new Vector3(0.006f, winH + 0.004f, 0.05f), 0.0025f, 2);
            b.RoundedBox(new Vector3(0, wy + winH + 0.003f, hz), new Vector3(winW + 0.012f, 0.006f, 0.05f), 0.0025f, 2);
            // brightness turret on the hood
            b.Cylinder(new Vector3(0, wy + winH + 0.006f, hz - 0.006f), new Vector3(0, wy + winH + 0.012f, hz - 0.006f), 0.006f, 0.006f, 12);
            // glass window (rear pane and tinted front pane)
            Vector3 sight = new Vector3(0, wy + winH * 0.5f, hz + 0.012f);
            b.Submesh = SubGlass;
            b.Plane(sight, Vector3.right * winW * 0.5f, Vector3.up * winH * 0.5f, Vector2.one, true);
            b.Plane(sight - Vector3.forward * 0.02f, Vector3.right * winW * 0.5f, Vector3.up * winH * 0.5f, Vector2.one, true);
            // reticle: dot + broken ring, projected onto the front pane facing the eye
            b.Submesh = SubReticle;
            b.Disc(sight - Vector3.forward * 0.0005f, Vector3.back, 0.00065f, 10);
            for (int i = 0; i < 4; i++)
            {
                float a = i * Mathf.PI * 0.5f + Mathf.PI * 0.25f;
                Vector3 c = sight - Vector3.forward * 0.0005f + new Vector3(Mathf.Cos(a), Mathf.Sin(a), 0) * 0.0062f;
                b.Box(c, Quaternion.Euler(0, 0, a * Mathf.Rad2Deg + 90f), new Vector3(0.0034f, 0.00045f, 0.0002f));
            }
            eyeDistance = 0.16f;
            return sight;
        }

        /// <summary>Variable-power scope with bells, turrets, rings and lenses.</summary>
        public static Vector3 Scope(MeshBuilder b, Vector3 railTop, out float eyeDistance)
        {
            float y = railTop.y + 0.032f;
            float zc = railTop.z;
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0, y, zc - 0.12f), new Vector3(0, y, zc + 0.14f), 0.0155f, 0.0155f, 24);
            b.Cylinder(new Vector3(0, y, zc + 0.14f), new Vector3(0, y, zc + 0.19f), 0.0155f, 0.027f, 24, false, false);
            b.Tube(new Vector3(0, y, zc + 0.19f), new Vector3(0, y, zc + 0.25f), 0.028f, 0.024f, 24);
            b.Cylinder(new Vector3(0, y, zc - 0.2f), new Vector3(0, y, zc - 0.12f), 0.022f, 0.0155f, 24, false, false);
            b.Tube(new Vector3(0, y, zc - 0.24f), new Vector3(0, y, zc - 0.2f), 0.023f, 0.019f, 24);
            // power ring knurl
            for (int i = 0; i < 10; i++)
            {
                float z = zc - 0.115f + i * 0.004f;
                b.Cylinder(new Vector3(0, y, z), new Vector3(0, y, z + 0.002f), 0.0172f, 0.0172f, 20);
            }
            // turrets
            b.Cylinder(new Vector3(0, y + 0.014f, zc + 0.02f), new Vector3(0, y + 0.034f, zc + 0.02f), 0.012f, 0.012f, 18);
            b.Cylinder(new Vector3(0.014f, y, zc + 0.02f), new Vector3(0.032f, y, zc + 0.02f), 0.011f, 0.011f, 18);
            b.Cylinder(new Vector3(-0.014f, y, zc + 0.02f), new Vector3(-0.026f, y, zc + 0.02f), 0.009f, 0.009f, 18);
            // rings + mount
            foreach (float z in new[] { zc - 0.07f, zc + 0.09f })
            {
                b.Tube(new Vector3(0, y, z - 0.008f), new Vector3(0, y, z + 0.008f), 0.0195f, 0.0154f, 20);
                b.RoundedBox(new Vector3(0, railTop.y + 0.008f, z), new Vector3(0.03f, 0.016f, 0.02f), 0.003f, 1);
            }
            // lenses
            b.Submesh = SubLens;
            b.Disc(new Vector3(0, y, zc + 0.245f), Vector3.forward, 0.024f, 24);
            b.Disc(new Vector3(0, y, zc - 0.235f), Vector3.back, 0.019f, 24);
            eyeDistance = 0.09f;
            return new Vector3(0, y, zc - 0.24f);
        }

        static void PistolGrip(MeshBuilder b, Vector3 top, float angle)
        {
            b.Submesh = SubPolymer;
            var rot = Quaternion.Euler(angle, 0, 0);
            b.RoundedBox(top + rot * new Vector3(0, -0.05f, 0), rot, new Vector3(0.03f, 0.105f, 0.042f), 0.012f, 3);
            // finger grooves
            for (int i = 0; i < 3; i++)
                b.Sphere(top + rot * new Vector3(0, -0.025f - i * 0.024f, 0.02f), new Vector3(0.014f, 0.01f, 0.006f), 4, 8);
            // trigger + guard
            b.Submesh = SubMetal;
            b.RoundedBox(top + new Vector3(0, -0.012f, 0.045f), Quaternion.Euler(15, 0, 0), new Vector3(0.006f, 0.022f, 0.006f), 0.002f, 1);
            b.RoundedBox(top + new Vector3(0, -0.032f, 0.046f), new Vector3(0.012f, 0.004f, 0.055f), 0.0018f, 1);
        }

        static Mesh CurvedMag(float length, float width, float depth, float curveDeg, int segs, bool ext)
        {
            var b = new MeshBuilder(6) { Submesh = SubPolymer };
            float segLen = length / segs;
            Vector3 p = Vector3.zero;
            Quaternion rot = Quaternion.identity;
            for (int i = 0; i < segs; i++)
            {
                Quaternion r = rot * Quaternion.Euler(-curveDeg / segs * 0.5f, 0, 0);
                b.RoundedBox(p + r * new Vector3(0, -segLen * 0.5f, 0), r, new Vector3(width, segLen * 1.04f, depth), 0.0035f, 1);
                // ribs
                b.RoundedBox(p + r * new Vector3(width * 0.5f, -segLen * 0.5f, 0), r, new Vector3(0.002f, segLen * 0.7f, depth * 0.6f), 0.0008f, 1);
                b.RoundedBox(p + r * new Vector3(-width * 0.5f, -segLen * 0.5f, 0), r, new Vector3(0.002f, segLen * 0.7f, depth * 0.6f), 0.0008f, 1);
                p += r * new Vector3(0, -segLen, 0);
                rot = rot * Quaternion.Euler(-curveDeg / segs, 0, 0);
            }
            b.Submesh = SubMetal;
            b.RoundedBox(p + rot * new Vector3(0, -0.006f, 0), rot, new Vector3(width * 1.15f, 0.012f, depth * 1.12f), 0.003f, 2);
            if (ext) b.RoundedBox(p + rot * new Vector3(0, -0.02f, 0), rot, new Vector3(width * 1.1f, 0.02f, depth * 1.1f), 0.004f, 2);
            // top rounds
            b.Submesh = SubMetal; // top round
            b.Cylinder(new Vector3(0, 0.003f, -depth * 0.4f), new Vector3(0, 0.003f, depth * 0.35f), 0.0042f, 0.003f, 10);
            return b.ToMesh("Magazine");
        }

        // =====================================================================
        // Complete weapons
        // =====================================================================

        public static WeaponModel BuildWeapon(WeaponStyle style, AttachmentFlags att)
        {
            switch (style)
            {
                case WeaponStyle.SMG: return BuildSmg(att);
                case WeaponStyle.Sniper: return BuildSniper(att);
                default: return BuildCarbine(att);
            }
        }

        static WeaponModel BuildCarbine(AttachmentFlags att)
        {
            var m = new WeaponModel();
            var b = new MeshBuilder(6);
            // Upper receiver
            b.Submesh = SubMetal;
            b.RoundedBox(new Vector3(0, 0.035f, 0.03f), new Vector3(0.048f, 0.052f, 0.24f), 0.006f, 2);
            // ejection port recess + dust cover
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0.0245f, 0.04f, 0.04f), new Vector3(0.002f, 0.016f, 0.05f), 0.0008f, 1);
            b.Submesh = SubMetal;
            // forward assist + charging handle
            b.Cylinder(new Vector3(0.022f, 0.045f, -0.02f), new Vector3(0.032f, 0.05f, -0.03f), 0.007f, 0.006f, 12);
            b.RoundedBox(new Vector3(0, 0.058f, -0.095f), new Vector3(0.04f, 0.008f, 0.02f), 0.003f, 1);
            // Lower receiver (tan) + magwell
            b.Submesh = SubTan;
            b.RoundedBox(new Vector3(0, -0.012f, 0.0f), new Vector3(0.044f, 0.044f, 0.19f), 0.006f, 2);
            b.RoundedBox(new Vector3(0, -0.045f, 0.06f), Quaternion.Euler(-6, 0, 0), new Vector3(0.04f, 0.05f, 0.05f), 0.005f, 2);
            PistolGrip(b, new Vector3(0, -0.03f, -0.05f), 18f);
            // Buffer tube + adjustable stock
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0, 0.03f, -0.09f), new Vector3(0, 0.03f, -0.27f), 0.0155f, 0.0155f, 16);
            b.Submesh = SubTan;
            b.RoundedBox(new Vector3(0, 0.012f, -0.25f), new Vector3(0.042f, 0.075f, 0.13f), 0.012f, 3);
            b.RoundedBox(new Vector3(0, 0.045f, -0.24f), new Vector3(0.036f, 0.02f, 0.1f), 0.008f, 2);
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0, -0.005f, -0.318f), new Vector3(0.044f, 0.11f, 0.014f), 0.006f, 2); // butt pad
            // Barrel, gas block, handguard
            float barrelEnd = (att & AttachmentFlags.LongBarrel) != 0 ? 0.62f : 0.54f;
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0, 0.03f, 0.14f), new Vector3(0, 0.03f, barrelEnd), 0.0095f, 0.0085f, 16);
            b.Cylinder(new Vector3(0, 0.03f, 0.43f), new Vector3(0, 0.03f, 0.455f), 0.014f, 0.014f, 14);
            VentedHandguard(b, new Vector3(0, 0.03f, 0), 0.027f, 0.15f, 0.43f, SubTan);
            PicatinnyRail(b, new Vector3(0, 0.061f, -0.08f), 0.5f);
            PicatinnyRail(b, new Vector3(0, -0.006f, 0.25f), 0.16f, 0.018f); // bottom rail section
            // Muzzle device
            Vector3 muzzle;
            if ((att & AttachmentFlags.Suppressor) != 0)
            {
                b.Submesh = SubPolymer;
                b.Cylinder(new Vector3(0, 0.03f, barrelEnd), new Vector3(0, 0.03f, barrelEnd + 0.17f), 0.019f, 0.019f, 20);
                b.Submesh = SubMetal;
                b.Tube(new Vector3(0, 0.03f, barrelEnd + 0.17f), new Vector3(0, 0.03f, barrelEnd + 0.18f), 0.0195f, 0.005f, 20);
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.18f);
            }
            else
            {
                b.Submesh = SubMetal;
                b.Tube(new Vector3(0, 0.03f, barrelEnd), new Vector3(0, 0.03f, barrelEnd + 0.055f), 0.0125f, 0.005f, 16);
                for (int i = 0; i < 3; i++) // compensator ports
                    b.Box(new Vector3(0, 0.0425f, barrelEnd + 0.012f + i * 0.015f), Quaternion.identity, new Vector3(0.014f, 0.002f, 0.006f));
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.055f);
            }
            if ((att & AttachmentFlags.Grip) != 0)
            {
                b.Submesh = SubPolymer;
                b.Cylinder(new Vector3(0, -0.005f, 0.33f), new Vector3(0, -0.085f, 0.325f), 0.014f, 0.012f, 14);
                b.Sphere(new Vector3(0, -0.085f, 0.325f), new Vector3(0.0125f, 0.006f, 0.0125f), 4, 12);
            }
            else
            {
                b.Submesh = SubPolymer;
                b.RoundedBox(new Vector3(0, -0.012f, 0.36f), Quaternion.Euler(10, 0, 0), new Vector3(0.022f, 0.014f, 0.05f), 0.006f, 2); // handstop
            }
            m.sightPoint = HoloSight(b, new Vector3(0, 0.071f, 0.02f), out m.eyeDistance);
            m.muzzle = muzzle;
            m.ejectPort = new Vector3(0.026f, 0.04f, 0.04f);
            m.magPos = new Vector3(0, -0.06f, 0.065f);
            m.leftHand = new Vector3(0, 0.0f, 0.32f);
            m.body = b.ToMesh("MCR4_Body");
            m.mag = CurvedMag((att & AttachmentFlags.ExtMag) != 0 ? 0.2f : 0.15f, 0.024f, 0.06f, 22f, 6, (att & AttachmentFlags.ExtMag) != 0);
            return m;
        }

        static WeaponModel BuildSmg(AttachmentFlags att)
        {
            var m = new WeaponModel();
            var b = new MeshBuilder(6);
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0, 0.028f, 0.03f), new Vector3(0.046f, 0.07f, 0.25f), 0.008f, 3);
            b.Submesh = SubMetal;
            b.RoundedBox(new Vector3(0, 0.067f, 0.03f), new Vector3(0.036f, 0.012f, 0.24f), 0.004f, 2);
            b.RoundedBox(new Vector3(0.024f, 0.035f, 0.05f), new Vector3(0.003f, 0.014f, 0.04f), 0.001f, 1);
            // charging handle (side, non-reciprocating)
            b.Cylinder(new Vector3(-0.023f, 0.045f, 0.12f), new Vector3(-0.04f, 0.045f, 0.12f), 0.005f, 0.006f, 10);
            PistolGrip(b, new Vector3(0, -0.006f, -0.04f), 12f);
            // magwell (straight)
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0, -0.018f, 0.075f), new Vector3(0.034f, 0.03f, 0.04f), 0.006f, 2);
            // barrel shroud with vents
            b.Submesh = SubMetal;
            float barrelEnd = (att & AttachmentFlags.LongBarrel) != 0 ? 0.36f : 0.3f;
            b.Cylinder(new Vector3(0, 0.03f, 0.15f), new Vector3(0, 0.03f, barrelEnd), 0.008f, 0.008f, 14);
            VentedHandguard(b, new Vector3(0, 0.03f, 0), 0.021f, 0.155f, 0.26f, SubPolymer, 5);
            PicatinnyRail(b, new Vector3(0, 0.073f, -0.07f), 0.32f, 0.019f);
            // folding wire stock
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0.012f, 0.05f, -0.09f), new Vector3(0.012f, 0.04f, -0.3f), 0.004f, 0.004f, 8);
            b.Cylinder(new Vector3(-0.012f, 0.05f, -0.09f), new Vector3(-0.012f, 0.04f, -0.3f), 0.004f, 0.004f, 8);
            b.Cylinder(new Vector3(0.012f, 0.015f, -0.09f), new Vector3(0.012f, 0.03f, -0.29f), 0.004f, 0.004f, 8);
            b.Cylinder(new Vector3(-0.012f, 0.015f, -0.09f), new Vector3(-0.012f, 0.03f, -0.29f), 0.004f, 0.004f, 8);
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0, 0.03f, -0.305f), new Vector3(0.04f, 0.075f, 0.014f), 0.006f, 2);
            Vector3 muzzle;
            b.Submesh = SubMetal;
            if ((att & AttachmentFlags.Suppressor) != 0)
            {
                b.Submesh = SubPolymer;
                b.Cylinder(new Vector3(0, 0.03f, barrelEnd), new Vector3(0, 0.03f, barrelEnd + 0.15f), 0.017f, 0.017f, 20);
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.15f);
            }
            else
            {
                b.Tube(new Vector3(0, 0.03f, barrelEnd), new Vector3(0, 0.03f, barrelEnd + 0.03f), 0.011f, 0.0045f, 14);
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.03f);
            }
            if ((att & AttachmentFlags.Grip) != 0)
            {
                b.Submesh = SubPolymer;
                b.RoundedBox(new Vector3(0, -0.02f, 0.21f), Quaternion.Euler(-20, 0, 0), new Vector3(0.022f, 0.06f, 0.026f), 0.009f, 2);
            }
            m.sightPoint = HoloSight(b, new Vector3(0, 0.083f, 0.0f), out m.eyeDistance);
            m.muzzle = muzzle;
            m.ejectPort = new Vector3(0.026f, 0.035f, 0.05f);
            m.magPos = new Vector3(0, -0.03f, 0.075f);
            m.leftHand = new Vector3(0, 0.0f, 0.2f);
            m.body = b.ToMesh("Striker9_Body");
            m.mag = CurvedMag((att & AttachmentFlags.ExtMag) != 0 ? 0.24f : 0.16f, 0.022f, 0.03f, 2f, 5, (att & AttachmentFlags.ExtMag) != 0);
            return m;
        }

        static WeaponModel BuildSniper(AttachmentFlags att)
        {
            var m = new WeaponModel { scoped = true };
            var b = new MeshBuilder(6);
            // round action
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0, 0.03f, -0.06f), new Vector3(0, 0.03f, 0.2f), 0.024f, 0.024f, 24);
            b.RoundedBox(new Vector3(0.022f, 0.036f, 0.05f), new Vector3(0.004f, 0.02f, 0.07f), 0.0015f, 1);
            // chassis
            b.Submesh = SubTan;
            b.RoundedBox(new Vector3(0, -0.005f, 0.06f), new Vector3(0.056f, 0.05f, 0.42f), 0.01f, 3);
            b.RoundedBox(new Vector3(0, -0.04f, 0.07f), new Vector3(0.05f, 0.03f, 0.08f), 0.008f, 2); // mag well
            PistolGrip(b, new Vector3(0, -0.03f, -0.07f), 8f);
            // skeleton stock with cheek riser and monopod
            b.Submesh = SubTan;
            b.RoundedBox(new Vector3(0, 0.03f, -0.28f), new Vector3(0.044f, 0.024f, 0.32f), 0.008f, 2);
            b.RoundedBox(new Vector3(0, -0.04f, -0.3f), Quaternion.Euler(8, 0, 0), new Vector3(0.044f, 0.024f, 0.28f), 0.008f, 2);
            b.RoundedBox(new Vector3(0, 0.0f, -0.44f), new Vector3(0.046f, 0.15f, 0.03f), 0.01f, 3);
            b.Submesh = SubPolymer;
            b.RoundedBox(new Vector3(0, 0.054f, -0.27f), new Vector3(0.036f, 0.022f, 0.14f), 0.008f, 2);
            b.RoundedBox(new Vector3(0, 0.0f, -0.462f), new Vector3(0.05f, 0.155f, 0.016f), 0.007f, 2);
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0, -0.06f, -0.38f), new Vector3(0, -0.11f, -0.38f), 0.008f, 0.008f, 12);
            // fluted heavy barrel
            float barrelEnd = (att & AttachmentFlags.LongBarrel) != 0 ? 1.02f : 0.92f;
            b.Cylinder(new Vector3(0, 0.03f, 0.2f), new Vector3(0, 0.03f, barrelEnd), 0.016f, 0.0125f, 24);
            for (int i = 0; i < 6; i++)
            {
                float a = i * 60f;
                var rot = Quaternion.Euler(0, 0, a);
                b.Box(new Vector3(0, 0.03f, 0.55f) + rot * new Vector3(0.0145f, 0, 0), rot, new Vector3(0.0025f, 0.004f, 0.45f));
            }
            // long handguard with M-LOK slots
            b.Submesh = SubTan;
            b.RoundedBox(new Vector3(0, 0.02f, 0.4f), new Vector3(0.05f, 0.05f, 0.36f), 0.012f, 3);
            b.Submesh = SubPolymer;
            for (int i = 0; i < 5; i++)
            {
                b.RoundedBox(new Vector3(0.0252f, 0.02f, 0.28f + i * 0.06f), new Vector3(0.002f, 0.012f, 0.035f), 0.0008f, 1);
                b.RoundedBox(new Vector3(-0.0252f, 0.02f, 0.28f + i * 0.06f), new Vector3(0.002f, 0.012f, 0.035f), 0.0008f, 1);
            }
            PicatinnyRail(b, new Vector3(0, 0.054f, -0.08f), 0.32f);
            // folded bipod
            b.Submesh = SubMetal;
            b.Cylinder(new Vector3(0.012f, -0.012f, 0.56f), new Vector3(0.012f, -0.02f, 0.36f), 0.005f, 0.005f, 10);
            b.Cylinder(new Vector3(-0.012f, -0.012f, 0.56f), new Vector3(-0.012f, -0.02f, 0.36f), 0.005f, 0.005f, 10);
            // muzzle brake or suppressor
            Vector3 muzzle;
            if ((att & AttachmentFlags.Suppressor) != 0)
            {
                b.Submesh = SubPolymer;
                b.Cylinder(new Vector3(0, 0.03f, barrelEnd), new Vector3(0, 0.03f, barrelEnd + 0.22f), 0.024f, 0.024f, 22);
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.22f);
            }
            else
            {
                b.Submesh = SubMetal;
                b.RoundedBox(new Vector3(0, 0.03f, barrelEnd + 0.04f), new Vector3(0.042f, 0.032f, 0.08f), 0.006f, 2);
                for (int i = 0; i < 3; i++)
                {
                    b.Submesh = SubPolymer;
                    b.Box(new Vector3(0.0215f, 0.03f, barrelEnd + 0.015f + i * 0.022f), Quaternion.identity, new Vector3(0.002f, 0.02f, 0.012f));
                    b.Box(new Vector3(-0.0215f, 0.03f, barrelEnd + 0.015f + i * 0.022f), Quaternion.identity, new Vector3(0.002f, 0.02f, 0.012f));
                }
                muzzle = new Vector3(0, 0.03f, barrelEnd + 0.08f);
            }
            m.sightPoint = Scope(b, new Vector3(0, 0.064f, 0.04f), out m.eyeDistance);
            m.muzzle = muzzle;
            m.ejectPort = new Vector3(0.026f, 0.036f, 0.05f);
            m.magPos = new Vector3(0, -0.055f, 0.07f);
            m.boltPos = new Vector3(0.026f, 0.03f, -0.03f);
            m.leftHand = new Vector3(0, -0.01f, 0.35f);
            m.body = b.ToMesh("KATT_Body");

            var mb = new MeshBuilder(6) { Submesh = SubPolymer };
            mb.RoundedBox(new Vector3(0, -0.03f, 0), new Vector3(0.036f, 0.06f, 0.075f), 0.006f, 2);
            mb.Submesh = SubMetal;
            mb.RoundedBox(new Vector3(0, -0.062f, 0), new Vector3(0.04f, 0.008f, 0.08f), 0.003f, 1);
            m.mag = mb.ToMesh("KATT_Mag");

            var bb = new MeshBuilder(6) { Submesh = SubMetal };
            bb.Cylinder(Vector3.zero, new Vector3(0.035f, -0.012f, 0), 0.004f, 0.004f, 10);
            bb.Sphere(new Vector3(0.04f, -0.014f, 0), Vector3.one * 0.009f, 8, 12);
            m.bolt = bb.ToMesh("KATT_Bolt");
            return m;
        }

        // =====================================================================
        // Foliage (vertex colour R = wind weight, G = phase)
        // =====================================================================

        public static Mesh BroadleafTree(int seed)
        {
            var rnd = new System.Random(seed);
            float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);
            var b = new MeshBuilder(2) { Submesh = 0 };
            float H = R(7f, 10f);
            // trunk with gentle S-bend
            var trunk = new List<Vector3>(); var tr = new List<float>(); var tw = new List<float>();
            Vector2 lean = new Vector2(R(-0.4f, 0.4f), R(-0.4f, 0.4f));
            for (int i = 0; i <= 6; i++)
            {
                float t = i / 6f;
                float bend = Mathf.Sin(t * Mathf.PI * 1.3f) * 0.35f;
                trunk.Add(new Vector3(lean.x * t * t + bend * 0.3f, t * H, lean.y * t * t + bend * 0.2f));
                tr.Add(Mathf.Lerp(0.32f, 0.07f, Mathf.Pow(t, 0.8f)) * (i == 0 ? 1.35f : 1f));
                tw.Add(Mathf.Pow(t, 1.6f) * 0.25f);
            }
            b.VertexColor = new Color(0, R(0, 1), 0, 1);
            b.TubePath(trunk, tr, 10, true, tw);
            // root flares
            for (int i = 0; i < 5; i++)
            {
                float a = i * Mathf.PI * 2f / 5f + R(-0.3f, 0.3f);
                var dir = new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a));
                b.TubePath(new[] { dir * 0.1f + Vector3.up * 0.5f, dir * 0.45f + Vector3.up * 0.1f, dir * 0.7f - Vector3.up * 0.05f },
                           new[] { 0.14f, 0.08f, 0.03f }, 6, false);
            }
            int branches = rnd.Next(6, 9);
            float golden = 2.39996f;
            for (int i = 0; i < branches; i++)
            {
                float t = Mathf.Lerp(0.42f, 0.86f, i / (float)(branches - 1));
                Vector3 origin = SamplePath(trunk, t);
                float az = i * golden + R(-0.2f, 0.2f);
                float elev = R(30f, 55f) * Mathf.Deg2Rad;
                float len = R(2.0f, 3.4f) * (1.1f - t * 0.5f);
                Vector3 dir = new Vector3(Mathf.Cos(az) * Mathf.Cos(elev), Mathf.Sin(elev), Mathf.Sin(az) * Mathf.Cos(elev));
                var pts = new List<Vector3>(); var rad = new List<float>(); var ww = new List<float>();
                for (int k = 0; k <= 4; k++)
                {
                    float u = k / 4f;
                    pts.Add(origin + dir * len * u + Vector3.down * (u * u * 0.6f));
                    rad.Add(Mathf.Lerp(0.1f, 0.025f, u));
                    ww.Add(Mathf.Lerp(0.3f, 0.8f, u));
                }
                b.VertexColor = new Color(0, R(0, 1), 0, 1);
                b.TubePath(pts, rad, 6, true, ww);
                // tier-2 twigs
                int twigs = rnd.Next(2, 4);
                for (int k = 0; k < twigs; k++)
                {
                    float u = R(0.45f, 0.85f);
                    Vector3 o = SamplePath(pts, u);
                    Vector3 td = (dir + new Vector3(R(-0.8f, 0.8f), R(0.1f, 0.6f), R(-0.8f, 0.8f))).normalized;
                    float tl = R(0.9f, 1.5f);
                    b.TubePath(new[] { o, o + td * tl * 0.5f, o + td * tl + Vector3.down * 0.15f }, new[] { 0.035f, 0.022f, 0.01f }, 5, true, new[] { 0.7f, 0.85f, 0.95f });
                    LeafCluster(b, o + td * tl, R(0.8f, 1.2f), rnd.Next());
                }
                LeafCluster(b, pts[pts.Count - 1], R(1.1f, 1.6f), rnd.Next());
            }
            LeafCluster(b, trunk[trunk.Count - 1] + Vector3.up * 0.6f, R(1.6f, 2.1f), rnd.Next());
            return b.ToMesh("Tree_Broadleaf_" + seed, true);
        }

        public static Mesh ConiferTree(int seed)
        {
            var rnd = new System.Random(seed);
            float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);
            var b = new MeshBuilder(2) { Submesh = 0 };
            float H = R(11f, 15f);
            var trunk = new List<Vector3>(); var tr = new List<float>(); var tw = new List<float>();
            for (int i = 0; i <= 6; i++)
            {
                float t = i / 6f;
                trunk.Add(new Vector3(Mathf.Sin(t * 3f) * 0.08f, t * H, 0));
                tr.Add(Mathf.Lerp(0.3f, 0.03f, t));
                tw.Add(t * t * 0.3f);
            }
            b.TubePath(trunk, tr, 9, true, tw);
            int tiers = 7;
            for (int tier = 0; tier < tiers; tier++)
            {
                float t = Mathf.Lerp(0.22f, 0.92f, tier / (float)(tiers - 1));
                float reach = Mathf.Lerp(3.0f, 0.8f, t);
                int arms = tier < 5 ? 7 : 5;
                Vector3 o = SamplePath(trunk, t);
                for (int a = 0; a < arms; a++)
                {
                    float az = a * Mathf.PI * 2f / arms + tier * 0.45f + R(-0.15f, 0.15f);
                    Vector3 d = new Vector3(Mathf.Cos(az), 0, Mathf.Sin(az));
                    Vector3 end = o + d * reach + Vector3.down * reach * 0.35f;
                    Vector3 mid = o + d * reach * 0.5f + Vector3.up * 0.1f;
                    b.Submesh = 0;
                    b.VertexColor = new Color(0, R(0, 1), 0, 1);
                    b.TubePath(new[] { o, mid, end }, new[] { 0.06f, 0.035f, 0.012f }, 5, true, new[] { 0.3f, 0.6f, 0.9f });
                    // needle mat: flattened, drooping ellipsoid along the arm
                    b.Submesh = 1;
                    b.VertexColor = new Color(0.9f, R(0, 1), 0, 1);
                    var rot = Quaternion.LookRotation((end - o).normalized, Vector3.up);
                    b.Push((o + end) * 0.5f + Vector3.down * 0.05f, rot);
                    b.Sphere(Vector3.zero, new Vector3(reach * 0.32f, 0.22f, reach * 0.58f), 5, 8, 0.18f, rnd.Next(1000));
                    b.Pop();
                }
            }
            b.Submesh = 1;
            b.VertexColor = new Color(1f, R(0, 1), 0, 1);
            b.Sphere(trunk[trunk.Count - 1], new Vector3(0.45f, 1.2f, 0.45f), 6, 8, 0.15f, seed);
            return b.ToMesh("Tree_Conifer_" + seed, true);
        }

        public static Mesh Bush(int seed)
        {
            var rnd = new System.Random(seed);
            float R(float a, float b) => a + (float)rnd.NextDouble() * (b - a);
            var b = new MeshBuilder(2);
            int clusters = rnd.Next(4, 7);
            for (int i = 0; i < clusters; i++)
            {
                Vector3 p = new Vector3(R(-0.8f, 0.8f), R(0.3f, 0.8f), R(-0.8f, 0.8f));
                b.Submesh = 0;
                b.VertexColor = new Color(0.2f, R(0, 1), 0, 1);
                b.TubePath(new[] { Vector3.zero, p * 0.6f, p }, new[] { 0.04f, 0.025f, 0.01f }, 5, false, new[] { 0f, 0.3f, 0.6f });
                LeafCluster(b, p, R(0.5f, 0.8f), rnd.Next());
            }
            return b.ToMesh("Bush_" + seed, true);
        }

        static void LeafCluster(MeshBuilder b, Vector3 center, float size, int seed)
        {
            int prevSub = b.Submesh;
            var prevCol = b.VertexColor;
            b.Submesh = 1;
            var rnd = new System.Random(seed);
            float phase = (float)rnd.NextDouble();
            b.VertexColor = new Color(1f, phase, 0, 1);
            // 3 overlapping lumpy lobes read as a dense cluster, not a ball
            for (int i = 0; i < 3; i++)
            {
                Vector3 off = new Vector3((float)rnd.NextDouble() - 0.5f, ((float)rnd.NextDouble() - 0.3f) * 0.6f, (float)rnd.NextDouble() - 0.5f) * size * 0.7f;
                Vector3 radii = new Vector3(size * (0.7f + (float)rnd.NextDouble() * 0.3f), size * (0.5f + (float)rnd.NextDouble() * 0.2f), size * (0.7f + (float)rnd.NextDouble() * 0.3f));
                b.Sphere(center + off, radii, 6, 9, 0.28f, seed + i * 13);
            }
            b.Submesh = prevSub;
            b.VertexColor = prevCol;
        }

        static Vector3 SamplePath(IList<Vector3> pts, float t)
        {
            float f = Mathf.Clamp01(t) * (pts.Count - 1);
            int i = Mathf.Min(Mathf.FloorToInt(f), pts.Count - 2);
            return Vector3.Lerp(pts[i], pts[i + 1], f - i);
        }
    }
}
