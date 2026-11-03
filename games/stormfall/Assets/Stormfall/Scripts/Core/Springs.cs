using UnityEngine;

namespace Stormfall
{
    /// <summary>Closed-form damped springs (see GUNPLAY_MATH §1). Exact for any delta time.</summary>
    public static class SpringMath
    {
        /// <summary>Critically damped step toward zero.</summary>
        public static void Critical(ref float x, ref float v, float omega, float dt)
        {
            float e = Mathf.Exp(-omega * dt);
            float t = v + omega * x;
            x = (x + t * dt) * e;
            v = (v - omega * t * dt) * e;
        }

        /// <summary>Under-damped step toward zero (0 &lt; zeta &lt; 1).</summary>
        public static void Underdamped(ref float x, ref float v, float omega, float zeta, float dt)
        {
            if (zeta >= 0.999f) { Critical(ref x, ref v, omega, dt); return; }
            float a = zeta * omega;
            float wd = omega * Mathf.Sqrt(1f - zeta * zeta);
            float b = (v + a * x) / wd;
            float e = Mathf.Exp(-a * dt);
            float c = Mathf.Cos(wd * dt), s = Mathf.Sin(wd * dt);
            float nx = e * (x * c + b * s);
            float nv = e * (v * c - (a * b + x * wd) * s);
            x = nx; v = nv;
        }

        /// <summary>Velocity impulse that makes a critically damped spring peak at <paramref name="peak"/>.</summary>
        public static float ImpulseForPeak(float peak, float omega) => peak * omega * 2.7182818f;
    }

    [System.Serializable]
    public struct Spring3
    {
        public Vector3 x, v;
        public float omega, zeta;

        public Spring3(float omega, float zeta) { x = v = Vector3.zero; this.omega = omega; this.zeta = zeta; }

        public void Step(float dt) => Step(Vector3.zero, dt);

        public void Step(Vector3 target, float dt)
        {
            float px = x.x - target.x, py = x.y - target.y, pz = x.z - target.z;
            float vx = v.x, vy = v.y, vz = v.z;
            SpringMath.Underdamped(ref px, ref vx, omega, zeta, dt);
            SpringMath.Underdamped(ref py, ref vy, omega, zeta, dt);
            SpringMath.Underdamped(ref pz, ref vz, omega, zeta, dt);
            x = new Vector3(px + target.x, py + target.y, pz + target.z);
            v = new Vector3(vx, vy, vz);
        }

        public void AddImpulse(Vector3 dv) => v += dv;
    }

    public static class Ease
    {
        public static float OutCubic(float t) { t = Mathf.Clamp01(t); float i = 1f - t; return 1f - i * i * i; }
        public static float InOutSine(float t) => -(Mathf.Cos(Mathf.PI * Mathf.Clamp01(t)) - 1f) * 0.5f;
        public static float Damp(float current, float target, float rate, float dt) =>
            Mathf.Lerp(current, target, 1f - Mathf.Exp(-rate * dt));
        public static Vector3 Damp(Vector3 current, Vector3 target, float rate, float dt) =>
            Vector3.Lerp(current, target, 1f - Mathf.Exp(-rate * dt));
    }
}
