using UnityEngine;

namespace Stormfall
{
    public enum FireMode { Auto, Burst, Semi, Bolt }

    public enum Rarity { Common, Uncommon, Rare, Epic, Legendary }

    public static class RarityUtil
    {
        public static Color Color(Rarity r)
        {
            switch (r)
            {
                case Rarity.Uncommon: return new Color(0.35f, 0.85f, 0.35f);
                case Rarity.Rare: return new Color(0.25f, 0.6f, 1f);
                case Rarity.Epic: return new Color(0.7f, 0.35f, 1f);
                case Rarity.Legendary: return new Color(1f, 0.75f, 0.15f);
                default: return new Color(0.7f, 0.7f, 0.7f);
            }
        }

        public static int AttachmentCount(Rarity r) => r switch
        {
            Rarity.Uncommon => 1,
            Rarity.Rare => 2,
            Rarity.Epic => 3,
            Rarity.Legendary => 5,
            _ => 0
        };

        public static AttachmentFlags RollAttachments(Rarity r, System.Random rnd)
        {
            AttachmentFlags[] pool = { AttachmentFlags.Suppressor, AttachmentFlags.LongBarrel, AttachmentFlags.Optic, AttachmentFlags.Grip, AttachmentFlags.ExtMag };
            int n = AttachmentCount(r);
            AttachmentFlags f = AttachmentFlags.None;
            var list = new System.Collections.Generic.List<AttachmentFlags>(pool);
            for (int i = 0; i < n && list.Count > 0; i++)
            {
                int k = rnd.Next(list.Count);
                f |= list[k];
                list.RemoveAt(k);
            }
            return f;
        }

        public static Rarity Roll(System.Random rnd, float luck = 0f)
        {
            float v = (float)rnd.NextDouble() + luck;
            if (v > 0.97f) return Rarity.Legendary;
            if (v > 0.88f) return Rarity.Epic;
            if (v > 0.68f) return Rarity.Rare;
            if (v > 0.38f) return Rarity.Uncommon;
            return Rarity.Common;
        }
    }

    /// <summary>Tunable weapon definition. See Docs/GUNPLAY_MATH.md for every field's role.</summary>
    [CreateAssetMenu(menuName = "Stormfall/Weapon", fileName = "Weapon")]
    public class WeaponData : ScriptableObject
    {
        [Header("Identity")]
        public string id = "mcr4";
        public string displayName = "MCR-4 Carbine";
        public string className = "ASSAULT RIFLE";
        public WeaponStyle style = WeaponStyle.Carbine;
        public FireMode[] fireModes = { FireMode.Auto, FireMode.Burst, FireMode.Semi };

        [Header("Damage")]
        public float damage = 28f;
        public float headMultiplier = 1.6f;
        public float range1 = 35f, range2 = 65f, minDamageFraction = 0.75f;
        public float muzzleVelocity = 780f;

        [Header("Rate & Ammo")]
        public float rpm = 720f;
        public int burstCount = 3;
        public float burstRpm = 900f;
        public float boltCycleTime = 0.9f;
        public int magSize = 30;
        public int reserveMax = 150;
        public float reloadTime = 2.2f;

        [Header("Handling")]
        public float adsTime = 0.2f;
        public float adsFov = 55f;
        public float sprintToFire = 0.18f;
        public float moveSpeedMultiplier = 1f;
        public Vector3 hipOffset = new Vector3(0.13f, -0.12f, 0.22f);

        [Header("Spread (degrees)")]
        public float hipSpread = 2.6f, moveSpread = 2.4f, airSpread = 4f, adsSpread = 0.08f;
        public float bloomPerShot = 0.35f, bloomMax = 3.2f, bloomRecovery = 5f;

        [Header("Recoil")]
        public float recoilVertical = 0.9f, recoilHorizontal = 0.35f, recoilRecoverRate = 9f;
        public float gunKickBack = 0.045f, gunKickRise = 2.2f, gunKickRoll = 1.8f;

        [Header("Presentation")]
        public Sfx shotSound = Sfx.RifleShot;
        public int tracerEvery = 3;
        public float flashScale = 1f;

        public float SecondsPerShot => 60f / Mathf.Max(1f, rpm);

        public float DamageAt(float distance)
        {
            if (distance <= range1) return damage;
            if (distance >= range2) return damage * minDamageFraction;
            float t = Mathf.SmoothStep(0f, 1f, (distance - range1) / (range2 - range1));
            return damage * Mathf.Lerp(1f, minDamageFraction, t);
        }

        /// <summary>Default arsenal used by the builder and as a runtime fallback.</summary>
        public static WeaponData[] CreateDefaults()
        {
            var ar = CreateInstance<WeaponData>();
            ar.name = "MCR4_Carbine";

            var smg = CreateInstance<WeaponData>();
            smg.name = "Striker9_SMG";
            smg.id = "striker9"; smg.displayName = "Striker-9"; smg.className = "SUBMACHINE GUN";
            smg.style = WeaponStyle.SMG;
            smg.damage = 22f; smg.range1 = 12f; smg.range2 = 28f; smg.minDamageFraction = 0.6f; smg.muzzleVelocity = 420f;
            smg.rpm = 900f; smg.burstRpm = 1100f; smg.magSize = 32; smg.reserveMax = 160; smg.reloadTime = 1.9f;
            smg.adsTime = 0.18f; smg.adsFov = 60f; smg.sprintToFire = 0.12f; smg.moveSpeedMultiplier = 1.05f;
            smg.hipOffset = new Vector3(0.12f, -0.115f, 0.2f);
            smg.hipSpread = 2.0f; smg.moveSpread = 1.6f; smg.adsSpread = 0.12f; smg.bloomPerShot = 0.25f; smg.bloomMax = 2.4f; smg.bloomRecovery = 6.5f;
            smg.recoilVertical = 0.62f; smg.recoilHorizontal = 0.42f; smg.recoilRecoverRate = 11f;
            smg.gunKickBack = 0.03f; smg.gunKickRise = 1.6f; smg.gunKickRoll = 2.4f;
            smg.shotSound = Sfx.SmgShot; smg.flashScale = 0.75f;

            var sniper = CreateInstance<WeaponData>();
            sniper.name = "KATT_AMR";
            sniper.id = "katt"; sniper.displayName = "KATT-AMR"; sniper.className = "SNIPER RIFLE";
            sniper.style = WeaponStyle.Sniper;
            sniper.fireModes = new[] { FireMode.Bolt };
            sniper.damage = 160f; sniper.range1 = 150f; sniper.range2 = 400f; sniper.minDamageFraction = 0.9f; sniper.muzzleVelocity = 950f;
            sniper.rpm = 48f; sniper.boltCycleTime = 1.0f; sniper.magSize = 5; sniper.reserveMax = 25; sniper.reloadTime = 3.4f;
            sniper.adsTime = 0.32f; sniper.adsFov = 12f; sniper.sprintToFire = 0.3f; sniper.moveSpeedMultiplier = 0.9f;
            sniper.hipOffset = new Vector3(0.14f, -0.13f, 0.18f);
            sniper.hipSpread = 6f; sniper.moveSpread = 4f; sniper.adsSpread = 0f; sniper.bloomPerShot = 2.5f; sniper.bloomMax = 5f; sniper.bloomRecovery = 2.5f;
            sniper.recoilVertical = 4.5f; sniper.recoilHorizontal = 0.8f; sniper.recoilRecoverRate = 6f;
            sniper.gunKickBack = 0.11f; sniper.gunKickRise = 9f; sniper.gunKickRoll = 4f;
            sniper.shotSound = Sfx.SniperShot; sniper.tracerEvery = 1; sniper.flashScale = 1.6f;

            return new[] { ar, smg, sniper };
        }
    }

    /// <summary>A weapon in someone's hands: rarity, attachments, ammo and reload checkpoint.</summary>
    [System.Serializable]
    public class WeaponInstance
    {
        public WeaponData data;
        public Rarity rarity;
        public AttachmentFlags attachments;
        public int mag;
        public int reserve;
        public int fireModeIndex;
        public float reloadCheckpoint;   // 0, 0.3 or 0.7
        public bool reloadTactical;
        public int chambered;            // round kept in the chamber during a tactical reload

        public WeaponInstance(WeaponData d, Rarity r, AttachmentFlags a)
        {
            data = d; rarity = r; attachments = a;
            mag = MagSize;
            reserve = Mathf.Min(d.reserveMax, MagSize * 3);
        }

        public bool Has(AttachmentFlags f) => (attachments & f) != 0;
        public int AttachmentCount { get { int c = 0; for (int i = 0; i < 5; i++) if (((int)attachments & (1 << i)) != 0) c++; return c; } }
        public int MagSize => Has(AttachmentFlags.ExtMag) ? Mathf.RoundToInt(data.magSize * 1.5f) : data.magSize;
        public bool Suppressed => Has(AttachmentFlags.Suppressor);
        public FireMode Mode => data.fireModes[Mathf.Clamp(fireModeIndex, 0, data.fireModes.Length - 1)];
        public float RangeMul => (Has(AttachmentFlags.Suppressor) ? 0.9f : 1f) * (Has(AttachmentFlags.LongBarrel) ? 1.2f : 1f);
        public float VelocityMul => Has(AttachmentFlags.LongBarrel) ? 1.08f : 1f;
        public float RecoilMul => (Has(AttachmentFlags.Grip) ? 0.82f : 1f) * (Has(AttachmentFlags.Suppressor) ? 0.95f : 1f) * (1f - 0.02f * (int)rarity);
        public float AdsTime => data.adsTime * (Has(AttachmentFlags.LongBarrel) ? 1.06f : 1f) * (Has(AttachmentFlags.ExtMag) ? 1.08f : 1f) * (Has(AttachmentFlags.Optic) ? 0.92f : 1f);
        public float SpreadMul => Has(AttachmentFlags.Optic) ? 0.9f : 1f;
        public string DisplayName => data.displayName;

        public float DamageAt(float distance)
        {
            float rm = RangeMul;
            if (Mathf.Approximately(rm, 1f)) return data.DamageAt(distance);
            return data.DamageAt(distance / rm);
        }
    }
}
