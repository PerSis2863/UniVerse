using UnityEngine;

namespace Stormfall
{
    /// <summary>
    /// Procedural soldier: generated meshes, a simple bone hierarchy, multi-zone hitboxes
    /// (Head 1.6x, Upper Torso 1.1x, Lower Torso 1.0x, Limbs 0.85x) and procedural locomotion,
    /// crouch, downed crawl and death topple.
    /// </summary>
    public class BotBody : MonoBehaviour
    {
        public Transform visual, pelvis, torso, head, thighL, thighR, shinL, shinR, upperArmL, upperArmR, forearmL, forearmR;
        public Transform weaponMount, muzzle, scopePoint;

        float m_Phase;
        float m_Crouch, m_Downed, m_Dead;
        float m_DeadSide = 1f;
        float m_AimPitch;

        static Mesh s_Head, s_Torso, s_Pelvis, s_Thigh, s_Shin, s_UpperArm, s_Forearm;
        static Material[] s_Mats;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { s_Head = null; s_Mats = null; }

        static void EnsureMeshes()
        {
            if (s_Head != null) return;
            s_Head = ProceduralMeshBuilder.SoldierHead();
            s_Torso = ProceduralMeshBuilder.SoldierTorso();
            s_Pelvis = ProceduralMeshBuilder.SoldierPelvis();
            s_Thigh = ProceduralMeshBuilder.SoldierLimb(0.44f, 0.085f, 0.065f, false, false);
            s_Shin = ProceduralMeshBuilder.SoldierLimb(0.44f, 0.06f, 0.05f, true, false);
            s_UpperArm = ProceduralMeshBuilder.SoldierLimb(0.3f, 0.06f, 0.05f, false, false);
            s_Forearm = ProceduralMeshBuilder.SoldierLimb(0.27f, 0.048f, 0.04f, false, true);
            s_Mats = new[] { MaterialLibrary.Get(Mat.BotCamo), MaterialLibrary.Get(Mat.BotGear), MaterialLibrary.Get(Mat.BotSkin), MaterialLibrary.Get(Mat.BotVisor) };
        }

        public void Build(WeaponInstance weapon)
        {
            EnsureMeshes();
            visual = new GameObject("Visual").transform;
            visual.SetParent(transform, false);
            pelvis = Bone("Pelvis", visual, new Vector3(0, 0.95f, 0), s_Pelvis);
            torso = Bone("Torso", pelvis, new Vector3(0, 0.02f, 0), s_Torso);
            head = Bone("Head", torso, new Vector3(0, 0.58f, 0.01f), s_Head);
            thighL = Bone("ThighL", pelvis, new Vector3(-0.1f, -0.06f, 0), s_Thigh);
            thighR = Bone("ThighR", pelvis, new Vector3(0.1f, -0.06f, 0), s_Thigh);
            shinL = Bone("ShinL", thighL, new Vector3(0, -0.44f, 0), s_Shin);
            shinR = Bone("ShinR", thighR, new Vector3(0, -0.44f, 0), s_Shin);
            upperArmL = Bone("UpperArmL", torso, new Vector3(-0.22f, 0.4f, 0), s_UpperArm);
            upperArmR = Bone("UpperArmR", torso, new Vector3(0.22f, 0.4f, 0), s_UpperArm);
            forearmL = Bone("ForearmL", upperArmL, new Vector3(0, -0.3f, 0), s_Forearm);
            forearmR = Bone("ForearmR", upperArmR, new Vector3(0, -0.3f, 0), s_Forearm);
            // rifle-ready arm pose
            upperArmR.localRotation = Quaternion.Euler(-35f, 0, 12f);
            forearmR.localRotation = Quaternion.Euler(-70f, 0, 0);
            upperArmL.localRotation = Quaternion.Euler(-60f, 0, -28f);
            forearmL.localRotation = Quaternion.Euler(-35f, 25f, 0);

            // third-person weapon
            weaponMount = new GameObject("WeaponMount").transform;
            weaponMount.SetParent(torso, false);
            weaponMount.localPosition = new Vector3(0.13f, 0.32f, 0.22f);
            if (weapon != null)
            {
                var model = ProceduralWeaponController.GetModel(weapon.data.style, weapon.attachments);
                var wgo = new GameObject("Weapon");
                wgo.transform.SetParent(weaponMount, false);
                wgo.transform.localPosition = new Vector3(0, 0, 0.1f);
                wgo.AddComponent<MeshFilter>().sharedMesh = model.body;
                var mats = new Material[model.body.subMeshCount];
                for (int i = 0; i < mats.Length; i++) mats[i] = MaterialLibrary.Get(WeaponModel.BodyMaterials[Mathf.Min(i, WeaponModel.BodyMaterials.Length - 1)]);
                wgo.AddComponent<MeshRenderer>().sharedMaterials = mats;
                var mag = new GameObject("Mag");
                mag.transform.SetParent(wgo.transform, false);
                mag.transform.localPosition = model.magPos;
                mag.AddComponent<MeshFilter>().sharedMesh = model.mag;
                var mm = new Material[model.mag.subMeshCount];
                for (int i = 0; i < mm.Length; i++) mm[i] = MaterialLibrary.Get(WeaponModel.BodyMaterials[i]);
                mag.AddComponent<MeshRenderer>().sharedMaterials = mm;
                muzzle = new GameObject("Muzzle").transform;
                muzzle.SetParent(wgo.transform, false);
                muzzle.localPosition = model.muzzle;
                scopePoint = new GameObject("Scope").transform;
                scopePoint.SetParent(wgo.transform, false);
                scopePoint.localPosition = model.sightPoint + new Vector3(0, 0, 0.12f);
            }

            // hitboxes
            AddHitbox(head, HitZone.Head, new Vector3(0, 0.02f, 0), 0.15f);
            AddBoxHitbox(torso, HitZone.UpperTorso, new Vector3(0, 0.3f, 0.01f), new Vector3(0.42f, 0.34f, 0.3f));
            AddBoxHitbox(pelvis, HitZone.LowerTorso, new Vector3(0, -0.02f, 0), new Vector3(0.38f, 0.22f, 0.26f));
            AddLimb(thighL); AddLimb(thighR); AddLimb(shinL); AddLimb(shinR);
            AddLimb(upperArmL, 0.3f); AddLimb(upperArmR, 0.3f); AddLimb(forearmL, 0.27f); AddLimb(forearmR, 0.27f);
        }

        Transform Bone(string name, Transform parent, Vector3 pos, Mesh mesh)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mats = new Material[mesh.subMeshCount];
            for (int i = 0; i < mats.Length; i++) mats[i] = s_Mats[Mathf.Min(i, s_Mats.Length - 1)];
            go.AddComponent<MeshRenderer>().sharedMaterials = mats;
            return go.transform;
        }

        static void AddHitbox(Transform bone, HitZone zone, Vector3 center, float radius)
        {
            var go = new GameObject("HB_" + zone);
            go.transform.SetParent(bone, false);
            var c = go.AddComponent<SphereCollider>();
            c.isTrigger = true; c.center = center; c.radius = radius;
            HitboxZone.Add(go, zone);
        }

        static void AddBoxHitbox(Transform bone, HitZone zone, Vector3 center, Vector3 size)
        {
            var go = new GameObject("HB_" + zone);
            go.transform.SetParent(bone, false);
            var c = go.AddComponent<BoxCollider>();
            c.isTrigger = true; c.center = center; c.size = size;
            HitboxZone.Add(go, zone);
        }

        static void AddLimb(Transform bone, float length = 0.44f)
        {
            var go = new GameObject("HB_Limb");
            go.transform.SetParent(bone, false);
            var c = go.AddComponent<CapsuleCollider>();
            c.isTrigger = true; c.direction = 1; c.radius = 0.075f; c.height = length + 0.1f; c.center = new Vector3(0, -length * 0.5f, 0);
            HitboxZone.Add(go, HitZone.Limb);
        }

        /// <summary>Drive the procedural animation.</summary>
        public void Animate(float speed, bool crouched, bool downed, bool dead, float aimPitch, float dt)
        {
            if (visual == null) return;
            m_Crouch = Ease.Damp(m_Crouch, crouched ? 1f : 0f, 10f, dt);
            m_Downed = Ease.Damp(m_Downed, downed ? 1f : 0f, 6f, dt);
            if (dead) m_Dead = Mathf.MoveTowards(m_Dead, 1f, dt * 1.8f);
            m_AimPitch = Ease.Damp(m_AimPitch, aimPitch, 8f, dt);

            float stride = Mathf.Lerp(1.6f, 0.9f, m_Crouch);
            m_Phase += speed / stride * Mathf.PI * dt;
            float amp = Mathf.Clamp01(speed / 4f) * (1f - m_Downed);
            float swing = Mathf.Sin(m_Phase) * 32f * amp;

            float pelvisY = Mathf.Lerp(0.95f, 0.62f, m_Crouch);
            pelvisY = Mathf.Lerp(pelvisY, 0.22f, m_Downed);
            pelvisY += Mathf.Abs(Mathf.Cos(m_Phase)) * 0.04f * amp;
            pelvis.localPosition = new Vector3(0, pelvisY, 0);
            pelvis.localRotation = Quaternion.Euler(m_Downed * 80f, 0, 0);
            torso.localRotation = Quaternion.Euler(Mathf.Lerp(m_Crouch * 15f + m_AimPitch * 0.6f, -50f, m_Downed), Mathf.Sin(m_Phase) * 6f * amp, 0);
            head.localRotation = Quaternion.Euler(m_AimPitch * 0.4f - m_Downed * 30f, 0, 0);

            float crouchThigh = m_Crouch * -70f, crouchShin = m_Crouch * 100f;
            thighL.localRotation = Quaternion.Euler(swing + crouchThigh + m_Downed * -10f, 0, 0);
            thighR.localRotation = Quaternion.Euler(-swing + crouchThigh + m_Downed * -10f, 0, 0);
            shinL.localRotation = Quaternion.Euler(Mathf.Max(0f, -Mathf.Sin(m_Phase)) * 45f * amp + crouchShin, 0, 0);
            shinR.localRotation = Quaternion.Euler(Mathf.Max(0f, Mathf.Sin(m_Phase)) * 45f * amp + crouchShin, 0, 0);

            if (m_Downed > 0.5f && speed > 0.1f)
            {
                // crawl: alternate arm reaches
                upperArmL.localRotation = Quaternion.Euler(-120f + Mathf.Sin(m_Phase * 2f) * 30f, 0, -15f);
                upperArmR.localRotation = Quaternion.Euler(-120f - Mathf.Sin(m_Phase * 2f) * 30f, 0, 15f);
            }
            else
            {
                upperArmR.localRotation = Quaternion.Euler(-35f, 0, 12f);
                upperArmL.localRotation = Quaternion.Euler(-60f, 0, -28f);
            }
            if (weaponMount != null) weaponMount.gameObject.SetActive(m_Downed < 0.5f && m_Dead <= 0f);

            if (m_Dead > 0f)
            {
                float t = Ease.OutCubic(m_Dead);
                visual.localRotation = Quaternion.Euler(0, 0, 88f * m_DeadSide * t);
                visual.localPosition = new Vector3(0.3f * m_DeadSide * t, 0.1f * t, 0);
            }
        }

        public void SetDeathSide(float side) => m_DeadSide = side >= 0 ? 1f : -1f;
    }
}
