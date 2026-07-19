# Iron Grid — Battlefield Asset Inventory

**Version:** 3.0
**Status:** Current asset baseline (placeholder art — prototype only)
**Audience:** Art, frontend, game design, QA, AI contributors
**Source:** Advance Wars (GBA) sprite rips, imported from
[Peaupote/advance-war](https://github.com/Peaupote/advance-war) (`assets/`)
**Decision:** [ADR-0005](../decisions/0005-advance-wars-asset-pack.md)

> Version 2.0 of this document inventoried the Pangea Wars pack (Aleksandr
> Makarov). That pack was replaced wholesale; see ADR-0005 for why. Its
> inventory lives in git history.

---

## 1. License and usage constraints

**These sprites are not ours to ship.** They are the intellectual property of
Nintendo and Intelligent Systems, used here as placeholders while the game's own
art is produced.

Binding constraints:

- No public deployment, distribution, or asset download may include them.
  Anything user-facing must first replace them with original or licensed art.
- The provenance is recorded in `public/game-assets/license.txt`, `CREDITS.md`
  and the `/credits` page.
- The GPL of the source project covers its Java code, not the artwork.

Rips credited by the sheets themselves: Dr. Phileas Fragg (AW1Sprites), Grim
(air and naval), Rogultgot (ground).

---

## 2. Package contents

```text
public/game-assets/
├── license.txt
├── terrain/        13 autotile files
│   ├── beach1.png  beach2.png  bridge.png  cliffs.png  cliffs2.png
│   ├── forest.png  hill.png    lowland_shadow.png      mountain.png
│   └── rivers1.png rivers2.png roads1.png  roads2.png
├── units/{blue,green,red,yellow}/
│   ├── sprites.png   ground units
│   ├── air.png       air units
│   └── sea.png       naval units
├── buildings/colored_buildings.png
├── ui/things.png
├── fx/{death,missile,attack}.png
└── audio/*.m4a       18 effects + the match music (§8)
```

The four faction directories are **pixel-identical in layout** — only the
palette changes — so every unit rectangle is measured once and reused.

---

## 3. Geometry: there is no grid

Unlike the previous pack, this art has **no uniform sprite grid**. Terrain files
are 3×3 autotile sets; units are differently sized rectangles at arbitrary
offsets; buildings are 16×20-ish; effects are irregular strips.

Geometry therefore lives in one generated file:

```text
pnpm atlas   →   app/lib/render/atlas.generated.ts
```

`scripts/build-atlas.ts` combines:

- **Declared rectangles** for terrain, buildings, HUD icons and effects, ported
  from the source project's renderers (`TerrainLocation.java`,
  `view/render/buildings/*Renderer.java`).
- **Detected rectangles** for unit clips: `scripts/atlas/detect.ts` scans the
  alpha channel for connected regions, merges the pieces of one sprite, and
  `scripts/atlas/tables.ts` names them from a curated seed table.

Nothing else in the codebase may hard-code a pixel offset. `/dev/atlas` renders
every entry with its key for visual approval.

### 3.1 Key format

```text
terrain_<terrain>_<position>       terrain_sea_top_left, terrain_road_center
building_<type>_<color>_<frame>    building_city_blue_0
unit_<sprite_key>_<clip>_<frame>   unit_infantry_move_up_2
hud_<name>                         hud_fuel, hud_mobility_treads
path_<name>                        path_arrow_top
fx_explosion_<n> / fx_splash_<n>
```

Unit entries carry a `{faction}` slot in their file path, filled in at draw time.

---

## 4. Terrain

Tiles are **16 × 16 px** with a 1 px gutter, so the nine autotile positions sit
at offsets 0 / 17 / 34. Selection is by orthogonal neighbors
(`app/lib/render/terrain-map.ts`, ported from `TerrainRenderer.set*Location`).

| Logical terrain | File(s) | Notes |
|---|---|---|
| plain | `rivers1.png` (center), `lowland_shadow.png` | The shadow variant is used west of a raised feature |
| forest | `forest.png` | Single tile, drawn over plain |
| mountain | `mountain.png` | 16 × 21 — overhangs the cell above |
| hill | `hill.png` | Single tile |
| sea | `beach1.png` (fill), `cliffs.png` (edges), `cliffs2.png` (8 × 8 inner corners) | Corner stickers round off diagonal shorelines |
| reef | `cliffs.png` (center) | |
| shoal | `beach1.png` / `beach2.png` | 16 sand transitions |
| river | `rivers1.png` / `rivers2.png` | 15 channel pieces incl. T-junctions |
| road | `roads1.png` / `roads2.png` | 11 pieces incl. crossroads |
| bridge | `bridge.png` | Horizontal / vertical |

Tiles are drawn **bottom-anchored**: anything taller than 16 px overhangs the
cell above, as in the original.

---

## 5. Properties

`colored_buildings.png` draws every property in **five ownership palettes**
(red, blue, green, yellow, neutral) with **two animation frames** each. This is
what let ADR-0004's programmatic ownership tint be removed.

| Property | Size | Neutral art |
|---|---|---|
| city | 16 × 20 | yes |
| base | 16 × 16 | yes |
| airport | 16 × 18 | yes |
| port | 16 × 21 | yes |
| headquarters | 16 × 31 | **no** — an HQ is always owned |
| silo | 16 × 23 | yes, plus a spent variant (`building_silo_spent`) |

---

## 6. Units

19 MVP units, all present. Sprite keys equal the `units.yaml` unit ids.

| Sheet | Units | Clips |
|---|---|---|
| `sprites.png` | infantry, mech, recon, apc, artillery, tank, anti_air, missiles, rockets, medium_tank, neotank | idle (3–4), move_side (3–4), move_up (3–4), move_down (3–4) |
| `air.png` | fighter, bomber, battle_copter, transport_copter | idle (2–3) |
| `sea.png` | lander, cruiser, battleship, submarine | idle (2–3) |

Notes:

- **Neotank has no art in this pack** — the ground sheet stops at the medium
  tank — so it borrows the medium tank's frames. Replace when art exists.
- Air and naval units have no walk clips; `unitFrame` falls back to idle.
- The submarine's submerged state reuses the surfaced frames, drawn translucent.
- There are **no attack, hit or death frames**: Advance Wars animates combat in a
  separate battle scene. Kills play `fx/death.png`; attacks are a lunge + flash
  (`game-specification.md` §28.3 — never invent art).

---

## 7. HUD and effects

| Asset | Contents |
|---|---|
| `ui/things.png` | Stat icons (life, fuel, ammo, lock, star, building), the "Vision" label, movement-class word labels (Foot / Mech / Tires / Tread / Ships / Trans) and the movement-path arrows |
| `fx/death.png` | 10-frame explosion (ground/air) and a 7-frame water plume (naval) |
| `fx/missile.png` | Missile projectile |
| `fx/attack.png` | Attack marker |

---

## 8. Audio

The same source project ships `assets/sound/` — 27 WAVs, 38 MB uncompressed —
and its Java code says exactly where each one plays (`view/sound/Sdfx.java` for
global stings, and a `selected` / `attack` / `death` clip per unit renderer in
`view/render/units/**`). That mapping is transcribed rather than guessed.

Transcoded to AAC on import, which every current browser plays and which turns
38 MB into 2.6 MB:

```text
afconvert -f m4af -d aac -b 96000 <in>.wav public/game-assets/audio/<id>.m4a
```

| Moment | Source file | Atlas of sound (`SfxId`) |
|---|---|---|
| Select foot unit | `song069.wav` | `select_foot` |
| Select wheeled unit | `ReconSelect.wav` | `select_wheels` |
| Select artillery | `SoldierLaughe.wav` | `select_artillery` |
| Select tracked unit | `ShermanE8.wav` | `select_treads` |
| Select air unit | `song021.wav` | `select_air` |
| Select naval unit | `song056.wav` | `select_naval` |
| Infantry attack | `ak47plus.wav` | `attack_rifle` |
| Mech attack | `bazooka.wav` | `attack_bazooka` |
| Recon attack | `ReconFire.wav` | `attack_recon` |
| Artillery attack | `CannonFire.wav` | `attack_cannon` |
| Tank attack | `TankShot.wav` | `attack_tank` |
| Air attack | `song037.wav` | `attack_air` |
| Naval attack | `song054.wav` | `attack_naval` |
| Any other attack | `song025.wav` | `attack_default` |
| Unit destroyed | `song016.wav` | `explosion` |
| New day | `song204/207/208/218.wav` (random) | `new_day_1..4` |
| Menu confirmation | `song124.wav` | `ui_confirm` |
| Match music (loop) | `main.wav` | `music_main` |

Deliberately **not** imported: `123.wav`, `car-engine.mp3` and `gunfire.mp3`
(unused by the source project too); `screaming.wav`, which it played for the
death of *every* unit — a human scream for a destroyed tank does not fit, so the
explosion it defined but never fired is used instead; and `song022`/`song057`,
which belong to the Stealth, a unit outside our roster.

The source only voiced ten units. Ours maps by **family** (foot, wheels,
artillery, treads, air, naval) in `app/lib/audio/unit-sounds.ts`, so a Neotank
sounds like a tank rather than falling back to the generic beep.

Playback lives in `app/lib/audio/`: the `AudioContext` is built on first play
(always a click or a key, so the browser's autoplay gate is already satisfied),
capability is checked before use so jsdom and SSR are silent no-ops, and the mute
preference is per browser in `localStorage` — sound is a property of the device,
not of the account.

---

## 9. Gaps

| Asset/system | Status |
|---|---|
| Neotank map sprite | Missing — borrows the medium tank |
| Unit attack/hit/death frames | Not applicable (combat is a separate scene) |
| Commander portraits | Missing — `ingame/AW1Sprites.png` in the source project has some, not imported |
| Fog-of-war tiles | Missing — fog renders as a programmatic dark overlay |
| Weather / snow terrain | Available in the source project (`terrains/snow/`), not imported (no weather in the MVP) |
| Capture / build / movement sounds | The source project never voiced them; the board stays quiet there rather than reusing a clip chosen for something else |

---

# Cross-references

- `docs/decisions/0005-advance-wars-asset-pack.md` — the adoption decision.
- `game-specification.md` — §7 (map/render), §9.5 (sprite mapping), §28
  (animation contract), §33.3–§33.4.
- `frontend.md` — §4 rendering model, §7 animation contract.
- `scripts/build-atlas.ts`, `app/lib/render/atlas.ts` — the manifest and its
  lookups.
