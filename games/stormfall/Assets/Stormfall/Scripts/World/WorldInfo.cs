using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Static facts about the island shared by every system.</summary>
    public static class WorldInfo
    {
        public const float WaterLevel = 8f;
        public const float HalfSize = 500f;
        public const float IslandRadius = 400f;
        public static readonly Vector3 RebootArenaCenter = new Vector3(0f, 0f, 2000f);

        public static readonly List<PointOfInterest> Pois = new List<PointOfInterest>();
        static Terrain s_Terrain;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { Pois.Clear(); s_Terrain = null; }

        public static Terrain Terrain
        {
            get
            {
                if (s_Terrain == null) s_Terrain = Terrain.activeTerrain;
                return s_Terrain;
            }
        }

        public static float GroundHeight(Vector3 p)
        {
            if (Physics.Raycast(new Vector3(p.x, 900f, p.z), Vector3.down, out var hit, 1200f, ~0, QueryTriggerInteraction.Ignore))
                return hit.point.y;
            var t = Terrain;
            return t != null ? t.SampleHeight(p) + t.transform.position.y : 0f;
        }

        public static string PoiAt(Vector3 p)
        {
            PointOfInterest best = null;
            float bestD = float.MaxValue;
            foreach (var poi in Pois)
            {
                float d = Vector2.Distance(new Vector2(p.x, p.z), new Vector2(poi.transform.position.x, poi.transform.position.z));
                if (d < poi.radius && d < bestD) { best = poi; bestD = d; }
            }
            return best != null ? best.displayName : (new Vector2(p.x, p.z).magnitude > IslandRadius ? "Open Water" : "Kaldera Wilds");
        }

        public static Vector3 RandomPointOnLand(System.Random rnd, float minR = 0f, float maxR = IslandRadius * 0.85f)
        {
            for (int i = 0; i < 40; i++)
            {
                float a = (float)rnd.NextDouble() * Mathf.PI * 2f;
                float r = Mathf.Lerp(minR, maxR, Mathf.Sqrt((float)rnd.NextDouble()));
                var p = new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
                p.y = GroundHeight(p);
                if (p.y > WaterLevel + 1f) return p;
            }
            return new Vector3(0, GroundHeight(Vector3.zero), 0);
        }
    }
}
