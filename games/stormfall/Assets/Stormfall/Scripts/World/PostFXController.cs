using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Stormfall
{
    /// <summary>
    /// Drives the global URP Volume at runtime: depth of field while aiming (focus from the aim
    /// ray), vignette tightening on ADS, gas colour grading and downed desaturation.
    /// </summary>
    [RequireComponent(typeof(Volume))]
    public class PostFXController : MonoBehaviour
    {
        Volume m_Volume;
        DepthOfField m_Dof;
        Vignette m_Vignette;
        ColorAdjustments m_Color;
        float m_Focus = 30f;
        float m_BaseVignette = 0.22f;

        void Start()
        {
            m_Volume = GetComponent<Volume>();
            // work on an instance so play mode never edits the saved profile asset
            var profile = m_Volume.profile;
            if (profile == null) return;
            profile.TryGet(out m_Dof);
            profile.TryGet(out m_Vignette);
            profile.TryGet(out m_Color);
            if (m_Vignette != null) m_BaseVignette = m_Vignette.intensity.value;
        }

        void LateUpdate()
        {
            if (!LocalPlayer.Exists) return;
            float dt = Time.deltaTime;
            var w = LocalPlayer.Weapon;
            float ads = w != null ? w.AdsAmount : 0f;
            bool scoped = w != null && w.IsScopedView;
            var cam = LocalPlayer.Camera.transform;

            if (m_Dof != null)
            {
                bool on = ads > 0.25f && !scoped;
                m_Dof.active = on;
                if (on)
                {
                    float target = Physics.Raycast(cam.position, cam.forward, out var hit, 400f, ~0, QueryTriggerInteraction.Ignore) ? hit.distance : 120f;
                    m_Focus = Mathf.Lerp(m_Focus, target, 1f - Mathf.Exp(-6f * dt));
                    m_Dof.mode.Override(DepthOfFieldMode.Gaussian);
                    m_Dof.gaussianStart.Override(m_Focus + 6f);
                    m_Dof.gaussianEnd.Override(m_Focus + 60f + m_Focus * 0.8f);
                    m_Dof.gaussianMaxRadius.Override(Mathf.Lerp(0.5f, 1.1f, ads));
                }
            }

            var ring = StormRingAndMatchManager.Instance;
            bool gas = ring != null && ring.PlayerInGas && !ring.PlayerMaskActive;
            bool downed = LocalPlayer.Health != null && LocalPlayer.Health.IsDowned;
            if (m_Vignette != null)
            {
                m_Vignette.intensity.Override(Mathf.Lerp(m_Vignette.intensity.value, m_BaseVignette + ads * 0.12f + (gas ? 0.15f : 0f) + (downed ? 0.2f : 0f), 1f - Mathf.Exp(-6f * dt)));
                m_Vignette.color.Override(gas ? new Color(0.18f, 0.25f, 0.02f) : downed ? new Color(0.25f, 0f, 0f) : Color.black);
            }
            if (m_Color != null)
            {
                m_Color.colorFilter.Override(Color.Lerp(m_Color.colorFilter.value, gas ? new Color(0.88f, 1f, 0.7f) : Color.white, 1f - Mathf.Exp(-3f * dt)));
                m_Color.saturation.Override(Mathf.Lerp(m_Color.saturation.value, downed ? -55f : gas ? -15f : 8f, 1f - Mathf.Exp(-3f * dt)));
            }
        }
    }
}
