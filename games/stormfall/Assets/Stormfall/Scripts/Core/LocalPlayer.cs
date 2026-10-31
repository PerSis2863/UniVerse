using UnityEngine;

namespace Stormfall
{
    /// <summary>Quick access to the local player's components (single-player game).</summary>
    public static class LocalPlayer
    {
        public static TacticalPlayerController Controller;
        public static ProceduralWeaponController Weapon;
        public static PlayerHealthArmor Health;
        public static PlayerLoadout Loadout;
        public static PlayerInteractor Interactor;
        public static Killstreaks Killstreaks;

        public static bool Exists => Controller != null;
        public static Transform Transform => Controller != null ? Controller.transform : null;
        public static Camera Camera => Controller != null ? Controller.cam : null;
        public static Vector3 Position => Controller != null ? Controller.transform.position : Vector3.zero;
        public static Vector3 EyePosition => Camera != null ? Camera.transform.position : Position + Vector3.up * 1.6f;

        public static void Register(GameObject go)
        {
            Controller = go.GetComponent<TacticalPlayerController>();
            Weapon = go.GetComponent<ProceduralWeaponController>();
            Health = go.GetComponent<PlayerHealthArmor>();
            Loadout = go.GetComponent<PlayerLoadout>();
            Interactor = go.GetComponent<PlayerInteractor>();
            Killstreaks = go.GetComponent<Killstreaks>();
        }

        public static bool IsPlayer(GameObject go) => go != null && Controller != null && go.transform.IsChildOf(Controller.transform);

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics()
        {
            Controller = null; Weapon = null; Health = null; Loadout = null; Interactor = null; Killstreaks = null;
        }
    }
}
