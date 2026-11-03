using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Player killstreak slot [3]. Recon Pulse sweeps the minimap for 30 s. Orbital Lance opens a
    /// rangefinder view; LMB designates, then three orbital strikes land along the aim line.
    /// </summary>
    public class Killstreaks : MonoBehaviour
    {
        public float reconDuration = 30f;

        public bool IsDesignating { get; private set; }
        public bool ReconActive => Time.time < m_ReconUntil;
        public float ReconRemaining => Mathf.Max(0f, m_ReconUntil - Time.time);
        public bool DesignationValid { get; private set; }
        public Vector3 DesignationPoint { get; private set; }

        float m_ReconUntil = -1f;
        PlayerLoadout m_Loadout;
        TacticalPlayerController m_Player;
        LineRenderer m_Laser;

        void Awake()
        {
            m_Loadout = GetComponent<PlayerLoadout>();
            m_Player = GetComponent<TacticalPlayerController>();
        }

        void Update()
        {
            if (m_Loadout == null || m_Player == null) return;
            bool canUse = !m_Player.MenuOpen && !m_Player.IsAirborneSkydive && LocalPlayer.Health != null && !LocalPlayer.Health.IsDowned && !LocalPlayer.Health.IsDead;
            if (!canUse) { StopDesignating(); return; }

            if (IsDesignating) { UpdateDesignation(); return; }
            if (!GameInput.Pressed(GameKey.Killstreak)) return;
            switch (m_Loadout.killstreak)
            {
                case KillstreakType.ReconPulse:
                    m_ReconUntil = Time.time + reconDuration;
                    m_Loadout.killstreak = KillstreakType.None;
                    AudioFX.Play2D(Sfx.ReconPing, 0.9f);
                    GameEvents.RaiseToast("RECON PULSE ONLINE");
                    GameEvents.RaiseCallout("COMMAND", "Recon pulse sweeping. Hostiles on your map.");
                    break;
                case KillstreakType.OrbitalLance:
                    IsDesignating = true;
                    AudioFX.Play2D(Sfx.UiClick, 0.8f);
                    break;
            }
        }

        void UpdateDesignation()
        {
            var cam = m_Player.cam.transform;
            DesignationValid = Physics.Raycast(cam.position, cam.forward, out var hit, 400f, ~0, QueryTriggerInteraction.Ignore) && hit.distance > 12f;
            if (DesignationValid) DesignationPoint = hit.point;
            EnsureLaser();
            m_Laser.enabled = DesignationValid;
            if (DesignationValid)
            {
                m_Laser.SetPosition(0, cam.position - cam.up * 0.15f + cam.right * 0.05f);
                m_Laser.SetPosition(1, DesignationPoint);
            }
            if (GameInput.Pressed(GameKey.Aim) || GameInput.Pressed(GameKey.Killstreak) || GameInput.Pressed(GameKey.Escape)) { StopDesignating(); return; }
            if (GameInput.Pressed(GameKey.Fire) && DesignationValid)
            {
                Vector3 dir = Vector3.ProjectOnPlane(cam.forward, Vector3.up).normalized;
                OrbitalStrike.Launch(DesignationPoint, dir, gameObject);
                m_Loadout.killstreak = KillstreakType.None;
                GameEvents.RaiseCallout("COMMAND", "Lance locked. Strikes inbound — keep your distance.");
                StopDesignating();
            }
        }

        void EnsureLaser()
        {
            if (m_Laser != null) return;
            var go = new GameObject("DesignatorLaser");
            go.transform.SetParent(transform, false);
            m_Laser = go.AddComponent<LineRenderer>();
            m_Laser.sharedMaterial = MaterialLibrary.Get(Mat.FxTracer);
            m_Laser.widthMultiplier = 0.01f;
            m_Laser.startColor = new Color(1f, 0.2f, 0.1f, 0.2f);
            m_Laser.endColor = new Color(1f, 0.1f, 0.05f, 1f);
            m_Laser.positionCount = 2;
        }

        void StopDesignating()
        {
            IsDesignating = false;
            if (m_Laser != null) m_Laser.enabled = false;
        }
    }
}
