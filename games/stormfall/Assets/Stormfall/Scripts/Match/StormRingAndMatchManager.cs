using UnityEngine;
using UnityEngine.SceneManagement;

namespace Stormfall
{
    public enum MatchPhase { Pregame, Infil, Live, Ended }

    /// <summary>
    /// Match flow (infil → live → end), the five-stage collapsing Blight ring with its volumetric
    /// wall, 12 HP/s gas ticks with gas-mask absorption, XP/kill bookkeeping, Reboot Trial
    /// hand-off and redeploys.
    /// </summary>
    public class StormRingAndMatchManager : MonoBehaviour
    {
        public static StormRingAndMatchManager Instance { get; private set; }

        [System.Serializable]
        public struct Stage { public float radius, wait, shrink; }

        public InfilAircraft aircraft;
        public RebootTrial rebootTrial;
        public float startRadius = 420f;
        public float gasDamagePerSecond = 12f;
        public Stage[] stages =
        {
            new Stage { radius = 260f, wait = 45f, shrink = 60f },
            new Stage { radius = 160f, wait = 40f, shrink = 50f },
            new Stage { radius = 90f, wait = 35f, shrink = 40f },
            new Stage { radius = 45f, wait = 30f, shrink = 30f },
            new Stage { radius = 12f, wait = 25f, shrink = 25f },
        };
        public int seed = 0;

        // ---------------------------------------------------------------- state
        public MatchPhase Phase { get; private set; } = MatchPhase.Pregame;
        public int StageIndex { get; private set; }
        public bool Shrinking { get; private set; }
        public float StageTimer { get; private set; }
        public Vector3 CurrentCenter { get; private set; }
        public float CurrentRadius { get; private set; }
        public Vector3 NextCenter { get; private set; }
        public float NextRadius { get; private set; }
        public bool NextRevealed => m_ForceReveal || Shrinking || StageTimer < 20f || StageIndex >= stages.Length;
        public bool PlayerInGas { get; private set; }
        public bool PlayerMaskActive => PlayerInGas && LocalPlayer.Loadout != null && LocalPlayer.Loadout.HasGasMask;
        public bool Victory { get; private set; }
        public int Placement { get; private set; }
        public bool RebootUsed { get; private set; }
        public float MatchTime { get; private set; }

        Vector3 m_PrevCenter;
        float m_PrevRadius;
        float m_TickTimer;
        bool m_ForceReveal;
        Transform m_Wall;
        Material m_WallMat;
        ParticleSystem m_Motes;
        AudioSource m_Hum;
        System.Random m_Rng;
        float m_MoteTimer;

        void Awake()
        {
            Instance = this;
            m_Rng = new System.Random(seed == 0 ? System.Environment.TickCount : seed);
            CurrentCenter = Vector3.zero;
            CurrentRadius = startRadius;
            BuildWall();
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void OnEnable()
        {
            GameEvents.CombatantDowned += OnDowned;
            GameEvents.CombatantKilled += OnKilled;
            GameEvents.DamageDealt += OnDamage;
        }

        void OnDisable()
        {
            GameEvents.CombatantDowned -= OnDowned;
            GameEvents.CombatantKilled -= OnKilled;
            GameEvents.DamageDealt -= OnDamage;
        }

        void Start()
        {
            PickNext();
            if (LocalPlayer.Health != null) LocalPlayer.Health.Died += OnPlayerDied;
            ProceduralAudioBank.Prewarm();
            Phase = MatchPhase.Infil;
            if (aircraft != null && LocalPlayer.Controller != null) aircraft.Launch(LocalPlayer.Controller, m_Rng.Next());
            else if (LocalPlayer.Controller != null)
            {
                var p = WorldInfo.RandomPointOnLand(m_Rng);
                LocalPlayer.Controller.Teleport(p + Vector3.up * 400f, 0f);
                LocalPlayer.Controller.BeginFreefall(Vector3.zero);
            }
            StageTimer = stages[0].wait + 30f; // extra time for the flight
        }

        // ================================================================ ring

        void BuildWall()
        {
            var b = new MeshBuilder(1);
            b.Cylinder(Vector3.zero, Vector3.up, 1f, 1f, 128, false, false);
            var go = new GameObject("BlightWall");
            go.transform.SetParent(transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = b.ToMesh("BlightWall");
            var mr = go.AddComponent<MeshRenderer>();
            m_WallMat = new Material(MaterialLibrary.Get(Mat.BlightWall));
            // A thin, faint veil: seen from outside (the infil flight) it must not wash out the view.
            m_WallMat.SetColor("_EmissionColor", new Color(0.45f, 0.62f, 0.05f) * 0.45f);
            mr.sharedMaterial = m_WallMat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            m_Wall = go.transform;

            var pgo = new GameObject("BlightMotes");
            pgo.transform.SetParent(transform, false);
            m_Motes = pgo.AddComponent<ParticleSystem>();
            m_Motes.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = m_Motes.main;
            main.loop = true; main.playOnAwake = false; main.maxParticles = 800;
            main.simulationSpace = ParticleSystemSimulationSpace.World;
            var em = m_Motes.emission; em.enabled = false;
            var sh = m_Motes.shape; sh.enabled = false;
            var col = m_Motes.colorOverLifetime; col.enabled = true;
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(Color.white, 1) },
                      new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(1, 0.3f), new GradientAlphaKey(0, 1) });
            col.color = g;
            var r = pgo.GetComponent<ParticleSystemRenderer>();
            r.sharedMaterial = MaterialLibrary.Get(Mat.FxBlight);
            m_Motes.Play();

            m_Hum = AudioFX.CreateLoop(transform, Sfx.BlightHum, 0f, 0f, 10f);
        }

        void PickNext()
        {
            if (StageIndex >= stages.Length) { NextCenter = CurrentCenter; NextRadius = CurrentRadius; return; }
            float r = stages[StageIndex].radius;
            float maxOffset = Mathf.Max(0f, CurrentRadius - r);
            for (int i = 0; i < 30; i++)
            {
                float a = (float)m_Rng.NextDouble() * Mathf.PI * 2f;
                float d = Mathf.Sqrt((float)m_Rng.NextDouble()) * maxOffset;
                var c = CurrentCenter + new Vector3(Mathf.Cos(a) * d, 0, Mathf.Sin(a) * d);
                // keep the final circles over land
                if (new Vector2(c.x, c.z).magnitude < WorldInfo.IslandRadius - r * 0.5f) { NextCenter = c; break; }
                NextCenter = CurrentCenter;
            }
            NextRadius = r;
            m_ForceReveal = false;
        }

        /// <summary>Uplink contract reward: reveal the next circle immediately.</summary>
        public void RevealNext() => m_ForceReveal = true;

        public bool IsOutside(Vector3 p) =>
            new Vector2(p.x - CurrentCenter.x, p.z - CurrentCenter.z).sqrMagnitude > CurrentRadius * CurrentRadius;

        /// <summary>Where bots should rotate: the next circle once known, else the current one.</summary>
        public Vector3 SafeCenter => NextRevealed ? NextCenter : CurrentCenter;
        public float SafeRadius => NextRevealed ? NextRadius : CurrentRadius;

        // ================================================================ update

        void Update()
        {
            float dt = Time.deltaTime;
            if (Phase == MatchPhase.Ended)
            {
                if (GameInput.PressedRaw(GameKey.Confirm)) SceneManager.LoadScene(SceneManager.GetActiveScene().name);
                return;
            }
            MatchTime += dt;
            if (Phase == MatchPhase.Infil && LocalPlayer.Controller != null && LocalPlayer.Controller.State != MoveState.InAircraft) Phase = MatchPhase.Live;

            UpdateRing(dt);
            UpdateTicks(dt);
            UpdateVisuals(dt);
        }

        void UpdateRing(float dt)
        {
            if (StageIndex >= stages.Length) return;
            StageTimer -= dt;
            if (!Shrinking)
            {
                if (StageTimer <= 0f)
                {
                    Shrinking = true;
                    StageTimer = stages[StageIndex].shrink;
                    m_PrevCenter = CurrentCenter;
                    m_PrevRadius = CurrentRadius;
                    GameEvents.RaiseToast("THE BLIGHT IS CLOSING");
                    AudioFX.Play2D(Sfx.Countdown, 0.8f, 0.7f);
                }
            }
            else
            {
                float total = stages[StageIndex].shrink;
                float t = 1f - Mathf.Clamp01(StageTimer / total);
                CurrentCenter = Vector3.Lerp(m_PrevCenter, NextCenter, t);
                CurrentRadius = Mathf.Lerp(m_PrevRadius, NextRadius, t);
                if (StageTimer <= 0f)
                {
                    Shrinking = false;
                    StageIndex++;
                    if (StageIndex < stages.Length)
                    {
                        StageTimer = stages[StageIndex].wait;
                        PickNext();
                        GameEvents.RaiseToast("BLIGHT STABLE — NEXT ZONE INBOUND");
                    }
                    else GameEvents.RaiseToast("FINAL ZONE");
                }
            }
        }

        void UpdateTicks(float dt)
        {
            PlayerInGas = LocalPlayer.Exists && !RebootTrial.PlayerInTrial && IsOutside(LocalPlayer.Position) && Phase == MatchPhase.Live;
            m_TickTimer -= dt;
            if (m_TickTimer > 0f || Phase != MatchPhase.Live) return;
            m_TickTimer = 1f;
            for (int i = CombatantRegistry.All.Count - 1; i >= 0; i--)
            {
                var h = CombatantRegistry.All[i];
                if (h == null || h.IsDead) continue;
                if (h.isPlayer && RebootTrial.PlayerInTrial) continue;
                if (IsOutside(h.transform.position)) h.BlightTick(gasDamagePerSecond);
            }
        }

        void UpdateVisuals(float dt)
        {
            m_Wall.position = new Vector3(CurrentCenter.x, -60f, CurrentCenter.z);
            m_Wall.localScale = new Vector3(CurrentRadius, 700f, CurrentRadius);
            if (m_WallMat != null)
            {
                m_WallMat.SetTextureOffset("_BaseMap", new Vector2(Time.time * 0.004f, Time.time * 0.03f));
                float pulse = 0.16f + 0.04f * Mathf.Sin(Time.time * 1.3f);
                var c = m_WallMat.GetColor("_BaseColor");
                c.a = pulse;
                m_WallMat.SetColor("_BaseColor", c);
            }
            if (!LocalPlayer.Exists) return;
            Vector3 p = LocalPlayer.Position;
            Vector3 flat = new Vector3(p.x - CurrentCenter.x, 0, p.z - CurrentCenter.z);
            float dist = flat.magnitude;
            float edge = Mathf.Abs(dist - CurrentRadius);
            m_Hum.volume = Ease.Damp(m_Hum.volume, PlayerInGas ? 0.45f : Mathf.Clamp01(1f - edge / 40f) * 0.35f, 3f, dt);

            // motes drifting along the wall near the player
            m_MoteTimer -= dt;
            if (edge < 60f && m_MoteTimer <= 0f && !RebootTrial.PlayerInTrial)
            {
                m_MoteTimer = 0.03f;
                float baseAng = Mathf.Atan2(flat.z, flat.x);
                for (int i = 0; i < 3; i++)
                {
                    float a = baseAng + Random.Range(-40f, 40f) / Mathf.Max(CurrentRadius, 10f);
                    float r = CurrentRadius + Random.Range(-4f, 6f);
                    Vector3 pos = new Vector3(CurrentCenter.x + Mathf.Cos(a) * r, p.y + Random.Range(-4f, 14f), CurrentCenter.z + Mathf.Sin(a) * r);
                    var ep = new ParticleSystem.EmitParams
                    {
                        position = pos,
                        velocity = new Vector3(Random.Range(-0.5f, 0.5f), Random.Range(0.1f, 0.8f), Random.Range(-0.5f, 0.5f)),
                        startSize = Random.Range(1.5f, 4f),
                        startLifetime = Random.Range(2f, 4f),
                        startColor = new Color(0.75f, 0.9f, 0.25f, 0.4f)
                    };
                    m_Motes.Emit(ep, 1);
                }
            }
        }

        // ================================================================ events

        void OnDamage(GameObject attacker, IDamageable victim, DamageResult r, Vector3 point)
        {
            if (!LocalPlayer.IsPlayer(attacker)) return;
            if (r.headshot && (r.downed || r.killed)) GameEvents.RaiseXp(50, "HEADSHOT");
        }

        void OnDowned(GameObject attacker, IDamageable victim)
        {
            if (LocalPlayer.IsPlayer(attacker) && !(victim is PlayerHealthArmor ph && ph.isPlayer)) GameEvents.RaiseXp(100, "DOWNED");
        }

        void OnKilled(GameObject attacker, IDamageable victim)
        {
            var h = victim as PlayerHealthArmor;
            if (h != null && !h.isPlayer)
            {
                if (LocalPlayer.IsPlayer(attacker))
                {
                    GameEvents.RaiseXp(150, "ELIMINATION");
                    if (LocalPlayer.Loadout != null) LocalPlayer.Loadout.kills++;
                }
                SupplyTerminalAndLootManager.DropBotLoot(h.transform.position);
            }
            if (Phase == MatchPhase.Live && LocalPlayer.Health != null && !LocalPlayer.Health.IsDead && !RebootTrial.PlayerInTrial && CombatantRegistry.AliveCount <= 1)
                EndMatch(true);
        }

        void OnPlayerDied(PlayerHealthArmor h)
        {
            if (Phase == MatchPhase.Ended) return;
            if (RebootTrial.PlayerInTrial) return; // the trial reports its own failure
            if (!RebootUsed && rebootTrial != null && StageIndex < stages.Length - 1)
            {
                RebootUsed = true;
                rebootTrial.Begin();
                return;
            }
            EndMatch(false);
        }

        /// <summary>Called by the Reboot Trial. Win → parachute over the safe zone; lose → eliminated.</summary>
        public void OnRebootFinished(bool won)
        {
            if (!won) { EndMatch(false); return; }
            Redeploy(SafeCenter, Mathf.Min(SafeRadius * 0.6f, 120f), 320f);
            if (LocalPlayer.Loadout != null) LocalPlayer.Loadout.AddCash(800);
            GameEvents.RaiseToast("REDEPLOYING — WELCOME BACK");
        }

        public void Redeploy(Vector3 center, float scatter, float height)
        {
            var pc = LocalPlayer.Controller;
            if (pc == null) return;
            float a = Random.value * Mathf.PI * 2f;
            Vector3 p = center + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)) * Random.Range(0f, scatter);
            p.y = WorldInfo.GroundHeight(p) + height;
            pc.Teleport(p, Random.Range(0f, 360f));
            pc.BeginFreefall(Vector3.zero);
        }

        public void EndMatch(bool victory)
        {
            if (Phase == MatchPhase.Ended) return;
            Phase = MatchPhase.Ended;
            Victory = victory;
            Placement = victory ? 1 : Mathf.Max(2, CombatantRegistry.AliveCount + 1);
            GameInput.GameplayBlocked = true;
            if (LocalPlayer.Controller != null) LocalPlayer.Controller.MenuOpen = true;
            AudioFX.Play2D(victory ? Sfx.KillChime : Sfx.UiDeny, 0.9f, victory ? 0.8f : 1f);
        }
    }
}
