using UnityEngine;

namespace Stormfall
{
    /// <summary>Geothermal redeploy vent: press [Space] inside it to launch ~100 m up into free-fall.</summary>
    public class UpdraftVent : MonoBehaviour, IInteractable
    {
        public float radius = 2.2f;
        public float launchSpeed = 130f;
        float m_SteamTimer;

        void Update()
        {
            m_SteamTimer -= Time.deltaTime;
            if (m_SteamTimer <= 0f)
            {
                m_SteamTimer = 0.06f;
                Vector2 r = Random.insideUnitCircle * radius * 0.8f;
                WeaponFX.Steam(transform.position + new Vector3(r.x, 0.4f, r.y), new Vector3(0, Random.Range(6f, 10f), 0), Random.Range(0.8f, 1.6f), new Color(0.95f, 0.95f, 1f, 0.3f));
            }
            var pc = LocalPlayer.Controller;
            if (pc == null || pc.State != MoveState.Grounded) return;
            Vector3 d = pc.transform.position - transform.position;
            if (new Vector2(d.x, d.z).magnitude < radius && Mathf.Abs(d.y) < 2f && GameInput.Pressed(GameKey.Jump)) Launch(pc);
        }

        void Launch(TacticalPlayerController pc)
        {
            AudioFX.PlayAt(Sfx.VentWhoosh, transform.position, 1f, 0.9f, 60f);
            pc.Teleport(pc.transform.position + Vector3.up * 1.5f, pc.Yaw);
            pc.BeginFreefall(Vector3.up * launchSpeed);
        }

        public string Prompt => "[SPACE] Ride the updraft";
        public float HoldDuration => 0f;
        public Vector3 InteractPoint => transform.position + Vector3.up * 0.8f;
        public bool CanInteract(GameObject player) => true;
        public void Interact(GameObject player) { }
    }
}
