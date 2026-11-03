using UnityEngine;

namespace Stormfall
{
    /// <summary>Three orbital lance strikes 8 m apart along a line, after a 3 s targeting beam.</summary>
    public class OrbitalStrike : MonoBehaviour
    {
        Vector3 m_Target, m_Dir;
        GameObject m_Owner;
        float m_T;
        int m_Fired;
        LineRenderer m_Beam;
        Light m_Light;

        public static void Launch(Vector3 target, Vector3 dir, GameObject owner)
        {
            var go = new GameObject("OrbitalStrike");
            go.transform.position = target;
            var s = go.AddComponent<OrbitalStrike>();
            s.m_Target = target; s.m_Dir = dir; s.m_Owner = owner;
            AudioFX.PlayAt(Sfx.OrbitalCharge, target + Vector3.up * 20f, 1f, 1f, 600f);
        }

        void Start()
        {
            m_Beam = gameObject.AddComponent<LineRenderer>();
            m_Beam.sharedMaterial = MaterialLibrary.Get(Mat.OrbitalBeam);
            m_Beam.positionCount = 2;
            m_Beam.widthMultiplier = 0.15f;
            m_Beam.startColor = new Color(0.6f, 0.85f, 1f, 0.2f);
            m_Beam.endColor = new Color(0.8f, 0.95f, 1f, 1f);
            var lg = new GameObject("BeamLight");
            lg.transform.SetParent(transform, false);
            lg.transform.localPosition = Vector3.up * 2f;
            m_Light = lg.AddComponent<Light>();
            m_Light.type = LightType.Point; m_Light.color = new Color(0.6f, 0.85f, 1f); m_Light.range = 25f; m_Light.intensity = 0f;
        }

        void Update()
        {
            m_T += Time.deltaTime;
            Vector3 strikePos = m_Target + m_Dir * ((Mathf.Min(m_Fired, 2) - 1) * 8f);
            m_Beam.SetPosition(0, strikePos + Vector3.up * 400f);
            m_Beam.SetPosition(1, strikePos);
            float charge = Mathf.Clamp01(m_T / 3f);
            m_Beam.widthMultiplier = m_Fired == 0 ? Mathf.Lerp(0.1f, 0.6f, charge * charge) : Mathf.Lerp(m_Beam.widthMultiplier, 0.2f, Time.deltaTime * 6f);
            m_Light.intensity = m_Fired == 0 ? charge * 12f : Mathf.Max(0f, m_Light.intensity - Time.deltaTime * 30f);

            float[] times = { 3f, 3.45f, 3.9f };
            if (m_Fired < 3 && m_T >= times[m_Fired])
            {
                Vector3 p = m_Target + m_Dir * ((m_Fired - 1) * 8f);
                p.y = WorldInfo.GroundHeight(p);
                m_Beam.widthMultiplier = 3.5f;
                m_Light.intensity = 40f;
                WeaponFX.Explode(p, 220f, 9f, m_Owner, Sfx.OrbitalBlast);
                m_Fired++;
            }
            if (m_T > 5f) Destroy(gameObject);
        }
    }
}
