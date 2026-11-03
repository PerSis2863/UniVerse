using UnityEngine;

namespace Stormfall
{
    public enum MoveState { Grounded, Airborne, Sliding, Diving, Prone, Mantling, InAircraft, Freefall, Parachute, Downed, Frozen }

    /// <summary>
    /// Quake-derived kinematic movement (PM_Accelerate / PM_Friction) on a CharacterController with
    /// tactical sprint, slide + slide-cancel, dolphin dive, prone, ledge mantle, free-fall and
    /// parachute. See Docs/TECHNICAL_SPEC.md §2 for the maths.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class TacticalPlayerController : MonoBehaviour
    {
        [Header("Rig")]
        public Transform cameraRoot;   // yaw-less, eye height
        public Transform cameraRig;    // pitch / roll / recoil
        public Camera cam;
        public GameObject parachuteVisual;

        [Header("Speeds")]
        public float baseSpeed = 5f;
        public float strafeMul = 0.85f, backMul = 0.75f, adsMul = 0.6f, crouchMul = 0.55f, proneMul = 0.25f, downedMul = 0.2f;
        public float sprintMul = 1.35f, tacSprintMul = 1.65f;
        public float tacSprintDuration = 4f, tacSprintRecharge = 3f;

        [Header("Physics")]
        public float groundAccel = 12f, airAccel = 2f, airWishCap = 1.2f;
        public float friction = 8f, crouchFriction = 9f, stopSpeed = 2.5f;
        public float gravity = 18f, jumpHeight = 1.05f;

        [Header("Slide / Dive")]
        public float slideDuration = 0.65f, slideDecay = 3.2f, slideTilt = 6f;
        public float diveForward = 9f, diveUp = 3.6f;

        [Header("Free-fall")]
        public float freefallSpeed = 50f, diveFreefallSpeed = 65f, freefallGlide = 18f;
        public float chuteDescent = 6f, chuteGlide = 14f, chuteMinHeight = 25f, chuteAutoHeight = 60f;

        [Header("Camera")]
        public float baseFov = 78f;
        public float sensitivityScale = 1f;

        // --- public state -------------------------------------------------------------------
        public MoveState State { get; private set; } = MoveState.Grounded;
        public Vector3 Velocity => m_Velocity;
        public bool IsGrounded => State == MoveState.Grounded || State == MoveState.Sliding || State == MoveState.Prone || State == MoveState.Downed;
        public bool IsSprinting => m_Sprinting && State == MoveState.Grounded;
        public bool IsTacSprinting => m_TacSprintTime > 0f && IsSprinting;
        public bool IsSliding => State == MoveState.Sliding;
        public bool IsCrouched => m_Crouched && State == MoveState.Grounded;
        public bool IsProne => State == MoveState.Prone;
        public bool IsMantling => State == MoveState.Mantling;
        public bool IsAirborneSkydive => State == MoveState.Freefall || State == MoveState.Parachute || State == MoveState.InAircraft;
        public float TacSprintFraction => m_TacSprintTime > 0f ? m_TacSprintTime / EffectiveTacDuration : 1f - Mathf.Clamp01(m_TacRecharge / tacSprintRecharge);
        public bool TacSprintReady => m_TacRecharge <= 0f;
        public float Speed01 => Mathf.Clamp01(new Vector2(m_Velocity.x, m_Velocity.z).magnitude / (baseSpeed * tacSprintMul));
        public float BobPhase => m_BobPhase;
        public float BobWeight => m_BobWeight;
        public Vector2 LookDelta { get; private set; }
        public float Yaw => m_Yaw;
        public float Pitch => m_Pitch;
        public float HeightAboveGround { get; private set; }
        public float EyeHeight => m_EyeHeight;

        /// <summary>Recoil offset (pitch up, yaw right) in degrees, written by the weapon each frame.</summary>
        [System.NonSerialized] public Vector2 ViewRecoil;
        /// <summary>ADS blend 0..1 and target FOV, written by the weapon each frame.</summary>
        [System.NonSerialized] public float AdsAmount, AdsFov = 60f, AdsSensitivity = 1f;
        [System.NonSerialized] public bool MenuOpen;
        [System.NonSerialized] public bool PerkFleetfoot;

        public System.Action<MoveState> StateChanged;

        CharacterController m_CC;
        Vector3 m_Velocity;
        float m_Yaw, m_Pitch;
        bool m_Sprinting, m_Crouched;
        float m_TacSprintTime, m_TacRecharge, m_LastShiftTap = -10f;
        float m_StateTime;
        bool m_SlideFromTac, m_DiveChecked;
        float m_CrouchHeldTime;
        float m_EyeHeight = 1.62f, m_TargetEye = 1.62f;
        float m_Roll, m_TargetRoll;
        float m_BobPhase, m_BobWeight;
        float m_StepAccum;
        float m_AirTime;
        float m_LandDip, m_LandDipVel;
        float m_FovCurrent;
        float m_ChuteCooldown;
        Transform m_AircraftAnchor;
        AudioSource m_WindSource;
        ProceduralWeaponController m_Weapon;
        PlayerHealthArmor m_Health;

        // mantle
        Vector3 m_MantleStart, m_MantleTop, m_MantleEnd;
        float m_MantleDuration;

        float EffectiveTacDuration => tacSprintDuration * (PerkFleetfoot ? 2f : 1f);

        const float StandHeight = 1.8f, CrouchHeight = 1.2f, SlideHeight = 0.9f, ProneHeight = 0.6f, DownedHeight = 0.7f;

        void Awake()
        {
            LocalPlayer.Register(gameObject);
            m_CC = GetComponent<CharacterController>();
            m_Weapon = GetComponent<ProceduralWeaponController>();
            m_Health = GetComponent<PlayerHealthArmor>();
            m_Yaw = transform.eulerAngles.y;
            m_FovCurrent = baseFov;
            if (cam == null) cam = GetComponentInChildren<Camera>();
            m_WindSource = AudioFX.CreateLoop(transform, Sfx.WindRush, 0f, 0f, 10f);
            if (parachuteVisual != null) parachuteVisual.SetActive(false);
            BuildHitboxes();
            SetHeight(StandHeight);
        }

        void Start()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            // Browsers only lock the pointer after a click (GameInput.UpdateCursor does it then).
            Cursor.lockState = CursorLockMode.Locked;
            Cursor.visible = false;
#endif
        }

        // Trigger hitboxes so bot bullets register on the player (the capsule itself is skipped by ballistics).
        CapsuleCollider m_BodyHitbox;
        SphereCollider m_HeadHitbox;

        void BuildHitboxes()
        {
            var body = new GameObject("HB_UpperTorso");
            body.transform.SetParent(transform, false);
            m_BodyHitbox = body.AddComponent<CapsuleCollider>();
            m_BodyHitbox.isTrigger = true;
            m_BodyHitbox.radius = 0.3f;
            HitboxZone.Add(body, HitZone.UpperTorso);
            var head = new GameObject("HB_Head");
            head.transform.SetParent(transform, false);
            m_HeadHitbox = head.AddComponent<SphereCollider>();
            m_HeadHitbox.isTrigger = true;
            m_HeadHitbox.radius = 0.14f;
            HitboxZone.Add(head, HitZone.Head);
        }

        void UpdateHitboxes()
        {
            if (m_BodyHitbox == null) return;
            float h = Mathf.Max(0.5f, m_EyeHeight - 0.12f);
            m_BodyHitbox.height = h;
            m_BodyHitbox.center = new Vector3(0, h * 0.5f, 0);
            m_BodyHitbox.direction = State == MoveState.Prone || State == MoveState.Downed ? 2 : 1;
            if (m_BodyHitbox.direction == 2) { m_BodyHitbox.height = 1.6f; m_BodyHitbox.center = new Vector3(0, 0.3f, 0); }
            m_HeadHitbox.center = new Vector3(0, m_EyeHeight + 0.02f, State == MoveState.Prone || State == MoveState.Downed ? 0.75f : 0f);
        }

        // =================================================================== public API

        public void Teleport(Vector3 pos, float yaw)
        {
            m_CC.enabled = false;
            transform.position = pos;
            m_CC.enabled = true;
            m_Yaw = yaw;
            m_Pitch = 0f;
            m_Velocity = Vector3.zero;
        }

        public void EnterAircraft(Transform anchor)
        {
            m_AircraftAnchor = anchor;
            SetState(MoveState.InAircraft);
            m_CC.enabled = false;
        }

        /// <summary>Starts free-fall at the current position (aircraft jump, updraft, redeploy).</summary>
        public void BeginFreefall(Vector3 velocity)
        {
            m_AircraftAnchor = null;
            if (!m_CC.enabled) m_CC.enabled = true;
            m_Velocity = velocity;
            m_ChuteCooldown = 0.4f;
            SetHeight(StandHeight);
            SetState(MoveState.Freefall);
            AudioFX.Play2D(Sfx.VentWhoosh, 0.5f, 1.2f);
        }

        public void SetDowned(bool downed)
        {
            if (downed)
            {
                m_Sprinting = false; m_TacSprintTime = 0f;
                SetHeight(DownedHeight);
                SetState(MoveState.Downed);
            }
            else if (State == MoveState.Downed)
            {
                SetHeight(StandHeight);
                SetState(MoveState.Grounded);
            }
        }

        public void Freeze(bool frozen)
        {
            if (frozen) { m_Velocity = Vector3.zero; SetState(MoveState.Frozen); }
            else if (State == MoveState.Frozen) SetState(MoveState.Grounded);
        }

        public void CancelSprint()
        {
            m_Sprinting = false;
            if (m_TacSprintTime > 0f) { m_TacSprintTime = 0f; m_TacRecharge = tacSprintRecharge; }
        }

        public void AddImpulse(Vector3 v) => m_Velocity += v;

        // =================================================================== update

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;
            GameInput.UpdateCursor(MenuOpen);

            // ---- look ----
            Vector2 look = GameInput.Look * sensitivityScale * Mathf.Lerp(1f, AdsSensitivity, AdsAmount);
            LookDelta = look;
            m_Yaw += look.x;
            float pitchLimit = State == MoveState.Prone || State == MoveState.Downed ? 45f : 85f;
            m_Pitch = Mathf.Clamp(m_Pitch - look.y, -pitchLimit, pitchLimit);
            transform.rotation = Quaternion.Euler(0f, m_Yaw, 0f);

            m_StateTime += dt;
            ProbeHeight();

            // ---- simulation with fixed sub-steps (frame-rate independence) ----
            int steps = Mathf.Clamp(Mathf.CeilToInt(dt / (1f / 120f)), 1, 8);
            float h = dt / steps;
            HandleDiscreteInput();
            for (int i = 0; i < steps; i++) Simulate(h);

            UpdateCameraEffects(dt);
            UpdateHitboxes();
            UpdateAudio(dt);
        }

        void HandleDiscreteInput()
        {
            Vector2 move = GameInput.Move;
            switch (State)
            {
                case MoveState.Grounded:
                {
                    // Sprint & tactical sprint (double-tap Shift)
                    if (GameInput.Pressed(GameKey.Sprint) && move.y > 0.5f && !m_Crouched)
                    {
                        bool doubleTap = Time.time - m_LastShiftTap < 0.3f;
                        m_LastShiftTap = Time.time;
                        if (m_Weapon == null || !m_Weapon.IsAiming)
                        {
                            m_Sprinting = true;
                            if (doubleTap && m_TacRecharge <= 0f && m_TacSprintTime <= 0f)
                            {
                                m_TacSprintTime = EffectiveTacDuration;
                                AudioFX.Play2D(Sfx.VentWhoosh, 0.18f, 1.8f);
                            }
                        }
                    }
                    if (move.y < 0.5f || (m_Weapon != null && m_Weapon.IsAiming)) { if (m_Sprinting) CancelSprint(); }

                    if (GameInput.Pressed(GameKey.Crouch))
                    {
                        if (m_Sprinting && new Vector2(m_Velocity.x, m_Velocity.z).magnitude > baseSpeed * 1.1f) StartSlide();
                        else if (m_Crouched) TryStand();
                        else { m_Crouched = true; SetHeight(CrouchHeight); }
                        m_CrouchHeldTime = 0f;
                    }
                    if (GameInput.Held(GameKey.Crouch) && State == MoveState.Grounded)
                    {
                        m_CrouchHeldTime += Time.deltaTime;
                        if (m_CrouchHeldTime > 0.6f && !m_Sprinting) { EnterProne(); m_CrouchHeldTime = -10f; }
                    }
                    if (GameInput.Pressed(GameKey.Jump))
                    {
                        if (TryMantle()) break;
                        if (m_Crouched) { TryStand(); break; }
                        m_Velocity.y = Mathf.Sqrt(2f * gravity * jumpHeight);
                        SetState(MoveState.Airborne);
                    }
                    break;
                }
                case MoveState.Sliding:
                    // C still held 0.15 s into a slide that started from tactical sprint -> dolphin dive
                    if (m_SlideFromTac && !m_DiveChecked && m_StateTime >= 0.15f)
                    {
                        m_DiveChecked = true;
                        if (GameInput.Held(GameKey.Crouch)) { StartDive(); break; }
                    }
                    if (GameInput.Pressed(GameKey.Jump)) SlideCancel();
                    break;
                case MoveState.Airborne:
                    if (GameInput.Pressed(GameKey.Jump)) TryMantle();
                    break;
                case MoveState.Prone:
                    if (GameInput.Pressed(GameKey.Jump) && HasHeadroom(StandHeight))
                    {
                        m_Crouched = false; SetHeight(StandHeight); SetState(MoveState.Grounded);
                    }
                    else if ((GameInput.Pressed(GameKey.Crouch) || GameInput.Pressed(GameKey.Jump)) && HasHeadroom(CrouchHeight))
                    {
                        m_Crouched = true; SetHeight(CrouchHeight); SetState(MoveState.Grounded);
                    }
                    break;
                case MoveState.InAircraft:
                    if (GameInput.Pressed(GameKey.Jump) && m_AircraftAnchor != null)
                    {
                        var vel = m_AircraftAnchor.GetComponentInParent<InfilAircraft>();
                        transform.position = m_AircraftAnchor.position + Vector3.down * 2.5f;
                        BeginFreefall(vel != null ? vel.Velocity * 0.4f : Vector3.zero);
                        if (vel != null) vel.NotifyPlayerJumped();
                    }
                    break;
                case MoveState.Freefall:
                    m_ChuteCooldown -= Time.deltaTime;
                    if ((GameInput.Pressed(GameKey.Jump) && HeightAboveGround > chuteMinHeight && m_ChuteCooldown <= 0f) || (HeightAboveGround < chuteAutoHeight && m_Velocity.y < 0f))
                        DeployChute();
                    break;
                case MoveState.Parachute:
                    m_ChuteCooldown -= Time.deltaTime;
                    if (GameInput.Pressed(GameKey.Crouch) && HeightAboveGround > chuteMinHeight + 10f)
                    {
                        if (parachuteVisual != null) parachuteVisual.SetActive(false);
                        m_ChuteCooldown = 1.0f;
                        AudioFX.Play2D(Sfx.ParachuteFlap, 0.4f, 1.6f);
                        SetState(MoveState.Freefall);
                    }
                    break;
            }

            // tactical sprint timers
            if (m_TacSprintTime > 0f)
            {
                m_TacSprintTime -= Time.deltaTime;
                if (m_TacSprintTime <= 0f || !IsSprinting) { m_TacSprintTime = 0f; m_TacRecharge = tacSprintRecharge; }
            }
            else if (m_TacRecharge > 0f) m_TacRecharge -= Time.deltaTime * (PerkFleetfoot ? 2f : 1f);
        }

        void Simulate(float h)
        {
            switch (State)
            {
                case MoveState.Grounded: GroundMove(h); break;
                case MoveState.Airborne: AirMove(h); break;
                case MoveState.Sliding: SlideMove(h); break;
                case MoveState.Diving: DiveMove(h); break;
                case MoveState.Prone: GroundMove(h); break;
                case MoveState.Downed: GroundMove(h); break;
                case MoveState.Mantling: MantleMove(h); break;
                case MoveState.InAircraft:
                    if (m_AircraftAnchor != null) transform.position = m_AircraftAnchor.position;
                    break;
                case MoveState.Freefall: SkydiveMove(h, false); break;
                case MoveState.Parachute: SkydiveMove(h, true); break;
                case MoveState.Frozen: break;
            }
        }

        // =================================================================== movement modes

        Vector3 WishDir(Vector2 input, out float dirMul)
        {
            Vector3 fwd = transform.forward, right = transform.right;
            Vector3 wish = fwd * input.y + right * input.x;
            float fw = Mathf.Max(input.y, 0f), bw = Mathf.Max(-input.y, 0f), sw = Mathf.Abs(input.x);
            float sum = fw + bw + sw;
            dirMul = sum > 0.001f ? (fw * 1f + bw * backMul + sw * strafeMul) / sum : 1f;
            return wish.sqrMagnitude > 1e-4f ? wish.normalized : Vector3.zero;
        }

        float StanceMultiplier()
        {
            switch (State)
            {
                case MoveState.Prone: return proneMul;
                case MoveState.Downed: return downedMul;
            }
            if (m_Crouched) return crouchMul;
            return 1f;
        }

        void GroundMove(float h)
        {
            Vector2 input = GameInput.Move;
            if (m_Health != null && m_Health.BlocksMovement) input = Vector2.zero;
            Vector3 wishdir = WishDir(input, out float dirMul);
            float wishspeed = baseSpeed * input.magnitude;
            if (IsSprinting && input.y > 0.5f)
            {
                float mul = m_TacSprintTime > 0f ? tacSprintMul : sprintMul;
                if (PerkFleetfoot) mul *= 1.05f;
                wishspeed = baseSpeed * mul;
            }
            else
            {
                wishspeed *= dirMul * StanceMultiplier();
                if (m_Weapon != null) wishspeed *= Mathf.Lerp(1f, adsMul, m_Weapon.AdsAmount) * m_Weapon.MoveSpeedMultiplier;
            }
            if (m_Health != null && m_Health.IsInsertingPlate) wishspeed *= 0.8f;
            if (transform.position.y < WorldInfo.WaterLevel - 0.6f) wishspeed *= 0.55f;

            ApplyFriction(h, m_Crouched || State == MoveState.Prone ? crouchFriction : friction);
            Accelerate(wishdir, wishspeed, groundAccel, h);

            m_Velocity.y = -2f; // stick to slopes
            var flags = m_CC.Move(m_Velocity * h);
            if ((flags & CollisionFlags.Below) == 0 && !SnapToGround())
            {
                m_Velocity.y = 0f;
                if (State == MoveState.Grounded) SetState(MoveState.Airborne);
            }
            else m_Velocity.y = 0f;
        }

        void AirMove(float h)
        {
            Vector2 input = GameInput.Move;
            Vector3 wishdir = WishDir(input, out _);
            Accelerate(wishdir, Mathf.Min(airWishCap, baseSpeed * input.magnitude), airAccel * 10f, h);
            m_Velocity.y -= gravity * h;
            var flags = m_CC.Move(m_Velocity * h);
            m_AirTime += h;
            if ((flags & CollisionFlags.Above) != 0 && m_Velocity.y > 0f) m_Velocity.y = 0f;
            if ((flags & CollisionFlags.Below) != 0 && m_Velocity.y <= 0f) Land();
        }

        void SlideMove(float h)
        {
            Vector3 flat = new Vector3(m_Velocity.x, 0, m_Velocity.z);
            float speed = flat.magnitude;
            float vEnd = baseSpeed * crouchMul;
            // v(t) = v_end + (v - v_end) e^{-k h}
            float newSpeed = vEnd + (speed - vEnd) * Mathf.Exp(-slideDecay * h);
            // slopes: gain speed downhill
            if (Physics.Raycast(transform.position + Vector3.up * 0.3f, Vector3.down, out var hit, 0.8f, ~0, QueryTriggerInteraction.Ignore))
            {
                float downhill = Vector3.Dot(Vector3.ProjectOnPlane(Vector3.down, hit.normal), flat.normalized);
                newSpeed += downhill * 9f * h;
            }
            if (speed > 0.01f) flat = flat / speed * newSpeed;
            // light steering
            Vector2 input = GameInput.Move;
            flat = Quaternion.Euler(0, input.x * 40f * h, 0) * flat;
            m_Velocity = new Vector3(flat.x, -2f, flat.z);
            var flags = m_CC.Move(m_Velocity * h);
            m_Velocity.y = 0f;
            if ((flags & CollisionFlags.Below) == 0 && !SnapToGround()) { EndSlide(true); SetState(MoveState.Airborne); return; }
            if (m_StateTime >= slideDuration) EndSlide(false);
        }

        void DiveMove(float h)
        {
            m_Velocity.y -= 22f * h;
            var flags = m_CC.Move(m_Velocity * h);
            if ((flags & CollisionFlags.Below) != 0 && m_Velocity.y <= 0f)
            {
                AudioFX.PlayAt(Sfx.Land, transform.position, 0.9f, 0.8f);
                m_LandDipVel -= 3.5f;
                m_Velocity *= 0.35f;
                m_Velocity.y = 0f;
                SetHeight(ProneHeight);
                SetState(MoveState.Prone);
            }
        }

        void SkydiveMove(float h, bool chute)
        {
            Vector2 input = GameInput.Move;
            Vector3 fwd = Quaternion.Euler(0, m_Yaw, 0) * Vector3.forward;
            Vector3 right = Quaternion.Euler(0, m_Yaw, 0) * Vector3.right;
            Vector3 wish = (fwd * input.y + right * input.x);
            float glide = chute ? chuteGlide : freefallGlide;
            Vector3 targetFlat = wish * glide + (chute ? fwd * 4f : Vector3.zero);
            float targetV = chute ? -chuteDescent : -(input.y > 0.5f && m_Pitch > 30f ? diveFreefallSpeed : freefallSpeed);
            if (!chute && input.y > 0.5f && m_Pitch > 30f) targetFlat *= 0.6f;
            Vector3 flat = new Vector3(m_Velocity.x, 0, m_Velocity.z);
            flat = Vector3.Lerp(flat, targetFlat, 1f - Mathf.Exp(-(chute ? 1.6f : 0.9f) * h));
            float vy = Mathf.Lerp(m_Velocity.y, targetV, 1f - Mathf.Exp(-(chute ? 3f : 0.8f) * h));
            m_Velocity = new Vector3(flat.x, vy, flat.z);
            var flags = m_CC.Move(m_Velocity * h);
            // keep inside the playable sky box
            Vector3 p = transform.position;
            float limit = WorldInfo.HalfSize * 1.2f;
            if (Mathf.Abs(p.x) > limit || Mathf.Abs(p.z) > limit)
            {
                m_Velocity.x -= Mathf.Sign(p.x) * Mathf.Max(0, Mathf.Abs(p.x) - limit) * h * 4f;
                m_Velocity.z -= Mathf.Sign(p.z) * Mathf.Max(0, Mathf.Abs(p.z) - limit) * h * 4f;
            }
            if ((flags & CollisionFlags.Below) != 0 || HeightAboveGround < 0.4f)
            {
                if (parachuteVisual != null) parachuteVisual.SetActive(false);
                AudioFX.PlayAt(Sfx.Land, transform.position, 1f, 0.9f);
                m_LandDipVel -= chute ? 2.5f : 5f;
                m_Velocity = flat * 0.3f;
                SetState(MoveState.Grounded);
            }
        }

        void DeployChute()
        {
            if (parachuteVisual != null) parachuteVisual.SetActive(true);
            AudioFX.Play2D(Sfx.ParachuteOpen, 0.9f);
            m_LandDipVel += 3f;
            SetState(MoveState.Parachute);
            m_ChuteCooldown = 1.0f;
        }

        void MantleMove(float h)
        {
            float t = Mathf.Clamp01(m_StateTime / m_MantleDuration);
            Vector3 target;
            if (t < 0.6f)
            {
                float u = Ease.OutCubic(t / 0.6f);
                target = Vector3.Lerp(m_MantleStart, new Vector3(m_MantleStart.x, m_MantleTop.y + 0.05f, m_MantleStart.z), u);
            }
            else
            {
                float u = Ease.InOutSine((t - 0.6f) / 0.4f);
                Vector3 up = new Vector3(m_MantleStart.x, m_MantleTop.y + 0.05f, m_MantleStart.z);
                target = Vector3.Lerp(up, m_MantleEnd, u);
            }
            m_CC.enabled = false;
            transform.position = target;
            m_CC.enabled = true;
            if (t >= 1f)
            {
                m_Velocity = transform.forward * baseSpeed * 0.6f;
                SetState(MoveState.Grounded);
            }
        }

        // =================================================================== Quake core

        void ApplyFriction(float h, float mu)
        {
            Vector3 flat = new Vector3(m_Velocity.x, 0, m_Velocity.z);
            float speed = flat.magnitude;
            if (speed < 0.05f) { m_Velocity.x = m_Velocity.z = 0f; return; }
            float control = Mathf.Max(speed, stopSpeed);
            float drop = control * mu * h;
            float newspeed = Mathf.Max(speed - drop, 0f) / speed;
            m_Velocity.x *= newspeed;
            m_Velocity.z *= newspeed;
        }

        void Accelerate(Vector3 wishdir, float wishspeed, float accel, float h)
        {
            float current = Vector3.Dot(m_Velocity, wishdir);
            float add = wishspeed - current;
            if (add <= 0f) return;
            float accelSpeed = Mathf.Min(accel * h * wishspeed, add);
            m_Velocity += accelSpeed * wishdir;
        }

        // =================================================================== actions

        void StartSlide()
        {
            Vector3 flat = new Vector3(m_Velocity.x, 0, m_Velocity.z);
            float v0 = Mathf.Max(1.5f * baseSpeed, flat.magnitude * 1.1f);
            Vector3 dir = flat.sqrMagnitude > 0.01f ? flat.normalized : transform.forward;
            m_Velocity = dir * v0;
            m_SlideFromTac = m_TacSprintTime > 0f;
            m_DiveChecked = false;
            m_Sprinting = false;
            SetHeight(SlideHeight);
            SetState(MoveState.Sliding);
            AudioFX.PlayAt(Sfx.SlideScrape, transform.position, 0.8f);
        }

        void EndSlide(bool airborne)
        {
            if (airborne) { SetHeight(StandHeight); m_Crouched = false; return; }
            m_Crouched = true;
            SetHeight(CrouchHeight);
            SetState(MoveState.Grounded);
        }

        void SlideCancel()
        {
            if (!HasHeadroom(StandHeight)) return;
            m_Crouched = false;
            SetHeight(StandHeight);
            SetState(MoveState.Grounded);
            // reset tactical sprint: full charge, and resume it immediately if we were tac-sprinting
            m_TacRecharge = 0f;
            m_Sprinting = true;
            m_TacSprintTime = m_SlideFromTac ? EffectiveTacDuration : 0f;
            m_LandDipVel += 1.5f;
        }

        void StartDive()
        {
            m_Velocity = transform.forward * diveForward + Vector3.up * diveUp;
            SetHeight(ProneHeight);
            SetState(MoveState.Diving);
            AudioFX.PlayAt(Sfx.Mantle, transform.position, 0.6f, 0.7f);
        }

        void EnterProne()
        {
            m_Crouched = false;
            SetHeight(ProneHeight);
            SetState(MoveState.Prone);
        }

        void TryStand()
        {
            if (!HasHeadroom(StandHeight)) return;
            m_Crouched = false;
            SetHeight(StandHeight);
        }

        bool TryMantle()
        {
            Vector3 feet = transform.position;
            Vector3 fwd = transform.forward;
            float r = m_CC.radius;
            if (!Physics.Raycast(feet + Vector3.up * 0.45f, fwd, out var knee, r + 0.9f, ~0, QueryTriggerInteraction.Ignore)) return false;
            if (knee.collider.GetComponentInParent<IDamageable>() != null) return false;
            Vector3 probe = knee.point + fwd * 0.35f + Vector3.up * 2.0f;
            if (!Physics.Raycast(probe, Vector3.down, out var top, 2.0f, ~0, QueryTriggerInteraction.Ignore)) return false;
            float height = top.point.y - feet.y;
            if (height < 0.6f || height > 1.6f) return false;
            if (Vector3.Angle(top.normal, Vector3.up) > 35f) return false;
            Vector3 end = top.point + fwd * (r + 0.1f);
            // clearance for a crouched capsule at the destination
            Vector3 p1 = end + Vector3.up * (r + 0.05f), p2 = end + Vector3.up * (CrouchHeight - r);
            if (Physics.CheckCapsule(p1, p2, r * 0.9f, ~0, QueryTriggerInteraction.Ignore)) return false;
            // chest must be clear above the ledge (no wall behind)
            if (Physics.Raycast(new Vector3(feet.x, top.point.y + 0.3f, feet.z), fwd, r + 0.6f, ~0, QueryTriggerInteraction.Ignore)) return false;

            m_MantleStart = feet;
            m_MantleTop = top.point;
            m_MantleEnd = end;
            m_MantleDuration = 0.25f + 0.15f * (height / 1.6f);
            m_Sprinting = false;
            SetHeight(StandHeight);
            SetState(MoveState.Mantling);
            AudioFX.PlayAt(Sfx.Mantle, transform.position, 0.8f);
            return true;
        }

        void Land()
        {
            if (m_AirTime > 0.35f)
            {
                m_LandDipVel -= Mathf.Clamp(m_AirTime * 3f, 1f, 4f);
                AudioFX.PlayAt(Sfx.Land, transform.position, 0.8f);
            }
            m_AirTime = 0f;
            m_Velocity.y = 0f;
            SetState(MoveState.Grounded);
        }

        bool SnapToGround()
        {
            if (Physics.SphereCast(transform.position + Vector3.up * (m_CC.radius + 0.05f), m_CC.radius * 0.95f, Vector3.down,
                    out var hit, 0.45f, ~0, QueryTriggerInteraction.Ignore))
            {
                if (Vector3.Angle(hit.normal, Vector3.up) <= m_CC.slopeLimit + 5f)
                {
                    m_CC.Move(Vector3.down * hit.distance);
                    return true;
                }
            }
            return false;
        }

        bool HasHeadroom(float height)
        {
            float r = m_CC.radius;
            Vector3 bottom = transform.position + Vector3.up * (r + 0.1f);
            Vector3 top = transform.position + Vector3.up * (height - r);
            foreach (var c in Physics.OverlapCapsule(bottom, top, r * 0.9f, ~0, QueryTriggerInteraction.Ignore))
                if (!c.transform.IsChildOf(transform)) return false;
            return true;
        }

        void SetHeight(float h)
        {
            m_CC.height = h;
            m_CC.center = new Vector3(0, h * 0.5f, 0);
            m_TargetEye = h switch
            {
                StandHeight => 1.62f,
                CrouchHeight => 1.05f,
                SlideHeight => 0.8f,
                ProneHeight => 0.38f,
                _ => 0.45f
            };
        }

        void SetState(MoveState s)
        {
            if (State == s) return;
            if (s != MoveState.Airborne) m_AirTime = 0f;
            State = s;
            m_StateTime = 0f;
            StateChanged?.Invoke(s);
        }

        void ProbeHeight()
        {
            Vector3 origin = transform.position + Vector3.up * 0.2f;
            if (Physics.Raycast(origin, Vector3.down, out var hit, 2000f, ~0, QueryTriggerInteraction.Ignore))
                HeightAboveGround = hit.distance - 0.2f;
            else HeightAboveGround = transform.position.y - WorldInfo.WaterLevel;
            HeightAboveGround = Mathf.Min(HeightAboveGround, transform.position.y - WorldInfo.WaterLevel);
        }

        // =================================================================== camera

        void UpdateCameraEffects(float dt)
        {
            Vector3 flat = new Vector3(m_Velocity.x, 0, m_Velocity.z);
            float speed = flat.magnitude;
            bool grounded = State == MoveState.Grounded || State == MoveState.Prone || State == MoveState.Downed;

            // bob phase (two-step bounce)
            float stride = IsTacSprinting ? 1.9f : IsSprinting ? 2.0f : 2.3f;
            if (grounded && speed > 0.3f)
            {
                m_BobPhase += speed / stride * Mathf.PI * dt;
                m_BobWeight = Ease.Damp(m_BobWeight, Mathf.Clamp01(speed / baseSpeed), 10f, dt);
                m_StepAccum += speed * dt;
                if (m_StepAccum > stride)
                {
                    m_StepAccum = 0f;
                    bool concrete = Physics.Raycast(transform.position + Vector3.up * 0.2f, Vector3.down, out var hit, 0.6f) && !(hit.collider is TerrainCollider);
                    float vol = State == MoveState.Prone || m_Crouched ? 0.25f : IsSprinting ? 0.85f : 0.55f;
                    AudioFX.PlayAt(concrete ? Sfx.FootstepConcrete : Sfx.Footstep, transform.position, vol, Random.Range(0.9f, 1.1f), 40f);
                    FootstepNoise?.Invoke(transform.position, vol);
                }
            }
            else m_BobWeight = Ease.Damp(m_BobWeight, 0f, 8f, dt);

            float ax = IsTacSprinting ? 0.03f : 0.018f, ay = IsTacSprinting ? 0.055f : 0.028f;
            float adsDamp = 1f - 0.85f * AdsAmount;
            Vector3 bob = new Vector3(Mathf.Sin(m_BobPhase) * ax, Mathf.Abs(Mathf.Sin(m_BobPhase)) * ay, 0f) * m_BobWeight * adsDamp;

            // eye height + landing dip spring
            m_EyeHeight = Ease.Damp(m_EyeHeight, m_TargetEye, 12f, dt);
            SpringMath.Critical(ref m_LandDip, ref m_LandDipVel, 11f, dt);
            if (cameraRoot != null) cameraRoot.localPosition = new Vector3(0, m_EyeHeight + m_LandDip * 0.08f, 0);

            // roll: slide tilt, strafe lean, parachute bank
            m_TargetRoll = 0f;
            if (State == MoveState.Sliding) m_TargetRoll = slideTilt;
            else if (State == MoveState.Parachute) m_TargetRoll = -GameInput.Move.x * 12f;
            else if (grounded) m_TargetRoll = -GameInput.Move.x * 0.8f;
            m_Roll = Ease.Damp(m_Roll, m_TargetRoll, 9f, dt);

            float mantleDip = State == MoveState.Mantling ? Mathf.Sin(Mathf.Clamp01(m_StateTime / m_MantleDuration) * Mathf.PI) * 4f : 0f;
            if (cameraRig != null)
            {
                cameraRig.localRotation = Quaternion.Euler(m_Pitch - ViewRecoil.x + mantleDip + m_LandDip * 1.5f, ViewRecoil.y, m_Roll);
                cameraRig.localPosition = bob;
            }

            // FOV: sprint kick (+4), tac kick (+8), skydive, ADS blend
            float kick = IsTacSprinting ? 8f : IsSprinting ? 4f : State == MoveState.Sliding ? 5f : State == MoveState.Freefall ? 10f : 0f;
            float target = Mathf.Lerp(baseFov + kick, AdsFov, AdsAmount);
            m_FovCurrent = Mathf.Lerp(m_FovCurrent, target, 1f - Mathf.Exp(-10f * dt));
            if (AdsAmount > 0.01f) m_FovCurrent = Mathf.Lerp(m_FovCurrent, target, AdsAmount);
            if (cam != null) cam.fieldOfView = m_FovCurrent;
        }

        public static System.Action<Vector3, float> FootstepNoise;

        void UpdateAudio(float dt)
        {
            float target = 0f, pitch = 1f;
            if (State == MoveState.Freefall) { target = Mathf.Clamp01(-m_Velocity.y / diveFreefallSpeed) * 0.9f; pitch = 0.8f + target * 0.5f; }
            else if (State == MoveState.Parachute) { target = 0.25f; pitch = 0.6f; }
            else if (State == MoveState.InAircraft) target = 0.15f;
            m_WindSource.volume = Ease.Damp(m_WindSource.volume, target, 4f, dt);
            m_WindSource.pitch = pitch;
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => FootstepNoise = null;
    }
}
