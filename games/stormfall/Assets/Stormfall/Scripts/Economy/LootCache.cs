using System;
using UnityEngine;

namespace Stormfall
{
    /// <summary>Humming supply cache (standard blue / vault orange) that bursts open into loot.</summary>
    public class LootCache : MonoBehaviour, IInteractable
    {
        public bool vault;
        public Transform lid;
        public bool Opened { get; private set; }

        public static event Action<LootCache> CacheOpened;

        AudioSource m_Hum;
        Light m_Glow;
        float m_OpenT;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => CacheOpened = null;

        void Start()
        {
            m_Hum = AudioFX.CreateLoop(transform, Sfx.CacheHum, vault ? 0.55f : 0.35f, 1f, vault ? 22f : 14f);
            m_Hum.pitch = vault ? 0.8f : 1f;
            var lg = new GameObject("Glow");
            lg.transform.SetParent(transform, false);
            lg.transform.localPosition = Vector3.up * 0.9f;
            m_Glow = lg.AddComponent<Light>();
            m_Glow.type = LightType.Point;
            m_Glow.range = 3.5f;
            m_Glow.intensity = 1.6f;
            m_Glow.color = vault ? new Color(1f, 0.6f, 0.2f) : new Color(0.4f, 0.65f, 1f);
            m_Glow.shadows = LightShadows.None;
        }

        void Update()
        {
            if (!Opened)
            {
                if (m_Glow != null) m_Glow.intensity = 1.3f + 0.4f * Mathf.Sin(Time.time * 3f);
                return;
            }
            if (m_OpenT < 1f)
            {
                m_OpenT = Mathf.Min(1f, m_OpenT + Time.deltaTime * 3f);
                if (lid != null) lid.localRotation = Quaternion.Euler(-105f * Ease.OutCubic(m_OpenT), 0, 0);
                if (m_Glow != null) m_Glow.intensity = Mathf.Lerp(3f, 0f, m_OpenT);
            }
        }

        public string Prompt => vault ? "[F] Open Vault Cache" : "[F] Open Supply Cache";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 0.5f;
        public bool CanInteract(GameObject player) => !Opened;

        public void Interact(GameObject player) => Open();

        public void Open()
        {
            if (Opened) return;
            Opened = true;
            if (m_Hum != null) m_Hum.Stop();
            AudioFX.PlayAt(Sfx.CacheOpen, transform.position, 0.9f, vault ? 0.85f : 1f, 40f);
            SupplyTerminalAndLootManager.SpawnLootBurst(transform.position + transform.forward * 0.3f, vault);
            CacheOpened?.Invoke(this);
        }
    }
}
