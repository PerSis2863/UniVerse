using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Simulated projectiles with drag and gravity (GUNPLAY_MATH §7), layer-free hit resolution
    /// (TECHNICAL_SPEC §1.3), tracers, near-miss whiz and range-based damage.
    /// </summary>
    public class Ballistics : MonoBehaviour
    {
        struct Bullet
        {
            public Vector3 pos, vel, visualOffset;
            public float traveled, life, damageScale;
            public GameObject shooter;
            public Transform shooterRoot;
            public WeaponInstance weapon;
            public int tracer;
            public bool whizzed, fromPlayer;
        }

        const float Step = 1f / 240f;
        const float MaxLife = 2.5f, MaxRange = 1200f, Drag = 0.04f;
        static readonly Vector3 Gravity = new Vector3(0, -9.81f, 0);

        static Ballistics s_Instance;
        readonly List<Bullet> m_Bullets = new List<Bullet>(256);
        readonly List<LineRenderer> m_TracerPool = new List<LineRenderer>();
        readonly Stack<int> m_FreeTracers = new Stack<int>();
        float m_Accumulator;

        static readonly RaycastHit[] s_Hits = new RaycastHit[32];
        static readonly HitComparer s_Comparer = new HitComparer();

        class HitComparer : IComparer<RaycastHit>
        {
            public int Compare(RaycastHit a, RaycastHit b) => a.distance.CompareTo(b.distance);
        }

        public static Ballistics Instance
        {
            get
            {
                if (s_Instance == null) s_Instance = new GameObject("Ballistics").AddComponent<Ballistics>();
                return s_Instance;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Instance = null;

        /// <summary>Fires one projectile from <paramref name="origin"/> along <paramref name="dir"/>.</summary>
        public static void Fire(GameObject shooter, WeaponInstance w, Vector3 origin, Vector3 dir, Vector3 muzzle, bool tracer, float damageScale = 1f)
        {
            var inst = Instance;
            var b = new Bullet
            {
                pos = origin,
                vel = dir.normalized * w.data.muzzleVelocity * w.VelocityMul,
                visualOffset = muzzle - origin,
                shooter = shooter,
                shooterRoot = shooter != null ? shooter.transform : null,
                weapon = w,
                damageScale = damageScale,
                tracer = -1,
                fromPlayer = LocalPlayer.IsPlayer(shooter)
            };
            if (tracer) b.tracer = inst.AcquireTracer(w.data.style == WeaponStyle.Sniper);
            inst.m_Bullets.Add(b);
        }

        /// <summary>
        /// Finds the first meaningful hit between two points, ignoring the shooter's hierarchy, character
        /// capsules and non-hitbox triggers.
        /// </summary>
        public static bool Resolve(Vector3 from, Vector3 to, Transform ignoreRoot, out RaycastHit hit, out HitboxZone zone)
        {
            zone = null;
            hit = default;
            Vector3 d = to - from;
            float len = d.magnitude;
            if (len < 1e-5f) return false;
            int n = Physics.RaycastNonAlloc(from, d / len, s_Hits, len, ~0, QueryTriggerInteraction.Collide);
            if (n == 0) return false;
            System.Array.Sort(s_Hits, 0, n, s_Comparer);
            for (int i = 0; i < n; i++)
            {
                var h = s_Hits[i];
                var col = h.collider;
                if (col == null) continue;
                if (ignoreRoot != null && col.transform.IsChildOf(ignoreRoot)) continue;
                if (col is CharacterController) continue;
                var hz = col.GetComponent<HitboxZone>();
                if (hz != null)
                {
                    if (hz.Owner == null || !hz.Owner.IsAlive) continue;
                    zone = hz; hit = h; return true;
                }
                if (col.isTrigger) continue;
                hit = h;
                return true;
            }
            return false;
        }

        /// <summary>Line-of-sight test that ignores characters and triggers.</summary>
        public static bool HasLineOfSight(Vector3 from, Vector3 to, Transform ignoreA, Transform ignoreB)
        {
            Vector3 d = to - from;
            float len = d.magnitude;
            int n = Physics.RaycastNonAlloc(from, d / Mathf.Max(len, 1e-5f), s_Hits, len, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < n; i++)
            {
                var c = s_Hits[i].collider;
                if (c == null || c is CharacterController) continue;
                if ((ignoreA != null && c.transform.IsChildOf(ignoreA)) || (ignoreB != null && c.transform.IsChildOf(ignoreB))) continue;
                if (c.GetComponentInParent<IDamageable>() != null) continue;
                return false;
            }
            return true;
        }

        void Update()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            m_Accumulator += dt;
            int steps = 0;
            while (m_Accumulator >= Step && steps < 40)
            {
                m_Accumulator -= Step;
                steps++;
                for (int i = m_Bullets.Count - 1; i >= 0; i--)
                {
                    var b = m_Bullets[i];
                    if (!StepBullet(ref b)) { Release(b); m_Bullets.RemoveAt(i); continue; }
                    m_Bullets[i] = b;
                }
            }
            UpdateTracers();
        }

        bool StepBullet(ref Bullet b)
        {
            Vector3 prev = b.pos;
            b.vel = b.vel * Mathf.Exp(-Drag * Step) + Gravity * Step;
            Vector3 next = prev + b.vel * Step;
            b.life += Step;

            if (!b.fromPlayer && !b.whizzed && LocalPlayer.Exists) CheckWhiz(ref b, prev, next);

            if (Resolve(prev, next, b.shooterRoot, out var hit, out var zone))
            {
                b.traveled += hit.distance;
                ApplyHit(b, hit, zone);
                return false;
            }
            b.traveled += Vector3.Distance(prev, next);
            b.pos = next;
            return b.life < MaxLife && b.traveled < MaxRange && b.pos.y > -50f;
        }

        void CheckWhiz(ref Bullet b, Vector3 a, Vector3 c)
        {
            Vector3 eye = LocalPlayer.EyePosition;
            Vector3 ab = c - a;
            float t = Mathf.Clamp01(Vector3.Dot(eye - a, ab) / Mathf.Max(ab.sqrMagnitude, 1e-6f));
            Vector3 closest = a + ab * t;
            if ((closest - eye).sqrMagnitude < 2.5f * 2.5f)
            {
                b.whizzed = true;
                AudioFX.PlayAt(Sfx.BulletWhiz, closest, 0.7f, Random.Range(0.85f, 1.2f), 15f);
            }
        }

        static void ApplyHit(Bullet b, RaycastHit hit, HitboxZone zone)
        {
            if (zone != null)
            {
                float mult = zone.zone == HitZone.Head ? b.weapon.data.headMultiplier : zone.multiplier;
                var info = new DamageInfo
                {
                    amount = b.weapon.DamageAt(b.traveled) * mult * b.damageScale,
                    point = hit.point,
                    direction = b.vel.normalized,
                    source = b.shooter,
                    zone = zone.zone,
                    type = DamageType.Bullet
                };
                var owner = zone.Owner;
                var result = owner.TakeDamage(info);
                if (result.applied) GameEvents.RaiseDamage(b.shooter, owner, result, hit.point);
                WeaponFX.HitPuff(hit.point, -b.vel.normalized, result.hitArmor);
                return;
            }
            WeaponFX.Impact(hit.point, hit.normal, hit.collider);
            var rb = hit.rigidbody;
            if (rb != null && !rb.isKinematic) rb.AddForceAtPosition(b.vel.normalized * 4f, hit.point, ForceMode.Impulse);
        }

        // ------------------------------------------------------------------ tracers
        int AcquireTracer(bool heavy)
        {
            int idx;
            if (m_FreeTracers.Count > 0) idx = m_FreeTracers.Pop();
            else
            {
                var go = new GameObject("Tracer");
                go.transform.SetParent(transform, false);
                var lr = go.AddComponent<LineRenderer>();
                lr.sharedMaterial = MaterialLibrary.Get(Mat.FxTracer);
                lr.positionCount = 2;
                lr.numCapVertices = 2;
                lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                lr.receiveShadows = false;
                lr.useWorldSpace = true;
                m_TracerPool.Add(lr);
                idx = m_TracerPool.Count - 1;
            }
            var t = m_TracerPool[idx];
            t.widthMultiplier = heavy ? 0.045f : 0.025f;
            t.startColor = new Color(1f, 0.85f, 0.6f, 0.1f);
            t.endColor = heavy ? new Color(1f, 0.95f, 0.85f, 1f) : new Color(1f, 0.75f, 0.4f, 1f);
            t.enabled = false;
            return idx;
        }

        void Release(Bullet b)
        {
            if (b.tracer < 0) return;
            m_TracerPool[b.tracer].enabled = false;
            m_FreeTracers.Push(b.tracer);
        }

        void UpdateTracers()
        {
            foreach (var b in m_Bullets)
            {
                if (b.tracer < 0) continue;
                var lr = m_TracerPool[b.tracer];
                float blend = Mathf.Clamp01(1f - b.traveled / 25f);
                Vector3 head = b.pos + b.visualOffset * blend;
                float len = Mathf.Min(b.vel.magnitude * 0.03f, Mathf.Max(0.5f, b.traveled * 0.6f), 14f);
                Vector3 tail = head - b.vel.normalized * len;
                lr.SetPosition(0, tail);
                lr.SetPosition(1, head);
                lr.enabled = b.life > 0.008f;
            }
        }
    }
}
