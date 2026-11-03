using UnityEngine;

namespace Stormfall
{
    /// <summary>Hinged door: [F] swings it open away from the player.</summary>
    public class Door : MonoBehaviour, IInteractable
    {
        public float openAngle = 100f;
        public float speed = 4f;
        public float width = 1f;

        bool m_Open;
        float m_Current, m_Target;
        Quaternion m_Closed;

        void Awake() => m_Closed = transform.localRotation;

        void Update()
        {
            m_Current = Mathf.MoveTowards(m_Current, m_Target, speed * Mathf.Abs(openAngle) * Time.deltaTime);
            transform.localRotation = m_Closed * Quaternion.Euler(0, m_Current, 0);
        }

        public string Prompt => m_Open ? "[F] Close Door" : "[F] Open Door";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.TransformPoint(new Vector3(width * 0.5f, 1.1f, 0));
        public bool CanInteract(GameObject player) => true;

        public void Interact(GameObject player)
        {
            m_Open = !m_Open;
            if (m_Open)
            {
                // swing away from whoever opened it
                Vector3 local = transform.InverseTransformPoint(player.transform.position);
                m_Target = local.z > 0 ? -openAngle : openAngle;
            }
            else m_Target = 0f;
            AudioFX.PlayAt(Sfx.DoorCreak, transform.position + Vector3.up, 0.6f, Random.Range(0.9f, 1.1f), 25f);
        }

        /// <summary>Bots open doors they walk into.</summary>
        public void OpenFor(Vector3 from)
        {
            if (m_Open) return;
            m_Open = true;
            Vector3 local = transform.InverseTransformPoint(from);
            m_Target = local.z > 0 ? -openAngle : openAngle;
            AudioFX.PlayAt(Sfx.DoorCreak, transform.position + Vector3.up, 0.5f, 1f, 25f);
        }
    }
}
