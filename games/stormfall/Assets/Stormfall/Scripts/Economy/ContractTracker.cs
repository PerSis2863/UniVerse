using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Runs the active Field Ops contract.
    /// Manhunt: kill a marked squad leader ($3,500). Salvage Run: open three marked caches in order
    /// ($2,500 + vault loot). Uplink: hold a beacon zone for 20 s to reveal the next Blight centre ($2,000).
    /// </summary>
    public class ContractTracker : MonoBehaviour
    {
        public static ContractTracker Instance { get; private set; }

        public float timeLimit = 240f;

        public bool Active { get; private set; }
        public ContractType Type { get; private set; }
        public string Objective { get; private set; }
        public float Progress { get; private set; }
        public float TimeLeft { get; private set; }
        public bool HasMarker { get; private set; }
        public Vector3 MarkerPosition { get; private set; }

        TacticalBotAI m_Target;
        float m_MarkerRefresh;
        readonly List<Vector3> m_SalvagePoints = new List<Vector3>();
        int m_SalvageIndex;
        LootCache m_CurrentCache;
        GameObject m_Beacon;
        float m_UplinkHeld;
        System.Random m_Rng = new System.Random();

        void Awake() => Instance = this;
        void OnDestroy() { if (Instance == this) Instance = null; }
        void OnEnable() { LootCache.CacheOpened += OnCacheOpened; GameEvents.CombatantKilled += OnKilled; }
        void OnDisable() { LootCache.CacheOpened -= OnCacheOpened; GameEvents.CombatantKilled -= OnKilled; }

        public bool Accept(ContractType type, Vector3 origin)
        {
            if (Active) return false;
            Type = type;
            TimeLeft = timeLimit;
            Progress = 0f;
            HasMarker = false;
            switch (type)
            {
                case ContractType.Manhunt:
                    m_Target = PickTarget(origin);
                    if (m_Target == null) { GameEvents.RaiseToast("NO TARGETS AVAILABLE"); return false; }
                    Objective = "Eliminate the marked squad leader";
                    HasMarker = true;
                    MarkerPosition = m_Target.transform.position;
                    GameEvents.RaiseCallout("HANDLER", "Bounty's live. Leader's marked on your map — updates every few seconds.");
                    break;
                case ContractType.SalvageRun:
                    m_SalvagePoints.Clear();
                    for (int i = 0; i < 3; i++) m_SalvagePoints.Add(PointNear(origin, 50f + i * 25f, 110f + i * 25f));
                    m_SalvageIndex = 0;
                    SpawnSalvageCache();
                    GameEvents.RaiseCallout("HANDLER", "Three supply drops on the board. Hit them in order.");
                    break;
                case ContractType.Uplink:
                {
                    Vector3 p = PointNear(origin, 70f, 140f);
                    m_Beacon = new GameObject("UplinkBeacon");
                    m_Beacon.transform.position = p;
                    m_Beacon.AddComponent<MeshFilter>().sharedMesh = ProceduralMeshBuilder.UplinkBeacon();
                    m_Beacon.AddComponent<MeshRenderer>().sharedMaterials = new[] { MaterialLibrary.Get(Mat.TerminalBody), MaterialLibrary.Get(Mat.BeaconRed) };
                    var l = new GameObject("Flare").AddComponent<Light>();
                    l.transform.SetParent(m_Beacon.transform, false);
                    l.transform.localPosition = Vector3.up * 2.8f;
                    l.type = LightType.Point; l.color = new Color(1f, 0.2f, 0.1f); l.range = 12f; l.intensity = 4f;
                    m_UplinkHeld = 0f;
                    Objective = "Hold the uplink zone (0/20s)";
                    HasMarker = true;
                    MarkerPosition = p;
                    GameEvents.RaiseCallout("HANDLER", "Uplink's deployed. Stay inside the zone for twenty seconds.");
                    break;
                }
            }
            Active = true;
            GameEvents.RaiseToast(FieldOpsTablet.Title(type) + " CONTRACT ACCEPTED");
            return true;
        }

        TacticalBotAI PickTarget(Vector3 origin)
        {
            TacticalBotAI best = null;
            float bestD = float.MaxValue;
            foreach (var squad in BotSquad.All)
            {
                var leader = squad.Leader;
                if (leader == null || !leader.IsAlive) continue;
                float d = Vector3.Distance(origin, leader.transform.position);
                if (d < bestD) { bestD = d; best = leader; }
            }
            return best;
        }

        Vector3 PointNear(Vector3 origin, float minD, float maxD)
        {
            for (int i = 0; i < 30; i++)
            {
                float a = (float)m_Rng.NextDouble() * Mathf.PI * 2f;
                float d = Mathf.Lerp(minD, maxD, (float)m_Rng.NextDouble());
                Vector3 p = origin + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * d;
                if (new Vector2(p.x, p.z).magnitude > WorldInfo.IslandRadius * 0.85f) continue;
                p.y = WorldInfo.GroundHeight(p);
                if (p.y > WorldInfo.WaterLevel + 1f) return p;
            }
            var q = origin; q.y = WorldInfo.GroundHeight(q); return q;
        }

        void SpawnSalvageCache()
        {
            Vector3 p = m_SalvagePoints[m_SalvageIndex];
            var go = new GameObject("SalvageCache");
            go.transform.position = p;
            var body = new GameObject("Body");
            body.transform.SetParent(go.transform, false);
            body.AddComponent<MeshFilter>().sharedMesh = ProceduralMeshBuilder.CacheBody(m_SalvageIndex == 2);
            body.AddComponent<MeshRenderer>().sharedMaterials = new[] { MaterialLibrary.Get(m_SalvageIndex == 2 ? Mat.CacheOrange : Mat.CacheBlue), MaterialLibrary.Get(Mat.CacheTrim) };
            var lid = new GameObject("Lid");
            lid.transform.SetParent(go.transform, false);
            lid.transform.localPosition = new Vector3(0, 0.5f, -0.3f);
            lid.AddComponent<MeshFilter>().sharedMesh = ProceduralMeshBuilder.CacheLid(m_SalvageIndex == 2);
            lid.AddComponent<MeshRenderer>().sharedMaterials = new[] { MaterialLibrary.Get(m_SalvageIndex == 2 ? Mat.CacheOrange : Mat.CacheBlue), MaterialLibrary.Get(Mat.CacheTrim) };
            var col = go.AddComponent<BoxCollider>();
            col.center = new Vector3(0, 0.3f, 0); col.size = new Vector3(1.1f, 0.6f, 0.65f);
            m_CurrentCache = go.AddComponent<LootCache>();
            m_CurrentCache.vault = m_SalvageIndex == 2;
            m_CurrentCache.lid = lid.transform;
            Objective = $"Open supply cache {m_SalvageIndex + 1}/3";
            HasMarker = true;
            MarkerPosition = p;
        }

        void OnCacheOpened(LootCache c)
        {
            if (!Active || Type != ContractType.SalvageRun || c != m_CurrentCache) return;
            m_SalvageIndex++;
            Progress = m_SalvageIndex / 3f;
            if (m_SalvageIndex >= 3) Complete(2500, "SALVAGE RUN COMPLETE");
            else SpawnSalvageCache();
        }

        void OnKilled(GameObject attacker, IDamageable victim)
        {
            if (!Active || Type != ContractType.Manhunt || m_Target == null) return;
            if (victim.Root != m_Target.transform) return;
            if (LocalPlayer.IsPlayer(attacker)) Complete(3500, "MANHUNT COMPLETE");
            else Fail("TARGET LOST");
        }

        void Update()
        {
            if (!Active) return;
            float dt = Time.deltaTime;
            TimeLeft -= dt;
            if (TimeLeft <= 0f) { Fail("CONTRACT EXPIRED"); return; }
            switch (Type)
            {
                case ContractType.Manhunt:
                    m_MarkerRefresh -= dt;
                    if (m_MarkerRefresh <= 0f && m_Target != null)
                    {
                        m_MarkerRefresh = 4f;
                        MarkerPosition = m_Target.transform.position;
                        AudioFX.Play2D(Sfx.ReconPing, 0.25f, 1.4f);
                    }
                    break;
                case ContractType.Uplink:
                    if (m_Beacon == null) break;
                    if (Time.frameCount % 6 == 0)
                        WeaponFX.Steam(m_Beacon.transform.position + Vector3.up * 2.8f, new Vector3(0, 3f, 0), 1.2f, new Color(1f, 0.2f, 0.1f, 0.5f));
                    if (LocalPlayer.Exists && Vector3.Distance(LocalPlayer.Position, m_Beacon.transform.position) < 8f && !LocalPlayer.Health.IsDowned)
                    {
                        m_UplinkHeld += dt;
                        Progress = m_UplinkHeld / 20f;
                        Objective = $"Hold the uplink zone ({Mathf.FloorToInt(m_UplinkHeld)}/20s)";
                        if (m_UplinkHeld >= 20f)
                        {
                            if (StormRingAndMatchManager.Instance != null) StormRingAndMatchManager.Instance.RevealNext();
                            Complete(2000, "UPLINK SECURED — NEXT ZONE REVEALED");
                        }
                    }
                    break;
            }
        }

        void Complete(int cash, string message)
        {
            Active = false;
            HasMarker = false;
            if (LocalPlayer.Loadout != null) LocalPlayer.Loadout.AddCash(cash);
            GameEvents.RaiseXp(300, "CONTRACT");
            GameEvents.RaiseToast(message + $"  +${cash:N0}");
            if (Type == ContractType.SalvageRun && LocalPlayer.Exists)
                SupplyTerminalAndLootManager.SpawnLootBurst(LocalPlayer.Position + LocalPlayer.Transform.forward * 2f, true);
            Cleanup();
        }

        void Fail(string message)
        {
            Active = false;
            HasMarker = false;
            GameEvents.RaiseToast(message);
            AudioFX.Play2D(Sfx.UiDeny, 0.6f);
            Cleanup();
        }

        void Cleanup()
        {
            if (m_Beacon != null) Destroy(m_Beacon, 2f);
            m_Beacon = null;
            m_Target = null;
            m_CurrentCache = null;
        }
    }
}
