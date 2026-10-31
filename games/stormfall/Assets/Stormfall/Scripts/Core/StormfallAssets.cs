using UnityEngine;

namespace Stormfall
{
    /// <summary>Runtime registry written by the scene builder (Resources/StormfallAssets.asset).</summary>
    [CreateAssetMenu(menuName = "Stormfall/Asset Registry", fileName = "StormfallAssets")]
    public class StormfallAssets : ScriptableObject
    {
        public Material[] materials;
        public WeaponData[] weapons;

        static StormfallAssets s_Instance;
        static bool s_Searched;

        public static StormfallAssets Instance
        {
            get
            {
                if (s_Instance == null && !s_Searched)
                {
                    s_Searched = true;
                    s_Instance = Resources.Load<StormfallAssets>("StormfallAssets");
                }
                return s_Instance;
            }
        }

        public static void SetInstance(StormfallAssets a) { s_Instance = a; s_Searched = true; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { s_Instance = null; s_Searched = false; }

        public WeaponData FindWeapon(string id)
        {
            if (weapons != null)
                foreach (var w in weapons)
                    if (w != null && w.id == id) return w;
            return null;
        }
    }
}
