# STORMFALL — Gunplay Mathematics

All angles are in degrees unless noted. `Δt` is the frame delta. `Springs.cs`,
`ProceduralWeaponController.cs` and `Ballistics.cs` implement every formula here.

---

## 1. Springs

### 1.1 Critically damped spring (ζ = 1)

Used for mouse-look lag sway, camera view-kick recentering, ADS-adjacent offsets and FOV kicks.
For displacement `x` from target, velocity `v` and stiffness `ω` (rad/s), the closed form is exact
for any `Δt`:

```
e  = exp(−ω·Δt)
x' = (x + (v + ω·x)·Δt) · e
v' = (v − ω·(v + ω·x)·Δt) · e
```

Struck from rest with impulse `v₀`, the displacement is `x(t) = v₀·t·e^(−ωt)`. It peaks at
`t* = 1/ω` with `x* = v₀/(ω·e)`. To get a visible peak of `k`, inject `v₀ = k·ω·e`.

### 1.2 Under-damped spring (0 < ζ < 1)

Used for the viewmodel gun-kick, where a slight overshoot gives the "snap":

```
a  = ζω,   ω_d = ω·√(1−ζ²)
B  = (v + a·x) / ω_d
x' = e^(−aΔt) · ( x·cos(ω_dΔt) + B·sin(ω_dΔt) )
v' = e^(−aΔt) · ( v·cos(ω_dΔt) − (a·B + x·ω_d)·sin(ω_dΔt) )
```

Gun-kick defaults: `ω = 26`, `ζ = 0.55` (position) and `ω = 22`, `ζ = 0.45` (rotation).

---

## 2. Dual-layer recoil

Each shot drives two independent layers.

### 2.1 Camera view-kick (what you aim with)

For shot index `n` in the current spray (reset after 0.25 s without firing):

```
pattern(n) = 1 + 0.35·(1 − e^(−n/6))                        rising first-shots curve
kickPitch  = R_v · pattern(n) · M
kickYaw    = R_h · (0.6·drift(n) + 0.4·U(−1,1)) · M
drift(n)   = sin(n·0.7 + seed)                                deterministic S-pattern
M          = mount(0.30 | 1.0) · attach · stance(crouch 0.85, prone 0.7) · (ADS ? 1.0 : 1.15)
```

* The **climb** layer takes `kickPitch` and `kickYaw` straight into `aimOffset`. That offset
  recovers toward zero at `recoverRate · (1 − e^(−8τ))`, where `τ` is time since the last shot.
  Recovery only starts `0.08 s` after the last shot, so pulling down against a full spray works.
* The **punch** layer injects `v₀ = 0.6·kickPitch·ω·e` into a critically damped spring
  (`ω = 18`). It adds a transient bump with no drift.

The final camera pitch is `pitch_player − climb.pitch − punch.pitch`, and yaw works the same
way.

### 2.2 Weapon viewmodel gun-kick (what you see)

These impulses go into the under-damped springs on the viewmodel transform:

```
Δz      = −G_back · M                       kick-back   (MCR-4 0.045 m, Striker 0.030, KATT 0.110)
Δpitch  = −G_rise · M                       muzzle rise (MCR-4 2.2°, Striker 1.6°, KATT 9.0°)
Δroll   = G_roll · U(−1,1)                  roll jitter (MCR-4 1.8°, Striker 2.4°, KATT 4.0°)
Δyaw    = 0.35·G_roll · U(−1,1)
```

The gun-kick never changes where bullets go. Only the view-kick does.

### 2.3 Mounting

Press **V** while a surface lies within 0.8 m in front of the chest (or a ledge 0.25–0.6 m below
the muzzle) to mount. Mounting sets `M_mount = 0.30` (−70%), cuts sway by 80%, and lowers or
raises the weapon to the surface. It breaks on any movement input above 0.2, a jump, or a stance
change.

---

## 3. Hip-fire bloom cone

The spread is a cone half-angle `σ`:

```
σ_hip = (S_hip + S_move·s + S_air·airborne + β) · (crouch 0.8 | prone 0.6)
σ_ads = S_ads + 0.15·β
σ     = lerp(σ_hip, σ_ads, e_ads)              e_ads from §4
s     = clamp01(|v_xz| / 8.25)
β    ← min(β + B_shot, B_max)  per shot
β    ← β · e^(−B_rec·Δt)        every frame
```

Shots are sampled uniformly over the disc of the cone:

```
r   = tan(σ)·√u₁,   θ = 2π·u₂
dir = normalize(fwd + right·r·cosθ + up·r·sinθ)
```

The crosshair tick distance (pixels from the centre) maps the cone to the screen:

```
gap_px = tan(σ) / tan(FOV_v / 2) · (H/2) + 6
alpha  = 1 − e_ads
```

| Weapon | S_hip | S_move | S_ads | B_shot | B_max | B_rec |
| --- | --- | --- | --- | --- | --- | --- |
| MCR-4 | 2.6 | 2.4 | 0.08 | 0.35 | 3.2 | 5.0 |
| Striker-9 | 2.0 | 1.6 | 0.12 | 0.25 | 2.4 | 6.5 |
| KATT-AMR | 6.0 | 4.0 | 0.00 | 2.50 | 5.0 | 2.5 |

---

## 4. ADS (200 ms cubic ease-out)

```
t     ← clamp01(t ± Δt / T_ads)               T_ads = 0.200 s (× attachment mod)
e_ads = 1 − (1 − t)³                           cubic ease-out
pos   = lerp(P_hip, P_ads, e_ads)
P_ads = −S_local + (0, 0, D_eye)               S_local = sight socket in weapon space
FOV   = lerp(FOV_base, FOV_ads, e_ads)
```

`P_ads` places the sight socket exactly on the camera axis at `(0, 0)` screen-space, `D_eye`
metres in front of the eye (0.16 m on the holo, 0.10 m on the scope). The holo reticle is an
emissive red dot quad inside the optic glass at the socket. The screen centre therefore lines up
with the bullet axis.

Look sensitivity is scaled so the angular speed per mouse count matches what the eye sees:

```
sens_ads = sens · tan(FOV/2) / tan(FOV_base/2)
```

The KATT-AMR scope sets `FOV_ads = 12°` and shows a full-screen scope overlay once
`e_ads > 0.9`. Hold breath (**Shift**, 4 s) scales sway by 0.1. After that the shooter is winded
for 2 s (sway × 1.6).

---

## 5. Sway

```
breath(t) = A_b · ( sin(ω_b t),  ½ sin(2 ω_b t) )                  figure-8 Lissajous, ω_b = 2π·0.33
look      = critically-damped spring toward clamp(−Δlook · 0.045, ±6°), ω = 14
bob       = ( A_x·sin(φ),  A_y·|sin(φ)| )                          φ from controller step phase
```

`A_b` is 0.35° hip, 0.12° ADS and 0.6° scoped. Bob amplitude scales with
`|v_xz| / V₀` and drops by 85% in ADS.

---

## 6. Damage model

### 6.1 Range falloff

```
f(d) = 1                                     d ≤ r₁
f(d) = lerp(1, m, smoothstep(r₁, r₂, d))     r₁ < d < r₂
f(d) = m                                     d ≥ r₂
```

| Weapon | Base | r₁ | r₂ | m | RPM | Muzzle v |
| --- | --- | --- | --- | --- | --- | --- |
| MCR-4 Carbine | 28 | 35 m | 65 m | 0.75 | 720 | 780 m/s |
| Striker-9 | 22 | 12 m | 28 m | 0.60 | 900 | 420 m/s |
| KATT-AMR | 160 | 150 m | 400 m | 0.90 | 48 (bolt) | 950 m/s |

### 6.2 Hitbox multipliers

| Zone | Multiplier |
| --- | --- |
| Head | 1.60 |
| Upper torso | 1.10 |
| Lower torso | 1.00 |
| Limbs | 0.85 |

`dmg = Base · f(d) · zone · attach_dmg`

### 6.3 Armour

```
armourDamage = min(dmg, armour)
healthDamage = dmg − armourDamage            (overflow carries through)
cellBroken   = a cell boundary (multiple of 50) was crossed
```

The hitmarker tier comes from the result. **Red** means a headshot, downed or kill. **Cyan** with
the "CELL BROKEN" text means a cell broke. **Cyan** without text means armour took damage.
**White** means flesh.

### 6.4 Time to kill against full armour (250 EHP), upper torso

| Weapon | Shots | TTK |
| --- | --- | --- |
| MCR-4 | ⌈250/30.8⌉ = 9 | 8/12 s = 0.667 s |
| Striker-9 (≤12 m) | ⌈250/24.2⌉ = 11 | 10/15 s = 0.667 s |
| KATT-AMR head | ⌈250/256⌉ = 1 | instant |

---

## 7. Projectile ballistics

Bullets are simulated projectiles stepped at `h = 1/240 s`:

```
v ← v·e^(−k·h) + g·h          k = 0.04 s⁻¹ (drag), g = (0, −9.81, 0)
p ← p + v·h
```

Each step casts a ray from `p_prev` to `p` (§1.3 of the tech spec). A bullet expires after
`2.5 s` or 1200 m. Tracers stretch along the last `0.04 s` of travel, and every third round shows
one (every round on the KATT).

---

## 8. Staged reloads

Reload progress `ρ ∈ [0,1]` advances at `1/(T_reload / speedMod)`. *Quickhands* gives
`speedMod = 1.35`.

| Checkpoint | ρ | Event |
| --- | --- | --- |
| Mag out | 0.30 | old magazine drops, `magOut` clack |
| Mag in | 0.70 | ammo moves from reserve, `magIn` clack |
| Bolt release | 1.00 | `bolt` clack (empty reloads only) |

A **tactical** reload (mag not empty) finishes at `ρ = 0.70` and keeps one round chambered
(`mag + 1`). Sprinting or swapping weapons cancels a reload and sets `ρ` back to the last
checkpoint passed (0, 0.30 or 0.70), so the next reload resumes from there.
