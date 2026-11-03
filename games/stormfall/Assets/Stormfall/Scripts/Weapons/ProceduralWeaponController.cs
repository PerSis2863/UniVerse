using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// First-person weapon rig: 200 ms cubic ease-out ADS onto the sight socket, dual-layer recoil
    /// (camera view-kick + viewmodel gun-kick springs), inertial look sway, figure-8 breathing,
    /// walk bob, sprint/tac-sprint poses, staged cancelable reloads, mounting, hold-breath,
    /// fire modes, muzzle flash, brass ejection and frag throws. Maths: Docs/GUNPLAY_MATH.md.
    /// </summary>
    public class ProceduralWeaponController : MonoBehaviour
    {
        public Transform weaponPivot;
        public Transform armsRoot;
        // Runtime-only: if Unity serialized this array it would fill it with empty instances.
        [System.NonSerialized] public WeaponInstance[] slots = new WeaponInstance[2];
        public int currentSlot;
        public int frags = 1;

        // ---------------------------------------------------------------- public state (HUD)
        public WeaponInstance Current => Valid(slots[currentSlot]);
        public WeaponInstance Other => Valid(slots[1 - currentSlot]);
        static WeaponInstance Valid(WeaponInstance w) => w != null && w.data != null ? w : null;
        public float AdsAmount => Ease.OutCubic(m_AdsT);
        public bool IsAiming => m_AimHeld;
        public bool IsReloading => m_Reloading;
        public float ReloadProgress => m_ReloadProgress;
        public float CurrentSpreadDeg { get; private set; }
        public bool IsScopedView => Current != null && Current.data.style == WeaponStyle.Sniper && AdsAmount > 0.9f;
        public bool HoldingBreath { get; private set; }
        public float BreathFraction => m_Breath / 4f;
        public bool IsMounted => m_Mounted;
        public bool CanMountNow { get; private set; }
        public float MoveSpeedMultiplier => Current != null ? Current.data.moveSpeedMultiplier : 1f;
        public bool PerkQuickhands;
        public string FireModeName => Current == null ? "" : Current.Mode.ToString().ToUpperInvariant();
        public bool Busy => m_SwapTimer > 0f || m_GrenadeTimer > 0f;

        public System.Action WeaponChanged;

        TacticalPlayerController m_Player;
        PlayerHealthArmor m_Health;
        Camera m_Cam;

        float m_AdsT;
        bool m_AimHeld;
        float m_NextFire;
        int m_BurstRemaining;
        float m_SprintOut;
        float m_Bloom;
        int m_Spray;
        float m_LastShot = -10f;
        int m_ShotCounter;
        Vector2 m_Climb;
        float m_PunchP, m_PunchPV, m_PunchY, m_PunchYV;
        Spring3 m_KickPos = new Spring3(26f, 0.55f), m_KickRot = new Spring3(22f, 0.45f);
        float m_SwayX, m_SwayXV, m_SwayY, m_SwayYV;
        float m_SprintW, m_TacW, m_LowerW, m_ReloadW;
        bool m_Reloading;
        float m_ReloadProgress;
        float m_SwapTimer;
        int m_SwapTarget = -1;
        bool m_SwapRaised;
        float m_BoltTimer;
        float m_GrenadeTimer;
        bool m_GrenadeThrown;
        bool m_Mounted;
        Vector3 m_MountPos;
        float m_Breath = 4f, m_Winded;
        float m_FlashTimer;
        float m_RecoilSeed;

        // view objects
        GameObject m_Model;
        WeaponModel m_ModelData;
        Transform m_Mag, m_Bolt, m_Muzzle;
        Vector3 m_MagHome, m_BoltHome;
        Light m_FlashLight;
        Transform m_ArmL, m_ArmR, m_HandL, m_HandR, m_PlateHand;
        GameObject m_DropMagTemplate;

        static readonly Dictionary<int, WeaponModel> s_ModelCache = new Dictionary<int, WeaponModel>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_ModelCache.Clear();

        public static WeaponModel GetModel(WeaponStyle style, AttachmentFlags att)
        {
            // optic flag doesn't change geometry; keep the cache small
            int key = (int)style * 64 + (int)(att & ~AttachmentFlags.Optic);
            if (!s_ModelCache.TryGetValue(key, out var m) || m.body == null)
            {
                m = ProceduralMeshBuilder.BuildWeapon(style, att);
                s_ModelCache[key] = m;
            }
            return m;
        }

        void Awake()
        {
            m_Player = GetComponent<TacticalPlayerController>();
            m_Health = GetComponent<PlayerHealthArmor>();
            m_Cam = m_Player != null ? m_Player.cam : GetComponentInChildren<Camera>();
            m_RecoilSeed = Random.value * 10f;
            BuildArms();
        }

        void Start()
        {
            if (Current == null)
            {
                slots[0] = slots[1] = null;
                var assets = StormfallAssets.Instance;
                var defaults = assets != null && assets.weapons != null && assets.weapons.Length > 0 ? assets.weapons : WeaponData.CreateDefaults();
                slots[0] = new WeaponInstance(defaults[0], Rarity.Common, AttachmentFlags.None);
                if (defaults.Length > 1) slots[1] = new WeaponInstance(defaults[1], Rarity.Common, AttachmentFlags.None);
            }
            Equip(currentSlot);
        }

        // ================================================================ inventory

        public void GiveWeapon(WeaponInstance w)
        {
            int slot = slots[0] == null ? 0 : slots[1] == null ? 1 : currentSlot;
            var old = slots[slot];
            if (old != null && old != w)
                LootPickup.SpawnWeapon(old, transform.position + transform.forward * 1.2f + Vector3.up * 0.5f);
            CancelReload();
            slots[slot] = w;
            currentSlot = slot;
            Equip(slot);
        }

        public void SetLoadout(WeaponInstance a, WeaponInstance b)
        {
            CancelReload();
            slots[0] = a; slots[1] = b; currentSlot = 0;
            Equip(0);
        }

        public void AddAmmo(float magazines)
        {
            foreach (var w in slots)
                if (w != null) w.reserve = Mathf.Min(w.data.reserveMax, w.reserve + Mathf.CeilToInt(w.MagSize * magazines));
            WeaponChanged?.Invoke();
        }

        void Equip(int slot)
        {
            currentSlot = slot;
            if (m_Model != null) Destroy(m_Model);
            m_Model = null;
            var w = Current;
            if (w == null) { WeaponChanged?.Invoke(); return; }
            m_ModelData = GetModel(w.data.style, w.attachments);
            m_Model = new GameObject(w.data.displayName);
            m_Model.transform.SetParent(weaponPivot, false);
            AddRenderer(m_Model, m_ModelData.body);
            m_Mag = new GameObject("Mag").transform;
            m_Mag.SetParent(m_Model.transform, false);
            m_Mag.localPosition = m_MagHome = m_ModelData.magPos;
            AddRenderer(m_Mag.gameObject, m_ModelData.mag);
            if (m_ModelData.bolt != null)
            {
                m_Bolt = new GameObject("Bolt").transform;
                m_Bolt.SetParent(m_Model.transform, false);
                m_Bolt.localPosition = m_BoltHome = m_ModelData.boltPos;
                AddRenderer(m_Bolt.gameObject, m_ModelData.bolt);
            }
            else m_Bolt = null;
            m_Muzzle = new GameObject("Muzzle").transform;
            m_Muzzle.SetParent(m_Model.transform, false);
            m_Muzzle.localPosition = m_ModelData.muzzle;
            m_FlashLight = m_Muzzle.gameObject.AddComponent<Light>();
            m_FlashLight.type = LightType.Point;
            m_FlashLight.color = new Color(1f, 0.72f, 0.4f);
            m_FlashLight.range = 6f;
            m_FlashLight.intensity = 0f;
            m_FlashLight.shadows = LightShadows.None;

            if (m_DropMagTemplate != null) Destroy(m_DropMagTemplate);
            m_DropMagTemplate = new GameObject("DroppedMag");
            m_DropMagTemplate.SetActive(false);
            m_DropMagTemplate.transform.SetParent(transform, false);
            AddRenderer(m_DropMagTemplate, m_ModelData.mag, false);

            m_Bloom = 0f;
            m_BoltTimer = 0f;
            WeaponChanged?.Invoke();
        }

        static void AddRenderer(GameObject go, Mesh mesh, bool viewmodel = true)
        {
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            var mats = new Material[mesh.subMeshCount];
            for (int i = 0; i < mats.Length; i++) mats[i] = MaterialLibrary.Get(WeaponModel.BodyMaterials[Mathf.Min(i, WeaponModel.BodyMaterials.Length - 1)]);
            mr.sharedMaterials = mats;
            if (viewmodel)
            {
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                mr.receiveShadows = false;
            }
        }

        void BuildArms()
        {
            if (armsRoot == null) armsRoot = weaponPivot != null ? weaponPivot.parent : transform;
            var sleeve = new MeshBuilder(1);
            sleeve.Cylinder(Vector3.zero, Vector3.forward, 0.052f, 0.04f, 12, false, true);
            var sleeveMesh = sleeve.ToMesh("Sleeve");
            var glove = new MeshBuilder(1);
            glove.RoundedBox(new Vector3(0, 0, 0.03f), new Vector3(0.075f, 0.05f, 0.11f), 0.022f, 2);
            glove.RoundedBox(new Vector3(0.03f, 0.0f, 0.04f), Quaternion.Euler(0, -30, 0), new Vector3(0.024f, 0.024f, 0.06f), 0.01f, 1);
            var gloveMesh = glove.ToMesh("Glove");
            m_ArmL = MakePart("ArmL", sleeveMesh, Mat.BotCamo);
            m_ArmR = MakePart("ArmR", sleeveMesh, Mat.BotCamo);
            m_HandL = MakePart("HandL", gloveMesh, Mat.BotGear);
            m_HandR = MakePart("HandR", gloveMesh, Mat.BotGear);
            m_PlateHand = MakePart("PlateInHand", ProceduralMeshBuilder.ArmorCellMesh(), Mat.ArmorCell);
            m_PlateHand.gameObject.SetActive(false);
        }

        Transform MakePart(string name, Mesh mesh, Mat mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(armsRoot, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            mr.sharedMaterial = MaterialLibrary.Get(mat);
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            mr.receiveShadows = false;
            return go.transform;
        }

        // ================================================================ update

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f || m_Player == null) return;
            var state = m_Player.State;
            bool skydiving = m_Player.IsAirborneSkydive;
            bool downed = m_Health != null && m_Health.IsDowned;
            bool plating = m_Health != null && m_Health.IsInsertingPlate;
            bool designating = LocalPlayer.Killstreaks != null && LocalPlayer.Killstreaks.IsDesignating;
            bool hidden = skydiving || downed || Current == null;
            if (m_Model != null) m_Model.SetActive(!hidden && !designating);
            SetArmsVisible(!hidden && !designating);

            bool blocked = hidden || plating || designating || m_Player.MenuOpen || state == MoveState.Mantling || state == MoveState.Frozen || Busy;

            if (!hidden && !m_Player.MenuOpen) HandleInventoryInput();
            UpdateSwap(dt);
            UpdateGrenade(dt);

            // ---- ADS ----
            if (GameInput.Pressed(GameKey.Aim) && m_Player.IsSprinting) m_Player.CancelSprint();
            m_AimHeld = !blocked && GameInput.Held(GameKey.Aim) && !m_Player.IsSprinting && state != MoveState.Sliding && state != MoveState.Diving;
            float adsTime = Current != null ? Current.AdsTime : 0.2f;
            m_AdsT = Mathf.Clamp01(m_AdsT + (m_AimHeld ? dt / adsTime : -dt / (adsTime * 0.8f)));

            // ---- mounting ----
            UpdateMount(dt, blocked);

            // ---- breath (scoped) ----
            HoldingBreath = false;
            if (m_Winded > 0f) m_Winded -= dt;
            else if (IsScopedView && GameInput.Held(GameKey.Sprint) && m_Breath > 0f)
            {
                HoldingBreath = true;
                m_Breath -= dt;
                if (m_Breath <= 0f) { m_Breath = 0f; m_Winded = 2f; }
            }
            else m_Breath = Mathf.Min(4f, m_Breath + dt);

            // ---- fire / reload ----
            if (m_SprintOut > 0f) m_SprintOut -= dt;
            if (m_BoltTimer > 0f) UpdateBolt(dt);
            if (!blocked) HandleFire();
            if (m_Reloading) UpdateReload(dt);
            if (m_Reloading && (m_Player.IsSprinting || plating || hidden)) CancelReload();

            // ---- recoil springs → camera ----
            m_Bloom *= Mathf.Exp(-(Current != null ? Current.data.bloomRecovery : 5f) * dt);
            float since = Time.time - m_LastShot;
            if (since > 0.08f && m_Climb.sqrMagnitude > 1e-6f)
            {
                float rate = (Current != null ? Current.data.recoilRecoverRate : 8f) * (1f - Mathf.Exp(-8f * (since - 0.08f)));
                float mag = m_Climb.magnitude;
                m_Climb = m_Climb / mag * Mathf.Max(0f, mag - rate * dt);
            }
            SpringMath.Critical(ref m_PunchP, ref m_PunchPV, 18f, dt);
            SpringMath.Critical(ref m_PunchY, ref m_PunchYV, 18f, dt);
            Vector2 scopeSway = Vector2.zero;
            if (IsScopedView)
            {
                float amp = 0.6f * (HoldingBreath ? 0.1f : m_Winded > 0f ? 1.6f : 1f) * (m_Mounted ? 0.2f : 1f);
                float w = Mathf.PI * 2f * 0.33f * Time.time;
                scopeSway = new Vector2(Mathf.Sin(2f * w) * 0.5f, Mathf.Sin(w)) * amp;
            }
            Vector3 shake = CameraShake.Sample(dt);
            m_Player.ViewRecoil = new Vector2(m_Climb.x + m_PunchP + scopeSway.x + shake.x, m_Climb.y + m_PunchY + scopeSway.y + shake.y);
            m_Player.AdsAmount = AdsAmount;
            m_Player.AdsFov = Current != null ? Current.data.adsFov : 60f;
            if (designating) { m_Player.AdsAmount = 1f; m_Player.AdsFov = 30f; }
            m_Player.AdsSensitivity = Mathf.Tan(m_Player.AdsFov * 0.5f * Mathf.Deg2Rad) / Mathf.Tan(m_Player.baseFov * 0.5f * Mathf.Deg2Rad);

            CurrentSpreadDeg = ComputeSpread();
            UpdateViewmodel(dt, plating);
        }

        void HandleInventoryInput()
        {
            if (Busy) return;
            if (GameInput.Pressed(GameKey.Weapon1) && currentSlot != 0 && slots[0] != null) StartSwap(0);
            else if (GameInput.Pressed(GameKey.Weapon2) && currentSlot != 1 && slots[1] != null) StartSwap(1);
            else if (Mathf.Abs(GameInput.Scroll) > 0.1f && slots[1 - currentSlot] != null) StartSwap(1 - currentSlot);
            if (GameInput.Pressed(GameKey.FireMode) && Current != null && Current.data.fireModes.Length > 1)
            {
                Current.fireModeIndex = (Current.fireModeIndex + 1) % Current.data.fireModes.Length;
                AudioFX.Play2D(Sfx.UiClick, 0.6f);
                WeaponChanged?.Invoke();
            }
            if (GameInput.Pressed(GameKey.Reload)) StartReload();
            if (GameInput.Pressed(GameKey.Grenade) && frags > 0 && m_GrenadeTimer <= 0f && !m_Player.IsAirborneSkydive)
            {
                CancelReload();
                m_GrenadeTimer = 0.55f;
                m_GrenadeThrown = false;
                AudioFX.Play2D(Sfx.GrenadePin, 0.7f);
            }
        }

        // ================================================================ firing

        void HandleFire()
        {
            var w = Current;
            if (w == null) return;
            bool pressed = GameInput.Pressed(GameKey.Fire), held = GameInput.Held(GameKey.Fire);
            if ((pressed || held) && m_Player.IsSprinting)
            {
                m_Player.CancelSprint();
                m_SprintOut = w.data.sprintToFire;
            }
            if (m_SprintOut > 0f || m_BoltTimer > 0f) return;

            if (m_Reloading)
            {
                if (pressed && w.mag > 0) CancelReload();
                else return;
            }

            var mode = w.Mode;
            bool want = mode == FireMode.Auto ? held : mode == FireMode.Burst ? (pressed || m_BurstRemaining > 0) : pressed;
            if (!want || Time.time < m_NextFire) return;

            if (w.mag <= 0)
            {
                if (pressed) AudioFX.Play2D(Sfx.DryFire, 0.8f);
                m_BurstRemaining = 0;
                if (w.reserve > 0) StartReload();
                return;
            }

            if (mode == FireMode.Burst && m_BurstRemaining <= 0) m_BurstRemaining = w.data.burstCount;
            FireOne(w);
            if (mode == FireMode.Burst)
            {
                m_BurstRemaining--;
                m_NextFire = Time.time + (m_BurstRemaining > 0 ? 60f / w.data.burstRpm : 0.22f);
            }
            else m_NextFire = Time.time + w.data.SecondsPerShot;
            if (mode == FireMode.Bolt) m_BoltTimer = w.data.boltCycleTime;
        }

        void FireOne(WeaponInstance w)
        {
            w.mag--;
            m_ShotCounter++;
            var camT = m_Cam.transform;
            float spread = ComputeSpread();
            Vector3 dir = SampleCone(camT.forward, camT.right, camT.up, spread);
            bool tracer = m_ShotCounter % Mathf.Max(1, w.data.tracerEvery) == 0;
            Vector3 muzzle = m_Muzzle != null ? m_Muzzle.position : camT.position;
            Ballistics.Fire(gameObject, w, camT.position, dir, muzzle, tracer);
            m_Bloom = Mathf.Min(m_Bloom + w.data.bloomPerShot, w.data.bloomMax);

            // --- camera view-kick (climb + punch) ---
            if (Time.time - m_LastShot > 0.25f) m_Spray = 0; else m_Spray++;
            m_LastShot = Time.time;
            float stance = m_Player.IsProne ? 0.7f : m_Player.IsCrouched ? 0.85f : 1f;
            float M = (m_Mounted ? 0.3f : 1f) * w.RecoilMul * stance * (m_AimHeld ? 1f : 1.15f);
            float kickPitch = w.data.recoilVertical * (1f + 0.35f * (1f - Mathf.Exp(-m_Spray / 6f))) * M;
            float kickYaw = w.data.recoilHorizontal * (0.6f * Mathf.Sin(m_Spray * 0.7f + m_RecoilSeed) + 0.4f * Random.Range(-1f, 1f)) * M;
            m_Climb += new Vector2(kickPitch, kickYaw);
            m_PunchPV += SpringMath.ImpulseForPeak(0.6f * kickPitch, 18f);
            m_PunchYV += SpringMath.ImpulseForPeak(0.3f * kickYaw, 18f);

            // --- viewmodel gun-kick ---
            float vm = (m_Mounted ? 0.4f : 1f) * w.RecoilMul;
            m_KickPos.AddImpulse(new Vector3(Random.Range(-0.1f, 0.1f) * w.data.gunKickBack, w.data.gunKickBack * 0.15f, -w.data.gunKickBack) * 26f * 1.6f * vm);
            m_KickRot.AddImpulse(new Vector3(-w.data.gunKickRise, w.data.gunKickRoll * 0.35f * Random.Range(-1f, 1f), w.data.gunKickRoll * Random.Range(-1f, 1f)) * 22f * 1.6f * vm);

            // --- presentation ---
            if (!w.Suppressed)
            {
                WeaponFX.MuzzleFlash(muzzle, camT.forward, w.data.flashScale);
                m_FlashTimer = 0.05f;
            }
            else WeaponFX.Steam(muzzle, camT.forward * 0.4f, 0.06f, new Color(0.8f, 0.8f, 0.8f, 0.15f));
            if (w.data.fireModes[0] != FireMode.Bolt) EjectBrass();
            AudioFX.Play2D(w.Suppressed ? Sfx.SuppressedShot : w.data.shotSound, w.Suppressed ? 0.6f : 0.85f, Random.Range(0.96f, 1.04f));
            if (!w.Suppressed) AudioFX.Play2D(Sfx.BassPunch, w.data.style == WeaponStyle.Sniper ? 0.8f : 0.35f, Random.Range(0.95f, 1.05f));
            CameraShake.Add(w.data.style == WeaponStyle.Sniper ? 0.25f : 0.03f);
            GameEvents.RaiseShot(gameObject, muzzle, w.Suppressed);
            if (w.mag == 0 && w.reserve > 0 && w.data.fireModes[0] != FireMode.Bolt) m_NextFire = Time.time + 0.15f;
            WeaponChanged?.Invoke();
        }

        void EjectBrass()
        {
            if (m_Model == null || m_ModelData == null) return;
            var t = m_Model.transform;
            Vector3 pos = t.TransformPoint(m_ModelData.ejectPort);
            Vector3 vel = t.right * Random.Range(2.5f, 3.5f) + t.up * Random.Range(1.5f, 2.5f) - t.forward * 0.5f + m_Player.Velocity;
            WeaponFX.EjectBrass(pos, t.rotation * Quaternion.Euler(0, 90, 0), vel);
        }

        void UpdateBolt(float dt)
        {
            float before = m_BoltTimer;
            m_BoltTimer -= dt;
            var w = Current;
            float total = w != null ? w.data.boltCycleTime : 1f;
            float phaseBefore = 1f - before / total, phase = 1f - m_BoltTimer / total;
            if (phaseBefore < 0.35f && phase >= 0.35f)
            {
                AudioFX.Play2D(Sfx.BoltRack, 0.8f);
                EjectBrass();
            }
            if (m_Bolt != null)
            {
                float pull = Mathf.Sin(Mathf.Clamp01((phase - 0.2f) / 0.5f) * Mathf.PI);
                m_Bolt.localPosition = m_BoltHome + new Vector3(0, 0, -0.07f * pull);
                m_Bolt.localRotation = Quaternion.Euler(0, 0, 60f * Mathf.Clamp01(pull * 2f));
            }
            if (m_BoltTimer <= 0f) m_BoltTimer = 0f;
        }

        float ComputeSpread()
        {
            var w = Current;
            if (w == null) return 0f;
            var d = w.data;
            Vector3 v = m_Player.Velocity;
            float speed01 = Mathf.Clamp01(new Vector2(v.x, v.z).magnitude / 8.25f);
            bool air = m_Player.State == MoveState.Airborne || m_Player.State == MoveState.Diving;
            float stance = m_Player.IsProne ? 0.6f : m_Player.IsCrouched ? 0.8f : 1f;
            float hip = (d.hipSpread + d.moveSpread * speed01 + (air ? d.airSpread : 0f) + m_Bloom) * stance * w.SpreadMul;
            float ads = d.adsSpread + 0.15f * m_Bloom;
            return Mathf.Lerp(hip, ads, AdsAmount);
        }

        static Vector3 SampleCone(Vector3 fwd, Vector3 right, Vector3 up, float halfAngleDeg)
        {
            float r = Mathf.Tan(halfAngleDeg * Mathf.Deg2Rad) * Mathf.Sqrt(Random.value);
            float th = Random.value * Mathf.PI * 2f;
            return (fwd + right * (r * Mathf.Cos(th)) + up * (r * Mathf.Sin(th))).normalized;
        }

        // ================================================================ reload

        public void StartReload()
        {
            var w = Current;
            if (w == null || m_Reloading || w.reserve <= 0 || Busy) return;
            if (w.reloadCheckpoint <= 0f && w.mag >= w.MagSize) return;
            if (w.reloadCheckpoint <= 0f) w.reloadTactical = w.mag > 0;
            if (m_Player.IsSprinting) m_Player.CancelSprint();
            m_Reloading = true;
            m_ReloadProgress = w.reloadCheckpoint;
            m_BurstRemaining = 0;
        }

        void UpdateReload(float dt)
        {
            var w = Current;
            float speed = PerkQuickhands ? 1.35f : 1f;
            float before = m_ReloadProgress;
            m_ReloadProgress += dt / (w.data.reloadTime / speed);
            if (before < 0.3f && m_ReloadProgress >= 0.3f) MagOut(w);
            if (before < 0.7f && m_ReloadProgress >= 0.7f)
            {
                MagIn(w);
                if (w.reloadTactical) { FinishReload(w); return; }
            }
            if (m_ReloadProgress >= 1f)
            {
                AudioFX.Play2D(Sfx.BoltRack, 0.8f);
                FinishReload(w);
            }
        }

        void MagOut(WeaponInstance w)
        {
            w.chambered = w.reloadTactical && w.mag > 0 ? 1 : 0;
            w.reserve += Mathf.Max(0, w.mag - w.chambered);
            w.mag = w.chambered;
            w.reloadCheckpoint = 0.3f;
            AudioFX.Play2D(Sfx.MagOut, 0.8f);
            if (m_Mag != null && m_DropMagTemplate != null)
                WeaponFX.DropObject(m_DropMagTemplate, m_Mag.position, m_Mag.rotation, m_Player.Velocity + Vector3.down * 1.5f - m_Mag.right * 0.5f, 5f);
            WeaponChanged?.Invoke();
        }

        void MagIn(WeaponInstance w)
        {
            int capacity = w.MagSize + w.chambered;
            int take = Mathf.Min(capacity - w.mag, w.reserve);
            w.mag += take;
            w.reserve -= take;
            w.reloadCheckpoint = 0.7f;
            AudioFX.Play2D(Sfx.MagIn, 0.8f);
            WeaponChanged?.Invoke();
        }

        void FinishReload(WeaponInstance w)
        {
            m_Reloading = false;
            w.reloadCheckpoint = 0f;
            w.chambered = 0;
            m_ReloadProgress = 0f;
            WeaponChanged?.Invoke();
        }

        /// <summary>Cancels and rewinds to the last checkpoint passed (0, 0.3 or 0.7).</summary>
        public void CancelReload()
        {
            if (!m_Reloading) return;
            m_Reloading = false;
            var w = Current;
            if (w != null) w.reloadCheckpoint = m_ReloadProgress >= 0.7f ? 0.7f : m_ReloadProgress >= 0.3f ? 0.3f : 0f;
        }

        // ================================================================ swap / grenade / mount

        void StartSwap(int target)
        {
            CancelReload();
            m_SwapTarget = target;
            m_SwapTimer = 0.5f / (PerkQuickhands ? 1.35f : 1f);
            m_SwapRaised = false;
            m_BurstRemaining = 0;
            m_Mounted = false;
            AudioFX.Play2D(Sfx.WeaponSwap, 0.6f);
        }

        void UpdateSwap(float dt)
        {
            if (m_SwapTimer <= 0f) return;
            float total = 0.5f / (PerkQuickhands ? 1.35f : 1f);
            m_SwapTimer -= dt;
            if (!m_SwapRaised && m_SwapTimer <= total * 0.5f && m_SwapTarget >= 0)
            {
                m_SwapRaised = true;
                Equip(m_SwapTarget);
                m_SwapTarget = -1;
            }
            if (m_SwapTimer < 0f) m_SwapTimer = 0f;
        }

        void UpdateGrenade(float dt)
        {
            if (m_GrenadeTimer <= 0f) return;
            m_GrenadeTimer -= dt;
            if (!m_GrenadeThrown && m_GrenadeTimer <= 0.25f)
            {
                m_GrenadeThrown = true;
                frags--;
                var camT = m_Cam.transform;
                Vector3 pos = camT.position + camT.forward * 0.5f + camT.right * 0.15f;
                Vector3 vel = camT.forward * 17f + Vector3.up * 3f + m_Player.Velocity * 0.6f;
                FragGrenade.Throw(gameObject, pos, vel, 3.5f);
                WeaponChanged?.Invoke();
            }
        }

        void UpdateMount(float dt, bool blocked)
        {
            CanMountNow = false;
            if (blocked || !m_Player.IsGrounded || m_Player.IsSprinting || m_Player.IsSliding) { m_Mounted = false; return; }
            var camT = m_Cam.transform;
            Vector3 fwd = Vector3.ProjectOnPlane(camT.forward, Vector3.up).normalized;
            Vector3 eye = camT.position;
            bool wall = Physics.Raycast(eye - Vector3.up * 0.25f, fwd, 0.8f, ~0, QueryTriggerInteraction.Ignore);
            bool ledge = Physics.Raycast(eye + fwd * 0.6f, Vector3.down, out var down, 0.65f, ~0, QueryTriggerInteraction.Ignore) && down.distance > 0.25f;
            CanMountNow = wall || ledge;
            if (m_Mounted)
            {
                if (GameInput.Move.magnitude > 0.2f || Vector3.Distance(transform.position, m_MountPos) > 0.2f || !CanMountNow || GameInput.Pressed(GameKey.Mount))
                    m_Mounted = false;
            }
            else if (GameInput.Pressed(GameKey.Mount) && CanMountNow)
            {
                m_Mounted = true;
                m_MountPos = transform.position;
                AudioFX.Play2D(Sfx.Mantle, 0.25f, 1.6f);
            }
        }

        // ================================================================ viewmodel pose

        void UpdateViewmodel(float dt, bool plating)
        {
            if (weaponPivot == null || m_ModelData == null) return;
            var w = Current;
            float e = AdsAmount;
            Vector3 hip = w != null ? w.data.hipOffset : new Vector3(0.13f, -0.12f, 0.22f);
            Vector3 ads = new Vector3(0, 0, m_ModelData.eyeDistance) - m_ModelData.sightPoint;
            Vector3 pos = Vector3.Lerp(hip, ads, e);
            Vector3 rot = Vector3.zero;

            // sprint & tactical sprint poses
            m_SprintW = Ease.Damp(m_SprintW, m_Player.IsSprinting && !m_Player.IsTacSprinting ? 1f : 0f, 10f, dt);
            m_TacW = Ease.Damp(m_TacW, m_Player.IsTacSprinting ? 1f : 0f, 9f, dt);
            pos += new Vector3(-0.05f, -0.03f, -0.04f) * m_SprintW;
            rot += new Vector3(14f, -32f, 10f) * m_SprintW;
            pos += new Vector3(-0.08f, 0.07f, -0.1f) * m_TacW;
            rot += new Vector3(-48f, 12f, 18f) * m_TacW;

            // lowered: swap, plate insert, grenade
            float swapLower = 0f;
            if (m_SwapTimer > 0f)
            {
                float total = 0.5f / (PerkQuickhands ? 1.35f : 1f);
                swapLower = Mathf.Sin(Mathf.Clamp01(1f - m_SwapTimer / total) * Mathf.PI);
            }
            float lowerTarget = Mathf.Max(swapLower, plating ? 0.55f : 0f, m_GrenadeTimer > 0f ? 0.7f : 0f);
            m_LowerW = Ease.Damp(m_LowerW, lowerTarget, 14f, dt);
            pos += new Vector3(0.02f, -0.22f, -0.05f) * m_LowerW;
            rot += new Vector3(35f, 0, -10f) * m_LowerW;

            // reload choreography: roll the gun to show the mag well
            m_ReloadW = Ease.Damp(m_ReloadW, m_Reloading ? 1f : 0f, 10f, dt);
            if (m_ReloadW > 0.01f)
            {
                float p = m_ReloadProgress;
                rot += new Vector3(-6f, 8f, 28f) * m_ReloadW;
                pos += new Vector3(-0.02f, -0.02f, -0.02f) * m_ReloadW;
                if (m_Mag != null)
                {
                    float outT = Mathf.Clamp01((p - 0.12f) / 0.18f), inT = Mathf.Clamp01((p - 0.45f) / 0.25f);
                    float drop = p < 0.3f ? outT * 0.12f : p < 0.45f ? 0.3f : (1f - inT) * 0.12f;
                    m_Mag.localPosition = m_MagHome + new Vector3(0, -drop, -drop * 0.15f);
                    m_Mag.gameObject.SetActive(p < 0.3f || p >= 0.45f);
                }
                if (p > 0.85f && !Current.reloadTactical) pos += new Vector3(0, 0, -0.015f) * Mathf.Sin((p - 0.85f) / 0.15f * Mathf.PI);
            }
            else if (m_Mag != null) { m_Mag.localPosition = m_MagHome; m_Mag.gameObject.SetActive(true); }

            // inertial look sway (critically damped toward the opposite of mouse motion)
            Vector2 look = m_Player.LookDelta;
            float swayAmt = (1f - 0.7f * e) * (m_Mounted ? 0.2f : 1f);
            float tx = Mathf.Clamp(-look.y * 0.45f, -6f, 6f) * swayAmt, ty = Mathf.Clamp(-look.x * 0.45f, -6f, 6f) * swayAmt;
            float sx = m_SwayX - tx, sy = m_SwayY - ty;
            SpringMath.Critical(ref sx, ref m_SwayXV, 14f, dt);
            SpringMath.Critical(ref sy, ref m_SwayYV, 14f, dt);
            m_SwayX = sx + tx; m_SwayY = sy + ty;
            rot += new Vector3(m_SwayX, m_SwayY, m_SwayY * 0.6f);
            pos += new Vector3(-m_SwayY * 0.002f, m_SwayX * 0.002f, 0);

            // figure-8 breathing
            float breathAmp = (IsScopedView ? 0f : Mathf.Lerp(0.35f, 0.12f, e)) * (m_Mounted ? 0.2f : 1f);
            float wB = Mathf.PI * 2f * 0.33f * Time.time;
            rot += new Vector3(Mathf.Sin(2f * wB) * 0.5f, Mathf.Sin(wB), 0) * breathAmp;

            // walk bob (synchronised with the camera's step phase)
            float bobW = m_Player.BobWeight * (1f - 0.85f * e);
            float ph = m_Player.BobPhase;
            float bobMul = m_Player.IsTacSprinting ? 2.2f : m_Player.IsSprinting ? 1.6f : 1f;
            pos += new Vector3(Mathf.Sin(ph) * 0.012f, -Mathf.Abs(Mathf.Sin(ph)) * 0.012f, 0) * bobW * bobMul;
            rot += new Vector3(Mathf.Abs(Mathf.Sin(ph)) * 1.2f, Mathf.Sin(ph) * 1.0f, Mathf.Sin(ph) * 1.4f) * bobW * bobMul;

            // landing / slide tilt
            if (m_Player.IsSliding) rot += new Vector3(0, 0, -12f);
            if (m_Mounted) pos += new Vector3(0, -0.008f, 0.01f);

            // gun-kick springs
            m_KickPos.Step(dt);
            m_KickRot.Step(dt);
            pos += m_KickPos.x;
            rot += m_KickRot.x;

            weaponPivot.localPosition = pos;
            weaponPivot.localRotation = Quaternion.Euler(rot);

            // flash light pulse
            if (m_FlashLight != null)
            {
                m_FlashTimer -= dt;
                m_FlashLight.intensity = m_FlashTimer > 0f ? 4f * (m_FlashTimer / 0.05f) : 0f;
            }

            UpdateArms(plating);
        }

        void SetArmsVisible(bool v)
        {
            if (m_ArmL == null) return;
            bool plating = m_Health != null && m_Health.IsInsertingPlate;
            m_ArmR.gameObject.SetActive(v);
            m_HandR.gameObject.SetActive(v);
            m_ArmL.gameObject.SetActive(v || plating);
            m_HandL.gameObject.SetActive(v || plating);
        }

        void UpdateArms(bool plating)
        {
            if (m_Model == null || m_ArmL == null) return;
            var mt = m_Model.transform;
            Vector3 rightHand = mt.TransformPoint(new Vector3(0, -0.07f, -0.06f));
            Vector3 leftHand = mt.TransformPoint(m_ModelData.leftHand + new Vector3(-0.005f, -0.025f, 0));

            if (plating)
            {
                float p = m_Health.PlateInsertProgress;
                Vector3 a = armsRoot.TransformPoint(new Vector3(-0.2f, -0.5f, 0.3f));
                Vector3 b = armsRoot.TransformPoint(new Vector3(-0.04f, -0.2f, 0.3f));
                Vector3 c = armsRoot.TransformPoint(new Vector3(-0.02f, -0.4f, 0.18f));
                leftHand = p < 0.6f ? Vector3.Lerp(a, b, Ease.OutCubic(p / 0.6f)) : Vector3.Lerp(b, c, Ease.InOutSine((p - 0.6f) / 0.4f));
                m_PlateHand.gameObject.SetActive(true);
                m_PlateHand.position = leftHand + armsRoot.up * 0.08f + armsRoot.forward * 0.02f;
                m_PlateHand.rotation = armsRoot.rotation * Quaternion.Euler(-15f, 10f, -8f);
            }
            else m_PlateHand.gameObject.SetActive(false);

            PlaceArm(m_ArmR, m_HandR, armsRoot.TransformPoint(new Vector3(0.24f, -0.42f, -0.12f)), rightHand);
            PlaceArm(m_ArmL, m_HandL, armsRoot.TransformPoint(new Vector3(-0.22f, -0.42f, -0.08f)), leftHand);
        }

        static void PlaceArm(Transform arm, Transform hand, Vector3 shoulder, Vector3 handPos)
        {
            Vector3 d = handPos - shoulder;
            float len = d.magnitude;
            if (len < 1e-4f) return;
            arm.position = shoulder;
            arm.rotation = Quaternion.LookRotation(d / len, Vector3.up);
            arm.localScale = new Vector3(1f, 1f, len - 0.04f);
            hand.position = handPos - d / len * 0.05f;
            hand.rotation = arm.rotation;
        }
    }
}
