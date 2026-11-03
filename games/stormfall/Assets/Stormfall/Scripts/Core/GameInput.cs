using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Stormfall
{
    public enum GameKey
    {
        Forward, Back, Left, Right,
        Jump, Crouch, Sprint, Fire, Aim, Reload, Interact, Plate, Mount,
        Map, Weapon1, Weapon2, Killstreak, FireMode, Grenade, Escape, Confirm,
        Buy1, Buy2, Buy3, Buy4, Buy5, Buy6
    }

    /// <summary>
    /// Single input facade. Reads the Input System directly (no action asset needed) and falls back
    /// to the legacy Input Manager when no Input System devices are present.
    /// </summary>
    public static class GameInput
    {
        public static float MouseSensitivity = 0.11f;
        public static float LegacyMouseScale = 12f;

        /// <summary>When true (menus open, match over) gameplay queries return neutral values.</summary>
        public static bool GameplayBlocked;

        static int s_LockFrame = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetStatics() { GameplayBlocked = false; s_LockFrame = -1; }

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void OnSceneLoaded()
        {
            UnityEngine.SceneManagement.SceneManager.sceneLoaded += (s, m) => GameplayBlocked = false;
        }

        public static Vector2 Move
        {
            get
            {
                if (GameplayBlocked) return Vector2.zero;
                float x = (Held(GameKey.Right) ? 1f : 0f) - (Held(GameKey.Left) ? 1f : 0f);
                float y = (Held(GameKey.Forward) ? 1f : 0f) - (Held(GameKey.Back) ? 1f : 0f);
                var v = new Vector2(x, y);
                return v.sqrMagnitude > 1f ? v.normalized : v;
            }
        }

        /// <summary>Look delta in degrees for this frame.</summary>
        public static Vector2 Look
        {
            get
            {
                if (GameplayBlocked || Cursor.lockState != CursorLockMode.Locked) return Vector2.zero;
#if ENABLE_INPUT_SYSTEM
                if (Mouse.current != null)
                    return Mouse.current.delta.ReadValue() * MouseSensitivity;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
                return new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * MouseSensitivity * LegacyMouseScale;
#else
                return Vector2.zero;
#endif
            }
        }

        public static float Scroll
        {
            get
            {
                if (GameplayBlocked) return 0f;
#if ENABLE_INPUT_SYSTEM
                if (Mouse.current != null) return Mouse.current.scroll.ReadValue().y;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
                return Input.mouseScrollDelta.y;
#else
                return 0f;
#endif
            }
        }

        public static bool Held(GameKey k) => !Blocks(k) && Query(k, 0);
        public static bool Pressed(GameKey k) => !Blocks(k) && Query(k, 1);
        public static bool Released(GameKey k) => !Blocks(k) && Query(k, 2);

        /// <summary>Raw query that ignores GameplayBlocked (used by menus).</summary>
        public static bool PressedRaw(GameKey k) => Query(k, 1);

        static bool Blocks(GameKey k)
        {
            if (!GameplayBlocked) return false;
            return k != GameKey.Escape && k != GameKey.Confirm && k != GameKey.Interact && k != GameKey.Map &&
                   (k < GameKey.Buy1 || k > GameKey.Buy6);
        }

        /// <summary>Locks the cursor on click, releases it on Escape. Call once per frame from one place.</summary>
        public static void UpdateCursor(bool wantFree)
        {
            if (s_LockFrame == Time.frameCount) return;
            s_LockFrame = Time.frameCount;
            if (wantFree)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                return;
            }
            if (Query(GameKey.Escape, 1))
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            else if (Cursor.lockState != CursorLockMode.Locked && MouseButtonDown())
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
        }

        static bool MouseButtonDown()
        {
#if ENABLE_INPUT_SYSTEM
            if (Mouse.current != null) return Mouse.current.leftButton.wasPressedThisFrame;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            return Input.GetMouseButtonDown(0);
#else
            return false;
#endif
        }

        // mode: 0 held, 1 pressed this frame, 2 released this frame
        static bool Query(GameKey k, int mode)
        {
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            var mouse = Mouse.current;
            if (kb != null || mouse != null)
            {
                if (k == GameKey.Fire || k == GameKey.Aim)
                {
                    if (mouse == null) return false;
                    var b = k == GameKey.Fire ? mouse.leftButton : mouse.rightButton;
                    return mode == 0 ? b.isPressed : mode == 1 ? b.wasPressedThisFrame : b.wasReleasedThisFrame;
                }
                if (kb == null) return false;
                if (k == GameKey.Sprint) return KeyState(kb.leftShiftKey, mode) || KeyState(kb.rightShiftKey, mode);
                if (k == GameKey.Confirm) return KeyState(kb.enterKey, mode) || KeyState(kb.numpadEnterKey, mode);
                return KeyState(kb[KeyFor(k)], mode);
            }
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            if (k == GameKey.Fire || k == GameKey.Aim)
            {
                int btn = k == GameKey.Fire ? 0 : 1;
                return mode == 0 ? Input.GetMouseButton(btn) : mode == 1 ? Input.GetMouseButtonDown(btn) : Input.GetMouseButtonUp(btn);
            }
            var lk = LegacyKeyFor(k);
            return mode == 0 ? Input.GetKey(lk) : mode == 1 ? Input.GetKeyDown(lk) : Input.GetKeyUp(lk);
#else
            return false;
#endif
        }

#if ENABLE_INPUT_SYSTEM
        static bool KeyState(UnityEngine.InputSystem.Controls.KeyControl c, int mode) =>
            mode == 0 ? c.isPressed : mode == 1 ? c.wasPressedThisFrame : c.wasReleasedThisFrame;

        static Key KeyFor(GameKey k)
        {
            switch (k)
            {
                case GameKey.Forward: return Key.W;
                case GameKey.Back: return Key.S;
                case GameKey.Left: return Key.A;
                case GameKey.Right: return Key.D;
                case GameKey.Jump: return Key.Space;
                case GameKey.Crouch: return Key.C;
                case GameKey.Sprint: return Key.LeftShift;
                case GameKey.Reload: return Key.R;
                case GameKey.Interact: return Key.F;
                case GameKey.Plate: return Key.G;
                case GameKey.Mount: return Key.V;
                case GameKey.Map: return Key.M;
                case GameKey.Weapon1: return Key.Digit1;
                case GameKey.Weapon2: return Key.Digit2;
                case GameKey.Killstreak: return Key.Digit3;
                case GameKey.FireMode: return Key.B;
                case GameKey.Grenade: return Key.Q;
                case GameKey.Escape: return Key.Escape;
                case GameKey.Confirm: return Key.Enter;
                case GameKey.Buy1: return Key.Digit1;
                case GameKey.Buy2: return Key.Digit2;
                case GameKey.Buy3: return Key.Digit3;
                case GameKey.Buy4: return Key.Digit4;
                case GameKey.Buy5: return Key.Digit5;
                case GameKey.Buy6: return Key.Digit6;
            }
            return Key.None;
        }
#endif

#if ENABLE_LEGACY_INPUT_MANAGER
        static KeyCode LegacyKeyFor(GameKey k)
        {
            switch (k)
            {
                case GameKey.Forward: return KeyCode.W;
                case GameKey.Back: return KeyCode.S;
                case GameKey.Left: return KeyCode.A;
                case GameKey.Right: return KeyCode.D;
                case GameKey.Jump: return KeyCode.Space;
                case GameKey.Crouch: return KeyCode.C;
                case GameKey.Sprint: return KeyCode.LeftShift;
                case GameKey.Reload: return KeyCode.R;
                case GameKey.Interact: return KeyCode.F;
                case GameKey.Plate: return KeyCode.G;
                case GameKey.Mount: return KeyCode.V;
                case GameKey.Map: return KeyCode.M;
                case GameKey.Weapon1: return KeyCode.Alpha1;
                case GameKey.Weapon2: return KeyCode.Alpha2;
                case GameKey.Killstreak: return KeyCode.Alpha3;
                case GameKey.FireMode: return KeyCode.B;
                case GameKey.Grenade: return KeyCode.Q;
                case GameKey.Escape: return KeyCode.Escape;
                case GameKey.Confirm: return KeyCode.Return;
                case GameKey.Buy1: return KeyCode.Alpha1;
                case GameKey.Buy2: return KeyCode.Alpha2;
                case GameKey.Buy3: return KeyCode.Alpha3;
                case GameKey.Buy4: return KeyCode.Alpha4;
                case GameKey.Buy5: return KeyCode.Alpha5;
                case GameKey.Buy6: return KeyCode.Alpha6;
            }
            return KeyCode.None;
        }
#endif
    }
}
