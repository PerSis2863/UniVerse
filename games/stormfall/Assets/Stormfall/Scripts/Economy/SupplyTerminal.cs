using UnityEngine;

namespace Stormfall
{
    /// <summary>World kiosk that opens the buy menu.</summary>
    public class SupplyTerminal : MonoBehaviour, IInteractable
    {
        public string Prompt => "[F] Use Supply Terminal";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 1.3f + transform.forward * 0.3f;

        void Start()
        {
            AudioFX.CreateLoop(transform, Sfx.CacheHum, 0.15f, 1f, 14f);
        }

        public bool CanInteract(GameObject player) =>
            SupplyTerminalAndLootManager.Instance != null && !SupplyTerminalAndLootManager.Instance.MenuOpen;

        public void Interact(GameObject player) => SupplyTerminalAndLootManager.Instance.OpenMenu(this);
    }
}
