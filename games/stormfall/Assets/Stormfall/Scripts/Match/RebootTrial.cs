using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// STORMFALL's second-chance mechanic: on the first death the player wakes in a sealed concrete
    /// test chamber and must destroy six sentry drones within 60 s using a Striker-9 and no armour.
    /// Success redeploys them by parachute over the safe zone.
    /// </summary>
    public class RebootTrial : MonoBehaviour
    {
        public static bool PlayerInTrial { get; private set; }
        public static RebootTrial Instance { get; private set; }

        public Transform playerSpawn;
        public Transform[] droneSpawns;
        public float timeLimit = 60f;
        public int droneCount = 6;
        public float arenaRadius = 18f;

        public float TimeLeft { get; private set; }
        public int DronesRemaining => m_Drones.Count;

        readonly List<SentryDrone> m_Drones = new List<SentryDrone>();
        float m_IntroTimer;
        float m_BeginTime = -100f;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { PlayerInTrial = false; Instance = null; }

        void Awake() => Instance = this;

        void Start()
        {
            if (LocalPlayer.Health != null) LocalPlayer.Health.Died += OnPlayerDied;
        }

        public void Begin()
        {
            var pc = LocalPlayer.Controller;
            var health = LocalPlayer.Health;
            if (pc == null || health == null) return;
            PlayerInTrial = true;
            m_BeginTime = Time.time;
            TimeLeft = timeLimit;
            m_IntroTimer = 2.5f;
            health.ResetFull(0f);
            health.allowDowned = false;
            pc.SetDowned(false);
            pc.Freeze(false);
            Vector3 spawn = playerSpawn != null ? playerSpawn.position : transform.position + Vector3.up;
            pc.Teleport(spawn, playerSpawn != null ? playerSpawn.eulerAngles.y : 0f);

            var assets = StormfallAssets.Instance;
            var defs = assets != null && assets.weapons != null && assets.weapons.Length >= 2 ? assets.weapons : WeaponData.CreateDefaults();
            LocalPlayer.Weapon.SetLoadout(new WeaponInstance(defs[1], Rarity.Uncommon, AttachmentFlags.Grip), null);

            foreach (var d in m_Drones) if (d != null) Destroy(d.gameObject);
            m_Drones.Clear();
            for (int i = 0; i < droneCount; i++)
            {
                Vector3 p = droneSpawns != null && droneSpawns.Length > 0 ? droneSpawns[i % droneSpawns.Length].position
                    : transform.position + Quaternion.Euler(0, i * 60f, 0) * Vector3.forward * arenaRadius * 0.7f + Vector3.up * 4f;
                var drone = SentryDrone.Spawn(p, this);
                drone.activationDelay = 3f + i * 1.2f; // staggered so the player can take them one by one
                m_Drones.Add(drone);
            }
            GameEvents.RaiseToast("REBOOT TRIAL — DESTROY ALL SENTRIES");
            AudioFX.Play2D(Sfx.Countdown, 0.9f, 0.6f);
        }

        public void NotifyDroneDestroyed(SentryDrone d)
        {
            m_Drones.Remove(d);
            GameEvents.RaiseXp(75, "SENTRY DOWN");
        }

        void Update()
        {
            if (!PlayerInTrial) return;
            if (m_IntroTimer > 0f) { m_IntroTimer -= Time.deltaTime; return; }
            TimeLeft -= Time.deltaTime;
            if (m_Drones.Count == 0) Finish(true);
            else if (TimeLeft <= 0f) Finish(false);
        }

        void OnPlayerDied(PlayerHealthArmor h)
        {
            // the death that started the trial fires this same event; ignore it
            if (PlayerInTrial && Time.time > m_BeginTime + 0.1f) Finish(false);
        }

        void Finish(bool won)
        {
            PlayerInTrial = false;
            foreach (var d in m_Drones) if (d != null) Destroy(d.gameObject);
            m_Drones.Clear();
            var health = LocalPlayer.Health;
            if (health != null) health.allowDowned = true;
            if (won)
            {
                var assets = StormfallAssets.Instance;
                var defs = assets != null && assets.weapons != null && assets.weapons.Length >= 2 ? assets.weapons : WeaponData.CreateDefaults();
                LocalPlayer.Weapon.SetLoadout(new WeaponInstance(defs[0], Rarity.Common, AttachmentFlags.None), LocalPlayer.Weapon.slots[0]);
                if (health != null) health.ResetFull(50f);
                GameEvents.RaiseXp(250, "TRIAL CLEARED");
            }
            if (StormRingAndMatchManager.Instance != null) StormRingAndMatchManager.Instance.OnRebootFinished(won);
        }
    }
}
