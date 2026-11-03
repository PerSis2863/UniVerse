using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Stormfall
{
    /// <summary>
    /// Lighter graphics for the browser build: shorter shadow distance with two cascades, a slightly
    /// lower render scale and no SSAO. Desktop builds and the editor are untouched.
    /// </summary>
    public static class WebPerformance
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Apply()
        {
            Application.targetFrameRate = -1;
            if (!(GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset urp)) return;
            urp.shadowDistance = 140f;
            urp.shadowCascadeCount = 2;
            urp.renderScale = 0.85f;
            urp.msaaSampleCount = 1;
            foreach (var data in urp.rendererDataList)
                if (data != null)
                    foreach (var f in data.rendererFeatures)
                        if (f is ScreenSpaceAmbientOcclusion) f.SetActive(false);
        }
#endif
    }
}
