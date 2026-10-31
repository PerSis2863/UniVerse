using UnityEngine;

namespace Stormfall
{
    /// <summary>Fades a light's intensity to zero, then destroys the object.</summary>
    [RequireComponent(typeof(Light))]
    public class FadeLight : MonoBehaviour
    {
        public float duration = 0.3f;
        Light m_Light;
        float m_Start, m_T;

        void Start() { m_Light = GetComponent<Light>(); m_Start = m_Light.intensity; }

        void Update()
        {
            m_T += Time.deltaTime;
            float k = 1f - m_T / duration;
            m_Light.intensity = m_Start * k * k;
            if (m_T >= duration) Destroy(gameObject);
        }
    }
}
