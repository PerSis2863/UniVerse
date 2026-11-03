using System.Collections.Generic;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace Stormfall.EditorTools
{
    /// <summary>
    /// Tools → Build Complete Stormfall Game.
    /// Generates and wires every asset (URP materials, meshes, weapon ScriptableObjects, terrain,
    /// volume profile, lens flare) and builds the playable scene: lighting, island terrain, the
    /// 3-lane Kestrel Airfield arena, named POIs with buildings/doors/roofs, cover, foliage,
    /// supply terminals, field-ops tablets, caches, updraft vents, the Reboot Trial chamber,
    /// bot squads, the player rig, the infil aircraft, managers and the HUD canvas.
    /// </summary>
    public static class StormfallSceneSetup
    {
        const string Root = "Assets/Stormfall";
        const string Gen = Root + "/Generated";
        const string ScenePath = Root + "/Scenes/Stormfall.unity";

        static readonly Dictionary<string, Mesh> s_Meshes = new Dictionary<string, Mesh>();
        static System.Random R;
        static Terrain s_Terrain;
        static Transform s_World, s_Props, s_Loot;
        static readonly List<Mesh> s_FoliageMeshes = new List<Mesh>();
        static int s_TabletCycle;

        struct Poi { public string name; public Vector2 pos; public float radius, padHeight, flatRadius; }

        static readonly Poi[] Pois =
        {
            new Poi { name = "Kestrel Airfield", pos = new Vector2(0, 0), radius = 150, padHeight = 16, flatRadius = 165 },
            new Poi { name = "Saltworks", pos = new Vector2(230, -220), radius = 70, padHeight = 11, flatRadius = 75 },
            new Poi { name = "Radar Ridge", pos = new Vector2(-20, 285), radius = 60, padHeight = 56, flatRadius = 55 },
            new Poi { name = "Old Harbor", pos = new Vector2(-300, 30), radius = 75, padHeight = 10.5f, flatRadius = 70 },
            new Poi { name = "Pinecrest", pos = new Vector2(240, 205), radius = 70, padHeight = 26, flatRadius = 65 },
            new Poi { name = "Quarry", pos = new Vector2(-235, -225), radius = 70, padHeight = 20, flatRadius = 70 },
            new Poi { name = "Lighthouse Point", pos = new Vector2(340, -30), radius = 55, padHeight = 15, flatRadius = 50 },
            new Poi { name = "Marrow Village", pos = new Vector2(20, -275), radius = 70, padHeight = 13, flatRadius = 70 },
        };

        [MenuItem("Tools/Build Complete Stormfall Game", priority = 0)]
        public static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            R = new System.Random(20261031);
            s_Meshes.Clear();
            s_FoliageMeshes.Clear();
            s_TabletCycle = 0;
            try
            {
                Progress("Preparing folders", 0.02f);
                PrepareFolders();
                ConfigureProject();
                Progress("Generating URP materials", 0.06f);
                var materials = BuildMaterials();
                Progress("Creating weapon ScriptableObjects", 0.1f);
                var weapons = BuildWeapons();
                BuildRegistry(materials, weapons);

                Progress("Creating scene", 0.12f);
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                s_World = new GameObject("World").transform;
                s_Props = new GameObject("Props").transform;
                s_Loot = new GameObject("Loot & Economy").transform;

                Progress("Lighting & post-processing", 0.15f);
                BuildLighting();
                BuildVolume();
                Progress("Sculpting Kaldera Isle terrain", 0.2f);
                BuildTerrain();
                BuildWater();
                Progress("Building Kestrel Airfield (3-lane arena)", 0.4f);
                BuildAirfield();
                Progress("Building points of interest", 0.5f);
                BuildPointsOfInterest();
                Progress("Planting foliage & rocks", 0.65f);
                BuildFoliage();
                Progress("Building the Reboot Trial chamber", 0.75f);
                var trial = BuildRebootArena();
                Progress("Player rig, aircraft & bots", 0.8f);
                BuildPlayer();
                var aircraft = BuildAircraft();
                BuildBots();
                Progress("Managers & HUD", 0.9f);
                BuildManagers(aircraft, trial);
                BuildHud();

                Progress("Saving scene", 0.97f);
                var scene = SceneManager.GetActiveScene();
                EditorSceneManager.MarkSceneDirty(scene);
                EditorSceneManager.SaveScene(scene, ScenePath);
                var scenes = EditorBuildSettings.scenes.Where(s => s.path != ScenePath).ToList();
                scenes.Insert(0, new EditorBuildSettingsScene(ScenePath, true));
                EditorBuildSettings.scenes = scenes.ToArray();
                AssetDatabase.SaveAssets();
                Debug.Log("[Stormfall] Build complete → " + ScenePath + ". Press Play to deploy.");
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        static void Progress(string msg, float t) => EditorUtility.DisplayProgressBar("Building STORMFALL", msg, t);

        // =====================================================================
        // Assets
        // =====================================================================

        static void PrepareFolders()
        {
            if (AssetDatabase.IsValidFolder(Gen)) AssetDatabase.DeleteAsset(Gen);
            foreach (var f in new[] { Root, Gen, Gen + "/Materials", Gen + "/Meshes", Gen + "/Terrain", Gen + "/Weapons", Gen + "/Settings", Root + "/Scenes", Root + "/Resources" })
            {
                if (AssetDatabase.IsValidFolder(f)) continue;
                int slash = f.LastIndexOf('/');
                AssetDatabase.CreateFolder(f.Substring(0, slash), f.Substring(slash + 1));
            }
        }

        static void ConfigureProject()
        {
            // Active Input Handling = Both, so the Input System and legacy fallback both work.
            var settings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset");
            if (settings != null && settings.Length > 0)
            {
                var so = new SerializedObject(settings[0]);
                var p = so.FindProperty("activeInputHandler");
                if (p != null && p.intValue != 2)
                {
                    p.intValue = 2;
                    so.ApplyModifiedProperties();
                    Debug.LogWarning("[Stormfall] Active Input Handling set to 'Both'. Restart the editor once for it to take effect.");
                }
            }
            PlayerSettings.colorSpace = ColorSpace.Linear;

            foreach (var rp in new[] { GraphicsSettings.defaultRenderPipeline, QualitySettings.renderPipeline })
            {
                if (!(rp is UniversalRenderPipelineAsset urp)) continue;
                urp.shadowDistance = 350f;
                urp.shadowCascadeCount = 4;
                var so = new SerializedObject(urp);
                var soft = so.FindProperty("m_SoftShadowsSupported");
                if (soft != null) soft.boolValue = true;
                var hdr = so.FindProperty("m_SupportsHDR");
                if (hdr != null) hdr.boolValue = true;
                so.ApplyModifiedProperties();
                EnsureSsao(so);
                EditorUtility.SetDirty(urp);
            }
        }

        static void EnsureSsao(SerializedObject pipeline)
        {
            var list = pipeline.FindProperty("m_RendererDataList");
            if (list == null) return;
            for (int i = 0; i < list.arraySize; i++)
            {
                if (!(list.GetArrayElementAtIndex(i).objectReferenceValue is ScriptableRendererData data)) continue;
                if (data.rendererFeatures.Any(f => f is ScreenSpaceAmbientOcclusion)) continue;
                var ssao = ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();
                ssao.name = "ScreenSpaceAmbientOcclusion";
                AssetDatabase.AddObjectToAsset(ssao, data);
                data.rendererFeatures.Add(ssao);
                var so = new SerializedObject(data);
                var map = so.FindProperty("m_RendererFeatureMap");
                if (map != null && AssetDatabase.TryGetGUIDAndLocalFileIdentifier(ssao, out _, out long id))
                {
                    map.arraySize++;
                    map.GetArrayElementAtIndex(map.arraySize - 1).longValue = id;
                    so.ApplyModifiedProperties();
                }
                data.SetDirty();
                EditorUtility.SetDirty(data);
            }
        }

        static Material[] BuildMaterials()
        {
            var ids = (Mat[])System.Enum.GetValues(typeof(Mat));
            var mats = new Material[ids.Length];
            foreach (var id in ids)
            {
                var m = MaterialLibrary.Create(id);
                string path = $"{Gen}/Materials/{m.name}.mat";
                AssetDatabase.CreateAsset(m, path);
                foreach (var prop in m.GetTexturePropertyNames())
                {
                    var tex = m.GetTexture(prop) as Texture2D;
                    if (tex != null && !AssetDatabase.Contains(tex)) AssetDatabase.AddObjectToAsset(tex, m);
                }
                mats[(int)id] = m;
            }
            return mats;
        }

        static WeaponData[] BuildWeapons()
        {
            var defs = WeaponData.CreateDefaults();
            foreach (var w in defs) AssetDatabase.CreateAsset(w, $"{Gen}/Weapons/{w.name}.asset");
            return defs;
        }

        static void BuildRegistry(Material[] mats, WeaponData[] weapons)
        {
            const string path = Root + "/Resources/StormfallAssets.asset";
            var reg = AssetDatabase.LoadAssetAtPath<StormfallAssets>(path);
            if (reg == null)
            {
                reg = ScriptableObject.CreateInstance<StormfallAssets>();
                AssetDatabase.CreateAsset(reg, path);
            }
            reg.materials = mats;
            reg.weapons = weapons;
            EditorUtility.SetDirty(reg);
            StormfallAssets.SetInstance(reg);
        }

        static Mesh SaveMesh(Mesh m, string name = null)
        {
            name = name ?? m.name;
            if (s_Meshes.TryGetValue(name, out var existing)) return existing;
            m.name = name;
            AssetDatabase.CreateAsset(m, $"{Gen}/Meshes/{name}.asset");
            s_Meshes[name] = m;
            return m;
        }

        static Mesh CachedMesh(string name, System.Func<Mesh> make) =>
            s_Meshes.TryGetValue(name, out var m) ? m : SaveMesh(make(), name);

        // =====================================================================
        // Scene helpers
        // =====================================================================

        enum Col { None, Box, Mesh, Capsule }

        static GameObject Obj(string name, Transform parent, Vector3 pos, Quaternion rot)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.SetPositionAndRotation(pos, rot);
            return go;
        }

        static GameObject MeshObj(string name, Transform parent, Mesh mesh, Mat[] mats, Vector3 pos, Quaternion rot, Col col = Col.None, bool isStatic = true, Vector3? scale = null)
        {
            var go = Obj(name, parent, pos, rot);
            if (scale.HasValue) go.transform.localScale = scale.Value;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            var arr = new Material[Mathf.Max(1, mesh.subMeshCount)];
            for (int i = 0; i < arr.Length; i++) arr[i] = MaterialLibrary.Get(mats[Mathf.Min(i, mats.Length - 1)]);
            mr.sharedMaterials = arr;
            switch (col)
            {
                case Col.Box: go.AddComponent<BoxCollider>(); break;
                case Col.Mesh: go.AddComponent<MeshCollider>().sharedMesh = mesh; break;
                case Col.Capsule: go.AddComponent<CapsuleCollider>(); break;
            }
            if (isStatic) GameObjectUtility.SetStaticEditorFlags(go, StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccludeeStatic | StaticEditorFlags.OccluderStatic);
            return go;
        }

        static float Ground(float x, float z) => s_Terrain.SampleHeight(new Vector3(x, 0, z)) + s_Terrain.transform.position.y;
        static Vector3 OnGround(float x, float z, float lift = 0f) => new Vector3(x, Ground(x, z) + lift, z);
        static float Rf(float a, float b) => a + (float)R.NextDouble() * (b - a);

        // =====================================================================
        // Lighting & post
        // =====================================================================

        static void BuildLighting()
        {
            var sunGo = new GameObject("Sun");
            sunGo.transform.rotation = Quaternion.Euler(38f, -40f, 0f);
            var sun = sunGo.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.94f, 0.84f);
            sun.intensity = 1.6f;
            sun.shadows = LightShadows.Soft;
            sun.shadowStrength = 0.85f;
            sun.shadowNormalBias = 0.4f;
            RenderSettings.sun = sun;

            var flare = ScriptableObject.CreateInstance<LensFlareDataSRP>();
            flare.elements = new[]
            {
                FlareElement(SRPLensFlareType.Circle, new Color(1f, 0.9f, 0.72f), 1.1f, 0f, 2.2f),
                FlareElement(SRPLensFlareType.Ring, new Color(0.6f, 0.8f, 1f), 0.35f, -0.45f, 0.7f),
                FlareElement(SRPLensFlareType.Polygon, new Color(1f, 0.7f, 0.4f), 0.3f, 0.65f, 0.35f),
                FlareElement(SRPLensFlareType.Circle, new Color(0.5f, 1f, 0.7f), 0.2f, 1.25f, 0.5f),
            };
            AssetDatabase.CreateAsset(flare, Gen + "/Settings/SunFlare.asset");
            var lf = sunGo.AddComponent<LensFlareComponentSRP>();
            lf.lensFlareData = flare;
            lf.intensity = 0.7f;
            lf.useOcclusion = true;
            lf.attenuationByLightShape = false;

            RenderSettings.skybox = AssetDatabase.GetBuiltinExtraResource<Material>("Default-Skybox.mat");
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.56f, 0.63f, 0.74f);
            RenderSettings.ambientEquatorColor = new Color(0.46f, 0.48f, 0.46f);
            RenderSettings.ambientGroundColor = new Color(0.22f, 0.2f, 0.18f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogDensity = 0.0017f;
            RenderSettings.fogColor = new Color(0.66f, 0.72f, 0.78f);

            var probeGo = new GameObject("Reflection Probe (Realtime)");
            probeGo.transform.position = new Vector3(0, 40, 0);
            var probe = probeGo.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.OnAwake;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            probe.size = new Vector3(2400, 800, 2400);
            probe.resolution = 128;
            probe.importance = 0;
        }

        static LensFlareDataElementSRP FlareElement(SRPLensFlareType type, Color tint, float intensity, float position, float scale)
        {
            var e = new LensFlareDataElementSRP
            {
                flareType = type,
                tint = tint,
                position = position,
                uniformScale = scale,
                blendMode = SRPLensFlareBlendMode.Additive,
                modulateByLightColor = true
            };
            e.localIntensity = intensity;
            if (type == SRPLensFlareType.Polygon) e.sideCount = 6;
            return e;
        }

        static void BuildVolume()
        {
            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            AssetDatabase.CreateAsset(profile, Gen + "/Settings/StormfallVolume.asset");
            var tone = profile.Add<Tonemapping>(true);
            tone.mode.Override(TonemappingMode.ACES);
            var bloom = profile.Add<Bloom>(true);
            bloom.threshold.Override(0.95f);
            bloom.intensity.Override(0.75f);
            bloom.scatter.Override(0.65f);
            var vig = profile.Add<Vignette>(true);
            vig.intensity.Override(0.22f);
            vig.smoothness.Override(0.45f);
            var dof = profile.Add<DepthOfField>(true);
            dof.mode.Override(DepthOfFieldMode.Gaussian);
            dof.gaussianStart.Override(40f);
            dof.gaussianEnd.Override(160f);
            dof.active = false;
            var color = profile.Add<ColorAdjustments>(true);
            color.postExposure.Override(0.15f);
            color.contrast.Override(10f);
            color.saturation.Override(8f);
            var wb = profile.Add<WhiteBalance>(true);
            wb.temperature.Override(4f);
            foreach (var c in profile.components) AssetDatabase.AddObjectToAsset(c, profile);
            EditorUtility.SetDirty(profile);

            var go = new GameObject("Global Volume");
            var vol = go.AddComponent<Volume>();
            vol.isGlobal = true;
            vol.priority = 1;
            vol.sharedProfile = profile;
            go.AddComponent<PostFXController>();
        }

        // =====================================================================
        // Terrain & water
        // =====================================================================

        const float TerrainSize = 1000f, TerrainHeight = 170f, TerrainBase = -10f;

        static float Fbm(float x, float z, int oct)
        {
            float s = 0, a = 0.5f, f = 1f, n = 0;
            for (int i = 0; i < oct; i++) { s += Mathf.PerlinNoise(x * f + 31.7f * i, z * f + 17.3f * i) * a; n += a; a *= 0.5f; f *= 2.03f; }
            return s / n;
        }

        static float IslandHeight(float x, float z)
        {
            float r = Mathf.Sqrt(x * x + z * z);
            float th = Mathf.Atan2(z, x);
            float coast = 410f + 22f * Mathf.Sin(3f * th + 1.3f) + 12f * Mathf.Sin(7f * th + 0.4f) + 6f * Mathf.Sin(13f * th);
            float t = r / coast;
            float land = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(1.06f, 0.86f, t));
            float baseH = 13f + Fbm(x * 0.0045f + 100f, z * 0.0045f + 100f, 5) * 26f;
            float ridges = (1f - Mathf.Abs(Mathf.PerlinNoise(x * 0.011f + 5f, z * 0.011f + 9f) * 2f - 1f)) * 7f;
            float hills = 44f * Mathf.Exp(-((x + 20f) * (x + 20f) + (z - 285f) * (z - 285f)) / (2f * 65f * 65f))
                          + 20f * Mathf.Exp(-((x - 240f) * (x - 240f) + (z - 205f) * (z - 205f)) / (2f * 95f * 95f))
                          + 26f * Mathf.Exp(-((x + 150f) * (x + 150f) + (z - 120f) * (z - 120f)) / (2f * 70f * 70f))
                          + 18f * Mathf.Exp(-((x - 140f) * (x - 140f) + (z + 60f) * (z + 60f)) / (2f * 60f * 60f));
            float h = Mathf.Lerp(-9f, baseH + ridges + hills, land);
            // beaches: ease the last stretch toward the waterline
            float beach = Mathf.InverseLerp(0.98f, 0.9f, t);
            if (land > 0.01f && beach < 1f) h = Mathf.Lerp(Mathf.Min(h, WorldInfo.WaterLevel + 1.6f), h, beach);
            foreach (var p in Pois)
            {
                float d = Vector2.Distance(new Vector2(x, z), p.pos);
                float w = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(p.flatRadius + 45f, p.flatRadius, d));
                h = Mathf.Lerp(h, p.padHeight, w);
            }
            return h;
        }

        static void BuildTerrain()
        {
            var data = new TerrainData { heightmapResolution = 513, alphamapResolution = 512, baseMapResolution = 1024 };
            data.SetDetailResolution(256, 16);
            data.size = new Vector3(TerrainSize, TerrainHeight, TerrainSize);
            AssetDatabase.CreateAsset(data, Gen + "/Terrain/KalderaIsle.asset");

            int res = data.heightmapResolution;
            var heights = new float[res, res];
            for (int y = 0; y < res; y++)
                for (int x = 0; x < res; x++)
                {
                    float wx = x / (float)(res - 1) * TerrainSize - TerrainSize * 0.5f;
                    float wz = y / (float)(res - 1) * TerrainSize - TerrainSize * 0.5f;
                    heights[y, x] = Mathf.Clamp01((IslandHeight(wx, wz) - TerrainBase) / TerrainHeight);
                }
            data.SetHeights(0, 0, heights);

            string[] kinds = { "Grass", "Sand", "Rock", "Dirt" };
            float[] tiles = { 9f, 7f, 14f, 8f };
            var layers = new TerrainLayer[kinds.Length];
            for (int i = 0; i < kinds.Length; i++)
            {
                var tex = TextureFactory.Terrain(kinds[i]);
                var copy = Object.Instantiate(tex);
                copy.name = "Terrain_" + kinds[i];
                AssetDatabase.CreateAsset(copy, $"{Gen}/Terrain/{copy.name}.asset");
                var layer = new TerrainLayer { diffuseTexture = copy, tileSize = new Vector2(tiles[i], tiles[i]), smoothness = kinds[i] == "Rock" ? 0.2f : 0.05f, metallic = 0f };
                AssetDatabase.CreateAsset(layer, $"{Gen}/Terrain/Layer_{kinds[i]}.terrainlayer");
                layers[i] = layer;
            }
            data.terrainLayers = layers;

            int ar = data.alphamapResolution;
            var maps = new float[ar, ar, layers.Length];
            for (int y = 0; y < ar; y++)
                for (int x = 0; x < ar; x++)
                {
                    float u = x / (float)(ar - 1), v = y / (float)(ar - 1);
                    float wx = u * TerrainSize - TerrainSize * 0.5f, wz = v * TerrainSize - TerrainSize * 0.5f;
                    float h = data.GetInterpolatedHeight(u, v) + TerrainBase;
                    float slope = data.GetSteepness(u, v);
                    float sand = Mathf.InverseLerp(WorldInfo.WaterLevel + 4.5f, WorldInfo.WaterLevel + 1.5f, h);
                    float rock = Mathf.InverseLerp(26f, 40f, slope);
                    float dirt = Mathf.Clamp01((Mathf.PerlinNoise(wx * 0.02f, wz * 0.02f) - 0.62f) * 3f);
                    foreach (var p in Pois)
                    {
                        float d = Vector2.Distance(new Vector2(wx, wz), p.pos);
                        dirt = Mathf.Max(dirt, Mathf.InverseLerp(p.flatRadius + 10f, p.flatRadius * 0.6f, d) * 0.85f);
                    }
                    float grass = Mathf.Max(0f, 1f - sand - rock - dirt);
                    float sum = grass + sand + rock + dirt + 1e-4f;
                    maps[y, x, 0] = grass / sum; maps[y, x, 1] = sand / sum; maps[y, x, 2] = rock / sum; maps[y, x, 3] = dirt / sum;
                }
            data.SetAlphamaps(0, 0, maps);

            var go = Terrain.CreateTerrainGameObject(data);
            go.name = "Kaldera Isle Terrain";
            go.transform.position = new Vector3(-TerrainSize * 0.5f, TerrainBase, -TerrainSize * 0.5f);
            s_Terrain = go.GetComponent<Terrain>();
            var rp = GraphicsSettings.currentRenderPipeline;
            if (rp != null && rp.defaultTerrainMaterial != null) s_Terrain.materialTemplate = rp.defaultTerrainMaterial;
            s_Terrain.drawInstanced = true;
            s_Terrain.heightmapPixelError = 4f;
            s_Terrain.basemapDistance = 600f;
            EditorUtility.SetDirty(data);
        }

        static void BuildWater()
        {
            var b = new MeshBuilder(1);
            b.Plane(Vector3.zero, Vector3.right * 1500f, Vector3.forward * 1500f, new Vector2(1, 1));
            var mesh = SaveMesh(b.ToMesh("Sea"));
            var go = MeshObj("Sea", s_World, mesh, new[] { Mat.Water }, new Vector3(0, WorldInfo.WaterLevel, 0), Quaternion.identity);
            go.GetComponent<MeshRenderer>().shadowCastingMode = ShadowCastingMode.Off;
        }

        // =====================================================================
        // Buildings
        // =====================================================================

        struct Opening { public float center, width, bottom, top; public bool door; }

        /// <summary>One wall run along local X with openings; thickness along local Z.</summary>
        static void Wall(MeshBuilder b, Vector3 start, Quaternion rot, float length, float height, float thick, List<Opening> openings)
        {
            openings = openings.OrderBy(o => o.center).ToList();
            float cursor = 0f;
            void Piece(float x0, float x1, float y0, float y1)
            {
                if (x1 - x0 < 0.01f || y1 - y0 < 0.01f) return;
                Vector3 c = start + rot * new Vector3((x0 + x1) * 0.5f, (y0 + y1) * 0.5f, 0);
                b.Box(c, rot, new Vector3(x1 - x0, y1 - y0, thick));
            }
            foreach (var o in openings)
            {
                float o0 = o.center - o.width * 0.5f, o1 = o.center + o.width * 0.5f;
                Piece(cursor, o0, 0, height);
                Piece(o0, o1, 0, o.bottom);
                Piece(o0, o1, o.top, height);
                cursor = o1;
            }
            Piece(cursor, length, 0, height);
        }

        /// <summary>
        /// Rectangular building with a floor slab, four walls with door and window openings,
        /// hinged doors and a roof (flat with parapet, or arched for hangars).
        /// </summary>
        static GameObject Building(string name, Vector3 pos, float yaw, float w, float d, float h, Mat wallMat, Mat roofMat,
            bool arched = false, float bigDoor = 0f, bool interior = true)
        {
            var rot = Quaternion.Euler(0, yaw, 0);
            var b = new MeshBuilder(3) { UVScale = 0.3f };
            const float t = 0.25f;
            b.Submesh = 0;
            b.Box(new Vector3(0, 0.1f, 0), Quaternion.identity, new Vector3(w, 0.2f, d));
            float wh = h;
            float y0 = 0.2f;
            var front = new List<Opening>(); var back = new List<Opening>(); var left = new List<Opening>(); var right = new List<Opening>();
            var doors = new List<(Vector3 hinge, float yaw, float width)>();
            if (bigDoor > 0f)
            {
                front.Add(new Opening { center = w * 0.5f, width = bigDoor, bottom = 0, top = Mathf.Min(h - 0.6f, 6f) });
                back.Add(new Opening { center = w * 0.5f, width = bigDoor, bottom = 0, top = Mathf.Min(h - 0.6f, 6f) });
                left.Add(new Opening { center = d * 0.5f, width = 1.1f, bottom = 0, top = 2.2f, door = true });
            }
            else
            {
                front.Add(new Opening { center = w * 0.5f, width = 1.1f, bottom = 0, top = 2.2f, door = true });
                back.Add(new Opening { center = w * 0.3f, width = 1.1f, bottom = 0, top = 2.2f, door = true });
                if (w > 6f) back.Add(new Opening { center = w * 0.72f, width = 1.3f, bottom = 1.0f, top = 2.1f });
            }
            for (int i = 1; i <= (d > 9f ? 2 : 1); i++)
            {
                float c = d * i / ((d > 9f ? 2 : 1) + 1f);
                left.Add(new Opening { center = c, width = 1.3f, bottom = 1.0f, top = 2.1f });
                right.Add(new Opening { center = c, width = 1.3f, bottom = 1.0f, top = 2.1f });
            }
            if (bigDoor > 0f) left.RemoveAll(o => !o.door && Mathf.Abs(o.center - d * 0.5f) < 1.5f);
            // walls: front (+z) and back (-z) run along X; sides run along Z
            Wall(b, new Vector3(-w * 0.5f, y0, d * 0.5f - t * 0.5f), Quaternion.identity, w, wh, t, front);
            Wall(b, new Vector3(w * 0.5f, y0, -d * 0.5f + t * 0.5f), Quaternion.Euler(0, 180, 0), w, wh, t, back);
            Wall(b, new Vector3(-w * 0.5f + t * 0.5f, y0, -d * 0.5f), Quaternion.Euler(0, -90, 0), d, wh, t, left);
            Wall(b, new Vector3(w * 0.5f - t * 0.5f, y0, d * 0.5f), Quaternion.Euler(0, 90, 0), d, wh, t, right);
            foreach (var o in front.Where(o => o.door)) doors.Add((new Vector3(-w * 0.5f + o.center - o.width * 0.5f, y0, d * 0.5f - t * 0.5f), 0f, o.width));
            foreach (var o in back.Where(o => o.door)) doors.Add((new Vector3(w * 0.5f - o.center + o.width * 0.5f, y0, -d * 0.5f + t * 0.5f), 180f, o.width));
            foreach (var o in left.Where(o => o.door)) doors.Add((new Vector3(-w * 0.5f + t * 0.5f, y0, -d * 0.5f + o.center - o.width * 0.5f), -90f, o.width));

            b.Submesh = 1;
            if (arched)
            {
                var arch = ProceduralMeshBuilder.ArchedRoof(w + 0.6f, Mathf.Min(6f, w * 0.25f), d + 0.6f);
                b.Push(new Vector3(0, y0 + wh, 0), Quaternion.identity);
                b.Append(MeshToBuilder(arch, 1));
                b.Pop();
            }
            else
            {
                b.Box(new Vector3(0, y0 + wh + 0.12f, 0), Quaternion.identity, new Vector3(w + 0.4f, 0.24f, d + 0.4f));
                b.Submesh = 0;
                b.Box(new Vector3(0, y0 + wh + 0.45f, d * 0.5f + 0.1f), Quaternion.identity, new Vector3(w + 0.4f, 0.45f, 0.2f));
                b.Box(new Vector3(0, y0 + wh + 0.45f, -d * 0.5f - 0.1f), Quaternion.identity, new Vector3(w + 0.4f, 0.45f, 0.2f));
                b.Box(new Vector3(w * 0.5f + 0.1f, y0 + wh + 0.45f, 0), Quaternion.identity, new Vector3(0.2f, 0.45f, d + 0.4f));
                b.Box(new Vector3(-w * 0.5f - 0.1f, y0 + wh + 0.45f, 0), Quaternion.identity, new Vector3(0.2f, 0.45f, d + 0.4f));
                b.Submesh = 2;
                b.Box(new Vector3(w * 0.25f, y0 + wh + 0.6f, -d * 0.2f), Quaternion.identity, new Vector3(1.4f, 0.8f, 1.0f)); // AC unit
            }
            var mesh = SaveMesh(b.ToMesh(name.Replace(' ', '_') + "_" + s_Meshes.Count));
            var go = MeshObj(name, s_World, mesh, new[] { wallMat, roofMat, Mat.SheetMetal }, pos, rot, Col.Mesh);

            var doorMesh = CachedMesh("Door", () => ProceduralMeshBuilder.Door(1.05f, 2.15f));
            foreach (var dr in doors)
            {
                var hinge = Obj("Door", go.transform, Vector3.zero, Quaternion.identity);
                hinge.transform.localPosition = dr.hinge;
                hinge.transform.localRotation = Quaternion.Euler(0, dr.yaw, 0);
                var panel = MeshObj("Panel", hinge.transform, doorMesh, new[] { Mat.Wood, Mat.GunMetal }, hinge.transform.position, hinge.transform.rotation, Col.None, false);
                var bc = panel.AddComponent<BoxCollider>();
                bc.center = new Vector3(0.525f, 1.075f, 0); bc.size = new Vector3(1.05f, 2.15f, 0.06f);
                var door = hinge.AddComponent<Door>();
                door.width = dr.width;
                GameObjectUtility.SetStaticEditorFlags(hinge, 0);
            }

            if (interior)
            {
                // interior cover + a cache
                var crate = CachedMesh("WoodCrate", () => ProceduralMeshBuilder.WoodCrate(1.0f));
                Vector3 c1 = go.transform.TransformPoint(new Vector3(w * 0.25f, y0, d * 0.2f));
                MeshObj("Crate", go.transform, crate, new[] { Mat.Wood }, c1, rot, Col.Box);
                if (R.NextDouble() < 0.7) Cache(go.transform.TransformPoint(new Vector3(-w * 0.25f, y0, -d * 0.2f)), yaw + 90f, false, go.transform);
                Cover(go.transform.TransformPoint(new Vector3(-w * 0.5f + 1.2f, y0, d * 0.25f)), false);
            }
            return go;
        }

        static MeshBuilder MeshToBuilder(Mesh mesh, int submesh)
        {
            var b = new MeshBuilder(submesh + 1);
            b.Submesh = submesh;
            var v = mesh.vertices; var n = mesh.normals; var uv = mesh.uv;
            var idx = new int[v.Length];
            for (int i = 0; i < v.Length; i++) idx[i] = b.Vertex(v[i], n[i], i < uv.Length ? uv[i] : Vector2.zero);
            for (int s = 0; s < mesh.subMeshCount; s++)
            {
                var tris = mesh.GetTriangles(s);
                for (int i = 0; i < tris.Length; i += 3) b.Tri(idx[tris[i]], idx[tris[i + 1]], idx[tris[i + 2]]);
            }
            return b;
        }

        // =====================================================================
        // Props & interactables
        // =====================================================================

        static void Container(Vector3 pos, float yaw, int color, bool cover = true)
        {
            var mesh = CachedMesh("Container", ProceduralMeshBuilder.Container);
            var mat = color == 0 ? Mat.ContainerRed : color == 1 ? Mat.ContainerBlue : Mat.ContainerGreen;
            var go = MeshObj("Container", s_Props, mesh, new[] { mat, Mat.SheetMetal }, pos, Quaternion.Euler(0, yaw, 0), Col.None);
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 1.295f, 0); bc.size = new Vector3(2.44f, 2.59f, 6.06f);
            if (cover)
            {
                var rot = Quaternion.Euler(0, yaw, 0);
                Cover(pos + rot * new Vector3(1.9f, 0, 2.6f), false);
                Cover(pos + rot * new Vector3(-1.9f, 0, -2.6f), false);
            }
        }

        static void Barrier(Vector3 pos, float yaw)
        {
            var mesh = CachedMesh("JerseyBarrier", () => ProceduralMeshBuilder.JerseyBarrier(3f));
            var go = MeshObj("Barrier", s_Props, mesh, new[] { Mat.Concrete }, pos, Quaternion.Euler(0, yaw, 0), Col.None);
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 0.475f, 0); bc.size = new Vector3(0.6f, 0.95f, 3f);
            var rot = Quaternion.Euler(0, yaw, 0);
            Cover(pos + rot * new Vector3(0.9f, 0, 0), true);
            Cover(pos + rot * new Vector3(-0.9f, 0, 0), true);
        }

        static void Sandbags(Vector3 pos, float yaw)
        {
            var mesh = CachedMesh("Sandbags", () => ProceduralMeshBuilder.Sandbags(5, 3));
            var go = MeshObj("Sandbags", s_Props, mesh, new[] { Mat.Sand }, pos, Quaternion.Euler(0, yaw, 0), Col.None);
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 0.45f, 0); bc.size = new Vector3(2.9f, 0.9f, 0.4f);
            var rot = Quaternion.Euler(0, yaw, 0);
            Cover(pos + rot * new Vector3(0, 0, 0.8f), true);
            Cover(pos + rot * new Vector3(0, 0, -0.8f), true);
        }

        static void Crate(Vector3 pos, float yaw, float size = 1f)
        {
            var mesh = CachedMesh("WoodCrate" + size, () => ProceduralMeshBuilder.WoodCrate(size));
            MeshObj("Crate", s_Props, mesh, new[] { Mat.Wood }, pos, Quaternion.Euler(0, yaw, 0), Col.Box);
        }

        static void Drum(Vector3 pos)
        {
            var mesh = CachedMesh("OilDrum", ProceduralMeshBuilder.OilDrum);
            var go = MeshObj("Drum", s_Props, mesh, new[] { R.Next(2) == 0 ? Mat.ContainerBlue : Mat.ContainerRed }, pos, Quaternion.Euler(0, Rf(0, 360), 0), Col.None);
            var cc = go.AddComponent<CapsuleCollider>();
            cc.center = new Vector3(0, 0.45f, 0); cc.radius = 0.3f; cc.height = 0.9f;
        }

        static void Cover(Vector3 pos, bool low)
        {
            var go = Obj("CoverPoint", s_Props, pos, Quaternion.identity);
            go.AddComponent<CoverPoint>().lowCover = low;
        }

        static void Cache(Vector3 pos, float yaw, bool vault, Transform parent = null)
        {
            var go = Obj(vault ? "VaultCache" : "SupplyCache", parent != null ? parent : s_Loot, pos, Quaternion.Euler(0, yaw, 0));
            var body = CachedMesh(vault ? "CacheBodyVault" : "CacheBody", () => ProceduralMeshBuilder.CacheBody(vault));
            var lidMesh = CachedMesh(vault ? "CacheLidVault" : "CacheLid", () => ProceduralMeshBuilder.CacheLid(vault));
            var colorMat = vault ? Mat.CacheOrange : Mat.CacheBlue;
            MeshObj("Body", go.transform, body, new[] { colorMat, Mat.CacheTrim }, pos, go.transform.rotation, Col.None, false);
            var lid = MeshObj("Lid", go.transform, lidMesh, new[] { colorMat, Mat.CacheTrim }, Vector3.zero, Quaternion.identity, Col.None, false);
            lid.transform.localPosition = new Vector3(0, 0.5f, -0.3f);
            lid.transform.localRotation = Quaternion.identity;
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 0.32f, 0); bc.size = new Vector3(vault ? 1.25f : 1.05f, 0.64f, 0.65f);
            var c = go.AddComponent<LootCache>();
            c.vault = vault;
            c.lid = lid.transform;
        }

        static void Terminal(Vector3 pos, float yaw)
        {
            var mesh = CachedMesh("SupplyTerminal", ProceduralMeshBuilder.SupplyTerminal);
            var go = MeshObj("Supply Terminal", s_Loot, mesh, new[] { Mat.TerminalBody, Mat.TerminalScreen }, pos, Quaternion.Euler(0, yaw, 0), Col.None, false);
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 1.1f, 0); bc.size = new Vector3(1f, 2.2f, 0.7f);
            go.AddComponent<SupplyTerminal>();
            var l = Obj("ScreenLight", go.transform, pos + go.transform.rotation * new Vector3(0, 1.4f, 0.8f), Quaternion.identity).AddComponent<Light>();
            l.type = LightType.Point; l.color = new Color(0.3f, 1f, 0.6f); l.range = 4f; l.intensity = 2f; l.shadows = LightShadows.None;
        }

        static void Tablet(Vector3 pos, float yaw)
        {
            var mesh = CachedMesh("FieldTablet", ProceduralMeshBuilder.FieldTablet);
            var go = MeshObj("Field Ops Tablet", s_Loot, mesh, new[] { Mat.TerminalBody, Mat.TabletYellow }, pos, Quaternion.Euler(0, yaw, 0), Col.None, false);
            var bc = go.AddComponent<BoxCollider>();
            bc.center = new Vector3(0, 0.6f, 0); bc.size = new Vector3(0.45f, 1.2f, 0.45f);
            go.AddComponent<FieldOpsTablet>().contract = (ContractType)(s_TabletCycle++ % 3);
        }

        static void Vent(Vector3 pos)
        {
            var mesh = CachedMesh("UpdraftVent", ProceduralMeshBuilder.UpdraftVent);
            var go = MeshObj("Updraft Vent", s_World, mesh, new[] { Mat.ConcreteDark, Mat.SheetMetal }, pos, Quaternion.identity, Col.None, false);
            go.AddComponent<UpdraftVent>();
        }

        static void PoiMarker(Poi p)
        {
            var go = Obj("POI_" + p.name, s_World, OnGround(p.pos.x, p.pos.y), Quaternion.identity);
            var poi = go.AddComponent<PointOfInterest>();
            poi.displayName = p.name;
            poi.radius = p.radius;
        }

        // =====================================================================
        // Kestrel Airfield — 3-lane arena
        // =====================================================================

        static void BuildAirfield()
        {
            var p = Pois[0];
            PoiMarker(p);
            float y = p.padHeight;
            // Runway lane (east, x = +32): long asphalt strip with paint, waist-high barriers.
            var strip = new MeshBuilder(2) { UVScale = 0.1f };
            strip.Box(new Vector3(0, 0.05f, 0), Quaternion.identity, new Vector3(26f, 0.1f, 190f));
            strip.Submesh = 1;
            for (int i = -8; i <= 8; i++) strip.Box(new Vector3(0, 0.105f, i * 11f), Quaternion.identity, new Vector3(0.5f, 0.02f, 6f));
            for (int i = -4; i <= 4; i++) strip.Box(new Vector3(-9f + i * 0.0f + (i + 4) * 2.2f, 0.105f, 88f), Quaternion.identity, new Vector3(1.2f, 0.02f, 8f));
            var stripMesh = SaveMesh(strip.ToMesh("Runway"));
            MeshObj("Runway", s_World, stripMesh, new[] { Mat.Asphalt, Mat.RunwayPaint }, new Vector3(32f, y, 0), Quaternion.identity, Col.Box);
            for (int i = 0; i < 9; i++)
            {
                float z = -80f + i * 20f;
                Barrier(new Vector3(32f + (i % 2 == 0 ? -6f : 6f), y + 0.1f, z), Rf(-20f, 20f));
                if (i % 3 == 1) Sandbags(new Vector3(32f + Rf(-3f, 3f), y + 0.1f, z + 9f), Rf(0, 360));
                if (i % 2 == 1) Crate(new Vector3(32f + Rf(-10f, 10f), y + 0.1f, z + Rf(-5f, 5f)), Rf(0, 360), 1.2f);
            }
            // Hangar lane (centre, x = 0): three connected hangars with big doors.
            for (int i = -1; i <= 1; i++)
            {
                var hg = Building("Hangar", new Vector3(0, y, i * 52f), 0f, 22f, 30f, 7f, Mat.SheetMetal, Mat.Roof, true, 10f, false);
                for (int k = 0; k < 4; k++) Crate(hg.transform.TransformPoint(new Vector3(Rf(-7f, 7f), 0.2f, Rf(-10f, 10f))), Rf(0, 360), 1.4f);
                for (int k = 0; k < 3; k++) Drum(hg.transform.TransformPoint(new Vector3(Rf(-8f, 8f), 0.2f, Rf(-12f, 12f))));
                Barrier(hg.transform.TransformPoint(new Vector3(-4f, 0.2f, 0f)), 0f);
                Barrier(hg.transform.TransformPoint(new Vector3(4f, 0.2f, 6f)), 0f);
                Cache(hg.transform.TransformPoint(new Vector3(6f, 0.2f, -8f)), 90f, i == 0);
            }
            // Container lane (west, x = -32): stacked aisles.
            for (int i = 0; i < 10; i++)
            {
                float z = -85f + i * 19f;
                float x = -32f + (i % 2 == 0 ? -5f : 5f);
                Container(new Vector3(x, y, z), Rf(-8f, 8f), i % 3);
                if (i % 3 == 0)
                {
                    var stacked = MeshObj("ContainerStack", s_Props, s_Meshes["Container"], new[] { Mat.ContainerBlue, Mat.SheetMetal }, new Vector3(x, y + 2.59f, z), Quaternion.Euler(0, Rf(-4f, 4f), 0), Col.None);
                    var bc = stacked.AddComponent<BoxCollider>(); bc.center = new Vector3(0, 1.295f, 0); bc.size = new Vector3(2.44f, 2.59f, 6.06f);
                }
                if (i % 2 == 1) Container(new Vector3(-32f + Rf(-2f, 2f), y, z + 9f), 90f + Rf(-6f, 6f), (i + 1) % 3);
            }
            // Lane separators with connectors at z = ±26 and 0.
            foreach (float x in new[] { -17f, 17f })
                for (int i = 0; i < 12; i++)
                {
                    float z = -88f + i * 16f;
                    if (Mathf.Abs(z) < 6f || Mathf.Abs(Mathf.Abs(z) - 26f) < 6f) continue;
                    Barrier(new Vector3(x, y + 0.1f, z), 0f);
                    Barrier(new Vector3(x, y + 0.1f, z + 3.1f), 0f);
                }
            // Control tower and spawn bunkers.
            Building("Control Tower", new Vector3(56f, y, 62f), 0f, 9f, 9f, 11f, Mat.Concrete, Mat.ConcreteDark);
            Building("North Bunker", new Vector3(0, y, 98f), 0f, 14f, 6f, 3.2f, Mat.ConcreteDark, Mat.ConcreteDark);
            Building("South Bunker", new Vector3(0, y, -98f), 180f, 14f, 6f, 3.2f, Mat.ConcreteDark, Mat.ConcreteDark);
            for (int i = -2; i <= 2; i++) { Sandbags(new Vector3(i * 9f, y + 0.1f, 88f), 0f); Sandbags(new Vector3(i * 9f, y + 0.1f, -88f), 0f); }
            Terminal(new Vector3(22f, y, -40f), -90f);
            Terminal(new Vector3(-22f, y, 40f), 90f);
            Tablet(new Vector3(12f, y, 70f), 180f);
            Cache(new Vector3(-24f, y, -60f), 0f, false);
            Cache(new Vector3(40f, y, 30f), 90f, false);
            Vent(new Vector3(-52f, y, 0f));
        }

        // =====================================================================
        // Points of interest
        // =====================================================================

        static void BuildPointsOfInterest()
        {
            for (int i = 1; i < Pois.Length; i++)
            {
                var p = Pois[i];
                PoiMarker(p);
                float y = p.padHeight;
                Vector3 c = new Vector3(p.pos.x, y, p.pos.y);
                switch (p.name)
                {
                    case "Saltworks":
                        for (int k = 0; k < 3; k++) Building("Salt Shed", c + new Vector3(-24f + k * 18f, 0, 20f), 180f, 10f, 7f, 3.6f, Mat.SheetMetal, Mat.Roof);
                        for (int k = 0; k < 6; k++)
                        {
                            var basin = new MeshBuilder(1) { UVScale = 0.2f };
                            basin.Box(new Vector3(0, 0.3f, 7f), Quaternion.identity, new Vector3(14f, 0.6f, 0.4f));
                            basin.Box(new Vector3(0, 0.3f, -7f), Quaternion.identity, new Vector3(14f, 0.6f, 0.4f));
                            basin.Box(new Vector3(7f, 0.3f, 0), Quaternion.identity, new Vector3(0.4f, 0.6f, 14f));
                            basin.Box(new Vector3(-7f, 0.3f, 0), Quaternion.identity, new Vector3(0.4f, 0.6f, 14f));
                            basin.Box(new Vector3(0, 0.05f, 0), Quaternion.identity, new Vector3(13.6f, 0.1f, 13.6f));
                            var bm = CachedMesh("SaltBasin", () => basin.ToMesh("SaltBasin"));
                            MeshObj("Evaporation Basin", s_World, bm, new[] { Mat.Concrete }, c + new Vector3(-30f + (k % 3) * 16f, 0, -14f - (k / 3) * 16f), Quaternion.identity, Col.Mesh);
                        }
                        for (int k = 0; k < 4; k++) Container(c + new Vector3(28f, 0, -20f + k * 9f), 90f, k % 3);
                        Terminal(c + new Vector3(8f, 0, 4f), 0f);
                        Cache(c + new Vector3(-10f, 0, -2f), 30f, false);
                        Cache(c + new Vector3(20f, 0, 14f), 0f, true);
                        Vent(c + new Vector3(-38f, 0, 26f));
                        break;

                    case "Radar Ridge":
                    {
                        var tower = new MeshBuilder(2);
                        tower.Cylinder(Vector3.zero, Vector3.up * 12f, 1.6f, 1.1f, 16);
                        for (int k = 0; k < 4; k++)
                        {
                            var rr = Quaternion.Euler(0, k * 90f + 45f, 0);
                            tower.Cylinder(rr * new Vector3(4f, 0, 0), Vector3.up * 11f, 0.18f, 0.12f, 8);
                        }
                        tower.Submesh = 1;
                        tower.Sphere(Vector3.up * 15.5f, Vector3.one * 4.2f, 16, 24);
                        tower.Cylinder(Vector3.up * 11.5f, Vector3.up * 12.5f, 3f, 3f, 24);
                        var tm = SaveMesh(tower.ToMesh("RadarDome"));
                        var tg = MeshObj("Radar Dome", s_World, tm, new[] { Mat.ConcreteDark, Mat.DroneBody }, c + new Vector3(0, 0, -8f), Quaternion.identity, Col.Mesh);
                        _ = tg;
                        Building("Radar Bunker", c + new Vector3(16f, 0, 10f), 200f, 12f, 8f, 3.2f, Mat.ConcreteDark, Mat.ConcreteDark);
                        for (int k = 0; k < 6; k++)
                        {
                            float a = k * 60f;
                            Sandbags(c + Quaternion.Euler(0, a, 0) * new Vector3(0, 0, 22f), a);
                        }
                        Tablet(c + new Vector3(-10f, 0, 12f), 90f);
                        Cache(c + new Vector3(8f, 0, -16f), 0f, true);
                        Cache(c + new Vector3(-16f, 0, -4f), 45f, false);
                        break;
                    }

                    case "Old Harbor":
                        Building("Warehouse A", c + new Vector3(10f, 0, 18f), 90f, 18f, 12f, 6f, Mat.SheetMetal, Mat.Roof, true, 5f, true);
                        Building("Warehouse B", c + new Vector3(10f, 0, -18f), 90f, 18f, 12f, 6f, Mat.SheetMetal, Mat.Roof, true, 5f, true);
                        Building("Harbor Office", c + new Vector3(32f, 0, 0f), 90f, 8f, 7f, 3.4f, Mat.Concrete, Mat.ConcreteDark);
                        for (int k = 0; k < 3; k++)
                        {
                            var pier = new MeshBuilder(1) { UVScale = 0.5f };
                            for (int s = 0; s < 14; s++) pier.Box(new Vector3(0, 0, s * 1.4f), Quaternion.Euler(0, 0, Rf(-1f, 1f)), new Vector3(4f, 0.18f, 1.3f));
                            for (int s = 0; s < 14; s += 3)
                            {
                                pier.Cylinder(new Vector3(-1.9f, -6f, s * 1.4f), new Vector3(-1.9f, 0.3f, s * 1.4f), 0.15f, 0.15f, 8);
                                pier.Cylinder(new Vector3(1.9f, -6f, s * 1.4f), new Vector3(1.9f, 0.3f, s * 1.4f), 0.15f, 0.15f, 8);
                            }
                            var pm = CachedMesh("Pier", () => pier.ToMesh("Pier"));
                            MeshObj("Pier", s_World, pm, new[] { Mat.Wood }, c + new Vector3(-18f, 0f, -24f + k * 24f), Quaternion.Euler(0, -90, 0), Col.Mesh);
                        }
                        for (int k = 0; k < 5; k++) Container(c + new Vector3(-6f, 0, -30f + k * 15f), Rf(-10, 10), k % 3);
                        Terminal(c + new Vector3(24f, 0, 12f), 180f);
                        Cache(c + new Vector3(0f, 0, 2f), 90f, false);
                        Cache(c + new Vector3(-12f, 0, 30f), 0f, false);
                        break;

                    case "Pinecrest":
                        for (int k = 0; k < 5; k++)
                        {
                            float a = k * 72f + 20f;
                            Vector3 pos = c + Quaternion.Euler(0, a, 0) * new Vector3(0, 0, 26f);
                            pos.y = y;
                            Building("Cabin", pos, a + 180f, 8f, 6.5f, 3.2f, Mat.Wood, Mat.Roof);
                        }
                        Tablet(c + new Vector3(0, 0, 0), 0f);
                        Cache(c + new Vector3(6f, 0, -6f), 0f, true);
                        Terminal(c + new Vector3(-8f, 0, 6f), 135f);
                        break;

                    case "Quarry":
                        for (int k = 0; k < 14; k++)
                        {
                            float a = k * 25.7f;
                            Vector3 pos = c + Quaternion.Euler(0, a, 0) * new Vector3(0, 0, Rf(30f, 50f));
                            pos.y = Ground(pos.x, pos.z) - 1.5f;
                            Rock(pos, Rf(5f, 10f));
                        }
                        Building("Quarry Shed", c + new Vector3(-10f, 0, 6f), 30f, 10f, 8f, 4f, Mat.SheetMetal, Mat.Roof);
                        Building("Machine Shed", c + new Vector3(14f, 0, -8f), -20f, 9f, 7f, 3.6f, Mat.Concrete, Mat.Roof);
                        for (int k = 0; k < 6; k++) Crate(c + new Vector3(Rf(-12f, 12f), 0.1f, Rf(-14f, 14f)), Rf(0, 360), 1.3f);
                        Terminal(c + new Vector3(4f, 0, 16f), 180f);
                        Cache(c + new Vector3(0f, 0, -4f), 0f, false);
                        Vent(c + new Vector3(-20f, 0, -22f));
                        break;

                    case "Lighthouse Point":
                    {
                        var lh = new MeshBuilder(3);
                        lh.Cylinder(Vector3.zero, Vector3.up * 22f, 3.2f, 2.2f, 24);
                        for (int k = 0; k < 5; k++)
                        {
                            lh.Submesh = 2;
                            lh.Cylinder(Vector3.up * (3f + k * 4f), Vector3.up * (4.2f + k * 4f), 3.25f - k * 0.2f, 3.05f - k * 0.2f, 24, false, false);
                        }
                        lh.Submesh = 0;
                        lh.Cylinder(Vector3.up * 22f, Vector3.up * 22.6f, 3.2f, 3.2f, 24);
                        lh.Submesh = 1;
                        lh.Cylinder(Vector3.up * 22.6f, Vector3.up * 25f, 1.8f, 1.8f, 20);
                        lh.Submesh = 2;
                        lh.Cylinder(Vector3.up * 25f, Vector3.up * 27f, 2.2f, 0.2f, 20);
                        var lm = SaveMesh(lh.ToMesh("Lighthouse"));
                        MeshObj("Lighthouse", s_World, lm, new[] { Mat.Concrete, Mat.TabletYellow, Mat.ContainerRed }, c + new Vector3(8f, 0, 0), Quaternion.identity, Col.Mesh);
                        var beam = Obj("LighthouseLamp", s_World, c + new Vector3(8f, 24f, 0), Quaternion.identity).AddComponent<Light>();
                        beam.type = LightType.Point; beam.range = 30f; beam.intensity = 4f; beam.color = new Color(1f, 0.9f, 0.6f);
                        Building("Keeper House", c + new Vector3(-14f, 0, 10f), 90f, 9f, 7f, 3.2f, Mat.Concrete, Mat.Roof);
                        Building("Boathouse", c + new Vector3(-12f, 0, -14f), 0f, 8f, 6f, 3.2f, Mat.Wood, Mat.Roof);
                        Cache(c + new Vector3(0f, 0, -2f), 0f, false);
                        Vent(c + new Vector3(-26f, 0, -4f));
                        break;
                    }

                    case "Marrow Village":
                    {
                        var road = new MeshBuilder(1) { UVScale = 0.1f };
                        road.Box(new Vector3(0, 0.05f, 0), Quaternion.identity, new Vector3(8f, 0.1f, 110f));
                        road.Box(new Vector3(0, 0.05f, 0), Quaternion.identity, new Vector3(90f, 0.1f, 8f));
                        var rm = SaveMesh(road.ToMesh("VillageRoad"));
                        MeshObj("Road", s_World, rm, new[] { Mat.Asphalt }, c, Quaternion.identity, Col.Box);
                        int n = 0;
                        foreach (var off in new[] { new Vector2(-16, 22), new Vector2(16, 22), new Vector2(-16, -22), new Vector2(16, -22), new Vector2(-36, 14), new Vector2(36, -14) })
                        {
                            float yaw = off.x < 0 ? 90f : -90f;
                            Building("House", c + new Vector3(off.x, 0, off.y), yaw, 9f, 8f, 3.2f, n % 2 == 0 ? Mat.Concrete : Mat.Wood, Mat.Roof);
                            n++;
                        }
                        Terminal(c + new Vector3(6f, 0, 6f), 225f);
                        Tablet(c + new Vector3(-6f, 0, -6f), 45f);
                        Cache(c + new Vector3(0f, 0, 40f), 0f, true);
                        for (int k = 0; k < 4; k++) Barrier(c + new Vector3(Rf(-30f, 30f), 0.1f, Rf(-4f, 4f)), 90f + Rf(-15, 15));
                        break;
                    }
                }
            }
        }

        static void Rock(Vector3 pos, float size)
        {
            int variant = R.Next(5);
            var mesh = CachedMesh("Rock_" + variant, () => ProceduralMeshBuilder.Rock(variant * 17 + 3, new Vector3(1.4f, 0.9f, 1.2f)));
            MeshObj("Rock", s_World, mesh, new[] { Mat.Rock }, pos, Quaternion.Euler(Rf(-10, 10), Rf(0, 360), Rf(-10, 10)), Col.Mesh, true, Vector3.one * size);
        }

        // =====================================================================
        // Foliage
        // =====================================================================

        static bool NearPoi(float x, float z, float margin)
        {
            foreach (var p in Pois)
                if (Vector2.Distance(new Vector2(x, z), p.pos) < p.flatRadius * 0.8f + margin) return true;
            return false;
        }

        static void BuildFoliage()
        {
            var foliage = new GameObject("Foliage").transform;
            var broad = new[] { SaveMesh(ProceduralMeshBuilder.BroadleafTree(11)), SaveMesh(ProceduralMeshBuilder.BroadleafTree(23)), SaveMesh(ProceduralMeshBuilder.BroadleafTree(37)) };
            var conifer = new[] { SaveMesh(ProceduralMeshBuilder.ConiferTree(5)), SaveMesh(ProceduralMeshBuilder.ConiferTree(9)) };
            var bushes = new[] { SaveMesh(ProceduralMeshBuilder.Bush(3)), SaveMesh(ProceduralMeshBuilder.Bush(8)) };
            s_FoliageMeshes.AddRange(broad); s_FoliageMeshes.AddRange(conifer); s_FoliageMeshes.AddRange(bushes);

            int trees = 0, attempts = 0;
            while (trees < 430 && attempts++ < 8000)
            {
                float x = Rf(-420f, 420f), z = Rf(-420f, 420f);
                float h = Ground(x, z);
                if (h < WorldInfo.WaterLevel + 3f) continue;
                if (NearPoi(x, z, 0f) && !(Vector2.Distance(new Vector2(x, z), Pois[4].pos) < 90f)) continue;
                float density = Mathf.PerlinNoise(x * 0.012f + 50f, z * 0.012f + 50f);
                if (density < 0.42f) continue;
                Vector3 n = s_Terrain.terrainData.GetInterpolatedNormal((x + 500f) / 1000f, (z + 500f) / 1000f);
                if (Vector3.Angle(n, Vector3.up) > 28f) continue;
                bool pine = h > 30f || density > 0.62f;
                var mesh = pine ? conifer[R.Next(conifer.Length)] : broad[R.Next(broad.Length)];
                float s = Rf(0.85f, 1.25f);
                var go = MeshObj(pine ? "Pine" : "Tree", foliage, mesh, new[] { Mat.Bark, pine ? Mat.LeavesB : Mat.LeavesA }, new Vector3(x, h - 0.2f, z), Quaternion.Euler(0, Rf(0, 360), 0), Col.None, false, Vector3.one * s);
                var cc = go.AddComponent<CapsuleCollider>();
                cc.radius = 0.35f; cc.height = 8f; cc.center = new Vector3(0, 4f, 0);
                trees++;
            }
            for (int i = 0; i < 160; i++)
            {
                float x = Rf(-410f, 410f), z = Rf(-410f, 410f);
                float h = Ground(x, z);
                if (h < WorldInfo.WaterLevel + 2f || NearPoi(x, z, -10f)) continue;
                MeshObj("Bush", foliage, bushes[R.Next(bushes.Length)], new[] { Mat.Bark, Mat.LeavesA }, new Vector3(x, h - 0.1f, z), Quaternion.Euler(0, Rf(0, 360), 0), Col.None, false, Vector3.one * Rf(0.8f, 1.4f));
            }
            for (int i = 0; i < 70; i++)
            {
                float x = Rf(-400f, 400f), z = Rf(-400f, 400f);
                float h = Ground(x, z);
                if (h < WorldInfo.WaterLevel - 1f || NearPoi(x, z, 5f)) continue;
                Rock(new Vector3(x, h - 0.6f, z), Rf(1.2f, 4.5f));
            }
        }

        // =====================================================================
        // Reboot Trial chamber
        // =====================================================================

        static RebootTrial BuildRebootArena()
        {
            Vector3 c = new Vector3(0f, 80f, 2000f);
            var root = Obj("Reboot Trial Chamber", s_World, c, Quaternion.identity);
            var b = new MeshBuilder(2) { UVScale = 0.25f };
            const float S = 44f, H = 8f;
            b.Box(new Vector3(0, -0.5f, 0), Quaternion.identity, new Vector3(S, 1f, S));
            b.Box(new Vector3(0, H / 2, S / 2), Quaternion.identity, new Vector3(S, H, 1f));
            b.Box(new Vector3(0, H / 2, -S / 2), Quaternion.identity, new Vector3(S, H, 1f));
            b.Box(new Vector3(S / 2, H / 2, 0), Quaternion.identity, new Vector3(1f, H, S));
            b.Box(new Vector3(-S / 2, H / 2, 0), Quaternion.identity, new Vector3(1f, H, S));
            b.Box(new Vector3(0, H + 0.5f, 0), Quaternion.identity, new Vector3(S, 1f, S));
            b.Submesh = 1;
            for (int i = -1; i <= 1; i += 2)
            {
                b.Box(new Vector3(0, H - 0.6f, i * (S / 2 - 0.6f)), Quaternion.identity, new Vector3(S - 4f, 0.25f, 0.15f));
                b.Box(new Vector3(i * (S / 2 - 0.6f), H - 0.6f, 0), Quaternion.identity, new Vector3(0.15f, 0.25f, S - 4f));
            }
            var mesh = SaveMesh(b.ToMesh("RebootChamber"));
            MeshObj("Chamber", root.transform, mesh, new[] { Mat.ConcreteDark, Mat.TerminalScreen }, c, Quaternion.identity, Col.Mesh);
            var pillar = CachedMesh("Pillar", () => { var pb = new MeshBuilder(1); pb.RoundedBox(new Vector3(0, 1.8f, 0), new Vector3(2f, 3.6f, 2f), 0.15f, 2); return pb.ToMesh("Pillar"); });
            foreach (var pp in new[] { new Vector2(-9, -6), new Vector2(9, -6), new Vector2(0, 2), new Vector2(-10, 9), new Vector2(10, 9), new Vector2(0, -12) })
                MeshObj("Pillar", root.transform, pillar, new[] { Mat.Concrete }, c + new Vector3(pp.x, 0, pp.y), Quaternion.identity, Col.Box);
            for (int i = 0; i < 4; i++)
            {
                var l = Obj("ChamberLight", root.transform, c + new Vector3(i % 2 == 0 ? -11f : 11f, 6.5f, i < 2 ? -11f : 11f), Quaternion.identity).AddComponent<Light>();
                l.type = LightType.Point; l.range = 26f; l.intensity = 9f; l.color = new Color(0.85f, 0.95f, 1f);
            }
            var spawn = Obj("PlayerSpawn", root.transform, c + new Vector3(0, 0.2f, -18f), Quaternion.identity);
            var drones = new Transform[6];
            for (int i = 0; i < 6; i++)
                drones[i] = Obj("DroneSpawn" + i, root.transform, c + Quaternion.Euler(0, i * 60f, 0) * new Vector3(0, 0, 13f) + Vector3.up * 4.5f, Quaternion.identity).transform;
            var trial = root.AddComponent<RebootTrial>();
            trial.playerSpawn = spawn.transform;
            trial.droneSpawns = drones;
            trial.arenaRadius = 18f;
            return trial;
        }

        // =====================================================================
        // Player, aircraft, bots
        // =====================================================================

        static void BuildPlayer()
        {
            var go = new GameObject("Player");
            go.transform.position = new Vector3(0, 650f, -700f);
            var cc = go.AddComponent<CharacterController>();
            cc.height = 1.8f; cc.radius = 0.35f; cc.center = new Vector3(0, 0.9f, 0);
            cc.slopeLimit = 46f; cc.stepOffset = 0.42f; cc.skinWidth = 0.04f;
            var health = go.AddComponent<PlayerHealthArmor>();
            health.isPlayer = true;
            health.startArmor = 50f;
            var lo = go.AddComponent<PlayerLoadout>();
            lo.cash = 400; lo.armorPlates = 3;
            go.AddComponent<PlayerInteractor>();
            var weapon = go.AddComponent<ProceduralWeaponController>();
            go.AddComponent<Killstreaks>();

            var camRoot = Obj("CameraRoot", go.transform, Vector3.zero, Quaternion.identity);
            camRoot.transform.localPosition = new Vector3(0, 1.62f, 0);
            var rig = Obj("CameraRig", camRoot.transform, Vector3.zero, Quaternion.identity);
            rig.transform.localPosition = Vector3.zero;
            var camGo = Obj("Main Camera", rig.transform, Vector3.zero, Quaternion.identity);
            camGo.transform.localPosition = Vector3.zero;
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.02f;
            cam.farClipPlane = 2500f;
            cam.fieldOfView = 78f;
            camGo.AddComponent<AudioListener>();
            var data = cam.GetUniversalAdditionalCameraData();
            data.renderPostProcessing = true;
            data.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            data.renderShadows = true;
            var pivot = Obj("WeaponPivot", camGo.transform, Vector3.zero, Quaternion.identity);
            pivot.transform.localPosition = Vector3.zero;

            var chuteMesh = CachedMesh("Parachute", ProceduralMeshBuilder.ParachuteCanopy);
            var chute = MeshObj("Parachute", go.transform, chuteMesh, new[] { Mat.ParachuteFabric, Mat.BotGear }, Vector3.zero, Quaternion.identity, Col.None, false);
            chute.transform.localPosition = new Vector3(0, 1.2f, 0);

            var pc = go.AddComponent<TacticalPlayerController>();
            pc.cameraRoot = camRoot.transform;
            pc.cameraRig = rig.transform;
            pc.cam = cam;
            pc.parachuteVisual = chute;
            weapon.weaponPivot = pivot.transform;
            weapon.armsRoot = camGo.transform;
            // reorder so the controller sits first in the inspector
            UnityEditorInternal.ComponentUtility.MoveComponentUp(pc);
        }

        static InfilAircraft BuildAircraft()
        {
            var bodyMesh = CachedMesh("CargoAircraft", ProceduralMeshBuilder.CargoAircraft);
            var go = MeshObj("Skyhauler", null, bodyMesh, new[] { Mat.AircraftBody, Mat.WindowGlass }, new Vector3(0, 600f, -700f), Quaternion.identity, Col.None, false);
            var rampMesh = CachedMesh("AircraftRamp", ProceduralMeshBuilder.AircraftRamp);
            var ramp = MeshObj("Ramp", go.transform, rampMesh, new[] { Mat.AircraftBody }, Vector3.zero, Quaternion.identity, Col.None, false);
            ramp.transform.localPosition = new Vector3(0, -1.6f, -11.5f);
            ramp.transform.localRotation = Quaternion.Euler(-18f, 0, 0);
            var anchor = Obj("RampAnchor", go.transform, Vector3.zero, Quaternion.identity);
            anchor.transform.localPosition = new Vector3(0, -1.4f, -9.5f);
            var prop = CachedMesh("Propeller", () =>
            {
                var pb = new MeshBuilder(1);
                pb.Sphere(Vector3.zero, new Vector3(0.35f, 0.35f, 0.5f), 8, 12);
                for (int i = 0; i < 4; i++) pb.RoundedBox(Vector3.zero, Quaternion.Euler(0, 0, i * 90f + 20f), new Vector3(0.22f, 3.6f, 0.06f), 0.03f, 1);
                return pb.ToMesh("Propeller");
            });
            var props = new List<Transform>();
            foreach (float x in new[] { -13f, -6.5f, 6.5f, 13f })
            {
                var p = MeshObj("Prop", go.transform, prop, new[] { Mat.GunMetal }, Vector3.zero, Quaternion.identity, Col.None, false);
                p.transform.localPosition = new Vector3(x, 1.8f, 5.3f);
                props.Add(p.transform);
            }
            var ia = go.AddComponent<InfilAircraft>();
            ia.rampAnchor = anchor.transform;
            ia.propellers = props.ToArray();
            return ia;
        }

        static void BuildBots()
        {
            var botsRoot = new GameObject("Bot Squads").transform;
            string[] callsigns = { "Kilo", "Raven", "Viper", "Onyx", "Talon", "Ember", "Wraith", "Saber" };
            for (int s = 0; s < callsigns.Length; s++)
            {
                var poi = Pois[s % Pois.Length];
                float a = Rf(0, Mathf.PI * 2f);
                Vector2 off = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * Rf(10f, poi.flatRadius * 0.6f);
                Vector3 c = OnGround(poi.pos.x + off.x, poi.pos.y + off.y, 0.2f);
                var squadGo = Obj("Squad " + callsigns[s], botsRoot, c, Quaternion.identity);
                var squad = squadGo.AddComponent<BotSquad>();
                squad.callsign = callsigns[s];
                BotRole[] roles = { BotRole.Rifleman, BotRole.Flanker, BotRole.Sniper };
                for (int i = 0; i < 3; i++)
                {
                    Vector3 p = c + new Vector3(Rf(-5f, 5f), 0, Rf(-5f, 5f));
                    p.y = Ground(p.x, p.z) + 0.15f;
                    var bot = Obj($"{callsigns[s]}-{i + 1} ({roles[i]})", squadGo.transform, p, Quaternion.Euler(0, Rf(0, 360), 0));
                    var cc = bot.AddComponent<CharacterController>();
                    cc.height = 1.8f; cc.radius = 0.32f; cc.center = new Vector3(0, 0.9f, 0);
                    var h = bot.AddComponent<PlayerHealthArmor>();
                    h.isPlayer = false;
                    bot.AddComponent<BotBody>();
                    var ai = bot.AddComponent<TacticalBotAI>();
                    ai.role = roles[i];
                    ai.squad = squad;
                    ai.seed = s * 10 + i + 1;
                    squad.members.Add(ai);
                }
            }
        }

        static void BuildManagers(InfilAircraft aircraft, RebootTrial trial)
        {
            var go = new GameObject("Game Managers");
            var ring = go.AddComponent<StormRingAndMatchManager>();
            ring.aircraft = aircraft;
            ring.rebootTrial = trial;
            go.AddComponent<SupplyTerminalAndLootManager>();
            go.AddComponent<ContractTracker>();
            var wind = go.AddComponent<FoliageWind>();
            wind.foliageMeshes = s_FoliageMeshes.ToArray();
        }

        static void BuildHud()
        {
            var canvasGo = new GameObject("HUD Canvas");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            canvasGo.AddComponent<GraphicRaycaster>();
            canvasGo.AddComponent<StormfallHUDController>();

            var es = new GameObject("EventSystem", typeof(EventSystem));
            es.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
        }
    }
}
