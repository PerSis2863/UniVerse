using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Trigger collider that routes bullet hits to its owner with a damage multiplier.
    /// Head 1.6x, Upper Torso 1.1x, Lower Torso 1.0x, Limbs 0.85x.
    /// </summary>
    public class HitboxZone : MonoBehaviour
    {
        public HitZone zone = HitZone.UpperTorso;
        public float multiplier = 1.1f;
        IDamageable m_Owner;

        public IDamageable Owner
        {
            get
            {
                if (m_Owner == null) m_Owner = GetComponentInParent<IDamageable>();
                return m_Owner;
            }
        }

        public static float DefaultMultiplier(HitZone z) => z switch
        {
            HitZone.Head => 1.6f,
            HitZone.UpperTorso => 1.1f,
            HitZone.LowerTorso => 1.0f,
            HitZone.Limb => 0.85f,
            _ => 1f
        };

        public static HitboxZone Add(GameObject go, HitZone z)
        {
            var h = go.AddComponent<HitboxZone>();
            h.zone = z;
            h.multiplier = DefaultMultiplier(z);
            return h;
        }
    }
}
