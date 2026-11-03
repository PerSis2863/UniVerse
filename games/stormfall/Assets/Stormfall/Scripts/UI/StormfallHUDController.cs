using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace Stormfall
{
    /// <summary>
    /// The full STORMFALL HUD, built in code under the scene Canvas:
    /// compass tape + POI banner + gunfire markers, rotating minimap / [M] tac-map, alive and kill
    /// counters, dynamic crosshair, 3-tier hitmarkers, XP feed, damage arcs, status dock, weapon
    /// dock, prompts, menus, overlays (scope, mask, downed, low HP, designator) and end screens.
    /// Split across partial files: .Map (compass/minimap), .Combat (centre feedback, overlays),
    /// .Docks (status/weapon docks, menus, prompts).
    /// </summary>
    [RequireComponent(typeof(Canvas))]
    public partial class StormfallHUDController : MonoBehaviour
    {
        RectTransform m_Root;
        float m_Dt;

        void Awake()
        {
            var canvas = GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = GetComponent<CanvasScaler>();
            if (scaler == null) scaler = gameObject.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            scaler.matchWidthOrHeight = 0.5f;
            if (GetComponent<GraphicRaycaster>() == null) gameObject.AddComponent<GraphicRaycaster>();

            m_Root = HUDBuilder.Stretch("HUD", transform);
            BuildOverlays();      // full-screen layers go first (behind everything else)
            BuildCompass();
            BuildMinimap();
            BuildCenter();
            BuildStatusDock();
            BuildWeaponDock();
            BuildPrompts();
            BuildMenus();
            BuildTacMap();
            BuildEndScreen();
        }

        void OnEnable()
        {
            GameEvents.DamageDealt += OnDamageDealt;
            GameEvents.XpAwarded += OnXp;
            GameEvents.PlayerDamagedFrom += OnPlayerDamaged;
            GameEvents.ShotFired += OnShotFired;
            GameEvents.Callout += OnCallout;
            GameEvents.Toast += OnToast;
            TacticalBotAI.BotFootstep += OnBotFootstep;
        }

        void OnDisable()
        {
            GameEvents.DamageDealt -= OnDamageDealt;
            GameEvents.XpAwarded -= OnXp;
            GameEvents.PlayerDamagedFrom -= OnPlayerDamaged;
            GameEvents.ShotFired -= OnShotFired;
            GameEvents.Callout -= OnCallout;
            GameEvents.Toast -= OnToast;
            TacticalBotAI.BotFootstep -= OnBotFootstep;
        }

        void Start()
        {
            BuildMapTextures();
        }

        void Update()
        {
            m_Dt = Time.unscaledDeltaTime;
            if (!LocalPlayer.Exists) return;
            UpdateCompass();
            UpdateMinimap();
            UpdateTacMap();
            UpdateCenter();
            UpdateOverlays();
            UpdateStatusDock();
            UpdateWeaponDock();
            UpdatePrompts();
            UpdateMenus();
            UpdateEndScreen();
        }

        // ---------------------------------------------------------------- helpers

        static string Clock(float seconds)
        {
            seconds = Mathf.Max(0f, seconds);
            int m = Mathf.FloorToInt(seconds / 60f), s = Mathf.FloorToInt(seconds % 60f);
            return $"{m}:{s:00}";
        }

        static void SetAlpha(Graphic g, float a)
        {
            var c = g.color; c.a = a; g.color = c;
        }

        /// <summary>World position → canvas position relative to the screen centre; false if behind camera.</summary>
        bool WorldToCanvas(Vector3 world, out Vector2 canvasPos, out bool onScreen)
        {
            var cam = LocalPlayer.Camera;
            Vector3 sp = cam.WorldToScreenPoint(world);
            bool behind = sp.z < 0f;
            var rect = m_Root.rect;
            Vector2 n = new Vector2(sp.x / Screen.width - 0.5f, sp.y / Screen.height - 0.5f);
            if (behind) n = -n;
            canvasPos = new Vector2(n.x * rect.width, n.y * rect.height);
            onScreen = !behind && Mathf.Abs(n.x) < 0.47f && Mathf.Abs(n.y) < 0.45f;
            return !behind;
        }

        Vector2 ClampToEdge(Vector2 p, float margin)
        {
            var rect = m_Root.rect;
            float hx = rect.width * 0.5f - margin, hy = rect.height * 0.5f - margin;
            if (p.sqrMagnitude < 1e-3f) p = Vector2.up;
            float k = Mathf.Min(hx / Mathf.Max(Mathf.Abs(p.x), 1e-3f), hy / Mathf.Max(Mathf.Abs(p.y), 1e-3f));
            return k < 1f ? p * k : p;
        }

        class Fader
        {
            public Graphic g;
            public float t, life;
        }
    }
}
