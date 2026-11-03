using UnityEngine;
using UnityEngine.Rendering;

namespace Stormfall
{
    public enum Mat
    {
        GunMetal, GunPolymer, GunTan, OpticGlass, ReticleRed, Brass, ScopeLens,
        Concrete, ConcreteDark, Asphalt, ContainerRed, ContainerBlue, ContainerGreen, SheetMetal,
        Wood, Roof, WindowGlass, Bark, LeavesA, LeavesB, Rock, Sand,
        BotCamo, BotSkin, BotGear, BotVisor, ArmorCell,
        CacheBlue, CacheOrange, CacheTrim, TerminalBody, TerminalScreen, TabletYellow,
        BlightWall, Water, AircraftBody, ParachuteFabric, DroneBody, DroneEye, PodShell, BeaconRed,
        FxTracer, FxMuzzle, FxSpark, FxSmoke, FxGlint, FxBeam, FxSteam, FxDust, FxBlight,
        DecalBulletHole, DecalScorch, Hazard, OrbitalBeam, RunwayPaint
    }

    /// <summary>
    /// Every material in the game. Uses only "Universal Render Pipeline/Lit" and
    /// "Universal Render Pipeline/Particles/Unlit". Prefers the builder-saved assets registered in
    /// <see cref="StormfallAssets"/> and creates them in memory otherwise.
    /// </summary>
    public static class MaterialLibrary
    {
        public const string LitShader = "Universal Render Pipeline/Lit";
        public const string ParticleShader = "Universal Render Pipeline/Particles/Unlit";

        static Material[] s_Runtime;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Runtime = null;

        public static Material Get(Mat id)
        {
            var assets = StormfallAssets.Instance;
            if (assets != null && assets.materials != null && (int)id < assets.materials.Length && assets.materials[(int)id] != null)
                return assets.materials[(int)id];
            if (s_Runtime == null) s_Runtime = new Material[System.Enum.GetValues(typeof(Mat)).Length];
            if (s_Runtime[(int)id] == null) s_Runtime[(int)id] = Create(id);
            return s_Runtime[(int)id];
        }

        public static Material Create(Mat id)
        {
            Material m;
            switch (id)
            {
                // Weapon metals: metallic 0.85 / smoothness 0.75 per spec.
                case Mat.GunMetal: m = Lit(new Color(0.16f, 0.17f, 0.18f), 0.85f, 0.75f); break;
                case Mat.GunPolymer: m = Lit(new Color(0.09f, 0.09f, 0.095f), 0.0f, 0.28f, null, TextureFactory.KnurlPolymer()); break;
                case Mat.GunTan: m = Lit(new Color(0.55f, 0.47f, 0.34f), 0.05f, 0.32f, null, TextureFactory.KnurlPolymer()); break;
                case Mat.OpticGlass: m = Transparent(Lit(new Color(0.35f, 0.55f, 0.6f, 0.18f), 0.2f, 0.98f, new Color(0.02f, 0.05f, 0.06f))); break;
                case Mat.ReticleRed: m = Lit(new Color(1f, 0.1f, 0.06f), 0f, 0.5f, new Color(1f, 0.05f, 0.02f) * 9f); break;
                case Mat.ScopeLens: m = Lit(new Color(0.02f, 0.05f, 0.08f), 0.4f, 0.98f, new Color(0.0f, 0.04f, 0.08f)); break;
                case Mat.Brass: m = Lit(new Color(0.78f, 0.6f, 0.26f), 0.9f, 0.7f); break;

                case Mat.Concrete: m = Lit(new Color(0.72f, 0.71f, 0.68f), 0f, 0.12f, null, TextureFactory.Concrete(), 0.25f); break;
                case Mat.ConcreteDark: m = Lit(new Color(0.42f, 0.42f, 0.41f), 0f, 0.1f, null, TextureFactory.Concrete(), 0.25f); break;
                case Mat.Asphalt: m = Lit(new Color(0.2f, 0.2f, 0.21f), 0f, 0.18f, null, TextureFactory.Grime("asphalt", new Color(0.6f, 0.6f, 0.62f), Color.white, 16, 5, 1.6f), 0.05f); break;
                case Mat.RunwayPaint: m = Lit(new Color(0.92f, 0.9f, 0.82f), 0f, 0.25f); break;
                case Mat.ContainerRed: m = Lit(new Color(0.55f, 0.16f, 0.11f), 0.55f, 0.35f, null, TextureFactory.Corrugated()); break;
                case Mat.ContainerBlue: m = Lit(new Color(0.12f, 0.26f, 0.45f), 0.55f, 0.35f, null, TextureFactory.Corrugated()); break;
                case Mat.ContainerGreen: m = Lit(new Color(0.18f, 0.34f, 0.2f), 0.55f, 0.35f, null, TextureFactory.Corrugated()); break;
                case Mat.SheetMetal: m = Lit(new Color(0.6f, 0.62f, 0.63f), 0.7f, 0.4f, null, TextureFactory.Corrugated()); break;
                case Mat.Wood: m = Lit(new Color(0.48f, 0.34f, 0.22f), 0f, 0.25f, null, TextureFactory.Grime("wood", new Color(0.75f, 0.7f, 0.65f), Color.white, 4, 9, 2f)); break;
                case Mat.Roof: m = Lit(new Color(0.32f, 0.2f, 0.17f), 0.1f, 0.3f, null, TextureFactory.Corrugated()); break;
                case Mat.WindowGlass: m = Transparent(Lit(new Color(0.55f, 0.7f, 0.75f, 0.28f), 0.1f, 0.95f)); break;
                case Mat.Hazard: m = Lit(new Color(0.95f, 0.72f, 0.08f), 0.2f, 0.4f); break;

                case Mat.Bark: m = Lit(Color.white, 0f, 0.1f, null, TextureFactory.Bark()); break;
                case Mat.LeavesA: m = Lit(new Color(0.2f, 0.36f, 0.14f), 0f, 0.22f, null, TextureFactory.Grime("leafA", new Color(0.75f, 0.8f, 0.7f), Color.white, 8, 15, 1.4f)); break;
                case Mat.LeavesB: m = Lit(new Color(0.3f, 0.4f, 0.16f), 0f, 0.22f, null, TextureFactory.Grime("leafB", new Color(0.75f, 0.8f, 0.7f), Color.white, 8, 16, 1.4f)); break;
                case Mat.Rock: m = Lit(new Color(0.52f, 0.5f, 0.47f), 0f, 0.15f, null, TextureFactory.Terrain("Rock")); break;
                case Mat.Sand: m = Lit(Color.white, 0f, 0.1f, null, TextureFactory.Terrain("Sand")); break;

                case Mat.BotCamo: m = Lit(Color.white, 0f, 0.25f, null, TextureFactory.Camo()); break;
                case Mat.BotSkin: m = Lit(new Color(0.62f, 0.47f, 0.38f), 0f, 0.35f); break;
                case Mat.BotGear: m = Lit(new Color(0.12f, 0.13f, 0.12f), 0.3f, 0.35f); break;
                case Mat.BotVisor: m = Lit(new Color(0.05f, 0.05f, 0.06f), 0.9f, 0.95f, new Color(0.25f, 0.02f, 0.02f)); break;
                case Mat.ArmorCell: m = Lit(new Color(0.15f, 0.65f, 0.75f), 0.6f, 0.7f, new Color(0.1f, 0.9f, 1f) * 2.2f); break;

                case Mat.CacheBlue: m = Lit(new Color(0.12f, 0.3f, 0.62f), 0.6f, 0.5f); break;
                case Mat.CacheOrange: m = Lit(new Color(0.85f, 0.42f, 0.08f), 0.6f, 0.5f); break;
                case Mat.CacheTrim: m = Lit(new Color(0.85f, 0.85f, 0.8f), 0.9f, 0.6f, new Color(0.6f, 0.8f, 1f) * 1.5f); break;
                case Mat.TerminalBody: m = Lit(new Color(0.2f, 0.22f, 0.24f), 0.8f, 0.55f); break;
                case Mat.TerminalScreen: m = Lit(new Color(0.1f, 0.6f, 0.4f), 0f, 0.9f, new Color(0.15f, 1f, 0.6f) * 2.5f); break;
                case Mat.TabletYellow: m = Lit(new Color(1f, 0.82f, 0.1f), 0.2f, 0.6f, new Color(1f, 0.75f, 0.05f) * 2.5f); break;
                case Mat.BeaconRed: m = Lit(new Color(1f, 0.15f, 0.1f), 0f, 0.6f, new Color(1f, 0.1f, 0.05f) * 6f); break;

                case Mat.BlightWall:
                    m = Transparent(Lit(new Color(0.62f, 0.78f, 0.12f, 0.42f), 0f, 0.4f, new Color(0.45f, 0.62f, 0.05f) * 1.6f, TextureFactory.Noise()), true);
                    m.SetTextureScale("_BaseMap", new Vector2(24f, 3f));
                    break;
                case Mat.Water:
                    m = Transparent(Lit(new Color(0.08f, 0.32f, 0.42f, 0.78f), 0.1f, 0.94f, null, TextureFactory.WaterNoise()));
                    m.SetTextureScale("_BaseMap", new Vector2(60f, 60f));
                    break;
                case Mat.AircraftBody: m = Lit(new Color(0.36f, 0.39f, 0.36f), 0.6f, 0.45f, null, TextureFactory.Grime("hull", new Color(0.8f, 0.8f, 0.8f), Color.white, 8, 91, 1.5f)); break;
                case Mat.ParachuteFabric: m = Lit(new Color(0.85f, 0.42f, 0.12f), 0f, 0.2f); m.SetFloat("_Cull", 0f); break;
                case Mat.DroneBody: m = Lit(new Color(0.85f, 0.86f, 0.88f), 0.8f, 0.65f); break;
                case Mat.DroneEye: m = Lit(new Color(1f, 0.2f, 0.1f), 0f, 0.8f, new Color(1f, 0.15f, 0.05f) * 8f); break;
                case Mat.PodShell: m = Lit(new Color(0.18f, 0.2f, 0.22f), 0.85f, 0.6f, new Color(0.9f, 0.6f, 0.1f) * 0.3f); break;

                case Mat.FxTracer: m = Particle(new Color(1f, 0.78f, 0.45f, 1f), 2, TextureFactory.SoftCircle()); break;
                case Mat.FxMuzzle: m = Particle(new Color(1f, 0.7f, 0.35f, 1f), 2, TextureFactory.SoftCircle()); break;
                case Mat.FxSpark: m = Particle(new Color(1f, 0.8f, 0.5f, 1f), 2, TextureFactory.SoftCircle()); break;
                case Mat.FxGlint: m = Particle(new Color(1f, 1f, 1f, 1f), 2, TextureFactory.SoftCircle()); break;
                case Mat.FxBeam: m = Particle(new Color(1f, 1f, 1f, 0.6f), 2, TextureFactory.SoftCircle()); break;
                case Mat.OrbitalBeam: m = Particle(new Color(0.6f, 0.85f, 1f, 1f), 2, TextureFactory.SoftCircle()); break;
                case Mat.FxSmoke: m = Particle(new Color(0.55f, 0.55f, 0.55f, 0.55f), 0, TextureFactory.SoftCircle()); break;
                case Mat.FxSteam: m = Particle(new Color(0.9f, 0.92f, 0.95f, 0.35f), 0, TextureFactory.SoftCircle()); break;
                case Mat.FxDust: m = Particle(new Color(0.65f, 0.58f, 0.45f, 0.45f), 0, TextureFactory.SoftCircle()); break;
                case Mat.FxBlight: m = Particle(new Color(0.7f, 0.85f, 0.2f, 0.35f), 0, TextureFactory.SoftCircle()); break;

                case Mat.DecalBulletHole: m = Transparent(Lit(Color.white, 0f, 0.2f, null, TextureFactory.BulletHole())); break;
                case Mat.DecalScorch: m = Transparent(Lit(Color.white, 0f, 0.1f, null, TextureFactory.Scorch())); break;
                default: m = Lit(Color.magenta * 0.5f, 0, 0.5f); break;
            }
            m.name = "SF_" + id;
            return m;
        }

        public static Material Lit(Color c, float metallic, float smoothness, Color? emission = null, Texture2D tex = null, float bumpless = 0f)
        {
            var shader = Shader.Find(LitShader);
            var m = new Material(shader) { enableInstancing = true };
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Metallic", metallic);
            m.SetFloat("_Smoothness", smoothness);
            m.SetFloat("_EnvironmentReflections", 1f);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            if (emission.HasValue)
            {
                m.EnableKeyword("_EMISSION");
                m.SetColor("_EmissionColor", emission.Value);
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
            }
            return m;
        }

        public static Material Transparent(Material m, bool doubleSided = false)
        {
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_ZWrite", 0f);
            m.SetFloat("_Cull", doubleSided ? 0f : 2f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.SetOverrideTag("RenderType", "Transparent");
            m.SetShaderPassEnabled("DepthOnly", false);
            m.SetShaderPassEnabled("ShadowCaster", false);
            m.renderQueue = (int)RenderQueue.Transparent;
            return m;
        }

        /// <summary>blend: 0 alpha, 2 additive.</summary>
        public static Material Particle(Color c, int blend, Texture2D tex)
        {
            var m = new Material(Shader.Find(ParticleShader));
            m.SetTexture("_BaseMap", tex);
            m.SetColor("_BaseColor", c);
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_Blend", blend);
            m.SetFloat("_ZWrite", 0f);
            m.SetFloat("_Cull", 0f);
            m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", blend == 2 ? (float)BlendMode.One : (float)BlendMode.OneMinusSrcAlpha);
            m.SetFloat("_SrcBlendAlpha", blend == 2 ? (float)BlendMode.Zero : (float)BlendMode.One);
            m.SetFloat("_DstBlendAlpha", (float)BlendMode.One);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.SetOverrideTag("RenderType", "Transparent");
            m.renderQueue = (int)RenderQueue.Transparent + 10;
            return m;
        }

        /// <summary>Per-instance colour without breaking batching.</summary>
        public static void Tint(Renderer r, Color c, Color? emission = null)
        {
            var mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(mpb);
            mpb.SetColor("_BaseColor", c);
            if (emission.HasValue) mpb.SetColor("_EmissionColor", emission.Value);
            r.SetPropertyBlock(mpb);
        }
    }
}
