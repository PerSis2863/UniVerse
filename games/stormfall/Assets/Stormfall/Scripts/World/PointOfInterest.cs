using UnityEngine;

namespace Stormfall
{
    /// <summary>Named area marker (compass banner, tac-map labels, bot patrols).</summary>
    public class PointOfInterest : MonoBehaviour
    {
        public string displayName = "Location";
        public float radius = 60f;

        void OnEnable() { if (!WorldInfo.Pois.Contains(this)) WorldInfo.Pois.Add(this); }
        void OnDisable() => WorldInfo.Pois.Remove(this);
    }
}
