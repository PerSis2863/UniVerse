using UnityEngine;

namespace Stormfall
{
    /// <summary>Pooled one-shot playback for procedural clips (2D and 3D).</summary>
    public class AudioFX : MonoBehaviour
    {
        const int PoolSize = 48;
        static AudioFX s_Instance;
        AudioSource[] m_Pool;
        AudioSource m_UI;
        int m_Next;

        public static AudioFX Instance
        {
            get
            {
                if (s_Instance == null)
                {
                    var go = new GameObject("AudioFX");
                    s_Instance = go.AddComponent<AudioFX>();
                }
                return s_Instance;
            }
        }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Instance = null;

        void Awake()
        {
            if (s_Instance != null && s_Instance != this) { Destroy(gameObject); return; }
            s_Instance = this;
            m_Pool = new AudioSource[PoolSize];
            for (int i = 0; i < PoolSize; i++)
            {
                var go = new GameObject("Voice" + i);
                go.transform.SetParent(transform, false);
                var src = go.AddComponent<AudioSource>();
                src.playOnAwake = false;
                src.rolloffMode = AudioRolloffMode.Custom;
                src.SetCustomCurve(AudioSourceCurveType.CustomRolloff, new AnimationCurve(
                    new Keyframe(0f, 1f), new Keyframe(0.1f, 0.6f), new Keyframe(0.35f, 0.22f), new Keyframe(1f, 0f)));
                src.dopplerLevel = 0f;
                m_Pool[i] = src;
            }
            m_UI = gameObject.AddComponent<AudioSource>();
            m_UI.playOnAwake = false;
            m_UI.spatialBlend = 0f;
        }

        /// <summary>Plays a 3D one-shot at a world position.</summary>
        public static AudioSource PlayAt(Sfx sfx, Vector3 pos, float volume = 1f, float pitch = 1f, float maxDistance = 120f)
        {
            var inst = Instance;
            var src = inst.m_Pool[inst.m_Next];
            inst.m_Next = (inst.m_Next + 1) % PoolSize;
            src.transform.position = pos;
            src.clip = ProceduralAudioBank.Get(sfx);
            src.volume = volume;
            src.pitch = pitch;
            src.spatialBlend = 1f;
            src.maxDistance = maxDistance;
            src.minDistance = 1f;
            src.loop = false;
            src.Play();
            return src;
        }

        /// <summary>2D one-shot (UI, first-person sounds).</summary>
        public static void Play2D(Sfx sfx, float volume = 1f, float pitch = 1f)
        {
            var inst = Instance;
            inst.m_UI.pitch = pitch;
            inst.m_UI.PlayOneShot(ProceduralAudioBank.Get(sfx), volume);
        }

        /// <summary>Creates a looping source attached to <paramref name="parent"/>.</summary>
        public static AudioSource CreateLoop(Transform parent, Sfx sfx, float volume, float spatial, float maxDistance = 40f, bool play = true)
        {
            var src = parent.gameObject.AddComponent<AudioSource>();
            src.clip = ProceduralAudioBank.Get(sfx);
            src.loop = true;
            src.volume = volume;
            src.spatialBlend = spatial;
            src.rolloffMode = AudioRolloffMode.Linear;
            src.minDistance = 1f;
            src.maxDistance = maxDistance;
            src.dopplerLevel = 0f;
            src.playOnAwake = false;
            if (play)
            {
                src.time = Random.Range(0f, src.clip.length * 0.9f);
                src.Play();
            }
            return src;
        }
    }
}
