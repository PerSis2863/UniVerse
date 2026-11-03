using UnityEngine;

namespace Stormfall
{
    public enum ContractType { Manhunt, SalvageRun, Uplink }

    /// <summary>Yellow field tablet that starts a contract (one active at a time).</summary>
    public class FieldOpsTablet : MonoBehaviour, IInteractable
    {
        public ContractType contract;
        Light m_Light;

        void Start()
        {
            var lg = new GameObject("TabletGlow");
            lg.transform.SetParent(transform, false);
            lg.transform.localPosition = Vector3.up * 1.2f;
            m_Light = lg.AddComponent<Light>();
            m_Light.type = LightType.Point; m_Light.color = new Color(1f, 0.8f, 0.2f); m_Light.range = 3f; m_Light.intensity = 1.5f;
            m_Light.shadows = LightShadows.None;
        }

        void Update()
        {
            if (m_Light != null) m_Light.intensity = 1.2f + Mathf.Sin(Time.time * 4f) * 0.5f;
        }

        public static string Title(ContractType t) => t switch
        {
            ContractType.Manhunt => "MANHUNT",
            ContractType.SalvageRun => "SALVAGE RUN",
            _ => "UPLINK"
        };

        public string Prompt => $"[F] Accept {Title(contract)} contract";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 1.0f;
        public bool CanInteract(GameObject player) => ContractTracker.Instance != null && !ContractTracker.Instance.Active;

        public void Interact(GameObject player)
        {
            if (ContractTracker.Instance.Accept(contract, transform.position))
            {
                AudioFX.Play2D(Sfx.UiBuy, 0.7f, 0.9f);
                gameObject.SetActive(false);
            }
        }
    }
}
