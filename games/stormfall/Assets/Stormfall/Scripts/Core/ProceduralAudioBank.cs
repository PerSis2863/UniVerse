using System;
using System.Collections.Generic;
using UnityEngine;

namespace Stormfall
{
    public enum Sfx
    {
        RifleShot, SmgShot, SniperShot, SuppressedShot, BassPunch, DryFire,
        HitTick, ArmorCrack, HeadshotDing, KillChime,
        MagOut, MagIn, BoltRack, WeaponSwap, PlateInsert,
        Footstep, FootstepConcrete, Land, SlideScrape, Mantle,
        WindRush, ParachuteOpen, ParachuteFlap, AircraftDrone,
        GasCough, Heartbeat, BlightHum, MaskOn,
        CacheHum, CacheOpen, Pickup, CashPickup, UiClick, UiBuy, UiDeny,
        Explosion, GrenadePin, GrenadeBounce, OrbitalCharge, OrbitalBlast, ReconPing,
        BulletWhiz, BulletImpactDirt, BulletImpactMetal, ShellTink, DroneHum, DoorCreak, VentWhoosh, Countdown
    }

    /// <summary>
    /// Synthesises every sound in the game as 44.1 kHz mono PCM via AudioClip.Create.
    /// Each generator is a small additive/subtractive patch: noise sources, sine/saw oscillators,
    /// one-pole and state-variable filters, exponential envelopes. Deterministic per seed.
    /// </summary>
    public static class ProceduralAudioBank
    {
        public const int Rate = 44100;
        static readonly Dictionary<Sfx, AudioClip> s_Clips = new Dictionary<Sfx, AudioClip>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() => s_Clips.Clear();

        public static AudioClip Get(Sfx s)
        {
            if (s_Clips.TryGetValue(s, out var c) && c != null) return c;
            c = Build(s);
            s_Clips[s] = c;
            return c;
        }

        public static void Prewarm()
        {
            foreach (Sfx s in Enum.GetValues(typeof(Sfx))) Get(s);
        }

        // ------------------------------------------------------------------ DSP helpers
        struct Rng
        {
            uint s;
            public Rng(uint seed) { s = seed * 747796405u + 2891336453u; if (s == 0) s = 1; }
            public float Next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s & 0xFFFFFF) / 8388607.5f - 1f; }
            public float Unit() => (Next() + 1f) * 0.5f;
        }

        /// <summary>One-pole low-pass, cutoff in Hz.</summary>
        struct LowPass
        {
            float y, a;
            public LowPass(float hz) { y = 0; a = 1f - Mathf.Exp(-2f * Mathf.PI * hz / Rate); }
            public void SetHz(float hz) { a = 1f - Mathf.Exp(-2f * Mathf.PI * hz / Rate); }
            public float Do(float x) { y += a * (x - y); return y; }
        }

        struct HighPass
        {
            LowPass lp;
            public HighPass(float hz) { lp = new LowPass(hz); }
            public float Do(float x) => x - lp.Do(x);
        }

        /// <summary>Chamberlin state-variable band-pass.</summary>
        struct BandPass
        {
            float low, band, f, q;
            public BandPass(float hz, float q) { low = band = 0; f = 2f * Mathf.Sin(Mathf.PI * Mathf.Min(hz, Rate / 6f) / Rate); this.q = 1f / Mathf.Max(0.5f, q); }
            public void SetHz(float hz) { f = 2f * Mathf.Sin(Mathf.PI * Mathf.Min(hz, Rate / 6f) / Rate); }
            public float Do(float x)
            {
                low += f * band;
                float high = x - low - q * band;
                band += f * high;
                return band;
            }
        }

        static float Env(float t, float attack, float decay) =>
            t < attack ? t / Mathf.Max(attack, 1e-5f) : Mathf.Exp(-(t - attack) / Mathf.Max(decay, 1e-5f));

        static float SoftClip(float x) => (float)Math.Tanh(x);

        static AudioClip Clip(string name, float seconds, Func<float, int, float> gen, bool loop = false, float gain = 1f)
        {
            int n = Mathf.Max(1, Mathf.CeilToInt(seconds * Rate));
            var data = new float[n];
            float peak = 1e-4f;
            for (int i = 0; i < n; i++)
            {
                data[i] = gen(i / (float)Rate, i);
                peak = Mathf.Max(peak, Mathf.Abs(data[i]));
            }
            float norm = gain / peak;
            if (loop)
            {
                // Equal-power crossfade of the last 60 ms into the first so the loop point is seamless.
                int fade = Mathf.Min(n / 4, (int)(0.06f * Rate));
                for (int i = 0; i < fade; i++)
                {
                    float w = i / (float)fade;
                    data[i] = data[i] * Mathf.Sqrt(w) + data[n - fade + i] * Mathf.Sqrt(1f - w);
                }
                Array.Resize(ref data, n - fade);
                n -= fade;
            }
            else
            {
                int tail = Mathf.Min(n, 256);
                for (int i = 0; i < tail; i++) data[n - 1 - i] *= i / (float)tail;
            }
            for (int i = 0; i < n; i++) data[i] *= norm;
            var clip = AudioClip.Create("SF_" + name, n, 1, Rate, false);
            clip.SetData(data, 0);
            return clip;
        }

        // ------------------------------------------------------------------ patches
        static AudioClip Build(Sfx s)
        {
            switch (s)
            {
                case Sfx.RifleShot: return Gunshot("RifleShot", 0.55f, 95f, 2600f, 0.09f, 0.16f, 11);
                case Sfx.SmgShot: return Gunshot("SmgShot", 0.38f, 120f, 3400f, 0.06f, 0.1f, 12);
                case Sfx.SniperShot: return Gunshot("SniperShot", 1.4f, 62f, 1900f, 0.16f, 0.42f, 13, 1.35f);
                case Sfx.SuppressedShot: return Suppressed();
                case Sfx.BassPunch: return BassPunch();
                case Sfx.DryFire: return Click("DryFire", 0.05f, 2200f, 0.006f, 31);
                case Sfx.HitTick: return HitTick();
                case Sfx.ArmorCrack: return ArmorCrack();
                case Sfx.HeadshotDing: return MetalDing("HeadshotDing", 0.6f, new[] { 1840f, 2630f, 4410f, 5900f }, 0.18f);
                case Sfx.KillChime: return MetalDing("KillChime", 0.9f, new[] { 1320f, 1980f, 2640f, 3960f }, 0.32f);
                case Sfx.MagOut: return Mechanical("MagOut", new[] { 0f, 0.05f }, new[] { 1700f, 900f }, 0.25f, 41);
                case Sfx.MagIn: return Mechanical("MagIn", new[] { 0f, 0.07f, 0.1f }, new[] { 1200f, 2600f, 3200f }, 0.28f, 42);
                case Sfx.BoltRack: return Mechanical("BoltRack", new[] { 0f, 0.11f }, new[] { 2900f, 2100f }, 0.3f, 43);
                case Sfx.WeaponSwap: return Mechanical("Swap", new[] { 0f, 0.09f }, new[] { 900f, 1500f }, 0.22f, 44, 0.6f);
                case Sfx.PlateInsert: return PlateInsert();
                case Sfx.Footstep: return Footstep("Footstep", 380f, 51);
                case Sfx.FootstepConcrete: return Footstep("FootstepConcrete", 900f, 52);
                case Sfx.Land: return Thud("Land", 0.3f, 70f, 600f, 53);
                case Sfx.SlideScrape: return NoiseSweep("Slide", 0.7f, 1400f, 500f, 2.5f, 54, 0.6f);
                case Sfx.Mantle: return NoiseSweep("Mantle", 0.35f, 700f, 1500f, 1.5f, 55, 0.5f);
                case Sfx.WindRush: return WindLoop("WindRush", 3f, 600f, 1.8f, 61);
                case Sfx.ParachuteOpen: return ParachuteOpen();
                case Sfx.ParachuteFlap: return WindLoop("ParachuteFlap", 2.5f, 260f, 6f, 62);
                case Sfx.AircraftDrone: return AircraftDrone();
                case Sfx.GasCough: return Cough();
                case Sfx.Heartbeat: return Heartbeat();
                case Sfx.BlightHum: return HumLoop("BlightHum", 2.4f, 55f, 0.35f, 71, 0.8f);
                case Sfx.MaskOn: return NoiseSweep("MaskOn", 0.5f, 400f, 2500f, 3f, 72, 0.5f);
                case Sfx.CacheHum: return HumLoop("CacheHum", 2f, 110f, 2.0f, 73, 0.5f);
                case Sfx.CacheOpen: return CacheOpen();
                case Sfx.Pickup: return Blip("Pickup", new[] { 880f, 1320f }, 0.08f);
                case Sfx.CashPickup: return Blip("Cash", new[] { 1568f, 2093f, 2637f }, 0.06f);
                case Sfx.UiClick: return Click("UiClick", 0.04f, 3000f, 0.004f, 81);
                case Sfx.UiBuy: return Blip("UiBuy", new[] { 784f, 988f, 1175f, 1568f }, 0.07f);
                case Sfx.UiDeny: return Blip("UiDeny", new[] { 220f, 185f }, 0.12f, true);
                case Sfx.Explosion: return Explosion("Explosion", 2.2f, 91);
                case Sfx.GrenadePin: return Mechanical("Pin", new[] { 0f, 0.06f }, new[] { 4200f, 3100f }, 0.18f, 92, 0.5f);
                case Sfx.GrenadeBounce: return Click("Bounce", 0.12f, 1600f, 0.03f, 93);
                case Sfx.OrbitalCharge: return OrbitalCharge();
                case Sfx.OrbitalBlast: return Explosion("OrbitalBlast", 3f, 94, 1.4f);
                case Sfx.ReconPing: return Blip("Recon", new[] { 1200f, 1800f }, 0.5f);
                case Sfx.BulletWhiz: return Whiz();
                case Sfx.BulletImpactDirt: return Thud("ImpactDirt", 0.18f, 160f, 2400f, 101);
                case Sfx.BulletImpactMetal: return MetalDing("ImpactMetal", 0.35f, new[] { 2300f, 3700f, 5100f }, 0.07f, 0.6f);
                case Sfx.ShellTink: return MetalDing("Tink", 0.25f, new[] { 5200f, 7400f, 9100f }, 0.05f, 0.4f);
                case Sfx.DroneHum: return HumLoop("DroneHum", 1.6f, 180f, 9f, 111, 0.6f);
                case Sfx.DoorCreak: return Creak();
                case Sfx.VentWhoosh: return NoiseSweep("Vent", 1.6f, 300f, 2400f, 0.9f, 121, 0.8f);
                case Sfx.Countdown: return Blip("Countdown", new[] { 1000f }, 0.12f);
            }
            return Click("Missing", 0.05f, 1000f, 0.01f, 1);
        }

        /// <summary>Muzzle blast: noise crack + filtered body + pitch-dropping sub thump + reverb-ish tail.</summary>
        static AudioClip Gunshot(string name, float len, float thumpHz, float crackHz, float bodyDecay, float tailDecay, uint seed, float drive = 1f)
        {
            var rng = new Rng(seed);
            var crackBp = new BandPass(crackHz, 0.9f);
            var body = new LowPass(1800f);
            var tailLp = new LowPass(700f);
            float phase = 0f;
            float echo1 = 0f, echo2 = 0f;
            var delay = new float[(int)(0.083f * Rate)];
            var delay2 = new float[(int)(0.141f * Rate)];
            int di = 0, di2 = 0;
            return Clip(name, len, (t, i) =>
            {
                float n = rng.Next();
                float crack = crackBp.Do(n) * Env(t, 0.0004f, 0.012f) * 2.2f;
                float bodyN = body.Do(n) * Env(t, 0.0008f, bodyDecay) * 1.6f;
                float f = thumpHz * (1f + 2.2f * Mathf.Exp(-t / 0.012f));
                phase += 2f * Mathf.PI * f / Rate;
                float thump = Mathf.Sin(phase) * Env(t, 0.001f, bodyDecay * 0.9f) * 1.4f;
                float tail = tailLp.Do(n) * Env(t, 0.01f, tailDecay) * 0.45f;
                float dry = crack + bodyN + thump + tail;
                echo1 = delay[di]; delay[di] = dry + echo1 * 0.35f; di = (di + 1) % delay.Length;
                echo2 = delay2[di2]; delay2[di2] = dry + echo2 * 0.3f; di2 = (di2 + 1) % delay2.Length;
                return SoftClip((dry + echo1 * 0.22f + echo2 * 0.16f) * 1.6f * drive);
            }, false, 0.95f);
        }

        static AudioClip Suppressed()
        {
            var rng = new Rng(14);
            var lp = new LowPass(900f);
            var bp = new BandPass(1400f, 2f);
            float ph = 0;
            return Clip("SuppressedShot", 0.32f, (t, i) =>
            {
                float n = rng.Next();
                float puff = lp.Do(n) * Env(t, 0.002f, 0.045f) * 1.5f;
                float clack = bp.Do(n) * Env(t, 0.0005f, 0.01f) * 1.2f;
                ph += 2f * Mathf.PI * (140f + 160f * Mathf.Exp(-t / 0.01f)) / Rate;
                float thump = Mathf.Sin(ph) * Env(t, 0.001f, 0.04f) * 0.8f;
                float mech = (t > 0.035f && t < 0.06f ? bp.Do(rng.Next()) * 0.6f * Env(t - 0.035f, 0.0005f, 0.006f) : 0f);
                return SoftClip(puff + clack + thump + mech);
            }, false, 0.8f);
        }

        static AudioClip BassPunch()
        {
            float ph = 0;
            return Clip("BassPunch", 0.3f, (t, i) =>
            {
                ph += 2f * Mathf.PI * (48f + 90f * Mathf.Exp(-t / 0.02f)) / Rate;
                return SoftClip(Mathf.Sin(ph) * Env(t, 0.002f, 0.08f) * 2.4f);
            }, false, 0.9f);
        }

        static AudioClip HitTick()
        {
            var rng = new Rng(21);
            var hp = new HighPass(3500f);
            return Clip("HitTick", 0.07f, (t, i) =>
            {
                float n = hp.Do(rng.Next()) * Env(t, 0.0003f, 0.008f);
                float tone = Mathf.Sin(2f * Mathf.PI * 4200f * t) * Env(t, 0.0003f, 0.012f) * 0.6f;
                return n + tone;
            }, false, 0.75f);
        }

        /// <summary>Glassy shatter: inharmonic high partials + crackling noise bursts.</summary>
        static AudioClip ArmorCrack()
        {
            var rng = new Rng(22);
            var hp = new HighPass(2200f);
            float[] partials = { 2310f, 3170f, 4520f, 5880f, 7330f };
            float[] decays = { 0.12f, 0.09f, 0.07f, 0.05f, 0.04f };
            return Clip("ArmorCrack", 0.5f, (t, i) =>
            {
                float s = 0;
                for (int k = 0; k < partials.Length; k++) s += Mathf.Sin(2f * Mathf.PI * partials[k] * t + k) * Env(t, 0.0004f, decays[k]) / (k + 1.5f);
                float crackle = 0;
                float r = rng.Unit();
                if (r > 0.985f - 0.1f * Mathf.Exp(-t / 0.05f)) crackle = rng.Next() * 2.5f;
                float n = hp.Do(rng.Next() + crackle) * Env(t, 0.0005f, 0.06f);
                return s * 1.4f + n;
            }, false, 0.85f);
        }

        static AudioClip MetalDing(string name, float len, float[] partials, float decay, float gain = 0.85f)
        {
            return Clip(name, len, (t, i) =>
            {
                float s = 0;
                for (int k = 0; k < partials.Length; k++)
                {
                    float beat = 1f + 0.003f * Mathf.Sin(2f * Mathf.PI * 6f * t);
                    s += Mathf.Sin(2f * Mathf.PI * partials[k] * beat * t) * Env(t, 0.0008f, decay / (1f + k * 0.45f)) / (1f + k * 0.6f);
                }
                return s;
            }, false, gain);
        }

        static AudioClip Mechanical(string name, float[] times, float[] freqs, float len, uint seed, float gain = 0.8f)
        {
            var rng = new Rng(seed);
            var bps = new BandPass[times.Length];
            for (int k = 0; k < times.Length; k++) bps[k] = new BandPass(freqs[k], 3f);
            var lp = new LowPass(500f);
            return Clip(name, len, (t, i) =>
            {
                float n = rng.Next();
                float s = 0;
                for (int k = 0; k < times.Length; k++)
                {
                    float tt = t - times[k];
                    float band = bps[k].Do(n);
                    if (tt >= 0) s += band * Env(tt, 0.0004f, 0.018f) * 2f
                                      + Mathf.Sin(2f * Mathf.PI * freqs[k] * 1.7f * tt) * Env(tt, 0.0004f, 0.01f) * 0.5f;
                }
                s += lp.Do(n) * Env(t, 0.001f, 0.05f) * 0.4f;
                return SoftClip(s);
            }, false, gain);
        }

        static AudioClip PlateInsert()
        {
            var rng = new Rng(45);
            var bp = new BandPass(2400f, 1.2f);
            var lp = new LowPass(300f);
            return Clip("PlateInsert", 0.9f, (t, i) =>
            {
                float n = rng.Next();
                // velcro-like rip: amplitude-modulated noise grains
                float grain = Mathf.Abs(Mathf.Sin(2f * Mathf.PI * 70f * t)) > 0.6f ? 1f : 0.3f;
                float rip = t < 0.35f ? bp.Do(n) * grain * Env(t, 0.03f, 0.25f) : 0f;
                float tt = t - 0.42f;
                float slam = tt > 0 ? (lp.Do(n) * 2.5f + Mathf.Sin(2f * Mathf.PI * 160f * tt) * 1.2f) * Env(tt, 0.001f, 0.06f) : 0f;
                float tt2 = t - 0.5f;
                float tink = tt2 > 0 ? Mathf.Sin(2f * Mathf.PI * 3100f * tt2) * Env(tt2, 0.0005f, 0.05f) * 0.4f : 0f;
                return SoftClip(rip + slam + tink);
            }, false, 0.8f);
        }

        static AudioClip Footstep(string name, float hz, uint seed)
        {
            var rng = new Rng(seed);
            var lp = new LowPass(hz);
            var bp = new BandPass(hz * 3f, 1f);
            return Clip(name, 0.2f, (t, i) =>
            {
                float n = rng.Next();
                float heel = lp.Do(n) * Env(t, 0.002f, 0.03f) * 2f;
                float scuff = bp.Do(n) * Env(t, 0.01f, 0.04f) * 0.6f;
                float body = Mathf.Sin(2f * Mathf.PI * 70f * t) * Env(t, 0.002f, 0.025f) * 0.8f;
                return SoftClip(heel + scuff + body);
            }, false, 0.6f);
        }

        static AudioClip Thud(string name, float len, float toneHz, float lpHz, uint seed)
        {
            var rng = new Rng(seed);
            var lp = new LowPass(lpHz);
            float ph = 0;
            return Clip(name, len, (t, i) =>
            {
                ph += 2f * Mathf.PI * toneHz * (1f + Mathf.Exp(-t / 0.02f)) / Rate;
                return SoftClip(lp.Do(rng.Next()) * Env(t, 0.001f, len * 0.2f) * 2f + Mathf.Sin(ph) * Env(t, 0.001f, len * 0.25f));
            }, false, 0.75f);
        }

        static AudioClip NoiseSweep(string name, float len, float fromHz, float toHz, float q, uint seed, float gain)
        {
            var rng = new Rng(seed);
            var bp = new BandPass(fromHz, q);
            return Clip(name, len, (t, i) =>
            {
                float u = t / len;
                bp.SetHz(Mathf.Lerp(fromHz, toHz, u));
                return bp.Do(rng.Next()) * Mathf.Sin(Mathf.PI * u) * 2f;
            }, false, gain);
        }

        static AudioClip WindLoop(string name, float len, float hz, float gustRate, uint seed)
        {
            var rng = new Rng(seed);
            var bp = new BandPass(hz, 0.7f);
            var lp = new LowPass(hz * 0.4f);
            return Clip(name, len, (t, i) =>
            {
                float gust = 0.65f + 0.35f * Mathf.Sin(2f * Mathf.PI * gustRate * t / len * 2f) * Mathf.Sin(2f * Mathf.PI * 0.7f * t);
                bp.SetHz(hz * (0.8f + 0.4f * gust));
                float n = rng.Next();
                return (bp.Do(n) * 1.5f + lp.Do(n) * 0.8f) * gust;
            }, true, 0.7f);
        }

        static AudioClip ParachuteOpen()
        {
            var rng = new Rng(63);
            var bp = new BandPass(500f, 1f);
            var lp = new LowPass(200f);
            return Clip("ParachuteOpen", 1.1f, (t, i) =>
            {
                float n = rng.Next();
                bp.SetHz(300f + 1600f * Mathf.Exp(-t / 0.25f));
                float whoosh = bp.Do(n) * Env(t, 0.08f, 0.3f) * 1.4f;
                float tt = t - 0.28f;
                float snap = tt > 0 ? (lp.Do(n) * 3f + Mathf.Sin(2f * Mathf.PI * 90f * tt)) * Env(tt, 0.002f, 0.08f) : 0f;
                return SoftClip(whoosh + snap);
            }, false, 0.85f);
        }

        static AudioClip AircraftDrone()
        {
            var rng = new Rng(64);
            var lp = new LowPass(400f);
            float p1 = 0, p2 = 0;
            return Clip("AircraftDrone", 4f, (t, i) =>
            {
                p1 += 2f * Mathf.PI * 58f / Rate; p2 += 2f * Mathf.PI * 87.3f / Rate;
                float saw1 = (p1 / (2f * Mathf.PI)) % 1f * 2f - 1f;
                float saw2 = (p2 / (2f * Mathf.PI)) % 1f * 2f - 1f;
                float prop = 0.6f + 0.4f * Mathf.Sin(2f * Mathf.PI * 29f * t);
                return lp.Do(saw1 * 0.6f + saw2 * 0.4f + rng.Next() * 0.8f) * prop * 2f;
            }, true, 0.7f);
        }

        /// <summary>Two coughs: noise through vocal-tract formant band-passes with glottal bursts.</summary>
        static AudioClip Cough()
        {
            var rng = new Rng(74);
            var f1 = new BandPass(650f, 4f);
            var f2 = new BandPass(1150f, 5f);
            var f3 = new BandPass(2600f, 6f);
            return Clip("GasCough", 1.0f, (t, i) =>
            {
                float n = rng.Next();
                float e = Env(t, 0.008f, 0.09f) + (t > 0.38f ? Env(t - 0.38f, 0.008f, 0.12f) * 0.8f : 0f);
                float buzz = Mathf.Sign(Mathf.Sin(2f * Mathf.PI * 120f * t)) * 0.25f;
                float x = n + buzz;
                return SoftClip((f1.Do(x) * 1.4f + f2.Do(x) + f3.Do(x) * 0.5f) * e * 2f);
            }, false, 0.75f);
        }

        static AudioClip Heartbeat()
        {
            float ph = 0;
            return Clip("Heartbeat", 0.9f, (t, i) =>
            {
                ph += 2f * Mathf.PI * (52f + 20f * Mathf.Exp(-((t % 0.3f) / 0.03f))) / Rate;
                float e = Env(t, 0.006f, 0.06f) + (t > 0.24f ? Env(t - 0.24f, 0.006f, 0.08f) * 0.7f : 0f);
                return SoftClip(Mathf.Sin(ph) * e * 2.2f);
            }, true, 0.9f);
        }

        static AudioClip HumLoop(string name, float len, float baseHz, float tremolo, uint seed, float gain)
        {
            var rng = new Rng(seed);
            var lp = new LowPass(baseHz * 6f);
            // Frequencies are snapped to whole cycles per loop so the loop point is phase-continuous.
            float f0 = Mathf.Round(baseHz * len) / len;
            float trem = Mathf.Max(1f, Mathf.Round(tremolo * len)) / len;
            return Clip(name, len, (t, i) =>
            {
                float s = Mathf.Sin(2f * Mathf.PI * f0 * t) + 0.5f * Mathf.Sin(2f * Mathf.PI * f0 * 2f * t) + 0.25f * Mathf.Sin(2f * Mathf.PI * f0 * 3f * t)
                          + 0.12f * Mathf.Sin(2f * Mathf.PI * f0 * 5f * t);
                float tr = 0.75f + 0.25f * Mathf.Sin(2f * Mathf.PI * trem * t);
                return (s * 0.6f + lp.Do(rng.Next()) * 0.4f) * tr;
            }, false, gain);
        }

        static AudioClip CacheOpen()
        {
            var rng = new Rng(75);
            var bp = new BandPass(800f, 2f);
            return Clip("CacheOpen", 1.2f, (t, i) =>
            {
                float n = rng.Next();
                float hiss = bp.Do(n) * Env(t, 0.02f, 0.2f);
                float tt = t - 0.15f;
                float chord = 0;
                if (tt > 0)
                {
                    float[] f = { 523f, 659f, 784f, 1047f };
                    for (int k = 0; k < f.Length; k++)
                    {
                        float tk = tt - k * 0.05f;
                        if (tk > 0) chord += Mathf.Sin(2f * Mathf.PI * f[k] * tk) * Env(tk, 0.005f, 0.4f) * 0.4f;
                    }
                }
                return hiss + chord;
            }, false, 0.75f);
        }

        static AudioClip Blip(string name, float[] notes, float noteLen, bool square = false)
        {
            float len = notes.Length * noteLen + 0.15f;
            return Clip(name, len, (t, i) =>
            {
                float s = 0;
                for (int k = 0; k < notes.Length; k++)
                {
                    float tk = t - k * noteLen;
                    if (tk < 0) continue;
                    float w = Mathf.Sin(2f * Mathf.PI * notes[k] * tk);
                    if (square) w = Mathf.Sign(w) * 0.5f;
                    s += w * Env(tk, 0.003f, noteLen * 1.2f);
                }
                return s;
            }, false, 0.6f);
        }

        static AudioClip Click(string name, float len, float hz, float decay, uint seed)
        {
            var rng = new Rng(seed);
            var bp = new BandPass(hz, 2f);
            return Clip(name, len, (t, i) => bp.Do(rng.Next()) * Env(t, 0.0003f, decay) * 3f, false, 0.6f);
        }

        static AudioClip Explosion(string name, float len, uint seed, float size = 1f)
        {
            var rng = new Rng(seed);
            var lp = new LowPass(2500f);
            var lp2 = new LowPass(140f);
            var crackle = new BandPass(3000f, 1f);
            float ph = 0;
            var delay = new float[(int)(0.19f * Rate)];
            int di = 0;
            return Clip(name, len, (t, i) =>
            {
                float n = rng.Next();
                lp.SetHz(300f + 4500f * Mathf.Exp(-t / (0.08f * size)));
                float blast = lp.Do(n) * Env(t, 0.002f, 0.35f * size) * 2f;
                float rumble = lp2.Do(n) * Env(t, 0.02f, 0.8f * size) * 4f;
                ph += 2f * Mathf.PI * (38f + 60f * Mathf.Exp(-t / 0.05f)) / Rate;
                float sub = Mathf.Sin(ph) * Env(t, 0.003f, 0.25f * size) * 2f;
                float deb = (rng.Unit() > 0.997f ? 1f : 0f) * crackle.Do(n) * Env(t, 0.1f, 0.6f) * 6f;
                float dry = blast + rumble + sub + deb;
                float echo = delay[di]; delay[di] = dry + echo * 0.4f; di = (di + 1) % delay.Length;
                return SoftClip((dry + echo * 0.3f) * 1.3f);
            }, false, 0.95f);
        }

        static AudioClip OrbitalCharge()
        {
            float ph = 0;
            var rng = new Rng(95);
            var bp = new BandPass(2000f, 3f);
            return Clip("OrbitalCharge", 3f, (t, i) =>
            {
                float f = 200f + 1800f * (t / 3f) * (t / 3f);
                ph += 2f * Mathf.PI * f / Rate;
                bp.SetHz(f * 2f);
                float e = Mathf.Clamp01(t / 2.8f);
                return (Mathf.Sin(ph) * 0.5f + Mathf.Sin(ph * 1.5f) * 0.25f + bp.Do(rng.Next()) * 0.6f) * e;
            }, false, 0.7f);
        }

        static AudioClip Whiz()
        {
            var rng = new Rng(102);
            var bp = new BandPass(4000f, 4f);
            return Clip("Whiz", 0.25f, (t, i) =>
            {
                bp.SetHz(5000f - 3500f * t / 0.25f);
                return bp.Do(rng.Next()) * Mathf.Sin(Mathf.PI * t / 0.25f) * 2.5f;
            }, false, 0.6f);
        }

        static AudioClip Creak()
        {
            float ph = 0;
            var rng = new Rng(112);
            return Clip("DoorCreak", 0.8f, (t, i) =>
            {
                float f = 280f + 120f * Mathf.Sin(2f * Mathf.PI * 1.3f * t) + rng.Next() * 20f;
                ph += 2f * Mathf.PI * f / Rate;
                float stick = Mathf.Pow(Mathf.Abs(Mathf.Sin(ph * 0.5f)), 8f);
                return (stick * 2f - 0.3f) * Mathf.Sin(Mathf.PI * t / 0.8f);
            }, false, 0.5f);
        }
    }
}
