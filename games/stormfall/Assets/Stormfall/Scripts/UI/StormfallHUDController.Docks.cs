using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Stormfall
{
    public partial class StormfallHUDController
    {
        // status dock
        Image[] m_CellFill;
        Image m_HpFill, m_StaminaFill, m_StimIcon, m_MaskIcon, m_CellIcon;
        Text m_HpText, m_ArmorText, m_CellCount, m_MaskCount, m_Cash, m_Perks;

        // weapon dock
        Image m_Silhouette, m_RarityBar;
        Image[] m_Pips;
        Text m_WeaponName, m_WeaponClass, m_Mag, m_Reserve, m_LowAmmo, m_FireModes, m_Frags, m_Killstreak, m_Secondary;
        readonly Dictionary<WeaponStyle, Sprite> m_SilhouetteSprites = new Dictionary<WeaponStyle, Sprite>();

        // prompts
        Text m_Prompt, m_Callout;
        Image m_HoldRing;
        readonly List<Text> m_Toasts = new List<Text>();
        readonly List<float> m_ToastTimes = new List<float>();
        float m_CalloutTime = -10f;
        RectTransform m_ContractPanel, m_Card;
        Text m_ContractTitle, m_ContractObjective, m_CardName, m_CardInfo;
        Image m_ContractBar, m_CardRarity;
        Image[] m_CardBarsNew, m_CardBarsOld;
        Text[] m_CardLabels;

        // menus
        RectTransform m_BuyPanel, m_KitPanel;
        Text m_BuyCash, m_BuyMessage;
        Text[] m_BuyLabels;

        // end screen
        RectTransform m_EndPanel;
        Text m_EndTitle, m_EndSub, m_EndStats;

        // ================================================================ status dock

        void BuildStatusDock()
        {
            var dock = HUDBuilder.Img("StatusDock", m_Root, new Vector2(0f, 0f), new Vector2(24, 24), new Vector2(430, 156), HUDBuilder.Panel, null, new Vector2(0f, 0f));
            HUDBuilder.Img("Accent", dock.transform, new Vector2(0f, 0f), Vector2.zero, new Vector2(4, 156), HUDBuilder.Amber, null, new Vector2(0f, 0f));
            m_CellFill = new Image[3];
            for (int i = 0; i < 3; i++)
                m_CellFill[i] = HUDBuilder.Bar("Cell" + i, dock.transform, new Vector2(0f, 0f), new Vector2(18 + i * 124, 122), new Vector2(118, 11), new Color(0.1f, 0.25f, 0.3f, 0.7f), HUDBuilder.Cyan, new Vector2(0f, 0f));
            m_HpFill = HUDBuilder.Bar("HP", dock.transform, new Vector2(0f, 0f), new Vector2(18, 98), new Vector2(366, 16), new Color(0.15f, 0.15f, 0.15f, 0.7f), HUDBuilder.OffWhite, new Vector2(0f, 0f));
            m_ArmorText = HUDBuilder.Txt("ArmorN", dock.transform, new Vector2(0f, 0f), new Vector2(392, 127), new Vector2(40, 16), "150", 13, HUDBuilder.Cyan, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_HpText = HUDBuilder.Txt("HPN", dock.transform, new Vector2(0f, 0f), new Vector2(392, 106), new Vector2(40, 18), "100", 16, HUDBuilder.OffWhite, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_StaminaFill = HUDBuilder.Bar("Stamina", dock.transform, new Vector2(0f, 0f), new Vector2(18, 86), new Vector2(366, 4), new Color(0, 0, 0, 0.5f), HUDBuilder.Amber, new Vector2(0f, 0f));

            m_CellIcon = HUDBuilder.Img("CellIcon", dock.transform, new Vector2(0f, 0f), new Vector2(30, 56), new Vector2(18, 22), HUDBuilder.Cyan, HUDBuilder.WhiteSprite);
            m_CellCount = HUDBuilder.Txt("Cells", dock.transform, new Vector2(0f, 0f), new Vector2(46, 56), new Vector2(80, 22), "x3", 18, HUDBuilder.OffWhite, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_StimIcon = HUDBuilder.Img("Stim", dock.transform, new Vector2(0f, 0f), new Vector2(104, 56), new Vector2(10, 24), HUDBuilder.Danger, HUDBuilder.WhiteSprite);
            HUDBuilder.Txt("StimL", dock.transform, new Vector2(0f, 0f), new Vector2(116, 56), new Vector2(60, 22), "STIM", 13, HUDBuilder.Muted, TextAnchor.MiddleLeft, false, new Vector2(0f, 0.5f));
            m_MaskIcon = HUDBuilder.Img("Mask", dock.transform, new Vector2(0f, 0f), new Vector2(172, 56), new Vector2(20, 20), new Color(0.7f, 0.9f, 0.3f), HUDBuilder.SpriteOf(TextureFactory.HardCircle()));
            m_MaskCount = HUDBuilder.Txt("MaskN", dock.transform, new Vector2(0f, 0f), new Vector2(186, 56), new Vector2(90, 22), "", 13, HUDBuilder.Muted, TextAnchor.MiddleLeft, false, new Vector2(0f, 0.5f));
            m_Cash = HUDBuilder.Txt("Cash", dock.transform, new Vector2(1f, 0f), new Vector2(-14, 56), new Vector2(170, 30), "$0", 26, HUDBuilder.Amber, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_Perks = HUDBuilder.Txt("Perks", dock.transform, new Vector2(0f, 0f), new Vector2(18, 22), new Vector2(400, 20), "", 13, HUDBuilder.Muted, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_Perks.supportRichText = true;
        }

        void UpdateStatusDock()
        {
            var h = LocalPlayer.Health;
            var lo = LocalPlayer.Loadout;
            var pc = LocalPlayer.Controller;
            for (int i = 0; i < 3; i++)
            {
                bool exists = i < h.maxCells;
                m_CellFill[i].transform.parent.gameObject.SetActive(exists);
                float fill = Mathf.Clamp01((h.Armor - i * h.cellCapacity) / h.cellCapacity);
                if (h.IsInsertingPlate && i == h.CellsFull) fill = Mathf.Max(fill, h.PlateInsertProgress);
                m_CellFill[i].fillAmount = fill;
                m_CellFill[i].color = h.IsInsertingPlate && i == h.CellsFull ? Color.Lerp(HUDBuilder.Cyan, Color.white, 0.5f + 0.5f * Mathf.Sin(Time.time * 12f)) : HUDBuilder.Cyan;
            }
            m_HpFill.fillAmount = Mathf.Clamp01(h.Health / h.maxHealth);
            m_HpFill.color = h.Health < h.lowHealthThreshold ? Color.Lerp(HUDBuilder.OffWhite, HUDBuilder.Danger, 0.5f + 0.5f * Mathf.Sin(Time.time * 7f)) : HUDBuilder.OffWhite;
            m_HpText.text = Mathf.CeilToInt(h.Health).ToString();
            m_ArmorText.text = Mathf.CeilToInt(h.Armor).ToString();
            m_StaminaFill.fillAmount = pc.TacSprintFraction;
            m_StaminaFill.color = pc.IsTacSprinting ? Color.white : pc.TacSprintReady ? HUDBuilder.Amber : new Color(0.6f, 0.45f, 0.2f);
            if (lo == null) return;
            m_CellCount.text = "x" + lo.armorPlates;
            SetAlpha(m_StimIcon, lo.selfRevive ? 1f : 0.15f);
            SetAlpha(m_MaskIcon, lo.HasGasMask ? 1f : 0.15f);
            m_MaskCount.text = lo.HasGasMask ? $"MASK {lo.gasMaskTicks}" : "NO MASK";
            m_Cash.text = "$" + lo.cash.ToString("N0");
            string P(Perk p, string n) => lo.HasPerk(p) ? $"<color=#ffb020>{n}</color>  " : "";
            m_Perks.text = P(Perk.Fleetfoot, "FLEETFOOT") + P(Perk.Quickhands, "QUICKHANDS") + P(Perk.Bulwark, "BULWARK") + P(Perk.TremorSense, "TREMOR SENSE");
        }

        // ================================================================ weapon dock

        void BuildWeaponDock()
        {
            var dock = HUDBuilder.Img("WeaponDock", m_Root, new Vector2(1f, 0f), new Vector2(-24, 24), new Vector2(470, 156), HUDBuilder.Panel, null, new Vector2(1f, 0f));
            HUDBuilder.Img("Accent", dock.transform, new Vector2(1f, 0f), Vector2.zero, new Vector2(4, 156), HUDBuilder.Amber, null, new Vector2(1f, 0f));
            m_Silhouette = HUDBuilder.Img("Silhouette", dock.transform, new Vector2(0f, 1f), new Vector2(14, -10), new Vector2(200, 62), new Color(1f, 1f, 1f, 0.85f), null, new Vector2(0f, 1f));
            m_Silhouette.preserveAspect = true;
            m_RarityBar = HUDBuilder.Img("Rarity", dock.transform, new Vector2(0f, 1f), new Vector2(14, -76), new Vector2(200, 4), Color.white, null, new Vector2(0f, 1f));
            m_WeaponName = HUDBuilder.Txt("Name", dock.transform, new Vector2(0f, 1f), new Vector2(14, -94), new Vector2(240, 24), "", 20, Color.white, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_WeaponClass = HUDBuilder.Txt("Class", dock.transform, new Vector2(0f, 1f), new Vector2(14, -114), new Vector2(240, 18), "", 12, HUDBuilder.Muted, TextAnchor.MiddleLeft, false, new Vector2(0f, 0.5f));
            m_Pips = new Image[5];
            for (int i = 0; i < 5; i++)
                m_Pips[i] = HUDBuilder.Img("Pip", dock.transform, new Vector2(0f, 1f), new Vector2(18 + i * 16, -134), new Vector2(10, 10), HUDBuilder.Amber, HUDBuilder.SpriteOf(TextureFactory.Diamond()));
            m_Secondary = HUDBuilder.Txt("Secondary", dock.transform, new Vector2(0f, 0f), new Vector2(110, 10), new Vector2(200, 16), "", 12, HUDBuilder.Muted, TextAnchor.MiddleLeft, false, new Vector2(0f, 0f));

            m_Mag = HUDBuilder.Txt("Mag", dock.transform, new Vector2(1f, 1f), new Vector2(-104, -46), new Vector2(120, 60), "30", 54, HUDBuilder.OffWhite, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_Reserve = HUDBuilder.Txt("Reserve", dock.transform, new Vector2(1f, 1f), new Vector2(-18, -52), new Vector2(84, 30), "/ 150", 22, HUDBuilder.Muted, TextAnchor.MiddleLeft, true, new Vector2(1f, 0.5f));
            m_LowAmmo = HUDBuilder.Txt("LowAmmo", dock.transform, new Vector2(1f, 1f), new Vector2(-18, -10), new Vector2(200, 18), "LOW AMMO", 14, HUDBuilder.Danger, TextAnchor.MiddleRight, true, new Vector2(1f, 1f));
            m_FireModes = HUDBuilder.Txt("FireModes", dock.transform, new Vector2(1f, 1f), new Vector2(-18, -92), new Vector2(240, 20), "", 14, HUDBuilder.Muted, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_FireModes.supportRichText = true;
            m_Frags = HUDBuilder.Txt("Frags", dock.transform, new Vector2(1f, 1f), new Vector2(-18, -118), new Vector2(240, 20), "", 14, HUDBuilder.OffWhite, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_Killstreak = HUDBuilder.Txt("Killstreak", dock.transform, new Vector2(1f, 1f), new Vector2(-18, -140), new Vector2(240, 20), "", 14, HUDBuilder.Muted, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_Killstreak.supportRichText = true;
        }

        void UpdateWeaponDock()
        {
            var ws = LocalPlayer.Weapon;
            var w = ws != null ? ws.Current : null;
            if (w == null) { m_WeaponName.text = ""; return; }
            if (!m_SilhouetteSprites.TryGetValue(w.data.style, out var spr))
            {
                spr = HUDBuilder.SpriteOf(HUDBuilder.WeaponSilhouette(w.data.style));
                m_SilhouetteSprites[w.data.style] = spr;
            }
            m_Silhouette.sprite = spr;
            var rc = RarityUtil.Color(w.rarity);
            m_RarityBar.color = rc;
            m_WeaponName.text = w.DisplayName.ToUpperInvariant();
            m_WeaponName.color = Color.Lerp(Color.white, rc, 0.6f);
            m_WeaponClass.text = $"{w.rarity.ToString().ToUpperInvariant()}  ·  {w.data.className}" + (w.Suppressed ? "  ·  SUPPRESSED" : "");
            for (int i = 0; i < 5; i++)
            {
                bool on = (((int)w.attachments) & (1 << i)) != 0;
                m_Pips[i].color = on ? HUDBuilder.Amber : new Color(1f, 1f, 1f, 0.15f);
            }
            m_Mag.text = w.mag.ToString();
            m_Reserve.text = "/ " + w.reserve;
            bool low = w.mag <= Mathf.CeilToInt(w.MagSize * 0.25f);
            m_LowAmmo.enabled = low && Mathf.Repeat(Time.time, 0.8f) < 0.55f;
            m_LowAmmo.text = w.mag == 0 && w.reserve == 0 ? "NO AMMO" : w.mag == 0 ? "RELOAD" : "LOW AMMO";
            m_Mag.color = low ? Color.Lerp(HUDBuilder.OffWhite, HUDBuilder.Danger, 0.7f) : HUDBuilder.OffWhite;

            var sb = new System.Text.StringBuilder();
            for (int i = 0; i < w.data.fireModes.Length; i++)
            {
                if (i > 0) sb.Append("  |  ");
                string n = w.data.fireModes[i].ToString().ToUpperInvariant();
                sb.Append(i == w.fireModeIndex ? $"<color=#ffb020>{n}</color>" : n);
            }
            m_FireModes.text = sb.ToString() + "   [B]";
            m_Frags.text = $"FRAG x{ws.frags}  [Q]";
            var ks = LocalPlayer.Loadout != null ? LocalPlayer.Loadout.killstreak : KillstreakType.None;
            m_Killstreak.text = ks == KillstreakType.None ? "[3]  —" :
                $"[3]  <color=#ffb020>{(ks == KillstreakType.ReconPulse ? "RECON PULSE" : "ORBITAL LANCE")}</color>";
            var other = ws.Other;
            m_Secondary.text = other != null ? $"[{(ws.currentSlot == 0 ? 2 : 1)}] {other.DisplayName}" : "";
        }

        // ================================================================ prompts, toasts, callouts, contract, card

        void BuildPrompts()
        {
            m_Prompt = HUDBuilder.Txt("Prompt", m_Root, new Vector2(0.5f, 0f), new Vector2(18, 290), new Vector2(700, 30), "", 22, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_HoldRing = HUDBuilder.Img("HoldRing", m_Root, new Vector2(0.5f, 0f), new Vector2(0, 330), new Vector2(40, 40), HUDBuilder.Amber, HUDBuilder.SpriteOf(TextureFactory.Ring(0.18f)));
            m_HoldRing.type = Image.Type.Filled;
            m_HoldRing.fillMethod = Image.FillMethod.Radial360;
            m_HoldRing.fillOrigin = 2;
            m_Callout = HUDBuilder.Txt("Callout", m_Root, new Vector2(0.5f, 0f), new Vector2(0, 230), new Vector2(1000, 28), "", 20, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, false);
            m_Callout.supportRichText = true;

            m_ContractPanel = HUDBuilder.Img("Contract", m_Root, new Vector2(0f, 1f), new Vector2(24, -24), new Vector2(360, 86), HUDBuilder.Panel, null, new Vector2(0f, 1f)).rectTransform;
            HUDBuilder.Img("Accent", m_ContractPanel, new Vector2(0f, 1f), Vector2.zero, new Vector2(4, 86), new Color(1f, 0.82f, 0.1f), null, new Vector2(0f, 1f));
            m_ContractTitle = HUDBuilder.Txt("Title", m_ContractPanel, new Vector2(0f, 1f), new Vector2(16, -16), new Vector2(330, 22), "", 17, new Color(1f, 0.82f, 0.1f), TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_ContractObjective = HUDBuilder.Txt("Obj", m_ContractPanel, new Vector2(0f, 1f), new Vector2(16, -42), new Vector2(330, 22), "", 15, HUDBuilder.OffWhite, TextAnchor.MiddleLeft, false, new Vector2(0f, 0.5f));
            m_ContractBar = HUDBuilder.Bar("Progress", m_ContractPanel, new Vector2(0f, 1f), new Vector2(16, -66), new Vector2(330, 5), new Color(0, 0, 0, 0.5f), new Color(1f, 0.82f, 0.1f), new Vector2(0f, 0.5f));
            m_ContractPanel.gameObject.SetActive(false);

            // weapon comparison card
            m_Card = HUDBuilder.Img("Card", m_Root, new Vector2(0.5f, 0.5f), new Vector2(330, -20), new Vector2(320, 214), new Color(0.03f, 0.04f, 0.05f, 0.85f)).rectTransform;
            m_CardRarity = HUDBuilder.Img("Rarity", m_Card, new Vector2(0.5f, 1f), Vector2.zero, new Vector2(320, 5), Color.white, null, new Vector2(0.5f, 1f));
            m_CardName = HUDBuilder.Txt("Name", m_Card, new Vector2(0f, 1f), new Vector2(14, -24), new Vector2(290, 26), "", 22, Color.white, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_CardInfo = HUDBuilder.Txt("Info", m_Card, new Vector2(0f, 1f), new Vector2(14, -48), new Vector2(290, 18), "", 13, HUDBuilder.Muted, TextAnchor.MiddleLeft, false, new Vector2(0f, 0.5f));
            string[] labels = { "DAMAGE", "FIRE RATE", "RANGE", "MOBILITY", "CONTROL" };
            m_CardBarsNew = new Image[labels.Length];
            m_CardBarsOld = new Image[labels.Length];
            m_CardLabels = new Text[labels.Length];
            for (int i = 0; i < labels.Length; i++)
            {
                float y = -78 - i * 24;
                m_CardLabels[i] = HUDBuilder.Txt("L", m_Card, new Vector2(0f, 1f), new Vector2(14, y), new Vector2(100, 18), labels[i], 12, HUDBuilder.Muted, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
                m_CardBarsOld[i] = HUDBuilder.Bar("Old", m_Card, new Vector2(0f, 1f), new Vector2(110, y), new Vector2(190, 8), new Color(1f, 1f, 1f, 0.08f), new Color(1f, 1f, 1f, 0.35f), new Vector2(0f, 0.5f));
                m_CardBarsNew[i] = HUDBuilder.Img("New", m_CardBarsOld[i].transform.parent, new Vector2(0f, 0.5f), Vector2.zero, new Vector2(190, 4), HUDBuilder.Amber, HUDBuilder.WhiteSprite, new Vector2(0f, 0.5f));
                m_CardBarsNew[i].type = Image.Type.Filled;
                m_CardBarsNew[i].fillMethod = Image.FillMethod.Horizontal;
            }
            m_Card.gameObject.SetActive(false);
        }

        static float[] Stats(WeaponInstance w)
        {
            var d = w.data;
            return new[]
            {
                Mathf.Clamp01(d.damage / 160f),
                Mathf.Clamp01(d.rpm / 1000f),
                Mathf.Clamp01(d.range2 * w.RangeMul / 400f),
                Mathf.Clamp01(d.moveSpeedMultiplier - 0.4f) * Mathf.Clamp01(1.3f - w.AdsTime * 2f),
                Mathf.Clamp01(1.2f - d.recoilVertical * w.RecoilMul / 4f)
            };
        }

        void OnToast(string text)
        {
            var t = HUDBuilder.Txt("Toast", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -175), new Vector2(900, 30), text, 22, HUDBuilder.Amber, TextAnchor.MiddleCenter, true);
            m_Toasts.Insert(0, t);
            m_ToastTimes.Insert(0, Time.time);
            while (m_Toasts.Count > 3) { Destroy(m_Toasts[3].gameObject); m_Toasts.RemoveAt(3); m_ToastTimes.RemoveAt(3); }
        }

        void OnCallout(string speaker, string line)
        {
            m_Callout.text = $"<color=#ff7a5c><b>{speaker}:</b></color>  \"{line}\"";
            m_CalloutTime = Time.time;
        }

        void UpdatePrompts()
        {
            var inter = LocalPlayer.Interactor;
            string prompt = inter != null ? inter.Prompt : null;
            var pc = LocalPlayer.Controller;
            if (string.IsNullOrEmpty(prompt) && LocalPlayer.Weapon != null && LocalPlayer.Weapon.CanMountNow && !LocalPlayer.Weapon.IsMounted && LocalPlayer.Weapon.IsAiming) prompt = "[V] Mount";
            if (string.IsNullOrEmpty(prompt) && LocalPlayer.Loadout != null && LocalPlayer.Loadout.armorPlates > 0 && LocalPlayer.Health.Armor < LocalPlayer.Health.MaxArmor - 1f && !LocalPlayer.Health.IsInsertingPlate && !pc.IsAirborneSkydive && !LocalPlayer.Health.IsDowned)
                prompt = "<size=16>[G] Insert Armour Cell</size>";
            m_Prompt.supportRichText = true;
            m_Prompt.text = prompt ?? "";
            m_HoldRing.enabled = inter != null && inter.HoldProgress > 0f;
            if (m_HoldRing.enabled) m_HoldRing.fillAmount = inter.HoldProgress;

            for (int i = m_Toasts.Count - 1; i >= 0; i--)
            {
                float t = Time.time - m_ToastTimes[i];
                if (t > 3.2f) { Destroy(m_Toasts[i].gameObject); m_Toasts.RemoveAt(i); m_ToastTimes.RemoveAt(i); continue; }
                m_Toasts[i].rectTransform.anchoredPosition = new Vector2(0, -175 - i * 30);
                SetAlpha(m_Toasts[i], Mathf.Clamp01((3.2f - t) / 0.6f) * (i == 0 ? 1f : 0.7f));
            }
            SetAlpha(m_Callout, Mathf.Clamp01((4f - (Time.time - m_CalloutTime)) / 0.6f));

            var ct = ContractTracker.Instance;
            bool active = ct != null && ct.Active;
            m_ContractPanel.gameObject.SetActive(active);
            if (active)
            {
                m_ContractTitle.text = $"{FieldOpsTablet.Title(ct.Type)} CONTRACT   {Clock(ct.TimeLeft)}";
                m_ContractObjective.text = ct.Objective;
                m_ContractBar.fillAmount = ct.Progress;
            }

            // comparison card for focused weapon loot
            var loot = inter != null ? inter.Focus as LootPickup : null;
            bool card = loot != null && loot.type == LootType.Weapon && loot.weapon != null;
            m_Card.gameObject.SetActive(card);
            if (card)
            {
                var nw = loot.weapon;
                var cur = LocalPlayer.Weapon.Current;
                var rc = RarityUtil.Color(nw.rarity);
                m_CardRarity.color = rc;
                m_CardName.text = nw.DisplayName.ToUpperInvariant();
                m_CardName.color = Color.Lerp(Color.white, rc, 0.6f);
                m_CardInfo.text = $"{nw.rarity.ToString().ToUpperInvariant()} {nw.data.className}  ·  {nw.AttachmentCount}/5 ATTACHMENTS";
                var sNew = Stats(nw);
                var sOld = cur != null ? Stats(cur) : new float[sNew.Length];
                for (int i = 0; i < sNew.Length; i++)
                {
                    m_CardBarsOld[i].fillAmount = sOld[i];
                    m_CardBarsNew[i].fillAmount = sNew[i];
                    m_CardBarsNew[i].color = sNew[i] > sOld[i] + 0.02f ? new Color(0.35f, 1f, 0.45f) : sNew[i] < sOld[i] - 0.02f ? HUDBuilder.Danger : HUDBuilder.Amber;
                }
            }
        }

        // ================================================================ menus

        void BuildMenus()
        {
            if (EventSystem.current == null && FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem));
#if ENABLE_INPUT_SYSTEM
                es.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#else
                es.AddComponent<StandaloneInputModule>();
#endif
            }

            var catalog = SupplyTerminalAndLootManager.Catalog;
            m_BuyPanel = HUDBuilder.Img("BuyMenu", m_Root, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(660, 140 + catalog.Length * 66), new Color(0.02f, 0.03f, 0.04f, 0.94f)).rectTransform;
            HUDBuilder.Img("Accent", m_BuyPanel, new Vector2(0.5f, 1f), Vector2.zero, new Vector2(660, 5), new Color(0.3f, 1f, 0.55f), null, new Vector2(0.5f, 1f));
            HUDBuilder.Txt("Title", m_BuyPanel, new Vector2(0f, 1f), new Vector2(24, -34), new Vector2(400, 30), "SUPPLY TERMINAL", 26, HUDBuilder.OffWhite, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            m_BuyCash = HUDBuilder.Txt("Cash", m_BuyPanel, new Vector2(1f, 1f), new Vector2(-24, -34), new Vector2(240, 30), "", 26, HUDBuilder.Amber, TextAnchor.MiddleRight, true, new Vector2(1f, 0.5f));
            m_BuyLabels = new Text[catalog.Length];
            for (int i = 0; i < catalog.Length; i++)
            {
                int idx = i;
                var b = HUDBuilder.Button("Item" + i, m_BuyPanel, new Vector2(0.5f, 1f), new Vector2(0, -96 - i * 66), new Vector2(612, 58), "", 18,
                    () => { if (SupplyTerminalAndLootManager.Instance != null) SupplyTerminalAndLootManager.Instance.Buy(idx); });
                m_BuyLabels[i] = b.GetComponentInChildren<Text>();
            }
            m_BuyMessage = HUDBuilder.Txt("Message", m_BuyPanel, new Vector2(0.5f, 0f), new Vector2(0, 46), new Vector2(600, 24), "", 18, HUDBuilder.Amber, TextAnchor.MiddleCenter, true);
            HUDBuilder.Txt("Close", m_BuyPanel, new Vector2(0.5f, 0f), new Vector2(0, 18), new Vector2(600, 20), "[1-6] OR CLICK TO BUY    ·    [F] / [ESC] CLOSE", 14, HUDBuilder.Muted);
            m_BuyPanel.gameObject.SetActive(false);

            m_KitPanel = HUDBuilder.Img("KitMenu", m_Root, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(660, 360), new Color(0.02f, 0.03f, 0.04f, 0.94f)).rectTransform;
            HUDBuilder.Img("Accent", m_KitPanel, new Vector2(0.5f, 1f), Vector2.zero, new Vector2(660, 5), new Color(1f, 0.75f, 0.15f), null, new Vector2(0.5f, 1f));
            HUDBuilder.Txt("Title", m_KitPanel, new Vector2(0f, 1f), new Vector2(24, -34), new Vector2(600, 30), "KIT POD — SELECT LOADOUT", 26, HUDBuilder.OffWhite, TextAnchor.MiddleLeft, true, new Vector2(0f, 0.5f));
            var defs = StormfallAssets.Instance != null && StormfallAssets.Instance.weapons != null && StormfallAssets.Instance.weapons.Length >= 3 ? StormfallAssets.Instance.weapons : WeaponData.CreateDefaults();
            for (int i = 0; i < KitPod.Kits.Length; i++)
            {
                int idx = i;
                var k = KitPod.Kits[i];
                string label = $"<b>[{i + 1}] {k.name}</b>   <color=#ffc426>{defs[k.primary].displayName}</color> + <color=#ffc426>{defs[k.secondary].displayName}</color>\n<size=13><color=#a8b0b5>Legendary · 5 attachments · Fleetfoot · Quickhands · Bulwark · Tremor Sense</color></size>";
                var b = HUDBuilder.Button("Kit" + i, m_KitPanel, new Vector2(0.5f, 1f), new Vector2(0, -100 - i * 76), new Vector2(612, 66), label, 18,
                    () => { if (KitPod.MenuOpenFor != null) KitPod.MenuOpenFor.Choose(idx); });
                b.GetComponentInChildren<Text>().supportRichText = true;
            }
            HUDBuilder.Txt("Close", m_KitPanel, new Vector2(0.5f, 0f), new Vector2(0, 18), new Vector2(600, 20), "[1-3] OR CLICK TO EQUIP    ·    [ESC] CLOSE", 14, HUDBuilder.Muted);
            m_KitPanel.gameObject.SetActive(false);
        }

        void UpdateMenus()
        {
            var mgr = SupplyTerminalAndLootManager.Instance;
            bool buy = mgr != null && mgr.MenuOpen;
            m_BuyPanel.gameObject.SetActive(buy);
            if (buy)
            {
                var lo = LocalPlayer.Loadout;
                m_BuyCash.text = "$" + lo.cash.ToString("N0");
                var catalog = SupplyTerminalAndLootManager.Catalog;
                for (int i = 0; i < catalog.Length; i++)
                {
                    int price = SupplyTerminalAndLootManager.PriceOf(i);
                    string col = lo.cash >= price ? "#ffb020" : "#ff5a48";
                    m_BuyLabels[i].supportRichText = true;
                    m_BuyLabels[i].text = $"<b>[{i + 1}] {catalog[i].name}</b>   <size=14><color=#a8b0b5>{catalog[i].description}</color></size>      <color={col}><b>${price:N0}</b></color>";
                }
                m_BuyMessage.text = Time.unscaledTime - mgr.LastMessageTime < 2.5f ? mgr.LastMessage : "";
            }
            m_KitPanel.gameObject.SetActive(KitPod.MenuOpenFor != null);
        }

        // ================================================================ end screen

        void BuildEndScreen()
        {
            m_EndPanel = HUDBuilder.FullImg("EndScreen", m_Root, new Color(0.01f, 0.01f, 0.02f, 0.82f)).rectTransform;
            m_EndTitle = HUDBuilder.Txt("Title", m_EndPanel, new Vector2(0.5f, 0.5f), new Vector2(0, 120), new Vector2(1200, 90), "", 72, HUDBuilder.Amber, TextAnchor.MiddleCenter, true);
            m_EndSub = HUDBuilder.Txt("Sub", m_EndPanel, new Vector2(0.5f, 0.5f), new Vector2(0, 50), new Vector2(1200, 40), "", 28, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_EndStats = HUDBuilder.Txt("Stats", m_EndPanel, new Vector2(0.5f, 0.5f), new Vector2(0, -40), new Vector2(1200, 90), "", 22, HUDBuilder.Muted, TextAnchor.MiddleCenter, false);
            HUDBuilder.Txt("Again", m_EndPanel, new Vector2(0.5f, 0.5f), new Vector2(0, -150), new Vector2(1200, 30), "PRESS [ENTER] TO DEPLOY AGAIN", 22, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_EndPanel.gameObject.SetActive(false);
        }

        void UpdateEndScreen()
        {
            var ring = StormRingAndMatchManager.Instance;
            bool ended = ring != null && ring.Phase == MatchPhase.Ended;
            m_EndPanel.gameObject.SetActive(ended);
            if (!ended) return;
            m_EndTitle.text = ring.Victory ? "STORMFALL CHAMPION" : "ELIMINATED";
            m_EndTitle.color = ring.Victory ? HUDBuilder.Amber : HUDBuilder.Danger;
            m_EndSub.text = ring.Victory ? "#1 — LAST ONE STANDING ON KALDERA ISLE" : $"PLACED #{ring.Placement}";
            var lo = LocalPlayer.Loadout;
            m_EndStats.text = $"KILLS  {lo.kills}        XP  {lo.xp:N0}        CASH  ${lo.cash:N0}        TIME  {Clock(ring.MatchTime)}";
        }
    }
}
