using System;
using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// 100 HP + three 50 HP armour cells, 5 s out-of-combat regen at 40 HP/s, cell inserts (hold G),
    /// downed/last-stand with Stim self-revive (hold F 6 s), low-HP heartbeat and gas-mask ticks.
    /// Shared by the player (isPlayer) and bots.
    /// </summary>
    public class PlayerHealthArmor : MonoBehaviour, IDamageable
    {
        public bool isPlayer;
        public float maxHealth = 100f;
        public float cellCapacity = 50f;
        public int maxCells = 3;
        public float regenDelay = 5f, regenRate = 40f;
        public float lowHealthThreshold = 35f;
        public float downedDuration = 30f;
        public float selfReviveTime = 6f;
        public float plateInsertTime = 1.5f;
        public bool allowDowned = true;
        [Range(0, 150)] public float startArmor = 150f;

        public float Health { get; private set; }
        public float Armor { get; private set; }
        public float MaxArmor => cellCapacity * maxCells;
        public bool IsAlive => !IsDead;
        public bool IsDead { get; private set; }
        public bool IsDowned { get; private set; }
        public float DownedTimeLeft { get; private set; }
        public float SelfReviveProgress { get; private set; }
        public bool IsInsertingPlate { get; private set; }
        public float PlateInsertProgress { get; private set; }
        public bool BlocksMovement => false;
        public float LastDamageTime { get; private set; } = -100f;
        public GameObject LastAttacker { get; private set; }
        public bool PerkBulwark;
        public Transform Root => transform;
        public int CellsFull => Mathf.FloorToInt(Armor / cellCapacity + 0.001f);

        public event Action<PlayerHealthArmor> Downed, Died, Revived;
        public event Action<DamageResult> Damaged;

        AudioSource m_Heartbeat;
        float m_DownedBleed;
        PlayerLoadout m_Loadout;
        float m_CoughCooldown;

        void Awake()
        {
            Health = maxHealth;
            Armor = Mathf.Min(startArmor, MaxArmor);
            m_Loadout = GetComponent<PlayerLoadout>();
            if (isPlayer) m_Heartbeat = AudioFX.CreateLoop(transform, Sfx.Heartbeat, 0f, 0f, 5f);
        }

        void OnEnable() => CombatantRegistry.Register(this);
        void OnDisable() => CombatantRegistry.Unregister(this);

        public void ResetFull(float armor)
        {
            IsDead = false; IsDowned = false;
            Health = maxHealth;
            Armor = Mathf.Clamp(armor, 0f, MaxArmor);
            IsInsertingPlate = false;
            SelfReviveProgress = 0f;
            LastDamageTime = -100f;
        }

        public void SetMaxCells(int cells)
        {
            maxCells = cells;
            Armor = Mathf.Min(Armor, MaxArmor);
        }

        // ================================================================ damage

        public DamageResult TakeDamage(DamageInfo info)
        {
            var r = new DamageResult();
            if (IsDead || info.amount <= 0f) return r;
            r.applied = true;
            r.headshot = info.zone == HitZone.Head;
            LastDamageTime = Time.time;
            if (info.source != null) LastAttacker = info.source;
            if (isPlayer && info.source != null && info.type != DamageType.Blight) GameEvents.RaisePlayerDamagedFrom(info.source.transform.position);

            if (IsDowned)
            {
                m_DownedBleed -= info.amount;
                r.healthDamage = info.amount;
                if (m_DownedBleed <= 0f || !isPlayer)
                {
                    r.killed = true;
                    Die(info.source);
                }
                Damaged?.Invoke(r);
                return r;
            }

            float dmg = info.amount;
            if (!info.bypassArmor && Armor > 0f)
            {
                int cellsBefore = Mathf.CeilToInt(Armor / cellCapacity - 0.001f);
                float absorbed = Mathf.Min(dmg, Armor);
                Armor -= absorbed;
                dmg -= absorbed;
                r.armorDamage = absorbed;
                r.hitArmor = true;
                int cellsAfter = Mathf.CeilToInt(Armor / cellCapacity - 0.001f);
                r.cellBroken = cellsAfter < cellsBefore;
                if (r.cellBroken && isPlayer) AudioFX.Play2D(Sfx.ArmorCrack, 0.5f, 0.8f);
            }
            r.healthDamage = Mathf.Min(dmg, Health);
            Health -= dmg;

            if (Health <= 0f)
            {
                Health = 0f;
                if (allowDowned && !IsDowned)
                {
                    r.downed = true;
                    GoDown(info.source);
                }
                else
                {
                    r.killed = true;
                    Die(info.source);
                }
            }
            Damaged?.Invoke(r);
            return r;
        }

        /// <summary>One gas tick (1 s). Masks absorb ticks; otherwise direct health damage.</summary>
        public void BlightTick(float damage)
        {
            if (IsDead) return;
            if (isPlayer && m_Loadout != null && m_Loadout.gasMaskTicks > 0)
            {
                m_Loadout.gasMaskTicks--;
                if (m_Loadout.gasMaskTicks == 0) GameEvents.RaiseToast("GAS MASK DEPLETED");
                return;
            }
            if (isPlayer && m_CoughCooldown <= 0f)
            {
                AudioFX.Play2D(Sfx.GasCough, 0.7f, UnityEngine.Random.Range(0.9f, 1.1f));
                m_CoughCooldown = 2.5f;
            }
            var info = new DamageInfo { amount = damage, type = DamageType.Blight, bypassArmor = true, zone = HitZone.Generic, point = transform.position };
            TakeDamage(info);
        }

        void GoDown(GameObject attacker)
        {
            IsDowned = true;
            IsInsertingPlate = false;
            DownedTimeLeft = downedDuration;
            m_DownedBleed = 100f;
            SelfReviveProgress = 0f;
            Downed?.Invoke(this);
            GameEvents.RaiseDowned(attacker, this);
            if (isPlayer) { var pc = GetComponent<TacticalPlayerController>(); if (pc != null) pc.SetDowned(true); }
        }

        void Die(GameObject attacker)
        {
            if (IsDead) return;
            IsDead = true;
            IsDowned = false;
            Health = 0f;
            Died?.Invoke(this);
            GameEvents.RaiseKilled(attacker, this);
        }

        public void Revive(float hp)
        {
            if (IsDead) return;
            IsDowned = false;
            Health = hp;
            SelfReviveProgress = 0f;
            LastDamageTime = Time.time;
            if (isPlayer) { var pc = GetComponent<TacticalPlayerController>(); if (pc != null) pc.SetDowned(false); }
            Revived?.Invoke(this);
        }

        public void AddArmor(float amount) => Armor = Mathf.Min(MaxArmor, Armor + amount);

        // ================================================================ update

        void Update()
        {
            float dt = Time.deltaTime;
            if (IsDead) { if (m_Heartbeat != null) m_Heartbeat.volume = 0f; return; }
            if (m_CoughCooldown > 0f) m_CoughCooldown -= dt;

            if (IsDowned)
            {
                DownedTimeLeft -= dt;
                if (isPlayer && m_Loadout != null && m_Loadout.selfRevive && GameInput.Held(GameKey.Interact))
                {
                    SelfReviveProgress += dt / selfReviveTime;
                    if (SelfReviveProgress >= 1f)
                    {
                        m_Loadout.selfRevive = false;
                        Revive(30f);
                        AudioFX.Play2D(Sfx.PlateInsert, 0.7f, 0.8f);
                        GameEvents.RaiseToast("SELF-REVIVED");
                    }
                }
                else SelfReviveProgress = Mathf.Max(0f, SelfReviveProgress - dt * 0.5f);
                if (DownedTimeLeft <= 0f) Die(LastAttacker);
            }
            else
            {
                if (Time.time - LastDamageTime > regenDelay && Health < maxHealth)
                    Health = Mathf.Min(maxHealth, Health + regenRate * dt);
                if (isPlayer) UpdatePlates(dt);
            }

            if (m_Heartbeat != null)
            {
                bool low = Health < lowHealthThreshold || IsDowned;
                m_Heartbeat.volume = Ease.Damp(m_Heartbeat.volume, low ? 0.8f : 0f, 4f, dt);
                m_Heartbeat.pitch = IsDowned ? 0.85f : 1.1f;
            }
        }

        void UpdatePlates(float dt)
        {
            if (m_Loadout == null) return;
            var pc = LocalPlayer.Controller;
            bool canInsert = m_Loadout.armorPlates > 0 && Armor < MaxArmor - 0.01f && (pc == null || !pc.IsAirborneSkydive);
            if (!IsInsertingPlate)
            {
                if (GameInput.Held(GameKey.Plate) && canInsert)
                {
                    IsInsertingPlate = true;
                    PlateInsertProgress = 0f;
                    if (pc != null) pc.CancelSprint();
                    if (LocalPlayer.Weapon != null) LocalPlayer.Weapon.CancelReload();
                    AudioFX.Play2D(Sfx.PlateInsert, 0.8f, PerkBulwark ? 1.3f : 1f);
                }
                return;
            }
            if (pc != null && pc.IsSprinting) { IsInsertingPlate = false; return; }
            PlateInsertProgress += dt / (PerkBulwark ? 0.9f : plateInsertTime);
            if (PlateInsertProgress >= 1f)
            {
                Armor = Mathf.Min(MaxArmor, (Mathf.Floor(Armor / cellCapacity + 0.001f) + 1f) * cellCapacity);
                m_Loadout.armorPlates--;
                IsInsertingPlate = false;
                PlateInsertProgress = 0f;
                // chain while G is held
                if (GameInput.Held(GameKey.Plate) && m_Loadout.armorPlates > 0 && Armor < MaxArmor - 0.01f)
                {
                    IsInsertingPlate = true;
                    AudioFX.Play2D(Sfx.PlateInsert, 0.8f, PerkBulwark ? 1.3f : 1f);
                }
            }
        }
    }
}
