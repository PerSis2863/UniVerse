using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Orbital kit pod: a red smoke beacon marks the drop, the pod falls from orbit, then opens a
    /// kit selection granting two Legendary 5-attachment weapons and all four perks.
    /// </summary>
    public class KitPod : MonoBehaviour, IInteractable
    {
        public struct Kit { public string name; public int primary, secondary; }

        public static readonly Kit[] Kits =
        {
            new Kit { name = "VANGUARD", primary = 0, secondary = 1 },
            new Kit { name = "LONGSHOT", primary = 2, secondary = 1 },
            new Kit { name = "SKIRMISHER", primary = 1, secondary = 0 },
        };

        public static KitPod MenuOpenFor { get; private set; }

        Vector3 m_Ground;
        float m_Delay = 4f;
        bool m_Landed, m_Used;
        GameObject m_Body;
        float m_SmokeTimer;
        int m_OpenFrame;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => MenuOpenFor = null;

        public static KitPod CallIn(Vector3 ground)
        {
            var go = new GameObject("KitPod");
            go.transform.position = ground;
            var pod = go.AddComponent<KitPod>();
            pod.m_Ground = ground;
            GameEvents.RaiseToast("KIT POD INBOUND");
            AudioFX.Play2D(Sfx.ReconPing, 0.6f, 0.7f);
            return pod;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            // red marker smoke
            m_SmokeTimer -= dt;
            if (m_SmokeTimer <= 0f && !m_Used)
            {
                m_SmokeTimer = 0.08f;
                WeaponFX.Steam(m_Ground + Vector3.up * 0.3f, new Vector3(Random.Range(-0.4f, 0.4f), 2.5f, Random.Range(-0.4f, 0.4f)), Random.Range(0.8f, 1.6f), new Color(0.9f, 0.15f, 0.1f, 0.55f));
            }
            if (m_Landed) { HandleMenu(); return; }
            m_Delay -= dt;
            if (m_Delay > 0f) return;
            if (m_Body == null)
            {
                m_Body = new GameObject("PodBody");
                m_Body.transform.SetParent(transform, false);
                m_Body.transform.position = m_Ground + Vector3.up * 350f;
                m_Body.AddComponent<MeshFilter>().sharedMesh = ProceduralMeshBuilder.KitPod();
                m_Body.AddComponent<MeshRenderer>().sharedMaterials = new[] { MaterialLibrary.Get(Mat.PodShell), MaterialLibrary.Get(Mat.BeaconRed) };
                AudioFX.PlayAt(Sfx.VentWhoosh, m_Ground + Vector3.up * 60f, 1f, 0.6f, 400f);
            }
            var t = m_Body.transform;
            t.position += Vector3.down * 90f * dt;
            WeaponFX.Steam(t.position + Vector3.up * 2.6f, Vector3.up * 3f, 1.4f, new Color(0.6f, 0.6f, 0.6f, 0.5f));
            if (t.position.y <= m_Ground.y)
            {
                t.position = m_Ground;
                m_Landed = true;
                var col = gameObject.AddComponent<CapsuleCollider>();
                col.center = Vector3.up * 1.2f; col.radius = 0.6f; col.height = 2.6f;
                AudioFX.PlayAt(Sfx.Land, m_Ground, 1f, 0.5f, 200f);
                AudioFX.PlayAt(Sfx.BassPunch, m_Ground, 1f, 0.6f, 200f);
                CameraShake.AddAt(m_Ground, 0.6f, 40f);
                for (int i = 0; i < 24; i++)
                    WeaponFX.Dust(m_Ground + Vector3.up * 0.3f, new Vector3(Random.Range(-6f, 6f), Random.Range(0.5f, 2f), Random.Range(-6f, 6f)), Random.Range(1.5f, 3f), Random.Range(1.2f, 2.2f), new Color(0.6f, 0.55f, 0.45f, 0.6f));
                GameEvents.RaiseToast("KIT POD LANDED");
            }
        }

        void HandleMenu()
        {
            if (MenuOpenFor != this || Time.frameCount == m_OpenFrame) return;
            if (GameInput.PressedRaw(GameKey.Escape) || Vector3.Distance(LocalPlayer.Position, transform.position) > 4f) { CloseMenu(); return; }
            for (int i = 0; i < Kits.Length; i++)
                if (GameInput.PressedRaw(GameKey.Buy1 + i)) { Choose(i); return; }
        }

        public void Choose(int index)
        {
            var assets = StormfallAssets.Instance;
            var defs = assets != null && assets.weapons != null && assets.weapons.Length >= 3 ? assets.weapons : WeaponData.CreateDefaults();
            const AttachmentFlags all = AttachmentFlags.Suppressor | AttachmentFlags.LongBarrel | AttachmentFlags.Optic | AttachmentFlags.Grip | AttachmentFlags.ExtMag;
            var k = Kits[index];
            var a = new WeaponInstance(defs[k.primary], Rarity.Legendary, all);
            var b = new WeaponInstance(defs[k.secondary], Rarity.Legendary, all);
            a.reserve = a.data.reserveMax; b.reserve = b.data.reserveMax;
            LocalPlayer.Weapon.SetLoadout(a, b);
            LocalPlayer.Loadout.ApplyPerks(Perk.Fleetfoot | Perk.Quickhands | Perk.Bulwark | Perk.TremorSense);
            m_Used = true;
            CloseMenu();
            AudioFX.Play2D(Sfx.UiBuy, 0.9f, 0.8f);
            GameEvents.RaiseToast("KIT EQUIPPED: " + k.name);
        }

        void CloseMenu()
        {
            MenuOpenFor = null;
            GameInput.GameplayBlocked = false;
            if (LocalPlayer.Controller != null) LocalPlayer.Controller.MenuOpen = false;
        }

        public string Prompt => "[F] Open Kit Pod";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 1.2f;
        public bool CanInteract(GameObject player) => m_Landed && !m_Used && MenuOpenFor == null;

        public void Interact(GameObject player)
        {
            MenuOpenFor = this;
            m_OpenFrame = Time.frameCount;
            GameInput.GameplayBlocked = true;
            LocalPlayer.Controller.MenuOpen = true;
            AudioFX.Play2D(Sfx.CacheOpen, 0.7f);
        }
    }
}
