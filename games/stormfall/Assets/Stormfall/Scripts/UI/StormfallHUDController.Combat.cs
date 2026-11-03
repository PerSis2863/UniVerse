using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Stormfall
{
    public partial class StormfallHUDController
    {
        // crosshair
        Image[] m_Ticks;
        Image m_Dot;
        Image m_ReloadBar;
        Text m_ReloadText;

        // hitmarkers
        RectTransform m_Hit;
        Image[] m_HitInner, m_HitOuter;
        Image m_Shield;
        Text m_CellBroken;
        readonly List<Image> m_Shards = new List<Image>();
        readonly List<Vector2> m_ShardDir = new List<Vector2>();
        float m_HitTime = -10f, m_BrokenTime = -10f;
        int m_HitTier;

        // XP feed
        readonly List<Text> m_XpLines = new List<Text>();
        readonly List<float> m_XpTimes = new List<float>();
        RectTransform m_XpRoot;

        // damage arcs
        readonly List<RectTransform> m_ArcPivots = new List<RectTransform>();
        readonly List<Image> m_Arcs = new List<Image>();
        readonly List<Vector3> m_ArcFrom = new List<Vector3>();
        readonly List<float> m_ArcTime = new List<float>();

        // world markers
        Image m_ObjectiveMarker;
        Text m_ObjectiveDistance;
        readonly List<Image> m_GrenadeIcons = new List<Image>();

        // overlays
        Image m_Blood, m_HitFlash, m_GasTint, m_MaskVisor, m_ScopeImg, m_ScopeLeft, m_ScopeRight, m_DownedTint;
        RectTransform m_ScopeRoot, m_DesignatorRoot, m_DownedRoot;
        Text m_MaskText, m_ScopeHint, m_DesignatorRange, m_DownedTimer, m_DownedHint, m_BigHint, m_Altitude, m_TrialText, m_ControlsText;
        Image m_DownedBar, m_BreathBar;
        float m_HitFlashA;

        // ================================================================ build

        void BuildOverlays()
        {
            var edge = HUDBuilder.SpriteOf(TextureFactory.RadialEdge());
            m_GasTint = HUDBuilder.FullImg("GasTint", m_Root, new Color(0.55f, 0.75f, 0.1f, 0f), edge);
            m_Blood = HUDBuilder.FullImg("Blood", m_Root, new Color(0.7f, 0.02f, 0.02f, 0f), edge);
            m_HitFlash = HUDBuilder.FullImg("HitFlash", m_Root, new Color(0.9f, 0.05f, 0.03f, 0f), edge);
            m_DownedTint = HUDBuilder.FullImg("DownedTint", m_Root, new Color(0.35f, 0f, 0f, 0f));
            m_MaskVisor = HUDBuilder.FullImg("MaskVisor", m_Root, new Color(0f, 0f, 0f, 0f), edge);
            m_MaskText = HUDBuilder.Txt("MaskText", m_Root, new Vector2(0.5f, 0f), new Vector2(0, 250), new Vector2(400, 24), "", 16, new Color(0.75f, 0.95f, 0.4f), TextAnchor.MiddleCenter, true);

            // sniper scope: square mask + black side bars
            m_ScopeRoot = HUDBuilder.Stretch("Scope", m_Root);
            m_ScopeImg = HUDBuilder.Img("Mask", m_ScopeRoot, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1080, 1080), Color.white, HUDBuilder.SpriteOf(HUDBuilder.ScopeMask()));
            m_ScopeLeft = HUDBuilder.Img("L", m_ScopeRoot, new Vector2(0f, 0.5f), Vector2.zero, new Vector2(500, 1200), Color.black, null, new Vector2(0f, 0.5f));
            m_ScopeRight = HUDBuilder.Img("R", m_ScopeRoot, new Vector2(1f, 0.5f), Vector2.zero, new Vector2(500, 1200), Color.black, null, new Vector2(1f, 0.5f));
            m_ScopeHint = HUDBuilder.Txt("Hint", m_ScopeRoot, new Vector2(0.5f, 0f), new Vector2(0, 150), new Vector2(500, 24), "HOLD [SHIFT] TO STEADY", 16, HUDBuilder.OffWhite);
            m_BreathBar = HUDBuilder.Bar("Breath", m_ScopeRoot, new Vector2(0.5f, 0f), new Vector2(0, 128), new Vector2(220, 5), new Color(0, 0, 0, 0.6f), HUDBuilder.OffWhite);
            m_ScopeRoot.gameObject.SetActive(false);

            // orbital lance designator
            m_DesignatorRoot = HUDBuilder.Stretch("Designator", m_Root);
            HUDBuilder.FullImg("Tint", m_DesignatorRoot, new Color(0.05f, 0.1f, 0.12f, 0.25f));
            foreach (var c in new[] { new Vector2(-1, -1), new Vector2(1, -1), new Vector2(-1, 1), new Vector2(1, 1) })
            {
                HUDBuilder.Img("CornerH", m_DesignatorRoot, new Vector2(0.5f, 0.5f), new Vector2(c.x * 300, c.y * 180), new Vector2(60, 3), HUDBuilder.Amber);
                HUDBuilder.Img("CornerV", m_DesignatorRoot, new Vector2(0.5f, 0.5f), new Vector2(c.x * 328, c.y * 156), new Vector2(3, 50), HUDBuilder.Amber);
            }
            HUDBuilder.Img("Ret", m_DesignatorRoot, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(46, 46), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.Ring(0.08f)));
            m_DesignatorRange = HUDBuilder.Txt("Range", m_DesignatorRoot, new Vector2(0.5f, 0.5f), new Vector2(0, -60), new Vector2(300, 24), "", 18, HUDBuilder.Amber, TextAnchor.MiddleCenter, true);
            HUDBuilder.Txt("Help", m_DesignatorRoot, new Vector2(0.5f, 0f), new Vector2(0, 180), new Vector2(700, 26), "ORBITAL LANCE   [LMB] DESIGNATE   [RMB] CANCEL", 18, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_DesignatorRoot.gameObject.SetActive(false);

            // downed
            m_DownedRoot = HUDBuilder.Stretch("Downed", m_Root);
            HUDBuilder.Txt("Title", m_DownedRoot, new Vector2(0.5f, 0.5f), new Vector2(0, 120), new Vector2(600, 60), "DOWNED", 48, HUDBuilder.Danger, TextAnchor.MiddleCenter, true);
            m_DownedTimer = HUDBuilder.Txt("Timer", m_DownedRoot, new Vector2(0.5f, 0.5f), new Vector2(0, 75), new Vector2(600, 30), "", 24, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_DownedHint = HUDBuilder.Txt("Hint", m_DownedRoot, new Vector2(0.5f, 0.5f), new Vector2(0, -90), new Vector2(700, 26), "", 20, HUDBuilder.OffWhite);
            m_DownedBar = HUDBuilder.Bar("Revive", m_DownedRoot, new Vector2(0.5f, 0.5f), new Vector2(0, -118), new Vector2(320, 8), new Color(0, 0, 0, 0.6f), new Color(0.3f, 1f, 0.5f));
            m_DownedRoot.gameObject.SetActive(false);

            m_BigHint = HUDBuilder.Txt("BigHint", m_Root, new Vector2(0.5f, 0.5f), new Vector2(0, -200), new Vector2(900, 34), "", 26, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_Altitude = HUDBuilder.Txt("Altitude", m_Root, new Vector2(0.5f, 0.5f), new Vector2(260, 0), new Vector2(200, 30), "", 22, HUDBuilder.Amber, TextAnchor.MiddleLeft, true);
            m_TrialText = HUDBuilder.Txt("Trial", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -140), new Vector2(700, 30), "", 24, HUDBuilder.Danger, TextAnchor.MiddleCenter, true);
            m_ControlsText = HUDBuilder.Txt("Controls", m_Root, new Vector2(0f, 0.8f), new Vector2(24, 0), new Vector2(520, 300),
                "<b><color=#ffb020>STORMFALL</color></b>  — controls\n" +
                "WASD move · Shift sprint (double-tap: tactical) · C crouch/slide/dive\n" +
                "Space jump/mantle/slide-cancel · LMB fire · RMB aim · R reload\n" +
                "1/2 weapons · B fire mode · Q frag · G armour cells · V mount\n" +
                "F interact (hold to self-revive) · 3 killstreak · M tac-map · Esc cursor",
                15, HUDBuilder.Muted, TextAnchor.UpperLeft, false, new Vector2(0f, 1f));
            m_ControlsText.supportRichText = true;
        }

        void BuildCenter()
        {
            var center = HUDBuilder.Rect("Center", m_Root, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            m_Ticks = new Image[4];
            for (int i = 0; i < 4; i++)
                m_Ticks[i] = HUDBuilder.Img("Tick", center, new Vector2(0.5f, 0.5f), Vector2.zero, i < 2 ? new Vector2(12, 2.5f) : new Vector2(2.5f, 12), HUDBuilder.OffWhite);
            m_Dot = HUDBuilder.Img("Dot", center, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(3, 3), HUDBuilder.OffWhite);
            m_ReloadText = HUDBuilder.Txt("Reload", center, new Vector2(0.5f, 0.5f), new Vector2(0, -60), new Vector2(200, 20), "RELOADING", 14, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_ReloadBar = HUDBuilder.Bar("ReloadBar", center, new Vector2(0.5f, 0.5f), new Vector2(0, -76), new Vector2(110, 4), new Color(0, 0, 0, 0.5f), HUDBuilder.OffWhite);

            m_Hit = HUDBuilder.Rect("Hitmarker", center, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(60, 60));
            m_HitInner = MakeX(m_Hit, 10f, new Vector2(13, 3));
            m_HitOuter = MakeX(m_Hit, 20f, new Vector2(16, 3.5f));
            m_Shield = HUDBuilder.Img("Shield", m_Hit, new Vector2(0.5f, 0.5f), new Vector2(0, 38), new Vector2(16, 18), HUDBuilder.Cyan, HUDBuilder.SpriteOf(TextureFactory.Diamond()));
            m_CellBroken = HUDBuilder.Txt("CellBroken", center, new Vector2(0.5f, 0.5f), new Vector2(0, 70), new Vector2(240, 22), "CELL BROKEN", 16, HUDBuilder.Cyan, TextAnchor.MiddleCenter, true);
            for (int i = 0; i < 8; i++)
            {
                float a = i / 8f * Mathf.PI * 2f + 0.3f;
                var s = HUDBuilder.Img("Shard", center, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(7, 3), HUDBuilder.Cyan);
                s.rectTransform.localRotation = Quaternion.Euler(0, 0, a * Mathf.Rad2Deg);
                m_Shards.Add(s);
                m_ShardDir.Add(new Vector2(Mathf.Cos(a), Mathf.Sin(a)));
            }

            m_XpRoot = HUDBuilder.Rect("XP", m_Root, new Vector2(0.5f, 0.5f), new Vector2(0f, 0.5f), new Vector2(70, 40), new Vector2(300, 200));

            for (int i = 0; i < 6; i++)
            {
                var pivot = HUDBuilder.Rect("ArcPivot", center, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
                var arc = HUDBuilder.Img("Arc", pivot, new Vector2(0.5f, 0.5f), new Vector2(0, 175), new Vector2(170, 60), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.DamageArc()));
                arc.enabled = false;
                m_ArcPivots.Add(pivot);
                m_Arcs.Add(arc);
                m_ArcFrom.Add(Vector3.zero);
                m_ArcTime.Add(-10f);
            }

            m_ObjectiveMarker = HUDBuilder.Img("ObjMarker", center, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(22, 22), new Color(1f, 0.82f, 0.1f), HUDBuilder.SpriteOf(TextureFactory.Diamond()));
            m_ObjectiveDistance = HUDBuilder.Txt("Dist", m_ObjectiveMarker.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -22), new Vector2(120, 20), "", 14, new Color(1f, 0.85f, 0.3f), TextAnchor.MiddleCenter, true);
            for (int i = 0; i < 4; i++)
            {
                var g = HUDBuilder.Img("Grenade", center, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(40, 40), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.Ring(0.12f)));
                HUDBuilder.Img("Core", g.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.HardCircle()));
                HUDBuilder.Txt("Label", g.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -30), new Vector2(120, 18), "FRAG", 13, HUDBuilder.Danger, TextAnchor.MiddleCenter, true);
                g.gameObject.SetActive(false);
                m_GrenadeIcons.Add(g);
            }
        }

        static Image[] MakeX(Transform parent, float offset, Vector2 size)
        {
            var bars = new Image[4];
            for (int i = 0; i < 4; i++)
            {
                float a = 45f + 90f * i;
                Vector2 dir = new Vector2(Mathf.Cos(a * Mathf.Deg2Rad), Mathf.Sin(a * Mathf.Deg2Rad));
                bars[i] = HUDBuilder.Img("X", parent, new Vector2(0.5f, 0.5f), dir * offset, size, Color.white);
                bars[i].rectTransform.localRotation = Quaternion.Euler(0, 0, a);
            }
            return bars;
        }

        // ================================================================ events

        void OnDamageDealt(GameObject attacker, IDamageable victim, DamageResult r, Vector3 point)
        {
            if (!LocalPlayer.IsPlayer(attacker)) return;
            if (victim is PlayerHealthArmor ph && ph.isPlayer) return;
            int tier = r.killed || r.downed || r.headshot ? 3 : r.cellBroken ? 2 : r.hitArmor ? 1 : 0;
            if (Time.time - m_HitTime < 0.15f) tier = Mathf.Max(tier, m_HitTier);
            m_HitTier = tier;
            m_HitTime = Time.time;
            if (r.cellBroken) m_BrokenTime = Time.time;
            if (r.killed || r.downed) AudioFX.Play2D(Sfx.KillChime, 0.75f);
            else if (r.headshot) AudioFX.Play2D(Sfx.HeadshotDing, 0.7f);
            else if (r.cellBroken) AudioFX.Play2D(Sfx.ArmorCrack, 0.75f);
            else AudioFX.Play2D(Sfx.HitTick, 0.55f, r.hitArmor ? 1.35f : 1f);
        }

        void OnXp(int amount, string label)
        {
            var t = HUDBuilder.Txt("Xp", m_XpRoot, new Vector2(0f, 1f), Vector2.zero, new Vector2(300, 26), $"+{amount}  {label}", 20, new Color(1f, 0.86f, 0.25f), TextAnchor.MiddleLeft, true, new Vector2(0f, 1f));
            m_XpLines.Insert(0, t);
            m_XpTimes.Insert(0, Time.time);
            while (m_XpLines.Count > 6) { Destroy(m_XpLines[6].gameObject); m_XpLines.RemoveAt(6); m_XpTimes.RemoveAt(6); }
        }

        void OnPlayerDamaged(Vector3 from)
        {
            m_HitFlashA = Mathf.Min(0.45f, m_HitFlashA + 0.25f);
            int slot = 0;
            float oldest = float.MaxValue;
            for (int i = 0; i < m_ArcTime.Count; i++)
            {
                if ((m_ArcFrom[i] - from).sqrMagnitude < 4f && Time.time - m_ArcTime[i] < 1.5f) { slot = i; oldest = -1f; break; }
                if (m_ArcTime[i] < oldest) { oldest = m_ArcTime[i]; slot = i; }
            }
            m_ArcFrom[slot] = from;
            m_ArcTime[slot] = Time.time;
        }

        // ================================================================ update

        void UpdateCenter()
        {
            var w = LocalPlayer.Weapon;
            var pc = LocalPlayer.Controller;
            var h = LocalPlayer.Health;
            bool weaponVisible = w != null && w.Current != null && !pc.IsAirborneSkydive && !h.IsDowned && !(LocalPlayer.Killstreaks != null && LocalPlayer.Killstreaks.IsDesignating);

            // ---- crosshair ----
            float alpha = weaponVisible ? (1f - w.AdsAmount) * (pc.IsSprinting ? 0.25f : 1f) * (w.IsReloading ? 0.5f : 1f) : 0f;
            float vfov = LocalPlayer.Camera.fieldOfView;
            float gap = weaponVisible ? Mathf.Tan(w.CurrentSpreadDeg * Mathf.Deg2Rad) / Mathf.Tan(vfov * 0.5f * Mathf.Deg2Rad) * (m_Root.rect.height * 0.5f) + 6f : 10f;
            m_Ticks[0].rectTransform.anchoredPosition = new Vector2(-gap - 6f, 0);
            m_Ticks[1].rectTransform.anchoredPosition = new Vector2(gap + 6f, 0);
            m_Ticks[2].rectTransform.anchoredPosition = new Vector2(0, gap + 6f);
            m_Ticks[3].rectTransform.anchoredPosition = new Vector2(0, -gap - 6f);
            foreach (var t in m_Ticks) SetAlpha(t, alpha);
            SetAlpha(m_Dot, alpha * 0.9f);

            bool reloading = weaponVisible && w.IsReloading;
            m_ReloadText.enabled = reloading;
            m_ReloadBar.transform.parent.gameObject.SetActive(reloading);
            if (reloading) m_ReloadBar.fillAmount = w.ReloadProgress;

            // ---- hitmarker ----
            float age = Time.time - m_HitTime;
            bool showHit = age < 0.28f;
            m_Hit.gameObject.SetActive(showHit);
            if (showHit)
            {
                float a = 1f - age / 0.28f;
                float scale = 1f + 0.35f * Mathf.Exp(-age * 30f);
                m_Hit.localScale = Vector3.one * scale;
                Color c = m_HitTier == 3 ? HUDBuilder.Danger : m_HitTier >= 1 ? HUDBuilder.Cyan : Color.white;
                c.a = a;
                foreach (var b in m_HitInner) b.color = c;
                foreach (var b in m_HitOuter) { b.color = c; b.enabled = m_HitTier == 3; }
                m_Shield.enabled = m_HitTier == 1 || m_HitTier == 2;
                SetAlpha(m_Shield, a);
            }
            float bAge = Time.time - m_BrokenTime;
            bool broken = bAge < 0.9f;
            m_CellBroken.enabled = broken;
            if (broken)
            {
                SetAlpha(m_CellBroken, 1f - bAge / 0.9f);
                m_CellBroken.rectTransform.anchoredPosition = new Vector2(0, 62 + bAge * 20f);
            }
            for (int i = 0; i < m_Shards.Count; i++)
            {
                bool on = bAge < 0.4f;
                m_Shards[i].enabled = on;
                if (!on) continue;
                float d = 14f + Ease.OutCubic(bAge / 0.4f) * 46f;
                m_Shards[i].rectTransform.anchoredPosition = m_ShardDir[i] * d;
                SetAlpha(m_Shards[i], 1f - bAge / 0.4f);
            }

            // ---- XP feed ----
            for (int i = m_XpLines.Count - 1; i >= 0; i--)
            {
                float t = Time.time - m_XpTimes[i];
                if (t > 2.8f) { Destroy(m_XpLines[i].gameObject); m_XpLines.RemoveAt(i); m_XpTimes.RemoveAt(i); continue; }
                var rt = m_XpLines[i].rectTransform;
                rt.anchoredPosition = Vector2.Lerp(rt.anchoredPosition, new Vector2(i == 0 ? Mathf.Lerp(-30f, 0f, Mathf.Clamp01(t * 8f)) : 0f, -i * 26f), 1f - Mathf.Exp(-16f * m_Dt));
                SetAlpha(m_XpLines[i], Mathf.Clamp01((2.8f - t) / 0.5f) * (i == 0 ? 1f : 0.8f));
                m_XpLines[i].fontSize = i == 0 ? 22 : 18;
            }

            // ---- damage arcs ----
            Vector3 camFwd = LocalPlayer.Camera.transform.forward; camFwd.y = 0;
            for (int i = 0; i < m_Arcs.Count; i++)
            {
                float t = Time.time - m_ArcTime[i];
                bool on = t < 1.6f;
                m_Arcs[i].enabled = on;
                if (!on) continue;
                Vector3 to = m_ArcFrom[i] - LocalPlayer.Position; to.y = 0;
                float ang = Vector3.SignedAngle(camFwd, to, Vector3.up);
                m_ArcPivots[i].localRotation = Quaternion.Euler(0, 0, -ang);
                SetAlpha(m_Arcs[i], Mathf.Clamp01(1f - t / 1.6f) * 0.9f);
            }

            // ---- objective marker ----
            var ct = ContractTracker.Instance;
            bool obj = ct != null && ct.Active && ct.HasMarker && !RebootTrial.PlayerInTrial;
            m_ObjectiveMarker.enabled = obj;
            m_ObjectiveDistance.enabled = obj;
            if (obj)
            {
                WorldToCanvas(ct.MarkerPosition + Vector3.up * 2f, out var cp, out bool onScreen);
                m_ObjectiveMarker.rectTransform.anchoredPosition = onScreen ? cp : ClampToEdge(cp, 60f);
                m_ObjectiveDistance.text = Mathf.RoundToInt(Vector3.Distance(LocalPlayer.Position, ct.MarkerPosition)) + "m";
            }

            // ---- grenade danger ----
            int gi = 0;
            foreach (var g in FragGrenade.Live)
            {
                if (gi >= m_GrenadeIcons.Count) break;
                if (g == null || (g.transform.position - LocalPlayer.Position).sqrMagnitude > 10f * 10f) continue;
                var icon = m_GrenadeIcons[gi++];
                icon.gameObject.SetActive(true);
                WorldToCanvas(g.transform.position, out var cp, out bool onScreen);
                icon.rectTransform.anchoredPosition = onScreen ? cp : ClampToEdge(cp, 80f);
                float pulse = 0.6f + 0.4f * Mathf.Sin(Time.time * 18f);
                icon.rectTransform.localScale = Vector3.one * (0.9f + 0.25f * pulse);
            }
            for (; gi < m_GrenadeIcons.Count; gi++) m_GrenadeIcons[gi].gameObject.SetActive(false);
        }

        void UpdateOverlays()
        {
            var h = LocalPlayer.Health;
            var pc = LocalPlayer.Controller;
            var w = LocalPlayer.Weapon;
            var ring = StormRingAndMatchManager.Instance;

            // low HP blood + heartbeat pulse (1.1 Hz)
            float low = h.IsDowned ? 0.75f : h.Health < h.lowHealthThreshold ? (1f - h.Health / h.lowHealthThreshold) * 0.85f : 0f;
            float pulse = 0.75f + 0.25f * Mathf.Sin(Time.time * Mathf.PI * 2f * 1.1f);
            SetAlpha(m_Blood, h.IsDead ? 0f : low * pulse);
            m_HitFlashA = Mathf.Max(0f, m_HitFlashA - m_Dt * 1.6f);
            SetAlpha(m_HitFlash, m_HitFlashA);
            SetAlpha(m_DownedTint, h.IsDowned ? 0.25f : 0f);

            bool inGas = ring != null && ring.PlayerInGas;
            bool mask = ring != null && ring.PlayerMaskActive;
            SetAlpha(m_GasTint, inGas && !mask ? 0.6f + 0.15f * Mathf.Sin(Time.time * 2f) : 0f);
            SetAlpha(m_MaskVisor, mask ? 0.85f : 0f);
            m_MaskText.text = mask ? $"GAS MASK  {LocalPlayer.Loadout.gasMaskTicks}/10" : "";

            // scope
            bool scoped = w != null && w.IsScopedView && !h.IsDowned;
            m_ScopeRoot.gameObject.SetActive(scoped);
            if (scoped)
            {
                float H = m_Root.rect.height, W = m_Root.rect.width;
                m_ScopeImg.rectTransform.sizeDelta = new Vector2(H, H);
                float side = Mathf.Max(0f, (W - H) * 0.5f + 2f);
                m_ScopeLeft.rectTransform.sizeDelta = new Vector2(side, H + 10f);
                m_ScopeRight.rectTransform.sizeDelta = new Vector2(side, H + 10f);
                m_BreathBar.fillAmount = w.BreathFraction;
                m_ScopeHint.text = w.HoldingBreath ? "STEADY" : w.BreathFraction < 0.05f ? "WINDED" : "HOLD [SHIFT] TO STEADY";
            }

            var ks = LocalPlayer.Killstreaks;
            bool designating = ks != null && ks.IsDesignating;
            m_DesignatorRoot.gameObject.SetActive(designating);
            if (designating)
                m_DesignatorRange.text = ks.DesignationValid ? $"RANGE {Mathf.RoundToInt(Vector3.Distance(LocalPlayer.Position, ks.DesignationPoint))}m — LOCK READY" : "NO VALID TARGET";

            // downed
            m_DownedRoot.gameObject.SetActive(h.IsDowned);
            if (h.IsDowned)
            {
                m_DownedTimer.text = "BLEEDING OUT  " + Clock(h.DownedTimeLeft);
                bool stim = LocalPlayer.Loadout != null && LocalPlayer.Loadout.selfRevive;
                m_DownedHint.text = stim ? "HOLD [F] TO SELF-REVIVE" : "NO STIM REVIVER — CRAWL TO SAFETY";
                m_DownedBar.transform.parent.gameObject.SetActive(stim);
                m_DownedBar.fillAmount = h.SelfReviveProgress;
            }

            // infil / skydive hints
            string hint = "";
            switch (pc.State)
            {
                case MoveState.InAircraft: hint = "[SPACE] JUMP"; break;
                case MoveState.Freefall: hint = pc.HeightAboveGround > pc.chuteMinHeight ? "[SPACE] DEPLOY CHUTE    [W] + LOOK DOWN TO DIVE" : ""; break;
                case MoveState.Parachute: hint = "[C] CUT CHUTE"; break;
            }
            if (ring != null && ring.Phase == MatchPhase.Ended) hint = "";
            m_BigHint.text = hint;
            bool sky = pc.State == MoveState.Freefall || pc.State == MoveState.Parachute || pc.State == MoveState.InAircraft;
            m_Altitude.text = sky ? $"ALT {Mathf.RoundToInt(pc.HeightAboveGround)}m\n{Mathf.RoundToInt(-pc.Velocity.y)} m/s" : "";

            var trial = RebootTrial.Instance;
            m_TrialText.text = RebootTrial.PlayerInTrial && trial != null ? $"REBOOT TRIAL   SENTRIES {trial.DronesRemaining}   {Clock(trial.TimeLeft)}" : "";

            float ct = ring != null ? ring.MatchTime : Time.timeSinceLevelLoad;
            m_ControlsText.enabled = ct < 25f || (m_TacOpen);
        }
    }
}
