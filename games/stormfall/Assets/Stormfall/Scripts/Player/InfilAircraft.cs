using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// "Skyhauler" cargo aircraft that carries the player across the island at the start of the
    /// match. The player rides the open rear ramp and jumps with Space; they are ejected
    /// automatically at the end of the route.
    /// </summary>
    public class InfilAircraft : MonoBehaviour
    {
        public float altitude = 600f;
        public float speed = 70f;
        public Transform rampAnchor;
        public Transform[] propellers;

        public Vector3 Velocity { get; private set; }
        public bool PlayerAboard => m_Player != null;
        public float RouteProgress => m_Length > 0 ? Mathf.Clamp01(m_Distance / m_Length) : 0f;
        public Vector3 RouteStart => m_Start;
        public Vector3 RouteEnd => m_End;

        Vector3 m_Start, m_End;
        float m_Length, m_Distance;
        TacticalPlayerController m_Player;
        AudioSource m_Drone;

        public void Launch(TacticalPlayerController player, int seed)
        {
            var rnd = new System.Random(seed);
            float ang = (float)rnd.NextDouble() * Mathf.PI * 2f;
            Vector3 dir = new Vector3(Mathf.Cos(ang), 0, Mathf.Sin(ang));
            Vector3 side = Vector3.Cross(Vector3.up, dir);
            float offset = ((float)rnd.NextDouble() - 0.5f) * 260f;
            m_Start = -dir * 700f + side * offset + Vector3.up * altitude;
            m_End = dir * 700f + side * offset + Vector3.up * altitude;
            m_Length = Vector3.Distance(m_Start, m_End);
            m_Distance = 0f;
            transform.SetPositionAndRotation(m_Start, Quaternion.LookRotation(dir));
            Velocity = dir * speed;
            m_Player = player;
            if (player != null)
            {
                player.Teleport(rampAnchor.position, transform.eulerAngles.y + 180f);
                player.EnterAircraft(rampAnchor);
            }
            if (m_Drone == null) m_Drone = AudioFX.CreateLoop(transform, Sfx.AircraftDrone, 0.9f, 0.6f, 900f);
            gameObject.SetActive(true);
        }

        public void NotifyPlayerJumped()
        {
            m_Player = null;
            GameEvents.RaiseToast("DEPLOYED — [SPACE] OPEN CHUTE");
        }

        void Update()
        {
            float dt = Time.deltaTime;
            m_Distance += speed * dt;
            transform.position = Vector3.Lerp(m_Start, m_End, RouteProgress);
            if (propellers != null)
                foreach (var p in propellers) if (p != null) p.Rotate(0, 0, 1800f * dt, Space.Self);

            // auto-eject over the far coast
            if (m_Player != null && RouteProgress > 0.93f)
            {
                var pl = m_Player;
                m_Player = null;
                pl.transform.position = rampAnchor.position + Vector3.down * 2.5f;
                pl.BeginFreefall(Velocity * 0.4f);
                GameEvents.RaiseToast("AUTO-DEPLOYED");
            }
            if (RouteProgress >= 1f) gameObject.SetActive(false);
        }
    }
}
