using UnityEngine;

namespace Stormfall
{
    /// <summary>Anything the player can use with [F].</summary>
    public interface IInteractable
    {
        string Prompt { get; }
        /// <summary>0 = instant press; otherwise seconds the key must be held.</summary>
        float HoldDuration { get; }
        Vector3 InteractPoint { get; }
        bool CanInteract(GameObject player);
        void Interact(GameObject player);
    }
}
