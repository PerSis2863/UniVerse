using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Hand-placed (builder-placed) cover spot behind waist-high or full cover.</summary>
    public class CoverPoint : MonoBehaviour
    {
        public static readonly List<CoverPoint> All = new List<CoverPoint>();
        public bool lowCover = true;
        [System.NonSerialized] public TacticalBotAI occupant;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => All.Clear();

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);

        /// <summary>Protected when a crouched head is hidden from the threat but a standing one can peek.</summary>
        public bool Protects(Vector3 threatEye)
        {
            Vector3 p = transform.position;
            bool crouchBlocked = !Ballistics.HasLineOfSight(p + Vector3.up * 0.9f, threatEye, null, null);
            return crouchBlocked;
        }

        public static CoverPoint FindBest(TacticalBotAI bot, Vector3 threatEye, float maxDistance)
        {
            CoverPoint best = null;
            float bestScore = float.MaxValue;
            Vector3 from = bot.transform.position;
            foreach (var c in All)
            {
                if (c.occupant != null && c.occupant != bot) continue;
                float d = Vector3.Distance(from, c.transform.position);
                if (d > maxDistance) continue;
                float threatD = Vector3.Distance(threatEye, c.transform.position);
                if (threatD < 6f) continue;
                if (!c.Protects(threatEye)) continue;
                float score = d + Mathf.Abs(threatD - 25f) * 0.3f;
                if (score < bestScore) { bestScore = score; best = c; }
            }
            return best;
        }
    }
}
