using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// A three-bot squad (Rifleman leader, Flanker, Sniper). Picks patrol waypoints and rotations,
    /// shares threat knowledge, rate-limits radio callouts and detects squad wipes.
    /// </summary>
    public class BotSquad : MonoBehaviour
    {
        public static readonly List<BotSquad> All = new List<BotSquad>();

        public string callsign = "Kilo";
        public List<TacticalBotAI> members = new List<TacticalBotAI>();

        public TacticalBotAI Leader
        {
            get
            {
                foreach (var m in members) if (m != null && m.IsAlive) return m;
                return null;
            }
        }

        public Vector3 Waypoint { get; private set; }
        public Vector3 LastKnownThreat { get; private set; }
        public float ThreatTime { get; private set; } = -100f;
        public bool Wiped { get; private set; }

        float m_WaypointTimer;
        static float s_LastCallout = -10f;
        System.Random m_Rng;

        // shared tracking of the player's movement for flank / frag decisions
        public static float PlayerStationaryTime { get; private set; }
        static Vector3 s_PlayerAnchor;
        static int s_TrackFrame = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { All.Clear(); s_LastCallout = -10f; PlayerStationaryTime = 0f; s_TrackFrame = -1; }

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);

        void Start()
        {
            m_Rng = new System.Random(UnityEngine.Random.Range(1, int.MaxValue));
            Waypoint = transform.position;
            foreach (var m in members) if (m != null) m.squad = this;
            GameEvents.CombatantKilled += OnKilled;
        }

        void OnDestroy() => GameEvents.CombatantKilled -= OnKilled;

        void Update()
        {
            TrackPlayer();
            m_WaypointTimer -= Time.deltaTime;
            var ring = StormRingAndMatchManager.Instance;
            var leader = Leader;
            if (leader == null) return;
            bool live = ring != null && ring.Phase == MatchPhase.Live;
            if (!live) return;
            Vector3 safe = ring.SafeCenter;
            float safeR = ring.SafeRadius;
            bool outside = new Vector2(leader.transform.position.x - safe.x, leader.transform.position.z - safe.z).magnitude > safeR * 0.85f;
            if (outside && (m_WaypointTimer <= 0f || new Vector2(Waypoint.x - safe.x, Waypoint.z - safe.z).magnitude > safeR * 0.8f))
            {
                m_WaypointTimer = 8f;
                float a = (float)m_Rng.NextDouble() * Mathf.PI * 2f;
                Vector3 p = safe + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * safeR * 0.5f * (float)m_Rng.NextDouble();
                p.y = WorldInfo.GroundHeight(p);
                Waypoint = p;
            }
            else if (m_WaypointTimer <= 0f)
            {
                m_WaypointTimer = 25f + (float)m_Rng.NextDouble() * 20f;
                // wander between nearby POIs inside the safe zone
                Vector3 best = leader.transform.position;
                float bestScore = float.MaxValue;
                foreach (var poi in WorldInfo.Pois)
                {
                    Vector3 pp = poi.transform.position;
                    if (new Vector2(pp.x - safe.x, pp.z - safe.z).magnitude > safeR * 0.9f) continue;
                    float score = Vector3.Distance(pp, leader.transform.position) * (0.6f + (float)m_Rng.NextDouble());
                    if (score < bestScore && score > 20f) { bestScore = score; best = pp; }
                }
                Vector2 jitter = new Vector2((float)m_Rng.NextDouble() - 0.5f, (float)m_Rng.NextDouble() - 0.5f) * 30f;
                best += new Vector3(jitter.x, 0, jitter.y);
                best.y = WorldInfo.GroundHeight(best);
                Waypoint = best;
            }
        }

        static void TrackPlayer()
        {
            if (s_TrackFrame == Time.frameCount || !LocalPlayer.Exists) return;
            s_TrackFrame = Time.frameCount;
            Vector3 p = LocalPlayer.Position;
            if (Vector3.Distance(p, s_PlayerAnchor) > 3f) { s_PlayerAnchor = p; PlayerStationaryTime = 0f; }
            else PlayerStationaryTime += Time.deltaTime;
        }

        public void ReportThreat(Vector3 pos)
        {
            LastKnownThreat = pos;
            ThreatTime = Time.time;
        }

        public bool ThreatFresh(float within) => Time.time - ThreatTime < within;

        public void Callout(string line, Vector3 from, bool force = false)
        {
            if (!LocalPlayer.Exists) return;
            if (Vector3.Distance(from, LocalPlayer.Position) > 80f) return;
            if (!force && Time.time - s_LastCallout < 3f) return;
            s_LastCallout = Time.time;
            GameEvents.RaiseCallout(callsign.ToUpperInvariant() + " SQUAD", line);
        }

        void OnKilled(GameObject attacker, IDamageable victim)
        {
            if (Wiped) return;
            bool mine = false;
            foreach (var m in members) if (m != null && victim.Root == m.transform) mine = true;
            if (!mine) return;
            if (Leader == null)
            {
                Wiped = true;
                if (LocalPlayer.IsPlayer(attacker)) GameEvents.RaiseXp(500, "SQUAD WIPED");
            }
            else Callout("Man down! Man down!", victim.Root.position, true);
        }
    }
}
