# STORMFALL — Technical Specification

STORMFALL is an original tactical battle royale for Unity 6.6 (`6000.6.7f1`) and URP 17.
Everything in the playable build is generated in code: meshes, PCM audio, URP materials, the
island terrain, the HUD and the bots. You can rebuild the whole game from an empty project with
**Tools → Build Complete Stormfall Game**.

This document covers architecture and movement. Gunplay maths is in
[`GUNPLAY_MATH.md`](GUNPLAY_MATH.md).

---

## 1. Project layout

```
Assets/
  Editor/StormfallSceneSetup.cs          1-click builder (menu item, assets, scene)
  Stormfall/
    Resources/StormfallAssets.asset      runtime asset registry (materials, weapons)
    Generated/                           builder output (materials, meshes, terrain, SOs)
    Scenes/Stormfall.unity               the playable scene
    Scripts/
      Core/      GameInput, Springs, ProceduralAudioBank, AudioFX, ProceduralMeshBuilder,
                 MaterialLibrary, StormfallAssets, UITextures, GameEvents
      Player/    TacticalPlayerController, InfilAircraft, PlayerHealthArmor, PlayerCameraFX
      Weapons/   WeaponData, WeaponInstance, ProceduralWeaponController, WeaponViewmodelFactory,
                 Ballistics, WeaponFX, FragGrenade
      Combat/    DamageInfo, IDamageable, HitboxZone, CombatantRegistry
      Match/     StormRingAndMatchManager, RebootTrial, SentryDrone, UpdraftVent
      Economy/   SupplyTerminalAndLootManager, LootCache, LootPickup, FieldOpsTablet, KitPod,
                 Killstreaks, Door
      AI/        TacticalBotAI, BotSquad, BotBody, CoverPoint
      UI/        StormfallHUDController, HUDBuilder
      World/     FoliageWind, PostFXController, WaterSurface
Docs/
  TECHNICAL_SPEC.md   (this file)
  GUNPLAY_MATH.md
```

Namespace: `Stormfall`. No third-party packages. Required packages are already in
`Packages/manifest.json`: URP 17.6, Input System 1.20, uGUI 2.6.

### 1.1 Engine rules

| Rule | Implementation |
| --- | --- |
| URP shaders only | `MaterialLibrary` only ever calls `Shader.Find("Universal Render Pipeline/Lit")` and `Shader.Find("Universal Render Pipeline/Particles/Unlit")`. Terrain uses the pipeline's own `defaultTerrainMaterial`. The builder saves every material as an asset, so the shaders are always included in player builds. |
| Input | `GameInput` reads `UnityEngine.InputSystem` devices directly. When `ENABLE_LEGACY_INPUT_MANAGER` is defined and no Input System device exists, it falls back to `UnityEngine.Input`. `activeInputHandler` is set to **Both** (`2`). |
| Audio | `ProceduralAudioBank` synthesises every sound into `AudioClip.Create` buffers at 44.1 kHz on first use. Nothing ships as a file. |
| Meshes | `ProceduralMeshBuilder` builds every gun, prop, tree, rock and character. It uses smooth radial normals, rounded boxes made by sphere-projection, and sub-meshes for each material slot. |

### 1.2 Runtime data flow

```
GameInput ──► TacticalPlayerController ──► CharacterController
     │                │ (stance, speed, bob phase, FOV kick)
     │                ▼
     └──────► ProceduralWeaponController ──► Ballistics (projectiles, tracers, impacts)
                      │                              │
                      ▼                              ▼
               PlayerCameraFX (view kick)      HitboxZone ─► IDamageable.TakeDamage
                                                             │
                     GameEvents (static C# events) ◄─────────┘
                              │
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                         ▼
 StormfallHUDController  StormRingAndMatchManager   TacticalBotAI (hearing)
```

`GameEvents` is a static event hub: `ShotFired`, `DamageDealt`, `CombatantDowned`,
`CombatantKilled`, `CashChanged`, `Callout`, `XpAwarded`. Systems subscribe in `OnEnable` and
unsubscribe in `OnDisable`, so no system holds a hard reference to the HUD.

### 1.3 Hit resolution without layers

The builder does not touch the Tag Manager, so physics queries never depend on custom layers.
`Ballistics.Resolve` casts `Physics.RaycastNonAlloc` with `QueryTriggerInteraction.Collide`,
sorts hits by distance, then walks them:

1. Skip colliders under the shooter's root transform.
2. Skip `CharacterController` capsules (the hitboxes inside them do the work).
3. Skip triggers that have no `HitboxZone` (storm volume, interaction zones).
4. On a `HitboxZone`, apply damage × zone multiplier and stop.
5. Anything else is world geometry. Spawn an impact and stop.

---

## 2. Movement (`TacticalPlayerController`)

The controller is a Quake-derived kinematic model driven through Unity's `CharacterController`.
The simulation runs in fixed sub-steps of at most `1/120 s` inside `Update`, which keeps
acceleration and friction identical between 30 FPS and 240 FPS.

### 2.1 Wish direction

```
input   = (strafe, forward) ∈ [-1,1]², normalised if |input| > 1
wishdir = normalize(forward·camForwardFlat + strafe·camRightFlat)
```

The per-axis speed multiplier is blended from the input weights so diagonal movement is continuous:

```
fwdW  = max(input.y, 0),  backW = max(-input.y, 0),  sideW = |input.x|
dirMul = (fwdW·1.00 + backW·0.75 + sideW·0.85) / (fwdW + backW + sideW)
```

### 2.2 Speed table (base `V₀ = 5.0 m/s`)

| Stance | Multiplier | Speed |
| --- | --- | --- |
| Walk forward | 1.00 | 5.00 m/s |
| Strafe | 0.85 | 4.25 m/s |
| Backpedal | 0.75 | 3.75 m/s |
| ADS walk | 0.60 | 3.00 m/s |
| Crouch | 0.55 | 2.75 m/s |
| Prone crawl | 0.25 | 1.25 m/s |
| Downed crawl | 0.20 | 1.00 m/s |
| Sprint | 1.35 | 6.75 m/s |
| Tactical sprint | 1.65 | 8.25 m/s |

`wishspeed = V₀ · dirMul · stanceMul · weaponMoveMul`. Sprint and tactical sprint ignore
`dirMul` and need the forward input to be above 0.5.

### 2.3 Ground acceleration — `PM_Accelerate`

```
currentspeed = dot(v, wishdir)
addspeed     = wishspeed − currentspeed
if addspeed ≤ 0: return
accelspeed   = min(a · Δt · wishspeed, addspeed)
v           += accelspeed · wishdir
```

`a_ground = 12`, `a_air = 2` with air `wishspeed` capped at `1.2 m/s`. Because of the
projection, strafing in the air turns the velocity without adding speed beyond the cap.

### 2.4 Surface friction — `PM_Friction`

```
speed = |v_xz|
if speed < 0.05: v_xz = 0; return
control  = max(speed, stopspeed)                 stopspeed = 2.5 m/s
drop     = control · μ · Δt                      μ_ground = 8, μ_crouch = 9
newspeed = max(speed − drop, 0)
v_xz    *= newspeed / speed
```

Friction runs before acceleration on every grounded step and never runs in the air.

### 2.5 Frame-rate independence

Each frame is split into `n = ceil(Δt / (1/120))` sub-steps with `h = Δt/n`. Friction and
acceleration are linear in `h`, so the error stays below 1% between 30 and 240 FPS. Camera
springs use the closed-form critically damped integrator in `GUNPLAY_MATH §1`, which is exact for
any `Δt`.

### 2.6 Tactical sprint

* Double-tap **Shift** within `0.30 s` while moving forward to start a tactical sprint.
* It lasts `4.0 s` (`8.0 s` with the *Fleetfoot* perk), then falls back to standard sprint and
  recharges for `3.0 s`.
* Camera: `+8°` FOV kick (standard sprint `+4°`), eased with `1 − e^(−10t)`. The head bob runs at
  `2.2 Hz` per step with vertical amplitude `0.055 m` and lateral `0.03 m`. The phase uses
  `|sin|`, which gives a two-step "bounce".
* Weapon: tactical-sprint pose pitches the gun `−48°` (muzzle up, high chest), rolls it `18°` and
  lifts it `+0.06 m`.

### 2.7 Slide and slide-cancel

Starting a slide (press **C** while sprinting):

```
v₀ = max(1.5·V₀, |v_xz|·1.10)            (7.5 m/s minimum)
duration T = 0.65 s
collider height 1.8 → 0.9 m, camera roll 6°, camera height 1.62 → 0.85 m
```

Slide decay is exponential, so the result does not depend on frame rate:

```
v(t) = v_end + (v₀ − v_end)·e^(−k·t),   k = 3.2 s⁻¹, v_end = crouch speed
```

After `T` the slide ends crouched. Pressing **Space** during a slide cancels it: the player
stands (if headroom allows), keeps `|v|`, and the tactical-sprint timer and charge reset to full.

### 2.8 Dolphin dive and prone

While tactical sprinting, press **C** to start a slide. If **C** is still held `0.15 s` later, the
slide turns into a dive:

```
v = forward·9.0 + up·3.6,   gravity 22 m/s²
```

On landing the player goes prone (collider `0.6 m`, eye `0.35 m`). Press **C** or **Space** to
stand.

### 2.9 Ledge mantle

When the player presses **Space**:

1. A chest ray (1.1 m up) and a knee ray (0.45 m up) are cast forward `0.9 m`.
2. If the knee ray hits, a downward ray from `(hit + forward·0.35 + up·2.0)` finds the ledge top
   `y_top`.
3. A mantle is valid when `0.6 ≤ y_top − y_feet ≤ 1.6`, there is capsule clearance at the top, and
   the surface normal is within 35° of vertical.
4. Movement follows a two-segment curve over `t_m = 0.25 + 0.15·(h/1.6) s`: an eased vertical
   rise, then a forward push. The camera dips 4° in pitch at mid-mantle.

### 2.10 Infil, free-fall and parachute

| Phase | Behaviour |
| --- | --- |
| Aircraft | Cargo aircraft *Skyhauler* flies a randomised chord across the island at 600 m and 70 m/s. The player rides the rear ramp. **Space** jumps. The player is auto-ejected at the end of the route. |
| Free-fall | Vertical speed eases to `−50 m/s` (head-down **W** dive: `−65 m/s`). Horizontal glide is `18 m/s` and steers by camera yaw. Wind-rush audio volume follows speed. |
| Parachute | **Space** deploys it (needs > 25 m height; auto-deploys at 60 m). Descent is `−6 m/s` and glide `14 m/s`. **C** cuts the chute. Redeploy is allowed after `1.0 s` while > 25 m. |
| Touchdown | A ground probe under 1.2 m returns the player to ground movement. A 0.3 s landing dip cancels any fall damage. |

The same free-fall/parachute path handles Updraft Vents and post-Reboot redeploys.

---

## 3. Combat systems

### 3.1 Health and armour (`PlayerHealthArmor`)

Players and bots share this component.

* `100` HP. Regenerates `40 HP/s` after `5.0 s` without damage.
* Three armour cells of `50` each. Damage drains armour first. Overflow carries into health, so a
  shot that breaks the last cell still damages HP (no "free" break).
* Hold **G** to insert cells one after another (`1.5 s` each, `0.9 s` with *Bulwark*). The weapon
  lowers while the left hand inserts each cell.
* Below `35 HP` a red edge vignette and heartbeat pulse at `1.1 Hz`.
* At `0 HP` the player is **downed** for `30 s` (crawl, no weapon). Holding **F** for `6.0 s`
  with a Stim Reviver restores `30 HP`. Downed bots bleed out after `12 s`, or die from any
  further damage.
* Gas mask: auto-dons inside the Blight (`1.0 s`). It absorbs 10 damage ticks (1 tick/s) and
  shows a visor overlay.

### 3.2 Blight ring (`StormRingAndMatchManager`)

| Stage | Radius after | Wait | Shrink |
| --- | --- | --- | --- |
| 1 | 260 m | 45 s | 60 s |
| 2 | 160 m | 40 s | 50 s |
| 3 | 90 m | 35 s | 40 s |
| 4 | 45 m | 30 s | 30 s |
| 5 | 12 m | 25 s | 25 s |

The starting radius is 420 m. Each next centre is picked uniformly inside the disc of radius
`R_cur − R_next` around the current centre, so the next circle always fits inside the current
one. Outside the ring, health takes `12 HP/s` directly (armour is bypassed), in 1 s ticks.

The wall is a 600 m tall cylinder with a transparent emissive URP Lit material, cull off, and a
scrolling noise texture, plus particle motes near the player.

### 3.3 Reboot Trial

STORMFALL's own second-chance mechanic. On the player's first death they wake inside a sealed
concrete test chamber 2 km off the coast. Six **sentry drones** hover and fire bursts. The player
has `60 s`, a Striker-9 and no armour. Destroying every drone redeploys them by parachute over the
current safe zone with `$800`. Dying or timing out ends the match.

### 3.4 Economy

* Cash from ground stacks, caches and eliminated bots.
* **Supply Terminals** (**F**): Armour Cell Pack `$1,200`, Gas Mask `$2,500`, Stim Reviver
  `$3,500`, Recon Pulse `$3,000`, Orbital Lance `$4,500`, Kit Pod `$8,000`.
* **Caches**: standard (blue) and vault (orange) give off a spatial hum and burst open with
  rarity-coloured loot. Rarities run Common (grey), Uncommon (green), Rare (blue), Epic (purple)
  and Legendary (gold), with 0/1/2/3/5 attachments.
* **Kit Pod**: a beacon calls a pod from orbit. Opening it gives two Legendary 5-attachment
  weapons and four perks: *Fleetfoot* (2× tactical-sprint duration, +5% sprint), *Quickhands*
  (+35% reload and swap speed), *Bulwark* (0.9 s cell inserts), and *Tremor Sense* (enemy footsteps
  within 30 m ping the minimap).
* **Field Ops tablets** (yellow): *Manhunt* (kill a marked squad leader, `$3,500`), *Salvage Run*
  (open three marked caches in order, `$2,500` + loot), *Uplink* (hold a beacon for 20 s to reveal
  the next Blight centre, `$2,000`).

### 3.5 Bots (`TacticalBotAI`)

The squad layout is 8 squads × 3 = 24 bots: Rifleman (leader), Flanker and Sniper. Each bot runs a
utility state machine: `Patrol → Alert → Engage ↔ Cover → Flank → Rotate (Blight) → Downed →
Dead`. Hitboxes: Head 1.6×, Upper torso 1.1×, Lower torso 1.0×, Limbs 0.85×.

* Riflemen fire 3–6 round bursts from the nearest `CoverPoint` that blocks line of sight to the
  threat when crouched.
* Flankers watch the player's displacement. If the player moves less than 3 m in 4 s, the flanker
  runs to a point 25 m to the side of the player-to-squad line.
* Snipers stay beyond 40 m and show a red/white scope glint billboard whenever they aim at the
  player.
* If the player stays within 3 m of one spot for more than 6 s, any bot 8–35 m away cooks a frag
  (fuse 3.5 s, cook 1–1.5 s) and throws it on a ballistic arc. The HUD shows a danger indicator
  when the frag is within 10 m. Radio subtitle callouts come from the bark table.

---

## 4. World

* An 800 m island on a 1000 m terrain (513² heightmap). The heights use radial falloff
  `(1 − (r/R)^2.4)` × fbm (5 octaves) with flattened POI pads.
* The 4-layer splat (sand, grass, dirt, rock) is driven by height and slope.
* **Kestrel Airfield** at the centre is a 3-lane arena:
  *Runway lane* (open, long sight lines, waist-high barriers),
  *Hangar lane* (three connected hangars with doors), and
  *Container lane* (tight stacked containers).
* POIs: Saltworks, Radar Ridge, Old Harbor, Pinecrest, Quarry, Lighthouse Point. Buildings have
  hinged doors (**F**), windows and roofs.
* Foliage: three branched tree variants (trunk, two branch tiers, leaf clusters). Vertex colour R
  stores the wind weight. `FoliageWind` deforms the three shared meshes each frame, so 400+ trees
  cost three vertex updates.
* Updraft Vents: press **Space** inside one to launch 120 m up into free-fall.

---

## 5. Presentation

* **HUD** (`StormfallHUDController`): compass tape, POI banner, gunfire diamonds, rotating
  minimap and **M** tac-map, alive/kill counters, dynamic crosshair, 3-tier hitmarkers, XP feed,
  damage arcs, status dock, weapon dock, interaction prompts, menus, overlays.
* **Post-processing**: a Global Volume with ACES tonemapping, bloom, vignette, colour adjustments
  and depth of field (enabled during ADS, focus distance from the aim ray). SSAO runs as a
  renderer feature on `PC_Renderer`.
* **Lighting**: a soft-shadow directional sun (4 cascades, 350 m), exponential-squared fog,
  and an SRP lens flare on the sun.

## 6. Controls

| Key | Action |
| --- | --- |
| WASD / Mouse | Move / look |
| Shift (double-tap) | Sprint / tactical sprint · hold breath while scoped |
| C | Crouch · slide · dive (hold) · cut chute |
| Space | Jump · mantle · slide-cancel · jump from aircraft · deploy chute |
| LMB / RMB | Fire / aim |
| R | Reload |
| 1 / 2 / wheel | Switch weapon |
| B | Fire mode |
| Q | Frag grenade |
| G (hold) | Insert armour cells |
| F | Interact · hold to self-revive |
| V | Mount on cover |
| 3 | Use killstreak |
| M | Tac-map |
| Esc | Release cursor |
| Enter | Restart after match end |
