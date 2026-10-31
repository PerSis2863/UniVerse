using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Every living combatant (player + bots) for alive counts, gas ticks and radar.</summary>
    public static class CombatantRegistry
    {
        public static readonly List<PlayerHealthArmor> All = new List<PlayerHealthArmor>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => All.Clear();

        public static void Register(PlayerHealthArmor h) { if (!All.Contains(h)) All.Add(h); }
        public static void Unregister(PlayerHealthArmor h) => All.Remove(h);

        /// <summary>Combatants still in the match (a player inside the Reboot Trial counts as alive).</summary>
        public static int AliveCount
        {
            get
            {
                int n = 0;
                foreach (var h in All)
                    if (h != null && !h.IsDead) n++;
                return n;
            }
        }
    }
}
