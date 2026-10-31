using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Stormfall
{
    public partial class StormfallHUDController
    {
        // ---------------------------------------------------------------- compass
        const float PxPerDeg = 4f;
        const float CompassWidth = 720f;
        RectTransform m_CompassStrip;
        Text m_Heading, m_PoiBanner;
        readonly List<Image> m_ShotDiamonds = new List<Image>();
        readonly List<float> m_ShotBearings = new List<float>(), m_ShotTimes = new List<float>();
        Image m_CompassObjective;
        string m_LastPoi;
        float m_PoiFlash;

        // ---------------------------------------------------------------- minimap
        const float MiniSize = 270f, MiniMeters = 230f;
        float MiniPxPerM => MiniSize / MiniMeters;
        RectTransform m_MiniRot;
        RawImage m_MiniMap, m_TacMapImage;
        Image m_MiniRing, m_MiniNext, m_TacRing, m_TacNext;
        Text m_AliveText, m_BlightText;
        readonly List<Image> m_MiniStatic = new List<Image>();
        readonly List<Vector3> m_MiniStaticPos = new List<Vector3>();
        readonly List<Component> m_MiniStaticOwner = new List<Component>();
        readonly List<Image> m_MiniPings = new List<Image>();
        readonly List<Vector3> m_PingPos = new List<Vector3>();
        readonly List<float> m_PingTime = new List<float>();
        readonly List<Color> m_PingColor = new List<Color>();
        Image m_MiniObjective, m_MiniSweep;
        float m_ReconSweepTimer;

        // ---------------------------------------------------------------- tac map
        RectTransform m_TacPanel;
        const float TacSize = 860f;
        Image m_TacPlayer;
        readonly List<Image> m_TacIcons = new List<Image>();
        bool m_TacOpen;

        void BuildCompass()
        {
            var panel = HUDBuilder.Img("Compass", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -22), new Vector2(CompassWidth, 40), new Color(0, 0, 0, 0.35f), null, new Vector2(0.5f, 1f));
            panel.gameObject.AddComponent<RectMask2D>();
            m_CompassStrip = HUDBuilder.Rect("Strip", panel.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(10, 40));
            string[] cardinals = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            for (int deg = -360; deg <= 720; deg += 5)
            {
                int d = ((deg % 360) + 360) % 360;
                bool major = d % 15 == 0;
                bool cardinal = d % 45 == 0;
                HUDBuilder.Img("T", m_CompassStrip, new Vector2(0.5f, 0.5f), new Vector2(deg * PxPerDeg, cardinal ? -12 : -15), new Vector2(cardinal ? 3 : 2, cardinal ? 14 : major ? 10 : 5),
                    cardinal ? HUDBuilder.OffWhite : HUDBuilder.Muted);
                if (major)
                {
                    string label = cardinal ? cardinals[d / 45] : d.ToString();
                    HUDBuilder.Txt("L", m_CompassStrip, new Vector2(0.5f, 0.5f), new Vector2(deg * PxPerDeg, 6), new Vector2(50, 20), label,
                        cardinal ? 19 : 13, d == 0 ? HUDBuilder.Amber : cardinal ? HUDBuilder.OffWhite : HUDBuilder.Muted, TextAnchor.MiddleCenter, cardinal);
                }
            }
            for (int i = 0; i < 8; i++)
            {
                var dia = HUDBuilder.Img("Shot", panel.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.Diamond()));
                dia.enabled = false;
                m_ShotDiamonds.Add(dia);
            }
            m_CompassObjective = HUDBuilder.Img("Objective", panel.transform, new Vector2(0.5f, 0.5f), new Vector2(0, -4), new Vector2(14, 14), new Color(1f, 0.82f, 0.1f), HUDBuilder.SpriteOf(TextureFactory.Diamond()));
            m_CompassObjective.enabled = false;
            var marker = HUDBuilder.Img("Marker", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -64), new Vector2(14, 10), HUDBuilder.Amber, HUDBuilder.SpriteOf(TextureFactory.Triangle()));
            marker.rectTransform.localRotation = Quaternion.Euler(0, 0, 0);
            m_Heading = HUDBuilder.Txt("Heading", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -80), new Vector2(80, 22), "000", 16, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
            m_PoiBanner = HUDBuilder.Txt("POI", m_Root, new Vector2(0.5f, 1f), new Vector2(0, -106), new Vector2(600, 30), "", 22, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
        }

        void UpdateCompass()
        {
            var cam = LocalPlayer.Camera.transform;
            float yaw = cam.eulerAngles.y;
            m_CompassStrip.anchoredPosition = new Vector2(-yaw * PxPerDeg, 0);
            m_Heading.text = Mathf.RoundToInt(yaw % 360f).ToString("000");

            string poi = RebootTrial.PlayerInTrial ? "REBOOT TRIAL" : LocalPlayer.Controller.State == MoveState.InAircraft ? "SKYHAULER — ROUTE OVER KALDERA ISLE" : WorldInfo.PoiAt(LocalPlayer.Position).ToUpperInvariant();
            if (poi != m_LastPoi) { m_LastPoi = poi; m_PoiFlash = 1f; }
            m_PoiFlash = Mathf.Max(0f, m_PoiFlash - m_Dt * 0.7f);
            m_PoiBanner.text = poi;
            m_PoiBanner.color = Color.Lerp(new Color(0.94f, 0.95f, 0.93f, 0.75f), HUDBuilder.Amber, m_PoiFlash);
            m_PoiBanner.fontSize = 20 + Mathf.RoundToInt(m_PoiFlash * 6f);

            for (int i = m_ShotTimes.Count - 1; i >= 0; i--)
            {
                float age = Time.time - m_ShotTimes[i];
                if (age > 3f) { m_ShotTimes.RemoveAt(i); m_ShotBearings.RemoveAt(i); }
            }
            for (int i = 0; i < m_ShotDiamonds.Count; i++)
            {
                var d = m_ShotDiamonds[i];
                if (i >= m_ShotTimes.Count) { d.enabled = false; continue; }
                float delta = Mathf.DeltaAngle(yaw, m_ShotBearings[i]);
                d.enabled = Mathf.Abs(delta) < CompassWidth * 0.5f / PxPerDeg - 4f;
                d.rectTransform.anchoredPosition = new Vector2(delta * PxPerDeg, -4f);
                float age = Time.time - m_ShotTimes[i];
                float pulse = 0.6f + 0.4f * Mathf.Sin(Time.time * 14f);
                SetAlpha(d, (1f - age / 3f) * pulse);
            }

            var ct = ContractTracker.Instance;
            bool showObj = ct != null && ct.Active && ct.HasMarker;
            m_CompassObjective.enabled = false;
            if (showObj)
            {
                Vector3 to = ct.MarkerPosition - LocalPlayer.Position;
                float bearing = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg;
                float delta = Mathf.DeltaAngle(yaw, bearing);
                if (Mathf.Abs(delta) < 85f)
                {
                    m_CompassObjective.enabled = true;
                    m_CompassObjective.rectTransform.anchoredPosition = new Vector2(delta * PxPerDeg, -4f);
                }
            }
        }

        void OnShotFired(GameObject shooter, Vector3 pos, bool suppressed)
        {
            if (suppressed || !LocalPlayer.Exists || LocalPlayer.IsPlayer(shooter)) return;
            Vector3 to = pos - LocalPlayer.Position;
            if (to.sqrMagnitude > 220f * 220f) return;
            float bearing = Mathf.Atan2(to.x, to.z) * Mathf.Rad2Deg;
            // merge with an existing marker in the same direction
            for (int i = 0; i < m_ShotBearings.Count; i++)
                if (Mathf.Abs(Mathf.DeltaAngle(m_ShotBearings[i], bearing)) < 6f) { m_ShotBearings[i] = bearing; m_ShotTimes[i] = Time.time; AddPing(pos, HUDBuilder.Danger, 3f); return; }
            if (m_ShotTimes.Count >= m_ShotDiamonds.Count) { m_ShotTimes.RemoveAt(0); m_ShotBearings.RemoveAt(0); }
            m_ShotBearings.Add(bearing);
            m_ShotTimes.Add(Time.time);
            AddPing(pos, HUDBuilder.Danger, 3f);
        }

        void OnBotFootstep(Vector3 pos)
        {
            if (LocalPlayer.Loadout == null || !LocalPlayer.Loadout.HasPerk(Perk.TremorSense)) return;
            if ((pos - LocalPlayer.Position).sqrMagnitude > 30f * 30f) return;
            AddPing(pos, new Color(1f, 0.55f, 0.2f), 1.2f);
        }

        void AddPing(Vector3 pos, Color c, float life)
        {
            if (m_PingPos.Count >= 48) { m_PingPos.RemoveAt(0); m_PingTime.RemoveAt(0); m_PingColor.RemoveAt(0); }
            m_PingPos.Add(pos);
            m_PingTime.Add(Time.time + life);
            m_PingColor.Add(c);
        }

        // ================================================================ minimap

        void BuildMinimap()
        {
            var frame = HUDBuilder.Img("MinimapFrame", m_Root, new Vector2(1f, 1f), new Vector2(-28, -24), new Vector2(MiniSize + 8, MiniSize + 8), new Color(0f, 0f, 0f, 0.55f), HUDBuilder.SpriteOf(TextureFactory.HardCircle()), new Vector2(1f, 1f));
            var ring = HUDBuilder.Img("Bezel", frame.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(MiniSize + 8, MiniSize + 8), new Color(1f, 0.69f, 0.13f, 0.7f), HUDBuilder.SpriteOf(TextureFactory.Ring(0.015f)));
            ring.transform.SetAsLastSibling();
            var maskImg = HUDBuilder.Img("Mask", frame.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(MiniSize, MiniSize), Color.white, HUDBuilder.SpriteOf(TextureFactory.HardCircle()));
            var mask = maskImg.gameObject.AddComponent<Mask>();
            mask.showMaskGraphic = false;
            m_MiniRot = HUDBuilder.Rect("Rotator", maskImg.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);
            var mapGo = HUDBuilder.Rect("Map", m_MiniRot, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one * WorldInfo.HalfSize * 2f * MiniPxPerM);
            m_MiniMap = mapGo.gameObject.AddComponent<RawImage>();
            m_MiniMap.raycastTarget = false;
            m_MiniMap.color = new Color(0.85f, 0.85f, 0.85f, 1f);
            m_MiniNext = HUDBuilder.Img("NextRing", mapGo, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one, new Color(1f, 1f, 1f, 0.8f), HUDBuilder.SpriteOf(TextureFactory.Ring(0.01f)));
            m_MiniRing = HUDBuilder.Img("BlightRing", mapGo, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one, new Color(0.7f, 0.9f, 0.15f, 0.95f), HUDBuilder.SpriteOf(TextureFactory.Ring(0.012f)));
            for (int i = 0; i < 48; i++)
            {
                var p = HUDBuilder.Img("Ping", mapGo, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(9, 9), HUDBuilder.Danger, HUDBuilder.SpriteOf(TextureFactory.HardCircle()));
                p.enabled = false;
                m_MiniPings.Add(p);
            }
            m_MiniObjective = HUDBuilder.Img("Objective", mapGo, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16), new Color(1f, 0.82f, 0.1f), HUDBuilder.SpriteOf(TextureFactory.Diamond()));
            m_MiniObjective.enabled = false;
            m_MiniSweep = HUDBuilder.Img("Sweep", maskImg.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(MiniSize, MiniSize), new Color(1f, 0.25f, 0.2f, 0.25f), HUDBuilder.SpriteOf(TextureFactory.Cone(14f)));
            m_MiniSweep.enabled = false;
            // player FOV cone + arrow (fixed: the map rotates under them)
            HUDBuilder.Img("FOV", maskImg.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(120, 120), new Color(1f, 1f, 1f, 0.35f), HUDBuilder.SpriteOf(TextureFactory.Cone(40f)));
            HUDBuilder.Img("Player", maskImg.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 18), HUDBuilder.Amber, HUDBuilder.SpriteOf(TextureFactory.Triangle()));
            HUDBuilder.Txt("N", frame.transform, new Vector2(0.5f, 1f), new Vector2(0, -4), new Vector2(20, 20), "", 14, HUDBuilder.Amber);

            m_AliveText = HUDBuilder.Txt("Alive", m_Root, new Vector2(1f, 1f), new Vector2(-28, -MiniSize - 44), new Vector2(MiniSize + 8, 26), "", 18, HUDBuilder.OffWhite, TextAnchor.MiddleRight, true, new Vector2(1f, 1f));
            m_BlightText = HUDBuilder.Txt("Blight", m_Root, new Vector2(1f, 1f), new Vector2(-28, -MiniSize - 70), new Vector2(MiniSize + 60, 24), "", 16, new Color(0.8f, 0.95f, 0.3f), TextAnchor.MiddleRight, true, new Vector2(1f, 1f));
        }

        void BuildMapTextures()
        {
            var tex = HUDBuilder.BuildMapTexture(256, WorldInfo.HalfSize);
            m_MiniMap.texture = tex;
            if (m_TacMapImage != null)
            {
                m_TacMapImage.texture = tex;
                foreach (var poi in WorldInfo.Pois)
                    HUDBuilder.Txt("POI", m_TacMapImage.transform, new Vector2(0.5f, 0.5f), MapToTac(poi.transform.position), new Vector2(240, 24), poi.displayName.ToUpperInvariant(), 15, HUDBuilder.OffWhite, TextAnchor.MiddleCenter, true);
                m_TacPlayer.transform.SetAsLastSibling();
            }
            // static icons: terminals ($), tablets (yellow), updraft vents (cyan)
            foreach (var t in FindObjectsByType<SupplyTerminal>()) AddStaticIcon(t, new Color(0.3f, 1f, 0.55f), TextureFactory.Diamond(), 13f);
            foreach (var t in FindObjectsByType<FieldOpsTablet>()) AddStaticIcon(t, new Color(1f, 0.82f, 0.1f), TextureFactory.HardCircle(), 10f);
            foreach (var v in FindObjectsByType<UpdraftVent>()) AddStaticIcon(v, HUDBuilder.Cyan, TextureFactory.Ring(0.2f), 13f);
        }

        void AddStaticIcon(Component owner, Color c, Texture2D tex, float size)
        {
            var img = HUDBuilder.Img("Icon", m_MiniMap.transform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(size, size), c, HUDBuilder.SpriteOf(tex));
            m_MiniStatic.Add(img);
            m_MiniStaticPos.Add(owner.transform.position);
            m_MiniStaticOwner.Add(owner);
            if (m_TacPanel != null)
            {
                var t = HUDBuilder.Img("Icon", m_TacMapImage.transform, new Vector2(0.5f, 0.5f), MapToTac(owner.transform.position), new Vector2(size * 1.3f, size * 1.3f), c, HUDBuilder.SpriteOf(tex));
                m_TacIcons.Add(t);
            }
        }

        void UpdateMinimap()
        {
            float yaw = LocalPlayer.Camera.transform.eulerAngles.y;
            Vector3 p = LocalPlayer.Position;
            float k = MiniPxPerM;
            m_MiniRot.localRotation = Quaternion.Euler(0, 0, yaw);
            m_MiniMap.rectTransform.anchoredPosition = new Vector2(-p.x, -p.z) * k;
            m_MiniMap.enabled = !RebootTrial.PlayerInTrial;
            var iconRot = Quaternion.Euler(0, 0, -yaw);

            var ring = StormRingAndMatchManager.Instance;
            if (ring != null)
            {
                m_MiniRing.rectTransform.anchoredPosition = new Vector2(ring.CurrentCenter.x, ring.CurrentCenter.z) * k;
                m_MiniRing.rectTransform.sizeDelta = Vector2.one * ring.CurrentRadius * 2f * k;
                m_MiniNext.enabled = ring.NextRevealed && ring.StageIndex < ring.stages.Length;
                m_MiniNext.rectTransform.anchoredPosition = new Vector2(ring.NextCenter.x, ring.NextCenter.z) * k;
                m_MiniNext.rectTransform.sizeDelta = Vector2.one * ring.NextRadius * 2f * k;
                string phase = ring.StageIndex >= ring.stages.Length ? "FINAL ZONE" : ring.Shrinking ? "BLIGHT CLOSING " + Clock(ring.StageTimer) : "BLIGHT CLOSES IN " + Clock(ring.StageTimer);
                m_BlightText.text = (ring.PlayerInGas ? "<color=#ff6a50>IN THE BLIGHT</color>   " : "") + phase;
                m_BlightText.supportRichText = true;
            }
            m_AliveText.text = $"ALIVE  <color=#ffb020>{CombatantRegistry.AliveCount}</color>      KILLS  <color=#ffb020>{(LocalPlayer.Loadout != null ? LocalPlayer.Loadout.kills : 0)}</color>";
            m_AliveText.supportRichText = true;

            for (int i = 0; i < m_MiniStatic.Count; i++)
            {
                var owner = m_MiniStaticOwner[i];
                bool alive = owner != null && owner.gameObject.activeInHierarchy;
                m_MiniStatic[i].enabled = alive;
                m_MiniStatic[i].rectTransform.anchoredPosition = new Vector2(m_MiniStaticPos[i].x, m_MiniStaticPos[i].z) * k;
                m_MiniStatic[i].rectTransform.localRotation = iconRot;
            }

            // recon pulse: radar sweep that refreshes enemy pings every 2 s
            var ks = LocalPlayer.Killstreaks;
            bool recon = ks != null && ks.ReconActive;
            m_MiniSweep.enabled = recon;
            if (recon)
            {
                m_MiniSweep.rectTransform.localRotation = Quaternion.Euler(0, 0, -Time.time * 180f);
                m_ReconSweepTimer -= m_Dt;
                if (m_ReconSweepTimer <= 0f)
                {
                    m_ReconSweepTimer = 2f;
                    foreach (var h in CombatantRegistry.All)
                        if (h != null && !h.isPlayer && !h.IsDead) AddPing(h.transform.position, HUDBuilder.Danger, 2.1f);
                }
            }

            int used = 0;
            for (int i = m_PingPos.Count - 1; i >= 0; i--)
            {
                if (Time.time > m_PingTime[i]) { m_PingPos.RemoveAt(i); m_PingTime.RemoveAt(i); m_PingColor.RemoveAt(i); continue; }
                if (used >= m_MiniPings.Count) continue;
                var img = m_MiniPings[used++];
                img.enabled = true;
                img.rectTransform.anchoredPosition = new Vector2(m_PingPos[i].x, m_PingPos[i].z) * k;
                var c = m_PingColor[i];
                c.a = Mathf.Clamp01((m_PingTime[i] - Time.time) / 0.8f);
                img.color = c;
            }
            for (int i = used; i < m_MiniPings.Count; i++) m_MiniPings[i].enabled = false;

            var ct = ContractTracker.Instance;
            m_MiniObjective.enabled = ct != null && ct.Active && ct.HasMarker;
            if (m_MiniObjective.enabled)
            {
                m_MiniObjective.rectTransform.anchoredPosition = new Vector2(ct.MarkerPosition.x, ct.MarkerPosition.z) * k;
                m_MiniObjective.rectTransform.localRotation = iconRot;
            }
        }

        // ================================================================ tac map

        Vector2 MapToTac(Vector3 world) => new Vector2(world.x, world.z) * (TacSize / (WorldInfo.HalfSize * 2f));

        void BuildTacMap()
        {
            var panel = HUDBuilder.Img("TacMap", m_Root, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(TacSize + 24, TacSize + 70), new Color(0.02f, 0.03f, 0.04f, 0.92f));
            m_TacPanel = panel.rectTransform;
            HUDBuilder.Txt("Title", panel.transform, new Vector2(0.5f, 1f), new Vector2(0, -22), new Vector2(600, 30), "KALDERA ISLE — TACTICAL MAP", 22, HUDBuilder.Amber, TextAnchor.MiddleCenter, true);
            var img = HUDBuilder.Rect("Map", panel.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -18), new Vector2(TacSize, TacSize));
            m_TacMapImage = img.gameObject.AddComponent<RawImage>();
            m_TacMapImage.raycastTarget = false;
            m_TacNext = HUDBuilder.Img("Next", img, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one, new Color(1f, 1f, 1f, 0.85f), HUDBuilder.SpriteOf(TextureFactory.Ring(0.008f)));
            m_TacRing = HUDBuilder.Img("Ring", img, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.one, new Color(0.7f, 0.9f, 0.15f, 1f), HUDBuilder.SpriteOf(TextureFactory.Ring(0.01f)));
            m_TacPlayer = HUDBuilder.Img("Player", img, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(18, 20), HUDBuilder.Amber, HUDBuilder.SpriteOf(TextureFactory.Triangle()));
            HUDBuilder.Txt("Legend", panel.transform, new Vector2(0.5f, 0f), new Vector2(0, 16), new Vector2(TacSize, 22),
                "<color=#4dff8c>SUPPLY TERMINAL</color>    <color=#ffd11a>FIELD OPS</color>    <color=#40e6ff>UPDRAFT</color>    <color=#b3e626>BLIGHT</color>    NEXT ZONE    [M] CLOSE",
                14, HUDBuilder.Muted).supportRichText = true;
            panel.gameObject.SetActive(false);
        }

        void UpdateTacMap()
        {
            if (GameInput.PressedRaw(GameKey.Map) && !RebootTrial.PlayerInTrial) m_TacOpen = !m_TacOpen;
            if (RebootTrial.PlayerInTrial) m_TacOpen = false;
            m_TacPanel.gameObject.SetActive(m_TacOpen);
            if (!m_TacOpen) return;
            m_TacPlayer.rectTransform.anchoredPosition = MapToTac(LocalPlayer.Position);
            m_TacPlayer.rectTransform.localRotation = Quaternion.Euler(0, 0, -LocalPlayer.Camera.transform.eulerAngles.y);
            var ring = StormRingAndMatchManager.Instance;
            if (ring == null) return;
            float k = TacSize / (WorldInfo.HalfSize * 2f);
            m_TacRing.rectTransform.anchoredPosition = MapToTac(ring.CurrentCenter);
            m_TacRing.rectTransform.sizeDelta = Vector2.one * ring.CurrentRadius * 2f * k;
            m_TacNext.enabled = ring.NextRevealed;
            m_TacNext.rectTransform.anchoredPosition = MapToTac(ring.NextCenter);
            m_TacNext.rectTransform.sizeDelta = Vector2.one * ring.NextRadius * 2f * k;
        }
    }
}
