using System;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Static event hub so gameplay never holds hard references to the HUD.</summary>
    public static class GameEvents
    {
        /// <summary>shooter, muzzle position, suppressed</summary>
        public static event Action<GameObject, Vector3, bool> ShotFired;
        /// <summary>attacker, victim, result, hit point</summary>
        public static event Action<GameObject, IDamageable, DamageResult, Vector3> DamageDealt;
        /// <summary>attacker, victim</summary>
        public static event Action<GameObject, IDamageable> CombatantDowned;
        public static event Action<GameObject, IDamageable> CombatantKilled;
        /// <summary>source position of damage that hit the local player</summary>
        public static event Action<Vector3> PlayerDamagedFrom;
        public static event Action<int, string> XpAwarded;
        public static event Action<string, string> Callout;
        public static event Action<string> Toast;

        public static void RaiseShot(GameObject shooter, Vector3 pos, bool suppressed) => ShotFired?.Invoke(shooter, pos, suppressed);
        public static void RaiseDamage(GameObject attacker, IDamageable victim, DamageResult r, Vector3 p) => DamageDealt?.Invoke(attacker, victim, r, p);
        public static void RaiseDowned(GameObject attacker, IDamageable victim) => CombatantDowned?.Invoke(attacker, victim);
        public static void RaiseKilled(GameObject attacker, IDamageable victim) => CombatantKilled?.Invoke(attacker, victim);
        public static void RaisePlayerDamagedFrom(Vector3 from) => PlayerDamagedFrom?.Invoke(from);
        public static void RaiseXp(int amount, string label) => XpAwarded?.Invoke(amount, label);
        public static void RaiseCallout(string speaker, string line) => Callout?.Invoke(speaker, line);
        public static void RaiseToast(string text) => Toast?.Invoke(text);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            ShotFired = null; DamageDealt = null; CombatantDowned = null; CombatantKilled = null;
            PlayerDamagedFrom = null; XpAwarded = null; Callout = null; Toast = null;
        }
    }
}
