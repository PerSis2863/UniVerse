using UnityEngine;

namespace Stormfall
{
    /// <summary>Finds the best interactable in view, shows its prompt and handles press / hold.</summary>
    public class PlayerInteractor : MonoBehaviour
    {
        public float range = 2.6f;
        public float maxAngle = 40f;

        public IInteractable Focus { get; private set; }
        public float HoldProgress { get; private set; }
        public string Prompt => Focus != null ? Focus.Prompt : null;

        static readonly Collider[] s_Buffer = new Collider[48];
        TacticalPlayerController m_Player;
        PlayerHealthArmor m_Health;
        IInteractable m_HoldTarget;

        void Awake()
        {
            m_Player = GetComponent<TacticalPlayerController>();
            m_Health = GetComponent<PlayerHealthArmor>();
        }

        void Update()
        {
            Focus = null;
            bool blocked = m_Player == null || m_Player.MenuOpen || m_Player.IsAirborneSkydive || (m_Health != null && (m_Health.IsDowned || m_Health.IsDead));
            if (blocked) { HoldProgress = 0f; m_HoldTarget = null; return; }

            var cam = m_Player.cam.transform;
            Vector3 eye = cam.position;
            int n = Physics.OverlapSphereNonAlloc(eye, range, s_Buffer, ~0, QueryTriggerInteraction.Collide);
            float best = float.MaxValue;
            for (int i = 0; i < n; i++)
            {
                var it = s_Buffer[i].GetComponentInParent<IInteractable>();
                if (it == null || !it.CanInteract(gameObject)) continue;
                Vector3 to = it.InteractPoint - eye;
                float dist = to.magnitude;
                if (dist > range) continue;
                float ang = Vector3.Angle(cam.forward, to);
                if (ang > maxAngle) continue;
                if (!Ballistics.HasLineOfSight(eye, it.InteractPoint, transform, ((Component)it).transform)) continue;
                float score = ang + dist * 6f;
                if (score < best) { best = score; Focus = it; }
            }

            if (Focus == null) { HoldProgress = 0f; m_HoldTarget = null; return; }
            if (Focus.HoldDuration <= 0f)
            {
                if (GameInput.Pressed(GameKey.Interact)) Focus.Interact(gameObject);
                HoldProgress = 0f;
                return;
            }
            if (GameInput.Held(GameKey.Interact))
            {
                if (m_HoldTarget != Focus) { m_HoldTarget = Focus; HoldProgress = 0f; }
                HoldProgress += Time.deltaTime / Focus.HoldDuration;
                if (HoldProgress >= 1f)
                {
                    HoldProgress = 0f;
                    m_HoldTarget = null;
                    Focus.Interact(gameObject);
                }
            }
            else { HoldProgress = 0f; m_HoldTarget = null; }
        }
    }
}
