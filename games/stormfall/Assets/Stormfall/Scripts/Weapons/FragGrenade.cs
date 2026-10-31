using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Cookable frag with bouncing ballistic flight. Registered for the HUD danger indicator.</summary>
    public class FragGrenade : MonoBehaviour
    {
        public static readonly List<FragGrenade> Live = new List<FragGrenade>();

        public float fuse = 3.5f;
        public float damage = 150f;
        public float radius = 7f;
        public GameObject owner;
        Vector3 m_Vel;
        Vector3 m_Spin;
        bool m_Resting;

        public float TimeLeft => fuse;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => Live.Clear();

        static Mesh s_Mesh;

        public static FragGrenade Throw(GameObject owner, Vector3 pos, Vector3 vel, float fuseRemaining)
        {
            if (s_Mesh == null) s_Mesh = ProceduralMeshBuilder.Grenade();
            var go = new GameObject("Frag");
            go.transform.position = pos;
            go.AddComponent<MeshFilter>().sharedMesh = s_Mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterials = new[] { MaterialLibrary.Get(Mat.BotCamo), MaterialLibrary.Get(Mat.GunMetal) };
            var g = go.AddComponent<FragGrenade>();
            g.owner = owner;
            g.fuse = fuseRemaining;
            g.m_Vel = vel;
            g.m_Spin = Random.insideUnitSphere * 720f;
            return g;
        }

        void OnEnable() => Live.Add(this);
        void OnDisable() => Live.Remove(this);

        void Update()
        {
            float dt = Time.deltaTime;
            fuse -= dt;
            if (fuse <= 0f)
            {
                WeaponFX.Explode(transform.position + Vector3.up * 0.1f, damage, radius, owner);
                Destroy(gameObject);
                return;
            }
            if (m_Resting) return;
            m_Vel += Physics.gravity * dt;
            Vector3 step = m_Vel * dt;
            Transform ignore = owner != null ? owner.transform : null;
            if (Ballistics.Resolve(transform.position, transform.position + step + step.normalized * 0.04f, ignore, out var hit, out var zone) && zone == null)
            {
                transform.position = hit.point + hit.normal * 0.045f;
                m_Vel = Vector3.Reflect(m_Vel, hit.normal) * 0.38f;
                m_Spin *= 0.5f;
                if (m_Vel.magnitude > 1.2f) AudioFX.PlayAt(Sfx.GrenadeBounce, hit.point, 0.6f, Random.Range(0.9f, 1.1f), 30f);
                if (m_Vel.magnitude < 0.5f && hit.normal.y > 0.6f) m_Resting = true;
            }
            else transform.position += step;
            transform.Rotate(m_Spin * dt, Space.Self);
        }
    }
}
