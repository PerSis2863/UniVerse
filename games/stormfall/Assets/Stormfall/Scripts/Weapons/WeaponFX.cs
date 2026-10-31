using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    public enum SurfaceKind { Dirt, Concrete, Metal, Wood, Flesh }

    /// <summary>Optional override for impact effects on a collider.</summary>
    public interface ISurfaceTag { SurfaceKind Kind { get; } }

    /// <summary>Global trauma-based camera shake (squared falloff).</summary>
    public static class CameraShake
    {
        static float s_Trauma;
        public static void Add(float amount) => s_Trauma = Mathf.Clamp01(s_Trauma + amount);
        public static void AddAt(Vector3 pos, float amount, float radius)
        {
            if (!LocalPlayer.Exists) return;
            float d = Vector3.Distance(pos, LocalPlayer.Position);
            if (d < radius) Add(amount * (1f - d / radius));
        }

        public static Vector3 Sample(float dt)
        {
            s_Trauma = Mathf.Max(0f, s_Trauma - dt * 1.4f);
            float s = s_Trauma * s_Trauma;
            float t = Time.time * 23f;
            return new Vector3((Mathf.PerlinNoise(t, 1.3f) - 0.5f) * 6f, (Mathf.PerlinNoise(2.1f, t) - 0.5f) * 6f, (Mathf.PerlinNoise(t, 7.7f) - 0.5f) * 4f) * s;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Trauma = 0f;
    }

    /// <summary>
    /// Shared world-space particle systems (sparks, dust, smoke, fire), decal ring buffer,
    /// physical brass and dropped magazines, plus explosions with damage.
    /// </summary>
    public class WeaponFX : MonoBehaviour
    {
        static WeaponFX s_Instance;
        ParticleSystem m_Sparks, m_Dust, m_Smoke, m_Fire, m_Flash, m_Puff;
        readonly List<Transform> m_Decals = new List<Transform>();
        int m_NextDecal;
        Mesh m_Quad;

        class Debris { public Transform t; public Vector3 v, spin; public float life; public bool tink; }
        readonly List<Debris> m_Debris = new List<Debris>();
        readonly Stack<Transform> m_BrassPool = new Stack<Transform>();
        Mesh m_BrassMesh;

        public static WeaponFX Instance
        {
            get
            {
                if (s_Instance == null) s_Instance = new GameObject("WeaponFX").AddComponent<WeaponFX>();
                return s_Instance;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Instance = null;

        void Awake()
        {
            if (s_Instance != null && s_Instance != this) { Destroy(gameObject); return; }
            s_Instance = this;
            m_Sparks = MakeSystem("Sparks", Mat.FxSpark, 600, true, 1.2f);
            m_Dust = MakeSystem("Dust", Mat.FxDust, 400, false, -0.05f);
            m_Smoke = MakeSystem("Smoke", Mat.FxSmoke, 300, false, -0.08f);
            m_Fire = MakeSystem("Fire", Mat.FxMuzzle, 200, false, -0.2f);
            m_Flash = MakeSystem("Flash", Mat.FxMuzzle, 100, false, 0f);
            m_Puff = MakeSystem("Puff", Mat.FxDust, 200, false, 0.1f);
            m_Quad = BuildQuad();
            m_BrassMesh = ProceduralMeshBuilder.BrassShell();
        }

        ParticleSystem MakeSystem(string name, Mat mat, int max, bool stretch, float gravity)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main;
            main.loop = true;
            main.playOnAwake = false;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.maxParticles = max;
            main.gravityModifier = gravity;
            var em = ps.emission; em.enabled = false;
            var shape = ps.shape; shape.enabled = false;
            var col = ps.colorOverLifetime;
            col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                      new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.8f, 0.3f), new GradientAlphaKey(0f, 1f) });
            col.color = g;
            var size = ps.sizeOverLifetime;
            size.enabled = true;
            size.size = new ParticleSystem.MinMaxCurve(1f, stretch ? AnimationCurve.Linear(0, 1, 1, 0.2f) : AnimationCurve.EaseInOut(0, 0.6f, 1, 1.6f));
            var r = go.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = MaterialLibrary.Get(mat);
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            if (stretch)
            {
                r.renderMode = ParticleSystemRenderMode.Stretch;
                r.velocityScale = 0.025f;
                r.lengthScale = 1.5f;
            }
            ps.Play();
            return ps;
        }

        static Mesh BuildQuad()
        {
            var b = new MeshBuilder(1);
            b.Plane(Vector3.zero, Vector3.right * 0.5f, Vector3.up * 0.5f, Vector2.one);
            return b.ToMesh("DecalQuad");
        }

        static void Emit(ParticleSystem ps, Vector3 pos, Vector3 vel, float size, float life, Color c)
        {
            var p = new ParticleSystem.EmitParams
            {
                position = pos,
                velocity = vel,
                startSize = size,
                startLifetime = life,
                startColor = c,
                rotation = Random.Range(0f, 360f),
                applyShapeToPosition = false
            };
            ps.Emit(p, 1);
        }

        // ================================================================== public API

        public static SurfaceKind Classify(Collider c)
        {
            if (c == null) return SurfaceKind.Dirt;
            var tag = c.GetComponentInParent<ISurfaceTag>();
            if (tag != null) return tag.Kind;
            if (c is TerrainCollider) return SurfaceKind.Dirt;
            var r = c.GetComponent<Renderer>();
            if (r != null && r.sharedMaterial != null)
            {
                string n = r.sharedMaterial.name;
                if (n.Contains("Container") || n.Contains("Metal") || n.Contains("Cache") || n.Contains("Terminal") || n.Contains("Aircraft") || n.Contains("Drone")) return SurfaceKind.Metal;
                if (n.Contains("Wood") || n.Contains("Bark")) return SurfaceKind.Wood;
            }
            return SurfaceKind.Concrete;
        }

        public static void Impact(Vector3 point, Vector3 normal, Collider c)
        {
            var fx = Instance;
            var kind = Classify(c);
            Vector3 n = normal;
            switch (kind)
            {
                case SurfaceKind.Metal:
                    for (int i = 0; i < 10; i++)
                        Emit(fx.m_Sparks, point, (n + Random.insideUnitSphere * 0.8f).normalized * Random.Range(4f, 11f), Random.Range(0.02f, 0.04f), Random.Range(0.15f, 0.4f), new Color(1f, 0.8f, 0.45f));
                    AudioFX.PlayAt(Sfx.BulletImpactMetal, point, 0.5f, Random.Range(0.85f, 1.2f), 35f);
                    break;
                case SurfaceKind.Dirt:
                    for (int i = 0; i < 5; i++)
                        Emit(fx.m_Dust, point, (n + Random.insideUnitSphere * 0.5f).normalized * Random.Range(1f, 3f), Random.Range(0.25f, 0.5f), Random.Range(0.5f, 1.0f), new Color(0.55f, 0.47f, 0.35f, 0.7f));
                    AudioFX.PlayAt(Sfx.BulletImpactDirt, point, 0.45f, Random.Range(0.9f, 1.1f), 30f);
                    break;
                default:
                    for (int i = 0; i < 4; i++)
                        Emit(fx.m_Sparks, point, (n + Random.insideUnitSphere * 0.7f).normalized * Random.Range(3f, 7f), 0.025f, Random.Range(0.1f, 0.25f), new Color(1f, 0.85f, 0.6f));
                    for (int i = 0; i < 4; i++)
                        Emit(fx.m_Dust, point, (n + Random.insideUnitSphere * 0.4f).normalized * Random.Range(0.6f, 2f), Random.Range(0.2f, 0.4f), Random.Range(0.6f, 1.1f), kind == SurfaceKind.Wood ? new Color(0.5f, 0.38f, 0.25f, 0.7f) : new Color(0.7f, 0.7f, 0.68f, 0.7f));
                    AudioFX.PlayAt(Sfx.BulletImpactDirt, point, 0.4f, Random.Range(1.2f, 1.5f), 30f);
                    break;
            }
            if (kind != SurfaceKind.Dirt || !(c is TerrainCollider)) fx.PlaceDecal(point, normal, Mat.DecalBulletHole, Random.Range(0.06f, 0.09f), c != null ? c.transform : null);
        }

        public static void HitPuff(Vector3 point, Vector3 normal, bool armor)
        {
            var fx = Instance;
            Color c = armor ? new Color(0.4f, 0.9f, 1f, 0.9f) : new Color(0.45f, 0.08f, 0.06f, 0.75f);
            for (int i = 0; i < (armor ? 8 : 5); i++)
                Emit(armor ? fx.m_Sparks : fx.m_Puff, point, (normal + Random.insideUnitSphere * 0.6f).normalized * Random.Range(1f, armor ? 6f : 2.5f),
                     armor ? 0.03f : Random.Range(0.12f, 0.22f), Random.Range(0.15f, 0.35f), c);
        }

        public static void MuzzleFlash(Vector3 pos, Vector3 fwd, float scale)
        {
            var fx = Instance;
            Emit(fx.m_Flash, pos + fwd * 0.03f * scale, fwd * 0.5f, 0.22f * scale, 0.045f, new Color(1f, 0.75f, 0.4f, 1f));
            Emit(fx.m_Flash, pos + fwd * 0.09f * scale, fwd * 1.5f, 0.14f * scale, 0.04f, new Color(1f, 0.6f, 0.3f, 0.9f));
            for (int i = 0; i < 5; i++)
                Emit(fx.m_Sparks, pos, (fwd + Random.insideUnitSphere * 0.35f).normalized * Random.Range(6f, 14f), 0.012f, Random.Range(0.04f, 0.1f), new Color(1f, 0.8f, 0.5f));
            Emit(fx.m_Smoke, pos + fwd * 0.05f, fwd * 0.6f + Vector3.up * 0.2f, 0.12f * scale, 0.6f, new Color(0.8f, 0.8f, 0.8f, 0.25f));
        }

        public static void Steam(Vector3 pos, Vector3 vel, float size, Color c)
        {
            Emit(Instance.m_Smoke, pos, vel, size, Random.Range(1.5f, 2.5f), c);
        }

        public static void Dust(Vector3 pos, Vector3 vel, float size, float life, Color c) => Emit(Instance.m_Dust, pos, vel, size, life, c);
        public static void Sparks(Vector3 pos, Vector3 vel, Color c) => Emit(Instance.m_Sparks, pos, vel, 0.03f, Random.Range(0.2f, 0.6f), c);

        void PlaceDecal(Vector3 point, Vector3 normal, Mat mat, float size, Transform parent)
        {
            Transform t;
            if (m_Decals.Count < 128)
            {
                var go = new GameObject("Decal");
                go.AddComponent<MeshFilter>().sharedMesh = m_Quad;
                var mr = go.AddComponent<MeshRenderer>();
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                t = go.transform;
                m_Decals.Add(t);
            }
            else
            {
                t = m_Decals[m_NextDecal];
                m_NextDecal = (m_NextDecal + 1) % m_Decals.Count;
            }
            t.GetComponent<MeshRenderer>().sharedMaterial = MaterialLibrary.Get(mat);
            bool attach = parent != null && !parent.gameObject.isStatic && parent.GetComponentInParent<Rigidbody>() != null;
            t.SetParent(attach ? parent : transform, true);
            t.SetPositionAndRotation(point + normal * 0.006f, Quaternion.LookRotation(-normal) * Quaternion.Euler(0, 0, Random.Range(0f, 360f)));
            t.localScale = Vector3.one * size;
            t.gameObject.SetActive(true);
        }

        // ------------------------------------------------------------------ brass & mags

        public static void EjectBrass(Vector3 pos, Quaternion rot, Vector3 velocity)
        {
            var fx = Instance;
            Transform t;
            if (fx.m_BrassPool.Count > 0) t = fx.m_BrassPool.Pop();
            else
            {
                var go = new GameObject("Brass");
                go.AddComponent<MeshFilter>().sharedMesh = fx.m_BrassMesh;
                var mr = go.AddComponent<MeshRenderer>();
                mr.sharedMaterial = MaterialLibrary.Get(Mat.Brass);
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                t = go.transform;
                t.SetParent(fx.transform, false);
            }
            t.gameObject.SetActive(true);
            t.SetPositionAndRotation(pos, rot);
            t.localScale = Vector3.one;
            fx.m_Debris.Add(new Debris { t = t, v = velocity, spin = Random.insideUnitSphere * 1500f, life = 2.5f, tink = true });
        }

        public static void DropObject(GameObject template, Vector3 pos, Quaternion rot, Vector3 velocity, float life = 6f)
        {
            var go = Instantiate(template, pos, rot, Instance.transform);
            go.SetActive(true);
            Instance.m_Debris.Add(new Debris { t = go.transform, v = velocity, spin = Random.insideUnitSphere * 200f, life = life, tink = false });
        }

        void Update()
        {
            float dt = Time.deltaTime;
            for (int i = m_Debris.Count - 1; i >= 0; i--)
            {
                var d = m_Debris[i];
                d.life -= dt;
                if (d.life <= 0f || d.t == null)
                {
                    if (d.t != null)
                    {
                        if (d.tink) { d.t.gameObject.SetActive(false); m_BrassPool.Push(d.t); }
                        else Destroy(d.t.gameObject);
                    }
                    m_Debris.RemoveAt(i);
                    continue;
                }
                d.v += Physics.gravity * dt;
                Vector3 step = d.v * dt;
                if (step.sqrMagnitude > 1e-8f && Physics.Raycast(d.t.position, step.normalized, out var hit, step.magnitude + 0.01f, ~0, QueryTriggerInteraction.Ignore)
                    && hit.collider.GetComponentInParent<TacticalPlayerController>() == null)
                {
                    d.t.position = hit.point + hit.normal * 0.005f;
                    d.v = Vector3.Reflect(d.v, hit.normal) * 0.35f;
                    d.spin *= 0.5f;
                    if (d.tink && d.v.magnitude > 0.6f) AudioFX.PlayAt(Sfx.ShellTink, hit.point, 0.25f, Random.Range(0.9f, 1.3f), 12f);
                    if (d.v.magnitude < 0.3f) { d.v = Vector3.zero; d.spin = Vector3.zero; }
                }
                else d.t.position += step;
                d.t.Rotate(d.spin * dt, Space.Self);
            }
        }

        // ------------------------------------------------------------------ explosions

        /// <summary>Fireball, smoke, debris, scorch, light flash, shake and radial damage with occlusion.</summary>
        public static void Explode(Vector3 pos, float damage, float radius, GameObject source, Sfx sound = Sfx.Explosion)
        {
            var fx = Instance;
            for (int i = 0; i < 18; i++)
                Emit(fx.m_Fire, pos + Random.insideUnitSphere * 0.6f, Random.insideUnitSphere * 5f + Vector3.up * 2f, Random.Range(1.2f, 2.6f), Random.Range(0.25f, 0.55f), new Color(1f, Random.Range(0.45f, 0.75f), 0.2f, 1f));
            for (int i = 0; i < 16; i++)
                Emit(fx.m_Smoke, pos + Random.insideUnitSphere, Random.insideUnitSphere * 2.5f + Vector3.up * 2.5f, Random.Range(2f, 4f), Random.Range(2.5f, 5f), new Color(0.22f, 0.21f, 0.2f, 0.7f));
            for (int i = 0; i < 40; i++)
                Emit(fx.m_Sparks, pos, (Random.insideUnitSphere + Vector3.up * 0.6f).normalized * Random.Range(8f, 24f), 0.05f, Random.Range(0.4f, 1.2f), new Color(1f, 0.7f, 0.3f));
            if (Physics.Raycast(pos + Vector3.up * 0.5f, Vector3.down, out var ground, 3f, ~0, QueryTriggerInteraction.Ignore))
                fx.PlaceDecal(ground.point, ground.normal, Mat.DecalScorch, radius * 0.6f, null);

            var lightGo = new GameObject("ExplosionLight");
            lightGo.transform.position = pos + Vector3.up;
            var l = lightGo.AddComponent<Light>();
            l.type = LightType.Point; l.color = new Color(1f, 0.6f, 0.3f); l.range = radius * 3f; l.intensity = 30f;
            lightGo.AddComponent<FadeLight>().duration = 0.35f;

            AudioFX.PlayAt(sound, pos, 1f, Random.Range(0.92f, 1.05f), 400f);
            CameraShake.AddAt(pos, 0.9f, radius * 4f);

            var hitSet = new HashSet<IDamageable>();
            foreach (var c in Physics.OverlapSphere(pos, radius, ~0, QueryTriggerInteraction.Collide))
            {
                var dmg = c.GetComponentInParent<IDamageable>();
                if (dmg == null || !dmg.IsAlive || hitSet.Contains(dmg)) continue;
                Vector3 target = dmg.Root.position + Vector3.up * 1.0f;
                if (!Ballistics.HasLineOfSight(pos + Vector3.up * 0.3f, target, dmg.Root, null)) continue;
                hitSet.Add(dmg);
                float d = Vector3.Distance(pos, target);
                float falloff = Mathf.Clamp01(1f - d / radius);
                var info = new DamageInfo { amount = damage * (0.2f + 0.8f * falloff * falloff), point = target, direction = (target - pos).normalized, source = source, zone = HitZone.Generic, type = DamageType.Explosion };
                var res = dmg.TakeDamage(info);
                if (res.applied) GameEvents.RaiseDamage(source, dmg, res, target);
            }
        }
    }
}
