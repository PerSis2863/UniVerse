using UnityEngine;

namespace Stormfall
{
    public enum HitZone { Head, UpperTorso, LowerTorso, Limb, Generic }

    public enum DamageType { Bullet, Explosion, Blight, Melee }

    public struct DamageInfo
    {
        public float amount;
        public Vector3 point;
        public Vector3 direction;
        public GameObject source;
        public HitZone zone;
        public DamageType type;
        public bool bypassArmor;
    }

    public struct DamageResult
    {
        public bool applied;
        public float armorDamage;
        public float healthDamage;
        public bool hitArmor;
        public bool cellBroken;
        public bool headshot;
        public bool downed;
        public bool killed;
    }

    public interface IDamageable
    {
        DamageResult TakeDamage(DamageInfo info);
        bool IsAlive { get; }
        Transform Root { get; }
    }
}
