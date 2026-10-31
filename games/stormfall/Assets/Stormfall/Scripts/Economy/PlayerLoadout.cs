using UnityEngine;

namespace Stormfall
{
    public enum KillstreakType { None, ReconPulse, OrbitalLance }

    [System.Flags]
    public enum Perk { None = 0, Fleetfoot = 1, Quickhands = 2, Bulwark = 4, TremorSense = 8 }

    /// <summary>Cash, carried armour cells, field items, perks, killstreak slot and match stats.</summary>
    public class PlayerLoadout : MonoBehaviour
    {
        public int cash = 0;
        public int armorPlates = 3;
        public int maxPlates = 8;
        public bool selfRevive;
        public int gasMaskTicks;           // 0 = no mask, 10 = fresh
        public Perk perks;
        public KillstreakType killstreak;
        public int kills, xp;
        public int kitPodPrice = 8000;

        public bool HasPerk(Perk p) => (perks & p) != 0;
        public bool HasGasMask => gasMaskTicks > 0;

        void OnEnable()
        {
            GameEvents.XpAwarded += OnXp;
        }

        void OnDisable()
        {
            GameEvents.XpAwarded -= OnXp;
        }

        void OnXp(int amount, string label) => xp += amount;

        public void AddCash(int amount)
        {
            cash += amount;
            AudioFX.Play2D(Sfx.CashPickup, 0.6f);
        }

        public bool TrySpend(int amount)
        {
            if (cash < amount) return false;
            cash -= amount;
            return true;
        }

        public bool AddPlates(int n)
        {
            if (armorPlates >= maxPlates) return false;
            armorPlates = Mathf.Min(maxPlates, armorPlates + n);
            return true;
        }

        public void ApplyPerks(Perk p)
        {
            perks |= p;
            var pc = GetComponent<TacticalPlayerController>();
            if (pc != null) pc.PerkFleetfoot = HasPerk(Perk.Fleetfoot);
            var w = GetComponent<ProceduralWeaponController>();
            if (w != null) w.PerkQuickhands = HasPerk(Perk.Quickhands);
            var h = GetComponent<PlayerHealthArmor>();
            if (h != null) h.PerkBulwark = HasPerk(Perk.Bulwark);
        }
    }
}
