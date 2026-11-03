using UnityEngine;

namespace Stormfall
{
    public enum BotRole { Rifleman, Flanker, Sniper }
    public enum BotState { Idle, Patrol, Engage, TakeCover, Flank, Investigate, Revive, Downed, Dead }

    /// <summary>
    /// Squad bot brain. Riflemen fight from cover with bursts, Flankers swing wide when the player
    /// stays put, Snipers hold range and show a scope glint, anyone may cook a frag at a camper.
    /// Bots hear unsuppressed gunfire, share threat knowledge, rotate with the Blight, revive
    /// downed squadmates and use radio callouts.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    [RequireComponent(typeof(PlayerHealthArmor))]
    [RequireComponent(typeof(BotBody))]
    public class TacticalBotAI : MonoBehaviour
    {
        public BotRole role = BotRole.Rifleman;
        public BotSquad squad;
        public float walkSpeed = 3.2f, runSpeed = 5.4f, crouchSpeed = 1.8f;
        public float viewDistance = 140f, fieldOfView = 130f;
        public float damageScale = 0.55f;
        public int seed;

        public BotState State { get; private set; } = BotState.Idle;
        public bool IsAlive => m_Health != null && !m_Health.IsDead;
        public bool IsDowned => m_Health != null && m_Health.IsDowned;
        public bool GlintVisible { get; private set; }
        public WeaponInstance Weapon => m_Weapon;

        public static System.Action<Vector3> BotFootstep;
        static float s_LastGrenade = -100f;

        CharacterController m_CC;
        PlayerHealthArmor m_Health;
        BotBody m_Body;
        WeaponInstance m_Weapon;
        System.Random m_Rng;

        PlayerHealthArmor m_Target;
        bool m_TargetVisible;
        Vector3 m_TargetLastSeen;
        float m_TargetSeenTime = -100f, m_TimeOnTarget, m_Reaction;
        float m_PerceptionTimer;

        float m_BurstCooldown, m_ShotTimer, m_ReloadTimer;
        int m_BurstLeft;

        Vector3 m_MoveTarget;
        float m_MoveSpeed;
        bool m_Crouch;
        float m_Yaw, m_AimPitch;
        float m_VerticalVel;

        CoverPoint m_Cover;
        float m_CoverEval, m_PeekTimer;
        bool m_Peeking;
        Vector3 m_FlankPoint;
        float m_FlankTimer, m_StrafeTimer;
        float m_StrafeDir = 1f;
        float m_PushUntil;
        float m_GrenadeCooldown, m_CookTimer = -1f, m_CookDuration;
        float m_StuckTimer, m_AvoidTimer;
        Vector3 m_LastPos, m_AvoidDir;
        float m_StepAccum, m_DeathTimer, m_ReviveTimer, m_PlateTimer;
        TacticalBotAI m_ReviveTarget;
        Transform m_Glint;
        MeshRenderer m_GlintRenderer;

        // ================================================================ setup

        void Awake()
        {
            m_CC = GetComponent<CharacterController>();
            m_Health = GetComponent<PlayerHealthArmor>();
            m_Body = GetComponent<BotBody>();
            m_Rng = new System.Random(seed != 0 ? seed : UnityEngine.Random.Range(1, int.MaxValue));
            m_Health.isPlayer = false;
            m_Health.downedDuration = 12f;
            m_Health.startArmor = 50f * (1 + m_Rng.Next(3));
            m_Health.ResetFull(m_Health.startArmor);
            m_CC.height = 1.8f; m_CC.radius = 0.32f; m_CC.center = new Vector3(0, 0.9f, 0);
            m_CC.slopeLimit = 50f; m_CC.stepOffset = 0.4f;

            var assets = StormfallAssets.Instance;
            var defs = assets != null && assets.weapons != null && assets.weapons.Length >= 3 ? assets.weapons : WeaponData.CreateDefaults();
            var data = role == BotRole.Sniper ? defs[2] : role == BotRole.Flanker ? defs[1] : defs[0];
            var rarity = RarityUtil.Roll(m_Rng);
            m_Weapon = new WeaponInstance(data, rarity, RarityUtil.RollAttachments(rarity, m_Rng));
            if (role == BotRole.Sniper) { viewDistance = 320f; fieldOfView = 100f; }
            m_Body.Build(m_Weapon);
            if (role == BotRole.Sniper) BuildGlint();
            m_Yaw = transform.eulerAngles.y;
            m_MoveTarget = transform.position;
            m_LastPos = transform.position;
        }

        void OnEnable()
        {
            m_Health.Downed += OnDowned;
            m_Health.Died += OnDied;
            m_Health.Revived += OnRevived;
            GameEvents.ShotFired += OnShotHeard;
            GameEvents.DamageDealt += OnDamageDealt;
        }

        void OnDisable()
        {
            m_Health.Downed -= OnDowned;
            m_Health.Died -= OnDied;
            m_Health.Revived -= OnRevived;
            GameEvents.ShotFired -= OnShotHeard;
            GameEvents.DamageDealt -= OnDamageDealt;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { BotFootstep = null; s_LastGrenade = -100f; }

        void BuildGlint()
        {
            if (m_Body.scopePoint == null) return;
            var go = new GameObject("ScopeGlint");
            go.transform.SetParent(m_Body.scopePoint, false);
            var b = new MeshBuilder(1);
            b.Plane(Vector3.zero, Vector3.right * 0.5f, Vector3.up * 0.5f, Vector2.one, true);
            go.AddComponent<MeshFilter>().sharedMesh = b.ToMesh("Glint");
            m_GlintRenderer = go.AddComponent<MeshRenderer>();
            m_GlintRenderer.sharedMaterial = MaterialLibrary.Get(Mat.FxGlint);
            m_GlintRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            m_Glint = go.transform;
            go.SetActive(false);
        }

        // ================================================================ events

        void OnShotHeard(GameObject shooter, Vector3 pos, bool suppressed)
        {
            if (!IsAlive || IsDowned || shooter == gameObject) return;
            if (squad != null && shooter != null && squad.members.Contains(shooter.GetComponent<TacticalBotAI>())) return;
            float range = suppressed ? 20f : 130f;
            if ((pos - transform.position).sqrMagnitude > range * range) return;
            if (squad != null) squad.ReportThreat(pos);
            if (!m_TargetVisible) { m_TargetLastSeen = pos; m_TargetSeenTime = Time.time - 2f; }
        }

        void OnDamageDealt(GameObject attacker, IDamageable victim, DamageResult r, Vector3 point)
        {
            if (!IsAlive) return;
            if (victim.Root == transform && attacker != null)
            {
                // being shot: know where it came from
                m_TargetLastSeen = attacker.transform.position;
                m_TargetSeenTime = Time.time;
                if (squad != null) squad.ReportThreat(attacker.transform.position);
                var h = attacker.GetComponent<PlayerHealthArmor>();
                if (m_Target == null && h != null) m_Target = h;
                m_CoverEval = 0f;
                return;
            }
            if (attacker == gameObject && victim is PlayerHealthArmor ph && ph.isPlayer && r.cellBroken && ph.Armor <= 0.01f && squad != null)
            {
                squad.Callout("He's cracked, push!", transform.position, true);
                foreach (var m in squad.members) if (m != null) m.m_PushUntil = Time.time + 6f;
            }
        }

        void OnDowned(PlayerHealthArmor h)
        {
            State = BotState.Downed;
            m_Crouch = false;
            if (m_Cover != null) { m_Cover.occupant = null; m_Cover = null; }
            if (squad != null) squad.Callout("I'm down! Need a pickup!", transform.position, true);
        }

        void OnRevived(PlayerHealthArmor h) => State = BotState.Patrol;

        void OnDied(PlayerHealthArmor h)
        {
            State = BotState.Dead;
            if (m_Cover != null) { m_Cover.occupant = null; m_Cover = null; }
            m_CC.enabled = false;
            Vector3 from = h.LastAttacker != null ? h.LastAttacker.transform.position : transform.position - transform.forward;
            m_Body.SetDeathSide(Vector3.Dot(transform.right, transform.position - from));
            if (m_Glint != null) m_Glint.gameObject.SetActive(false);
            foreach (var hz in GetComponentsInChildren<HitboxZone>()) hz.gameObject.SetActive(false);
        }

        // ================================================================ update

        void Update()
        {
            float dt = Time.deltaTime;
            if (State == BotState.Dead)
            {
                m_Body.Animate(0f, false, false, true, 0f, dt);
                m_DeathTimer += dt;
                if (m_DeathTimer > 45f) Destroy(gameObject);
                return;
            }
            var ring = StormRingAndMatchManager.Instance;
            bool live = ring == null || ring.Phase == MatchPhase.Live;

            m_PerceptionTimer -= dt;
            if (m_PerceptionTimer <= 0f)
            {
                m_PerceptionTimer = 0.2f + (float)m_Rng.NextDouble() * 0.1f;
                Perceive();
            }

            if (State == BotState.Downed) { UpdateDowned(dt); return; }
            if (!live) { IdleUpdate(dt); return; }

            Think(dt, ring);
            Move(dt);
            Combat(dt);
            UpdateGlint();
            m_Body.Animate(new Vector3(m_CC.velocity.x, 0, m_CC.velocity.z).magnitude, m_Crouch, false, false, m_AimPitch, dt);
        }

        void IdleUpdate(float dt)
        {
            ApplyGravityOnly(dt);
            m_Yaw += Mathf.Sin(Time.time * 0.3f + seed) * 10f * dt;
            transform.rotation = Quaternion.Euler(0, m_Yaw, 0);
            m_Body.Animate(0f, false, false, false, 0f, dt);
        }

        // ---------------------------------------------------------------- perception

        void Perceive()
        {
            Vector3 eye = EyePos;
            PlayerHealthArmor best = null;
            float bestScore = float.MaxValue;
            foreach (var h in CombatantRegistry.All)
            {
                if (h == null || h == m_Health || h.IsDead) continue;
                if (h.isPlayer)
                {
                    if (RebootTrial.PlayerInTrial) continue;
                    var pc = LocalPlayer.Controller;
                    if (pc != null && (pc.State == MoveState.InAircraft)) continue;
                }
                else if (squad != null)
                {
                    var bot = h.GetComponent<TacticalBotAI>();
                    if (bot != null && bot.squad == squad) continue;
                }
                Vector3 chest = ChestOf(h);
                Vector3 to = chest - eye;
                float d = to.magnitude;
                if (d > viewDistance) continue;
                float ang = Vector3.Angle(transform.forward, to);
                if (ang > fieldOfView * 0.5f && d > 10f && !(h == m_Target && Time.time - m_TargetSeenTime < 3f)) continue;
                if (!Ballistics.HasLineOfSight(eye, chest, transform, h.transform)) continue;
                float score = d * (h.isPlayer ? 0.6f : 1f) * (h.IsDowned ? 1.5f : 1f);
                if (score < bestScore) { bestScore = score; best = h; }
            }

            bool wasVisible = m_TargetVisible;
            m_TargetVisible = best != null;
            if (best != null)
            {
                if (best != m_Target || !wasVisible)
                {
                    m_Reaction = role == BotRole.Sniper ? 1.3f : Mathf.Lerp(0.35f, 0.7f, (float)m_Rng.NextDouble());
                    m_TimeOnTarget = 0f;
                    if (best.isPlayer && squad != null && Time.time - m_TargetSeenTime > 8f)
                        squad.Callout(role == BotRole.Sniper ? "Eyes on target, long range." : "Contact! Enemy spotted!", transform.position);
                }
                m_Target = best;
                m_TargetLastSeen = best.transform.position;
                m_TargetSeenTime = Time.time;
                if (squad != null) squad.ReportThreat(best.transform.position);
            }
            else if (m_Target != null && (m_Target.IsDead || Time.time - m_TargetSeenTime > 20f)) m_Target = null;

            // tremor/footstep cue for the player's perk
            if (LocalPlayer.Exists && (transform.position - LocalPlayer.Position).sqrMagnitude < 40f * 40f && m_CC.velocity.sqrMagnitude > 4f)
            {
                m_StepAccum += 0.25f;
                if (m_StepAccum > 0.6f) { m_StepAccum = 0f; BotFootstep?.Invoke(transform.position); }
            }
        }

        static Vector3 ChestOf(PlayerHealthArmor h)
        {
            if (h.isPlayer && LocalPlayer.Controller != null)
                return h.transform.position + Vector3.up * Mathf.Max(0.3f, LocalPlayer.Controller.EyeHeight - 0.35f);
            var bot = h.GetComponent<BotBody>();
            if (bot != null && bot.torso != null) return bot.torso.position + Vector3.up * 0.3f;
            return h.transform.position + Vector3.up * 1.2f;
        }

        Vector3 EyePos => m_Body.head != null ? m_Body.head.position : transform.position + Vector3.up * 1.6f;

        // ---------------------------------------------------------------- decision making

        void Think(float dt, StormRingAndMatchManager ring)
        {
            bool inGas = ring != null && ring.IsOutside(transform.position);
            bool lowHealth = m_Health.Health < 45f && m_Health.Armor <= 0.01f;
            m_CoverEval -= dt;

            // revive a downed squadmate when nothing is shooting at us
            if (!m_TargetVisible && squad != null && m_ReviveTarget == null)
                foreach (var m in squad.members)
                    if (m != null && m != this && m.IsDowned && Vector3.Distance(m.transform.position, transform.position) < 30f) { m_ReviveTarget = m; break; }
            if (m_ReviveTarget != null && (!m_ReviveTarget.IsDowned || m_TargetVisible)) { m_ReviveTarget = null; m_ReviveTimer = 0f; }

            if (inGas)
            {
                State = BotState.Patrol;
                SetMove(ring.SafeCenter, runSpeed);
                m_Crouch = false;
                return;
            }

            if (m_ReviveTarget != null)
            {
                State = BotState.Revive;
                float d = Vector3.Distance(transform.position, m_ReviveTarget.transform.position);
                if (d > 1.6f) SetMove(m_ReviveTarget.transform.position, runSpeed);
                else
                {
                    SetMove(transform.position, 0f);
                    m_Crouch = true;
                    m_ReviveTimer += dt;
                    if (m_ReviveTimer > 4f)
                    {
                        m_ReviveTarget.m_Health.Revive(40f);
                        squad.Callout("Got you, get up!", transform.position);
                        m_ReviveTarget = null;
                        m_ReviveTimer = 0f;
                    }
                }
                return;
            }

            if (m_Target != null && m_TargetVisible)
            {
                float dist = Vector3.Distance(transform.position, m_Target.transform.position);
                if (m_Target.isPlayer) TryGrenade(dist);

                switch (role)
                {
                    case BotRole.Sniper:
                        State = BotState.Engage;
                        if (dist < 35f) SetMove(transform.position + (transform.position - m_Target.transform.position).normalized * 10f, runSpeed);
                        else SetMove(transform.position, 0f);
                        m_Crouch = dist > 35f;
                        break;

                    case BotRole.Flanker when m_Target.isPlayer && BotSquad.PlayerStationaryTime > 4f && Time.time > m_PushUntil:
                        if (m_FlankTimer <= 0f)
                        {
                            Vector3 anchor = squad != null && squad.Leader != null ? squad.Leader.transform.position : transform.position;
                            Vector3 line = (anchor - m_Target.transform.position);
                            line.y = 0;
                            Vector3 side = Vector3.Cross(Vector3.up, line.normalized) * (m_Rng.Next(2) == 0 ? 1f : -1f);
                            m_FlankPoint = m_Target.transform.position + side * 25f + line.normalized * 6f;
                            m_FlankPoint.y = WorldInfo.GroundHeight(m_FlankPoint);
                            m_FlankTimer = 8f;
                            squad?.Callout("Moving to flank!", transform.position);
                        }
                        State = BotState.Flank;
                        m_FlankTimer -= dt;
                        SetMove(m_FlankPoint, runSpeed);
                        m_Crouch = false;
                        break;

                    default:
                        if (Time.time < m_PushUntil || (role == BotRole.Flanker && dist > 14f))
                        {
                            State = BotState.Engage;
                            SetMove(m_Target.transform.position, role == BotRole.Flanker ? runSpeed : walkSpeed + 1f);
                            m_Crouch = false;
                            break;
                        }
                        UseCover(dt, lowHealth);
                        break;
                }
                return;
            }

            if (squad != null && squad.ThreatFresh(12f))
            {
                State = BotState.Investigate;
                m_Crouch = false;
                SetMove(squad.LastKnownThreat, walkSpeed + 0.8f);
                return;
            }

            // patrol: follow squad waypoint in a loose wedge
            State = BotState.Patrol;
            m_Crouch = false;
            if (lowHealth) RegenArmor(dt);
            Vector3 wp = squad != null ? squad.Waypoint : transform.position;
            int index = squad != null ? squad.members.IndexOf(this) : 0;
            var leader = squad != null ? squad.Leader : this;
            if (leader != null && leader != this)
            {
                Vector3 back = -leader.transform.forward * 4f * index + leader.transform.right * (index % 2 == 0 ? 3f : -3f);
                wp = leader.transform.position + back;
            }
            SetMove(wp, walkSpeed);
        }

        void UseCover(float dt, bool lowHealth)
        {
            Vector3 threatEye = ChestOf(m_Target) + Vector3.up * 0.3f;
            if (m_CoverEval <= 0f)
            {
                m_CoverEval = 2f;
                if (m_Cover != null && !m_Cover.Protects(threatEye)) { m_Cover.occupant = null; m_Cover = null; }
                if (m_Cover == null)
                {
                    m_Cover = CoverPoint.FindBest(this, threatEye, 16f);
                    if (m_Cover != null) m_Cover.occupant = this;
                }
            }
            if (m_Cover != null)
            {
                State = BotState.TakeCover;
                float d = Vector3.Distance(transform.position, m_Cover.transform.position);
                if (d > 1.0f) { SetMove(m_Cover.transform.position, runSpeed); m_Crouch = false; return; }
                SetMove(m_Cover.transform.position, 0f);
                // peek cycle: hidden (crouched) → peek and burst
                m_PeekTimer -= dt;
                if (m_PeekTimer <= 0f)
                {
                    m_Peeking = !m_Peeking && !lowHealth;
                    m_PeekTimer = m_Peeking ? Random.Range(1.4f, 2.4f) : Random.Range(0.9f, 1.8f);
                }
                m_Crouch = !m_Peeking && m_Cover.lowCover;
                if (lowHealth && !m_Peeking) RegenArmor(dt);
                return;
            }
            // no cover: strafe and crouch-spam while firing
            State = BotState.Engage;
            m_StrafeTimer -= dt;
            if (m_StrafeTimer <= 0f)
            {
                m_StrafeTimer = Random.Range(0.6f, 1.6f);
                m_StrafeDir = -m_StrafeDir;
                m_Crouch = m_Rng.Next(3) == 0;
            }
            Vector3 toT = (m_Target.transform.position - transform.position);
            toT.y = 0;
            Vector3 side = Vector3.Cross(Vector3.up, toT.normalized) * m_StrafeDir;
            float dist = toT.magnitude;
            Vector3 approach = dist > 40f ? toT.normalized * 0.6f : dist < 12f ? -toT.normalized * 0.4f : Vector3.zero;
            SetMove(transform.position + (side + approach) * 3f, m_Crouch ? crouchSpeed : walkSpeed);
        }

        void RegenArmor(float dt)
        {
            m_PlateTimer += dt;
            if (m_PlateTimer > 3f && m_Health.Armor < m_Health.MaxArmor)
            {
                m_PlateTimer = 0f;
                m_Health.AddArmor(50f);
                AudioFX.PlayAt(Sfx.PlateInsert, transform.position, 0.6f, 1f, 25f);
            }
        }

        void TryGrenade(float dist)
        {
            m_GrenadeCooldown -= Time.deltaTime;
            if (m_CookTimer >= 0f)
            {
                m_CookTimer -= Time.deltaTime;
                if (m_CookTimer < 0f) ThrowFrag();
                return;
            }
            if (m_GrenadeCooldown > 0f || Time.time - s_LastGrenade < 8f) return;
            if (BotSquad.PlayerStationaryTime < 6f || dist < 8f || dist > 35f) return;
            m_CookTimer = Random.Range(1f, 1.5f);
            m_CookDuration = m_CookTimer;
            m_GrenadeCooldown = 15f;
            s_LastGrenade = Time.time;
            AudioFX.PlayAt(Sfx.GrenadePin, transform.position + Vector3.up * 1.3f, 0.6f, 1f, 20f);
            squad?.Callout("Throwing frag!", transform.position, true);
        }

        void ThrowFrag()
        {
            if (m_Target == null) return;
            Vector3 origin = transform.position + Vector3.up * 1.7f + transform.forward * 0.4f;
            Vector3 target = m_Target.transform.position;
            Vector3 delta = target - origin;
            float d = new Vector2(delta.x, delta.z).magnitude;
            float h = delta.y;
            float g = -Physics.gravity.y;
            Vector3 flat = new Vector3(delta.x, 0, delta.z).normalized;
            Vector3 vel = flat * 12f + Vector3.up * 6f;
            foreach (float deg in new[] { 38f, 50f, 60f })
            {
                float th = deg * Mathf.Deg2Rad;
                float denom = 2f * Mathf.Cos(th) * Mathf.Cos(th) * (d * Mathf.Tan(th) - h);
                if (denom <= 0.01f) continue;
                float v = Mathf.Sqrt(g * d * d / denom);
                vel = flat * v * Mathf.Cos(th) + Vector3.up * v * Mathf.Sin(th);
                break;
            }
            FragGrenade.Throw(gameObject, origin, vel, 3.5f - m_CookDuration);
        }

        // ---------------------------------------------------------------- downed

        void UpdateDowned(float dt)
        {
            Vector3 away = m_Target != null ? (transform.position - m_Target.transform.position) : transform.forward;
            away.y = 0;
            Vector3 vel = away.normalized * 0.8f;
            vel.y = m_VerticalVel;
            m_VerticalVel = m_CC.isGrounded ? -2f : m_VerticalVel - 18f * dt;
            if (m_CC.enabled) m_CC.Move(vel * dt);
            if (away.sqrMagnitude > 0.01f) m_Yaw = Mathf.MoveTowardsAngle(m_Yaw, Quaternion.LookRotation(away).eulerAngles.y, 90f * dt);
            transform.rotation = Quaternion.Euler(0, m_Yaw, 0);
            m_Body.Animate(0.8f, false, true, false, 0f, dt);
        }

        // ---------------------------------------------------------------- movement

        void SetMove(Vector3 target, float speed)
        {
            m_MoveTarget = target;
            m_MoveSpeed = speed;
        }

        void Move(float dt)
        {
            Vector3 to = m_MoveTarget - transform.position;
            to.y = 0;
            float dist = to.magnitude;
            Vector3 desired = Vector3.zero;
            float speed = m_Crouch ? Mathf.Min(m_MoveSpeed, crouchSpeed) : m_MoveSpeed;
            if (dist > 0.8f && speed > 0.01f)
            {
                Vector3 dir = to / dist;
                if (m_AvoidTimer > 0f) { m_AvoidTimer -= dt; dir = (dir * 0.3f + m_AvoidDir).normalized; }
                dir = Avoid(dir);
                desired = dir * speed;
            }

            // stuck detection
            if (desired.sqrMagnitude > 0.5f)
            {
                m_StuckTimer += dt;
                if (m_StuckTimer > 1.5f)
                {
                    if (Vector3.Distance(transform.position, m_LastPos) < 0.4f)
                    {
                        m_AvoidDir = Quaternion.Euler(0, m_Rng.Next(2) == 0 ? 90f : -90f, 0) * desired.normalized;
                        m_AvoidTimer = 1.2f;
                        if (m_CC.isGrounded) m_VerticalVel = 5.5f;
                    }
                    m_StuckTimer = 0f;
                    m_LastPos = transform.position;
                }
            }

            m_VerticalVel = m_CC.isGrounded && m_VerticalVel <= 0f ? -2f : m_VerticalVel - 18f * dt;
            Vector3 vel = desired + Vector3.up * m_VerticalVel;
            m_CC.Move(vel * dt);

            // facing: target when engaging, else movement direction
            Vector3 face = desired;
            if (m_Target != null && (m_TargetVisible || Time.time - m_TargetSeenTime < 2f) && State != BotState.Flank)
                face = m_TargetLastSeen - transform.position;
            face.y = 0;
            if (face.sqrMagnitude > 0.01f)
                m_Yaw = Mathf.MoveTowardsAngle(m_Yaw, Quaternion.LookRotation(face).eulerAngles.y, 300f * dt);
            transform.rotation = Quaternion.Euler(0, m_Yaw, 0);
        }

        Vector3 Avoid(Vector3 dir)
        {
            Vector3 origin = transform.position + Vector3.up * 0.9f;
            if (!Probe(origin, dir, out var door)) return dir;
            if (door != null) { door.OpenFor(transform.position); return dir; }
            foreach (float a in new[] { 35f, -35f, 70f, -70f, 110f, -110f })
            {
                Vector3 d = Quaternion.Euler(0, a, 0) * dir;
                if (!Probe(origin, d, out _)) return d;
            }
            return -dir;
        }

        bool Probe(Vector3 origin, Vector3 dir, out Door door)
        {
            door = null;
            if (Physics.SphereCast(origin, 0.3f, dir, out var hit, 1.3f, ~0, QueryTriggerInteraction.Ignore))
            {
                if (hit.collider.transform.IsChildOf(transform)) return false;
                if (hit.collider is CharacterController) return true;
                if (hit.normal.y > 0.7f) return false; // walkable slope
                door = hit.collider.GetComponentInParent<Door>();
                return true;
            }
            return false;
        }

        void ApplyGravityOnly(float dt)
        {
            if (!m_CC.enabled) return;
            m_VerticalVel = m_CC.isGrounded ? -2f : m_VerticalVel - 18f * dt;
            m_CC.Move(Vector3.up * m_VerticalVel * dt);
        }

        // ---------------------------------------------------------------- combat

        void Combat(float dt)
        {
            if (m_ReloadTimer > 0f)
            {
                m_ReloadTimer -= dt;
                if (m_ReloadTimer <= 0f) m_Weapon.mag = m_Weapon.MagSize;
                return;
            }
            if (m_Target == null || !m_TargetVisible || m_CookTimer >= 0f || State == BotState.Revive)
            {
                m_TimeOnTarget = 0f;
                m_AimPitch = Ease.Damp(m_AimPitch, 0f, 4f, dt);
                return;
            }
            if (State == BotState.TakeCover && !m_Peeking) return;
            if (State == BotState.Flank && Vector3.Distance(transform.position, m_FlankPoint) > 4f) return;

            Vector3 eye = EyePos;
            Vector3 chest = ChestOf(m_Target);
            Vector3 to = chest - eye;
            m_AimPitch = -Mathf.Asin(Mathf.Clamp(to.normalized.y, -1f, 1f)) * Mathf.Rad2Deg;
            float facing = Vector3.Angle(new Vector3(transform.forward.x, 0, transform.forward.z), new Vector3(to.x, 0, to.z));
            if (facing > 20f) return;

            m_TimeOnTarget += dt;
            if (m_Reaction > 0f) { m_Reaction -= dt; return; }

            if (m_Weapon.mag <= 0)
            {
                m_ReloadTimer = m_Weapon.data.reloadTime * 1.1f;
                AudioFX.PlayAt(Sfx.MagOut, transform.position + Vector3.up * 1.2f, 0.6f, 1f, 25f);
                if (m_Rng.Next(3) == 0) squad?.Callout("Reloading!", transform.position);
                return;
            }

            m_BurstCooldown -= dt;
            if (m_BurstLeft <= 0)
            {
                if (m_BurstCooldown > 0f) return;
                m_BurstLeft = role == BotRole.Sniper ? 1 : role == BotRole.Flanker ? m_Rng.Next(5, 9) : m_Rng.Next(3, 7);
            }
            m_ShotTimer -= dt;
            if (m_ShotTimer > 0f) return;
            m_ShotTimer = m_Weapon.data.SecondsPerShot * (role == BotRole.Sniper ? 1f : 1.15f);
            m_BurstLeft--;
            if (m_BurstLeft <= 0)
                m_BurstCooldown = role == BotRole.Sniper ? Random.Range(2.2f, 3.2f) : Random.Range(0.45f, 1.0f);
            Fire(eye, chest);
        }

        void Fire(Vector3 eye, Vector3 chest)
        {
            float dist = Vector3.Distance(eye, chest);
            float baseErr = role == BotRole.Sniper ? 0.45f : role == BotRole.Flanker ? 2.6f : 2.0f;
            float targetSpeed = 0f;
            if (m_Target.isPlayer && LocalPlayer.Controller != null) targetSpeed = LocalPlayer.Controller.Speed01;
            float err = baseErr * (1f + dist / 60f) * (1f + targetSpeed * 1.2f) * (0.35f + 0.65f * Mathf.Exp(-m_TimeOnTarget / 1.4f)) * (m_Crouch ? 0.8f : 1f);
            Vector3 aim = (chest - eye).normalized;
            Vector3 right = Vector3.Cross(Vector3.up, aim).normalized;
            Vector3 up = Vector3.Cross(aim, right);
            float r = Mathf.Tan(err * Mathf.Deg2Rad) * Mathf.Sqrt(Random.value);
            float th = Random.value * Mathf.PI * 2f;
            Vector3 dir = (aim + right * r * Mathf.Cos(th) + up * r * Mathf.Sin(th)).normalized;

            m_Weapon.mag--;
            Vector3 muzzle = m_Body.muzzle != null ? m_Body.muzzle.position : eye;
            bool tracer = role == BotRole.Sniper || m_Rng.Next(3) == 0;
            Ballistics.Fire(gameObject, m_Weapon, eye, dir, muzzle, tracer, damageScale);
            if (!m_Weapon.Suppressed) WeaponFX.MuzzleFlash(muzzle, dir, m_Weapon.data.flashScale * 0.8f);
            AudioFX.PlayAt(m_Weapon.Suppressed ? Sfx.SuppressedShot : m_Weapon.data.shotSound, muzzle, m_Weapon.Suppressed ? 0.5f : 1f, Random.Range(0.95f, 1.05f), m_Weapon.Suppressed ? 40f : 350f);
            GameEvents.RaiseShot(gameObject, muzzle, m_Weapon.Suppressed);
        }

        void UpdateGlint()
        {
            GlintVisible = false;
            if (m_Glint == null) return;
            bool show = m_Target != null && m_Target.isPlayer && m_TargetVisible && LocalPlayer.Exists
                        && Vector3.Distance(transform.position, LocalPlayer.Position) > 40f;
            m_Glint.gameObject.SetActive(show);
            GlintVisible = show;
            if (!show) return;
            var cam = LocalPlayer.Camera;
            m_Glint.rotation = Quaternion.LookRotation(m_Glint.position - cam.transform.position);
            float dist = Vector3.Distance(m_Glint.position, cam.transform.position);
            float pulse = 0.7f + 0.3f * Mathf.Sin(Time.time * 9f);
            m_Glint.localScale = Vector3.one * dist * 0.012f * pulse;
            bool red = Mathf.Repeat(Time.time, 0.6f) > 0.3f;
            MaterialLibrary.Tint(m_GlintRenderer, red ? new Color(1f, 0.25f, 0.2f, 1f) : new Color(1f, 1f, 1f, 1f));
        }
    }
}
