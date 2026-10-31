using UnityEngine;

namespace Stormfall
{
    /// <summary>Hovering Reboot Trial sentry: strafes, tracks the player and fires short bursts.</summary>
    public class SentryDrone : MonoBehaviour, IDamageable
    {
        public float health = 90f;
        public float activationDelay = 2f;
        public RebootTrial trial;

        public bool IsAlive => health > 0f;
        public Transform Root => transform;

        static Mesh s_Mesh;
        static WeaponInstance s_Gun;
        Vector3 m_Target;
        float m_Retarget, m_BurstCooldown, m_ShotTimer;
        int m_BurstLeft;
        Transform m_Visual;
        float m_Wobble;

        public static SentryDrone Spawn(Vector3 pos, RebootTrial trial)
        {
            if (s_Mesh == null) s_Mesh = ProceduralMeshBuilder.SentryDroneMesh();
            var go = new GameObject("SentryDrone");
            go.transform.position = pos;
            var d = go.AddComponent<SentryDrone>();
            d.trial = trial;
            var vis = new GameObject("Visual");
            vis.transform.SetParent(go.transform, false);
            vis.AddComponent<MeshFilter>().sharedMesh = s_Mesh;
            vis.AddComponent<MeshRenderer>().sharedMaterials = new[] { MaterialLibrary.Get(Mat.DroneBody), MaterialLibrary.Get(Mat.DroneEye) };
            d.m_Visual = vis.transform;
            var hit = new GameObject("Hitbox");
            hit.transform.SetParent(go.transform, false);
            var sc = hit.AddComponent<SphereCollider>();
            sc.isTrigger = true;
            sc.radius = 0.55f;
            var hz = HitboxZone.Add(hit, HitZone.UpperTorso);
            hz.multiplier = 1f;
            AudioFX.CreateLoop(go.transform, Sfx.DroneHum, 0.5f, 1f, 30f);
            var light = go.AddComponent<Light>();
            light.type = LightType.Point; light.color = new Color(1f, 0.2f, 0.1f); light.range = 4f; light.intensity = 2f;
            return d;
        }

        static WeaponInstance Gun
        {
            get
            {
                if (s_Gun == null)
                {
                    var data = ScriptableObject.CreateInstance<WeaponData>();
                    data.id = "sentry"; data.displayName = "Sentry"; data.damage = 4f; data.range1 = 20f; data.range2 = 40f;
                    data.muzzleVelocity = 260f; data.rpm = 600f; data.tracerEvery = 1;
                    s_Gun = new WeaponInstance(data, Rarity.Common, AttachmentFlags.None);
                }
                return s_Gun;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { s_Mesh = null; s_Gun = null; }

        void Start() => m_Target = transform.position;

        void Update()
        {
            float dt = Time.deltaTime;
            m_Wobble += dt;
            Vector3 center = trial != null ? trial.transform.position : transform.position;
            float radius = trial != null ? trial.arenaRadius : 15f;
            m_Retarget -= dt;
            if (m_Retarget <= 0f)
            {
                m_Retarget = Random.Range(1.2f, 2.6f);
                Vector2 r = Random.insideUnitCircle * radius * 0.8f;
                m_Target = center + new Vector3(r.x, Random.Range(3f, 6.5f), r.y);
            }
            transform.position = Vector3.Lerp(transform.position, m_Target, 1f - Mathf.Exp(-1.2f * dt));
            Vector3 bob = new Vector3(0, Mathf.Sin(m_Wobble * 2.3f) * 0.12f, 0);
            if (m_Visual != null) m_Visual.localPosition = bob;

            if (!LocalPlayer.Exists) return;
            Vector3 eye = LocalPlayer.EyePosition - Vector3.up * 0.3f;
            Vector3 to = eye - transform.position;
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), 1f - Mathf.Exp(-4f * dt));

            if (activationDelay > 0f) { activationDelay -= dt; return; }
            m_BurstCooldown -= dt;
            if (m_BurstLeft <= 0 && m_BurstCooldown <= 0f && Ballistics.HasLineOfSight(transform.position, eye, transform, LocalPlayer.Transform))
            {
                m_BurstLeft = 3;
                m_BurstCooldown = Random.Range(2.2f, 3.6f);
            }
            if (m_BurstLeft > 0)
            {
                m_ShotTimer -= dt;
                if (m_ShotTimer <= 0f)
                {
                    m_ShotTimer = 0.14f;
                    m_BurstLeft--;
                    Vector3 muzzle = transform.position + transform.forward * 0.5f - transform.up * 0.12f;
                    Vector3 dir = (to.normalized + Random.insideUnitSphere * 0.07f).normalized;
                    Ballistics.Fire(gameObject, Gun, muzzle, dir, muzzle, true);
                    WeaponFX.MuzzleFlash(muzzle, dir, 0.5f);
                    AudioFX.PlayAt(Sfx.SmgShot, muzzle, 0.6f, 1.4f, 80f);
                }
            }
        }

        public DamageResult TakeDamage(DamageInfo info)
        {
            var r = new DamageResult();
            if (!IsAlive) return r;
            r.applied = true;
            r.healthDamage = info.amount;
            health -= info.amount;
            if (health <= 0f)
            {
                r.killed = true;
                WeaponFX.Explode(transform.position, 0f, 2f, null, Sfx.GrenadeBounce);
                AudioFX.PlayAt(Sfx.Explosion, transform.position, 0.7f, 1.5f, 80f);
                if (trial != null) trial.NotifyDroneDestroyed(this);
                Destroy(gameObject);
            }
            return r;
        }
    }
}
