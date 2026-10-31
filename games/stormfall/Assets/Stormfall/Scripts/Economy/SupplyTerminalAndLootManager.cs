using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Economy hub: Supply Terminal catalogue and purchases, the buy-menu state, loot tables,
    /// loot bursts from caches and bot drops.
    /// </summary>
    public class SupplyTerminalAndLootManager : MonoBehaviour
    {
        public static SupplyTerminalAndLootManager Instance { get; private set; }

        public struct CatalogItem
        {
            public string name, description;
            public int price;
        }

        public static readonly CatalogItem[] Catalog =
        {
            new CatalogItem { name = "Armour Cell Pack", description = "+3 armour cells (carry up to 8)", price = 1200 },
            new CatalogItem { name = "Gas Mask", description = "Absorbs 10 Blight ticks", price = 2500 },
            new CatalogItem { name = "Stim Reviver", description = "Self-revive when downed (hold F)", price = 3500 },
            new CatalogItem { name = "Recon Pulse", description = "Sweeps the minimap for 30s", price = 3000 },
            new CatalogItem { name = "Orbital Lance", description = "Designate a target for 3 orbital strikes", price = 4500 },
            new CatalogItem { name = "Kit Pod", description = "Custom legendary weapons + 4 perks", price = 8000 },
        };

        public bool MenuOpen { get; private set; }
        public SupplyTerminal ActiveTerminal { get; private set; }
        public string LastMessage { get; private set; }
        public float LastMessageTime { get; private set; } = -10f;

        static System.Random s_Rng = new System.Random();
        int m_OpenFrame;

        public bool scatterGroundLoot = true;
        public int groundLootCount = 110;

        void Awake() => Instance = this;

        void Start()
        {
            if (scatterGroundLoot) ScatterGroundLoot(groundLootCount, System.Environment.TickCount);
        }
        void OnDestroy() { if (Instance == this) Instance = null; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { Instance = null; s_Rng = new System.Random(); }

        public static int PriceOf(int index)
        {
            if (index == 5 && LocalPlayer.Loadout != null) return LocalPlayer.Loadout.kitPodPrice;
            return Catalog[index].price;
        }

        // ================================================================ buy menu

        public void OpenMenu(SupplyTerminal t)
        {
            MenuOpen = true;
            m_OpenFrame = Time.frameCount;
            ActiveTerminal = t;
            SetBlocked(true);
            AudioFX.Play2D(Sfx.UiClick, 0.7f);
        }

        public void CloseMenu()
        {
            if (!MenuOpen) return;
            MenuOpen = false;
            ActiveTerminal = null;
            SetBlocked(false);
        }

        static void SetBlocked(bool b)
        {
            GameInput.GameplayBlocked = b;
            if (LocalPlayer.Controller != null) LocalPlayer.Controller.MenuOpen = b;
        }

        void Update()
        {
            if (!MenuOpen || Time.frameCount == m_OpenFrame) return;
            if (GameInput.PressedRaw(GameKey.Escape) || GameInput.PressedRaw(GameKey.Interact) ||
                ActiveTerminal == null || Vector3.Distance(LocalPlayer.Position, ActiveTerminal.transform.position) > 4f ||
                LocalPlayer.Health.IsDowned || LocalPlayer.Health.IsDead)
            {
                CloseMenu();
                return;
            }
            for (int i = 0; i < Catalog.Length; i++)
                if (GameInput.PressedRaw(GameKey.Buy1 + i)) Buy(i);
        }

        /// <summary>Attempts a purchase. Returns false with a reason in <see cref="LastMessage"/>.</summary>
        public bool Buy(int index)
        {
            var lo = LocalPlayer.Loadout;
            if (lo == null || index < 0 || index >= Catalog.Length) return false;
            int price = PriceOf(index);
            string deny = null;
            switch (index)
            {
                case 0: if (lo.armorPlates >= lo.maxPlates) deny = "CELLS FULL"; break;
                case 1: if (lo.gasMaskTicks >= 10) deny = "MASK ALREADY FULL"; break;
                case 2: if (lo.selfRevive) deny = "ALREADY CARRYING A STIM"; break;
                case 3:
                case 4: if (lo.killstreak != KillstreakType.None) deny = "KILLSTREAK SLOT FULL"; break;
            }
            if (deny == null && lo.cash < price) deny = "NOT ENOUGH CASH";
            if (deny != null)
            {
                Message(deny);
                AudioFX.Play2D(Sfx.UiDeny, 0.7f);
                return false;
            }
            lo.TrySpend(price);
            switch (index)
            {
                case 0: lo.AddPlates(3); break;
                case 1: lo.gasMaskTicks = 10; AudioFX.Play2D(Sfx.MaskOn, 0.5f); break;
                case 2: lo.selfRevive = true; break;
                case 3: lo.killstreak = KillstreakType.ReconPulse; break;
                case 4: lo.killstreak = KillstreakType.OrbitalLance; break;
                case 5:
                {
                    lo.kitPodPrice += 2000;
                    var pc = LocalPlayer.Controller;
                    Vector3 p = pc.transform.position + pc.transform.forward * 7f;
                    p.y = WorldInfo.GroundHeight(p);
                    KitPod.CallIn(p);
                    CloseMenu();
                    break;
                }
            }
            Message("PURCHASED " + Catalog[index].name.ToUpperInvariant());
            AudioFX.Play2D(Sfx.UiBuy, 0.8f);
            return true;
        }

        void Message(string m) { LastMessage = m; LastMessageTime = Time.unscaledTime; }

        // ================================================================ loot tables

        public static WeaponInstance RollWeapon(Rarity rarity)
        {
            var assets = StormfallAssets.Instance;
            var defs = assets != null && assets.weapons != null && assets.weapons.Length > 0 ? assets.weapons : WeaponData.CreateDefaults();
            int pick = s_Rng.Next(100) < 15 ? 2 : s_Rng.Next(2);
            pick = Mathf.Min(pick, defs.Length - 1);
            return new WeaponInstance(defs[pick], rarity, RarityUtil.RollAttachments(rarity, s_Rng));
        }

        /// <summary>Cache contents burst outward in an arc.</summary>
        public static void SpawnLootBurst(Vector3 origin, bool vault)
        {
            int count = vault ? 5 : 3 + s_Rng.Next(2);
            for (int i = 0; i < count; i++)
            {
                float a = (i / (float)count) * Mathf.PI * 2f + (float)s_Rng.NextDouble() * 0.5f;
                Vector3 vel = new Vector3(Mathf.Cos(a) * 2.6f, 4.5f, Mathf.Sin(a) * 2.6f);
                Vector3 pos = origin + Vector3.up * 0.8f;
                if (i == 0)
                {
                    var r = vault ? (s_Rng.Next(100) < 40 ? Rarity.Legendary : Rarity.Epic) : RarityUtil.Roll(s_Rng);
                    LootPickup.SpawnWeapon(RollWeapon(r), pos, vel);
                    continue;
                }
                int roll = s_Rng.Next(100);
                if (roll < 30) LootPickup.Spawn(LootType.Cash, (vault ? 800 : 200) + s_Rng.Next(5) * 100, Rarity.Common, pos, vel);
                else if (roll < 55) LootPickup.Spawn(LootType.ArmorPlate, 1, Rarity.Rare, pos, vel);
                else if (roll < 75) LootPickup.Spawn(LootType.Ammo, 1, Rarity.Common, pos, vel);
                else if (roll < 84) LootPickup.Spawn(LootType.Frag, 1, Rarity.Uncommon, pos, vel);
                else if (roll < 90) LootPickup.Spawn(LootType.GasMask, 1, Rarity.Rare, pos, vel);
                else if (roll < 95) LootPickup.Spawn(LootType.SelfRevive, 1, Rarity.Epic, pos, vel);
                else
                {
                    var k = LootPickup.Spawn(LootType.Killstreak, 1, Rarity.Legendary, pos, vel);
                    k.killstreak = s_Rng.Next(2) == 0 ? KillstreakType.ReconPulse : KillstreakType.OrbitalLance;
                }
            }
        }

        public static void DropBotLoot(Vector3 pos)
        {
            Vector3 up = pos + Vector3.up * 0.8f;
            LootPickup.Spawn(LootType.Cash, 300 + s_Rng.Next(7) * 100, Rarity.Common, up, new Vector3(1.5f, 3.5f, 0f));
            LootPickup.Spawn(LootType.Ammo, 1, Rarity.Common, up, new Vector3(-1.5f, 3.5f, 0.5f));
            if (s_Rng.Next(100) < 55) LootPickup.Spawn(LootType.ArmorPlate, 1, Rarity.Rare, up, new Vector3(0f, 3.5f, 1.5f));
            if (s_Rng.Next(100) < 25) LootPickup.SpawnWeapon(RollWeapon(RarityUtil.Roll(s_Rng, 0.1f)), up, new Vector3(0f, 3.5f, -1.5f));
        }

        /// <summary>Scatter ground loot across the island (called once at match start).</summary>
        public static void ScatterGroundLoot(int count, int seed)
        {
            var rnd = new System.Random(seed);
            for (int i = 0; i < count; i++)
            {
                // 60% clustered around named locations, the rest anywhere on land
                Vector3 p;
                if (WorldInfo.Pois.Count > 0 && rnd.Next(100) < 60)
                {
                    var poi = WorldInfo.Pois[rnd.Next(WorldInfo.Pois.Count)];
                    float a = (float)rnd.NextDouble() * Mathf.PI * 2f, d = (float)rnd.NextDouble() * poi.radius * 0.8f;
                    p = poi.transform.position + new Vector3(Mathf.Cos(a) * d, 0, Mathf.Sin(a) * d);
                    p.y = WorldInfo.GroundHeight(p);
                }
                else p = WorldInfo.RandomPointOnLand(rnd, 0f, WorldInfo.IslandRadius * 0.85f);
                p += Vector3.up * 0.4f;
                int roll = rnd.Next(100);
                if (roll < 40) LootPickup.SpawnWeapon(RollWeapon(RarityUtil.Roll(rnd)), p);
                else if (roll < 65) LootPickup.Spawn(LootType.Cash, 100 + rnd.Next(6) * 100, Rarity.Common, p, Vector3.zero);
                else if (roll < 85) LootPickup.Spawn(LootType.ArmorPlate, 1, Rarity.Rare, p, Vector3.zero);
                else LootPickup.Spawn(LootType.Ammo, 1, Rarity.Common, p, Vector3.zero);
            }
        }
    }
}
