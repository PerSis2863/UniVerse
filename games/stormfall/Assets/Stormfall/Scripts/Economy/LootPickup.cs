using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    public enum LootType { Weapon, ArmorPlate, Cash, Ammo, SelfRevive, GasMask, Frag, Killstreak }

    /// <summary>Floating, rarity-beamed ground item. Weapons need [F]; cash, ammo and cells auto-collect.</summary>
    public class LootPickup : MonoBehaviour, IInteractable
    {
        public LootType type;
        public int amount = 1;
        public Rarity rarity;
        [System.NonSerialized] public WeaponInstance weapon;
        public KillstreakType killstreak;

        Vector3 m_Vel;
        bool m_Landed;
        float m_Spin, m_BobPhase, m_Age;
        Transform m_Visual;

        static readonly Dictionary<LootType, Mesh> s_Icons = new Dictionary<LootType, Mesh>();
        static Mesh s_Beam;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { s_Icons.Clear(); s_Beam = null; }

        // ================================================================ spawning

        public static LootPickup Spawn(LootType type, int amount, Rarity rarity, Vector3 pos, Vector3 velocity)
        {
            var go = new GameObject("Loot_" + type);
            go.transform.position = pos;
            var p = go.AddComponent<LootPickup>();
            p.type = type; p.amount = amount; p.rarity = rarity;
            p.m_Vel = velocity;
            p.m_BobPhase = Random.value * 6f;
            return p;
        }

        public static LootPickup SpawnWeapon(WeaponInstance w, Vector3 pos, Vector3 velocity = default)
        {
            var p = Spawn(LootType.Weapon, 1, w.rarity, pos, velocity);
            p.weapon = w;
            return p;
        }

        void Start()
        {
            BuildVisual();
            var col = gameObject.AddComponent<SphereCollider>();
            col.isTrigger = true;
            col.radius = 0.6f;
        }

        void BuildVisual()
        {
            var vis = new GameObject("Visual");
            vis.transform.SetParent(transform, false);
            m_Visual = vis.transform;
            var mf = vis.AddComponent<MeshFilter>();
            var mr = vis.AddComponent<MeshRenderer>();
            if (type == LootType.Weapon && weapon != null)
            {
                var model = ProceduralWeaponController.GetModel(weapon.data.style, weapon.attachments);
                mf.sharedMesh = model.body;
                var mats = new Material[model.body.subMeshCount];
                for (int i = 0; i < mats.Length; i++) mats[i] = MaterialLibrary.Get(WeaponModel.BodyMaterials[Mathf.Min(i, WeaponModel.BodyMaterials.Length - 1)]);
                mr.sharedMaterials = mats;
                m_Visual.localScale = Vector3.one * 1.4f;
                m_Visual.localRotation = Quaternion.Euler(0, 0, 90f);
            }
            else
            {
                mf.sharedMesh = Icon(type);
                mr.sharedMaterial = MaterialLibrary.Get(IconMaterial(type));
            }
            // rarity beam
            if (s_Beam == null) s_Beam = ProceduralMeshBuilder.LootBeam();
            var beam = new GameObject("Beam");
            beam.transform.SetParent(transform, false);
            beam.AddComponent<MeshFilter>().sharedMesh = s_Beam;
            var br = beam.AddComponent<MeshRenderer>();
            br.sharedMaterial = MaterialLibrary.Get(Mat.FxBeam);
            br.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var c = RarityUtil.Color(rarity);
            MaterialLibrary.Tint(br, new Color(c.r, c.g, c.b, type == LootType.Weapon ? 0.55f : 0.3f));
            if (type != LootType.Weapon) beam.transform.localScale = new Vector3(0.6f, 0.4f, 0.6f);
        }

        static Mat IconMaterial(LootType t) => t switch
        {
            LootType.ArmorPlate => Mat.ArmorCell,
            LootType.Cash => Mat.TerminalScreen,
            LootType.Ammo => Mat.ContainerGreen,
            LootType.SelfRevive => Mat.BeaconRed,
            LootType.GasMask => Mat.BotGear,
            LootType.Frag => Mat.BotCamo,
            LootType.Killstreak => Mat.TabletYellow,
            _ => Mat.GunMetal
        };

        static Mesh Icon(LootType t)
        {
            if (s_Icons.TryGetValue(t, out var m) && m != null) return m;
            var b = new MeshBuilder(1);
            switch (t)
            {
                case LootType.ArmorPlate: b.Append(MeshFromProc(ProceduralMeshBuilder.ArmorCellMesh())); break;
                case LootType.Cash:
                    for (int i = 0; i < 3; i++) b.RoundedBox(new Vector3(0, 0.02f + i * 0.035f, 0), Quaternion.Euler(0, i * 9f, 0), new Vector3(0.16f, 0.03f, 0.07f), 0.005f, 1);
                    break;
                case LootType.Ammo:
                    b.RoundedBox(new Vector3(0, 0.06f, 0), new Vector3(0.24f, 0.12f, 0.12f), 0.01f, 1);
                    b.RoundedBox(new Vector3(0, 0.13f, 0), new Vector3(0.12f, 0.02f, 0.03f), 0.006f, 1);
                    break;
                case LootType.SelfRevive:
                    b.Cylinder(Vector3.zero, Vector3.up * 0.18f, 0.035f, 0.035f, 14);
                    b.Cylinder(Vector3.up * 0.18f, Vector3.up * 0.24f, 0.012f, 0.004f, 10);
                    break;
                case LootType.GasMask:
                    b.Sphere(Vector3.zero, new Vector3(0.11f, 0.13f, 0.08f), 8, 12);
                    b.Cylinder(new Vector3(0.06f, -0.05f, 0.05f), new Vector3(0.14f, -0.09f, 0.1f), 0.045f, 0.045f, 12);
                    b.Cylinder(new Vector3(-0.06f, -0.05f, 0.05f), new Vector3(-0.14f, -0.09f, 0.1f), 0.045f, 0.045f, 12);
                    break;
                case LootType.Frag: b.Append(MeshFromProc(ProceduralMeshBuilder.Grenade())); break;
                default:
                    b.RoundedBox(new Vector3(0, 0.1f, 0), new Vector3(0.2f, 0.2f, 0.05f), 0.02f, 2);
                    break;
            }
            m = b.ToMesh("Icon_" + t);
            s_Icons[t] = m;
            return m;
        }

        static MeshBuilder MeshFromProc(Mesh mesh)
        {
            var b = new MeshBuilder(1);
            var v = mesh.vertices; var n = mesh.normals; var uv = mesh.uv;
            var idx = new int[v.Length];
            for (int i = 0; i < v.Length; i++) idx[i] = b.Vertex(v[i] * 1.4f, n[i], uv.Length > i ? uv[i] : Vector2.zero);
            for (int s = 0; s < mesh.subMeshCount; s++)
            {
                var tris = mesh.GetTriangles(s);
                for (int i = 0; i < tris.Length; i += 3) b.Tri(idx[tris[i]], idx[tris[i + 1]], idx[tris[i + 2]]);
            }
            return b;
        }

        // ================================================================ behaviour

        void Update()
        {
            float dt = Time.deltaTime;
            m_Age += dt;
            if (!m_Landed)
            {
                m_Vel += Physics.gravity * dt;
                Vector3 step = m_Vel * dt;
                if (Physics.Raycast(transform.position, step.normalized, out var hit, step.magnitude + 0.25f, ~0, QueryTriggerInteraction.Ignore)
                    && hit.collider.GetComponentInParent<LootPickup>() == null && hit.collider.GetComponentInParent<IDamageable>() == null)
                {
                    transform.position = hit.point + Vector3.up * 0.25f;
                    m_Landed = true;
                }
                else transform.position += step;
            }
            m_Spin += dt * 60f;
            m_BobPhase += dt * 2f;
            if (m_Visual != null)
            {
                m_Visual.localPosition = new Vector3(0, 0.25f + Mathf.Sin(m_BobPhase) * 0.06f, 0);
                m_Visual.localRotation = Quaternion.Euler(0, m_Spin, 0) * (type == LootType.Weapon ? Quaternion.Euler(0, 0, 0) : Quaternion.identity);
            }

            // auto-collect consumables
            if (m_Age > 0.6f && type != LootType.Weapon && LocalPlayer.Exists && !LocalPlayer.Health.IsDead && !LocalPlayer.Health.IsDowned)
            {
                if ((LocalPlayer.Position + Vector3.up * 0.5f - transform.position).sqrMagnitude < 1.6f * 1.6f && AutoCollect()) Destroy(gameObject);
            }
        }

        bool AutoCollect()
        {
            var lo = LocalPlayer.Loadout;
            if (lo == null) return false;
            switch (type)
            {
                case LootType.Cash: lo.AddCash(amount); GameEvents.RaiseToast("+$" + amount); return true;
                case LootType.Ammo: LocalPlayer.Weapon.AddAmmo(amount); AudioFX.Play2D(Sfx.Pickup, 0.6f); return true;
                case LootType.ArmorPlate:
                    if (!lo.AddPlates(amount)) return false;
                    AudioFX.Play2D(Sfx.Pickup, 0.6f, 1.2f);
                    return true;
                case LootType.Frag:
                    if (LocalPlayer.Weapon.frags >= 3) return false;
                    LocalPlayer.Weapon.frags++;
                    AudioFX.Play2D(Sfx.Pickup, 0.6f);
                    return true;
            }
            return false;
        }

        // ================================================================ IInteractable

        public string Prompt => type switch
        {
            LootType.Weapon => weapon != null ? $"[F] Pick up {weapon.DisplayName}" : "[F] Pick up",
            LootType.SelfRevive => "[F] Take Stim Reviver",
            LootType.GasMask => "[F] Take Gas Mask",
            LootType.Killstreak => "[F] Take " + (killstreak == KillstreakType.OrbitalLance ? "Orbital Lance" : "Recon Pulse"),
            LootType.ArmorPlate => "[F] Take Armour Cells",
            _ => "[F] Take"
        };

        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 0.25f;

        public bool CanInteract(GameObject player)
        {
            var lo = LocalPlayer.Loadout;
            if (lo == null) return false;
            switch (type)
            {
                case LootType.SelfRevive: return !lo.selfRevive;
                case LootType.GasMask: return lo.gasMaskTicks < 10;
                case LootType.Killstreak: return lo.killstreak == KillstreakType.None;
                case LootType.Weapon: return weapon != null;
                case LootType.ArmorPlate: return lo.armorPlates < lo.maxPlates;
            }
            return false;
        }

        public void Interact(GameObject player)
        {
            var lo = LocalPlayer.Loadout;
            switch (type)
            {
                case LootType.Weapon: LocalPlayer.Weapon.GiveWeapon(weapon); break;
                case LootType.SelfRevive: lo.selfRevive = true; break;
                case LootType.GasMask: lo.gasMaskTicks = 10; break;
                case LootType.Killstreak: lo.killstreak = killstreak; break;
                case LootType.ArmorPlate: lo.AddPlates(amount); break;
            }
            AudioFX.Play2D(Sfx.Pickup, 0.7f);
            Destroy(gameObject);
        }
    }
}
