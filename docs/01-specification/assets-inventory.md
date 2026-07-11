# Iron Grid — Pangea Wars Asset Inventory

**Version:** 2.0  
**Status:** Final asset-scope baseline for the MVP  
**Audience:** Art, frontend, game design, QA, AI contributors  
**Source package:** `PangeaWars (v.1.0).zip`  
**Author credit required:** Aleksandr Makarov / @IKnowKingRabbit

> This inventory is based on direct inspection of every file in the package.  
> The pack does not include a machine-readable manifest or semantic labels for individual sprite rows. Exact file coordinates are authoritative; semantic names are mapped by visual equivalence and marked with confidence where interpretation is required.

---

## 1. License and usage constraints

The included license permits modification and commercial use.

Required:

- Credit **Aleksandr Makarov** in the game credits.
- Do not redistribute the pack, in whole or in part, as a publicly available standalone asset download.
- Modified assets may be used as part of Iron Grid.

Recommended credits entry:

```text
Pangea Wars visual assets by Aleksandr Makarov (@IKnowKingRabbit)
```

---

## 2. Package contents

```text
Pangea Wars/
├── license.txt
├── SpecialThanks!.txt
├── Tileset/
│   ├── Tileset.png
│   ├── FogOfWar.png
│   ├── SmallUnitShadow.png
│   └── BigUnitShadow.png
└── Units/
    ├── BlueUnitsSpriteSheet.png
    ├── GreenUnitsSpriteSheet.png
    ├── RedUnitsSpriteSheet.png
    └── YellowUnitsSpriteSheet.png
```

No UI kit, fonts, portraits, commander art, icons, sounds, music, project files, metadata, JSON, map examples or animation definitions are included.

---

## 3. Technical specifications

### 3.1 Terrain sheet

| File | Dimensions | Logical grid | Cell size |
|---|---:|---:|---:|
| `Tileset.png` | 240 × 384 px | 10 columns × 16 rows | 24 × 24 px |

Coordinate convention:

```text
tile_x = column * 24
tile_y = row * 24
tile_id = row * 10 + column
```

### 3.2 Unit sheets

| File | Dimensions | Faction |
|---|---:|---|
| `BlueUnitsSpriteSheet.png` | 896 × 1328 px | Blue |
| `GreenUnitsSpriteSheet.png` | 896 × 1328 px | Green |
| `RedUnitsSpriteSheet.png` | 896 × 1328 px | Red |
| `YellowUnitsSpriteSheet.png` | 896 × 1328 px | Yellow |

Layout:

- Header: 16 px high.
- Unit rows: 41.
- Row height: 32 px.
- Columns: 28.
- Frame size: 32 × 32 px.

Formula:

```text
frame_x = column * 32
frame_y = 16 + unit_row * 32
```

The four faction sheets share the same geometry and unit order. Only palette/faction appearance changes.

### 3.3 Animation column groups

The header visually identifies these animation groups:

| Group | Columns | Frames | Notes |
|---|---:|---:|---|
| Idle | 0–3 | 4 | Loop |
| Walk Side | 4–8 | 5 | Horizontal movement |
| Walk Down | 9–12 | 4 | Downward movement |
| Walk Up | 13–16 | 4 | Upward movement |
| Attack | 17–20 | up to 4 | Some rows leave frames blank |
| Hit | 21–23 | up to 3 | Damage reaction |
| Death | 24–27 | 4 | Explosion/destruction sequence |

Not every row uses every frame. Empty transparent cells must be treated as absent frames rather than animation pauses.

### 3.4 Shadows and fog

| File | Dimensions | Purpose |
|---|---:|---|
| `SmallUnitShadow.png` | 32 × 32 px | Small airborne unit shadow |
| `BigUnitShadow.png` | 32 × 32 px | Large airborne unit shadow |
| `FogOfWar.png` | 120 × 72 px | 5 × 3 grid of 24 px fog tiles |

The fog sheet provides 15 edge/coverage variants. It supports tile-based fog rendering, but discovery, visibility and hidden-unit behavior remain game logic.

---

## 4. Terrain sheet inventory

The terrain sheet contains reusable autotile fragments rather than one isolated tile per terrain type. Several cells are corners, edges, transitions or overlays.

### 4.1 Base terrain colors

| Coordinate | Tile ID | Description | Iron Grid use |
|---|---:|---|---|
| (0,0) | 0 | Transparent/empty | Do not use as terrain |
| (1,0) | 1 | Transparent/empty | Do not use as terrain |
| (0,1) | 10 | Water base | Sea |
| (1,1) | 11 | Grass base | Plain |
| (0,2)–(1,5) | 20–51 | Shore/grass transition variants | Shoal/coast transitions |
| (0,6)–(1,11) | 60–111 | Large coast/island overlays | Shoal/coast decoration |

### 4.2 River and water-channel autotiles

Region:

```text
columns 2–5, rows 0–11
```

Contains:

- Outer corners
- Inner corners
- Horizontal channels
- Vertical channels
- End caps
- Single-cell water holes
- Grass-bank variants
- Sand-bank variants
- Beach/sand transition variants

Supported gameplay terrain:

- River
- Sea/coastal water
- Shoal
- Bridge crossings when combined with road tiles

Important limitation:

- The sheet is optimized for visual construction using multiple transition tiles.
- Map data must separate **logical terrain type** from **render tile ID**.

### 4.3 Mountains

Region:

```text
columns 6–9, rows 0–3
```

Sixteen mountain silhouettes/edge variants are present.

Supports:

- Mountain tiles
- Connected mountain formations
- Edge and center variants

No snow, volcano or weather variants are present.

### 4.4 Forest

Region:

```text
columns 6–9, rows 4–7
```

Sixteen forest density/edge variants are present.

Supports:

- Forest logical terrain
- Connected forest shapes
- Multiple visual variations

### 4.5 Roads

Region:

```text
columns 0–5, rows 8–12
columns 6–9, rows 8–11
```

Contains:

- Horizontal road
- Vertical road
- Corners
- T-junctions
- Crossroads
- Road ends
- Road-over-dark-ground variants
- Large paved/industrial road formations

Supports:

- Road
- Bridge-like road passages when composed over water/river
- Factory/base surroundings

The sheet does not provide a separate semantic “bridge” object. Bridges are visual compositions of road segments over water/river.

### 4.6 Dirt / desert / industrial ground

Region:

```text
columns 6–9, rows 12–15
```

Contains brown/orange ground with:

- Straight edges
- Corners
- Inner corners
- Center fill
- Large connected formations

This does **not** have a direct standard AW2 terrain equivalent unless deliberately mapped to Plain or used as a visual biome. It should not introduce different movement/defense rules in the MVP.

### 4.7 Buildings and structures

Region:

```text
columns 0–5, rows 13–15
```

Observed structures:

| Coordinate region | Visual description | Proposed use | Confidence |
|---|---|---|---|
| row 13, cols 0–2 | Three small urban building variants | City/property palette states | High |
| row 13, col 3 | Elevated gray building/tower | HQ or special property candidate | Medium |
| row 14, cols 0–2 | Three hangar/industrial variants | Base/Factory property palette states | High |
| row 14, col 3 | Large elevated civic/command structure | HQ candidate | High |
| row 15, col 0 | Harbor/dock structure | Port | High |
| row 15, col 1 | Industrial bunker/mine-like structure | Missile silo or special structure candidate | Medium |
| row 15, col 2 | Radar/communications installation | Airport/radar/special property candidate | Medium |

Critical finding:

- The pack does **not** label buildings.
- It also does not clearly provide four colorized property sets in `Tileset.png`.
- Ownership tinting, flags, overlays or palette variants may need to be added programmatically or created as small derivative assets.
- Exact assignment of City, Base, Airport, Port, HQ and Missile Silo must be finalized in the visual mapping stage using these structures.

### 4.8 Pipe and pipe seam support

No clearly labeled, dedicated AW2-style pipe and pipe-seam set can be confirmed with certainty from the sheet alone.

Possible candidates exist among:

- Industrial road/barrier tiles
- Dark paved formations
- Bunker/industrial objects

Therefore:

| Feature | Status |
|---|---|
| Pipe gameplay | Not visually confirmed |
| Pipe Seam gameplay | Not visually confirmed |
| MVP inclusion without new art | Conditional |
| Required action | Create/modify small matching pixel-art tiles if no acceptable mapping is approved |

### 4.9 Reef support

No distinct, unambiguous reef tile is visible as a standalone logical asset.

Possible visual reuse:

- Dark water/coastal decoration
- Small island/shallow-water overlays

Status:

| Feature | Status |
|---|---|
| Reef gameplay | Mechanically possible |
| Dedicated reef art | Not conclusively confirmed |
| MVP inclusion without modifications | Conditional |

---

## 5. Unit sprite inventory

### 5.1 Interpretation policy

Each row below is inventoried even when it is excluded from the MVP.

Statuses:

- **AW2 candidate:** visually suitable for a standard AW2 unit.
- **Extra:** does not need to be used in the MVP.
- **Ambiguous:** exact military role cannot be proven from the pack because the artist supplied no labels.

The final source of truth for code will use stable internal row IDs such as `unit_row_08`, not inferred names, until the visual mapping is approved.

### 5.2 Rows 00–04: infantry-class sprites

| Row | Visual description | Proposed AW2 mapping | Confidence | MVP |
|---:|---|---|---|---|
| 00 | Small rifle infantry | Infantry | High | Yes |
| 01 | Alternate rifle infantry | Infantry visual variant / extra | Medium | No |
| 02 | Soldier carrying a heavier weapon | Mech | High | Yes |
| 03 | Specialist/light soldier with distinct pose | Extra infantry specialist | Medium | No |
| 04 | Multi-soldier/bike-like squad formation | Extra fast infantry unit | Medium | No |

### 5.3 Rows 05–08: utility and light vehicles

| Row | Visual description | Proposed mapping | Confidence | MVP |
|---:|---|---|---|---|
| 05 | Small command/utility truck | APC candidate | Medium | Conditional |
| 06 | Large cargo truck | APC candidate | High | Yes |
| 07 | Armored van/truck | Extra transport/APC variant | Medium | No |
| 08 | Fast wheeled scout car | Recon | High | Yes |

Preferred APC row: **06** because its cargo/supply silhouette is the clearest.

### 5.4 Rows 09–16: armored vehicles

| Row | Visual description | Proposed mapping | Confidence | MVP |
|---:|---|---|---|---|
| 09 | Small turreted armored vehicle | Tank | Medium–High | Yes |
| 10 | Long-barrel mobile gun | Artillery | High | Yes |
| 11 | Heavy long-barrel armored vehicle | Rockets or heavy artillery candidate | Medium | Conditional |
| 12 | Compact tracked turret vehicle | Tank alternate / Medium Tank candidate | Medium | Conditional |
| 13 | Twin/AA-style turret vehicle | Anti-Air | High | Yes |
| 14 | Large heavy tank | Medium Tank | High | Yes |
| 15 | Missile/radar-style tracked vehicle | Missiles | High | Yes |
| 16 | Futuristic/heavy rounded tank | Neotank | High | Yes |

### 5.5 Rows 17–23: artillery, missile and specialist ground units

| Row | Visual description | Proposed mapping | Confidence | MVP |
|---:|---|---|---|---|
| 17 | Forked/twin forward gun platform | Extra tank destroyer | Medium | No |
| 18 | Compact gun platform | Artillery alternate | Medium | No |
| 19 | Multi-launch rocket platform | Rockets | High | Yes |
| 20 | Heavy multi-barrel/rocket vehicle | Extra heavy rockets | Medium | No |
| 21 | Box launcher / large missile vehicle | Missiles alternate | Medium | No |
| 22 | Wheeled cannon/recon hybrid | Extra wheeled artillery | Medium | No |
| 23 | Covered tracked mound/launcher | Extra specialist vehicle | Low–Medium | No |

### 5.6 Row 24: nonstandard ground/special sprite

| Row | Visual description | Proposed mapping | Confidence | MVP |
|---:|---|---|---|---|
| 24 | Rounded side-facing emplacement/creature-like vehicle | None | Low | No |

This row should remain unused until manually assigned.

### 5.7 Rows 25–31: aircraft

| Row | Visual description | Proposed AW2 mapping | Confidence | MVP |
|---:|---|---|---|---|
| 25 | Swept-wing jet fighter | Fighter | High | Yes |
| 26 | Larger swept-wing aircraft | Bomber | High | Yes |
| 27 | Small compact fixed-wing aircraft | Extra light aircraft | Medium | No |
| 28 | Short-wing aircraft / attack jet | Extra aircraft | Medium | No |
| 29 | Conventional helicopter | Battle Copter | High | Yes |
| 30 | Alternate helicopter | T-Copter | High | Yes |
| 31 | Large futuristic aircraft/airship | Extra heavy aircraft | Medium | No |

Shadow mapping:

- Rows 29–30: `SmallUnitShadow.png`
- Rows 25–28 and 31: `BigUnitShadow.png`

### 5.8 Rows 32–40: naval and amphibious units

| Row | Visual description | Proposed AW2 mapping | Confidence | MVP |
|---:|---|---|---|---|
| 32 | Long deck warship | Battleship | High | Yes |
| 33 | Medium warship | Cruiser | High | Yes |
| 34 | Open-deck/container vessel | Lander candidate | Medium–High | Yes |
| 35 | Large broad-deck ship | Extra carrier/amphibious ship | Medium | No |
| 36 | Compact transport vessel | Lander alternate | Medium | No |
| 37 | Large enclosed hull ship | Extra heavy naval unit | Medium | No |
| 38 | Smaller armed patrol ship | Extra naval combatant | Medium | No |
| 39 | Submarine in submerged/special state | Submarine state/animation | High | Yes, paired with row 40 |
| 40 | Submarine surfaced profile | Submarine | High | Yes |

Submarine implementation note:

- Rows 39 and 40 should be treated as two visual states of one gameplay unit if animation testing confirms consistent orientation.
- Do not create two independent submarine unit types.

---

## 6. Recommended AW2 MVP mapping

This is the recommended minimal mapping that uses only visually supported assets.

| AW2 unit | Sprite row |
|---|---:|
| Infantry | 00 |
| Mech | 02 |
| Recon | 08 |
| APC | 06 |
| Tank | 09 |
| Medium Tank | 14 |
| Neotank | 16 |
| Artillery | 10 |
| Rockets | 19 |
| Anti-Air | 13 |
| Missiles | 15 |
| Fighter | 25 |
| Bomber | 26 |
| Battle Copter | 29 |
| T-Copter | 30 |
| Battleship | 32 |
| Cruiser | 33 |
| Lander | 34 |
| Submarine | 39/40 |

Rows excluded from MVP:

```text
01, 03, 04, 05, 07, 11, 12, 17, 18, 20, 21, 22, 23, 24,
27, 28, 31, 35, 36, 37, 38
```

This preserves all 19 standard AW2 units while ignoring the 22 additional/alternate rows.

---

## 7. Faction coverage

The unit pack supports exactly four full palettes:

- Blue
- Green
- Red
- Yellow

All 41 rows exist in all four palettes.

Implications:

- Four factions are fully supported for units.
- A commander can be permanently associated with one faction.
- No duplicate faction color should be allowed in a 1v1 match unless recoloring is implemented.
- Property ownership visuals still require a separate solution because property sprites are not supplied as clearly labeled four-faction sheets.

---

## 8. Animation capabilities and limitations

### Supported directly

- Idle
- Horizontal movement
- Vertical movement up
- Vertical movement down
- Attack
- Hit reaction
- Death/destruction

### Not supplied explicitly

- Separate selection animation
- Capture animation
- Loading/unloading animation
- Supply animation
- Repair animation
- CO power animation
- Rank-up/veterancy animation
- Unit production animation
- HQ capture cinematic
- Missile-silo launch effect
- Projectile sprites as separately addressable assets
- Terrain destruction transition for pipe seams
- UI portraits
- Commanders
- Menus and HUD icons

These can be represented through:

- Existing attack frames
- Tweening, flashes and particles
- Phaser-generated overlays
- Small derivative pixel-art assets
- UI assets created separately

---

## 9. Complete capability matrix

### 9.1 Fully supported without new gameplay art

| System | Status | Notes |
|---|---|---|
| Ground units | Supported | All AW2 roster roles have suitable rows |
| Air units | Supported | Fighter, Bomber, B-Copter, T-Copter |
| Naval units | Supported | Battleship, Cruiser, Lander, Submarine |
| Four factions | Supported | Complete unit sheets |
| Unit movement animation | Supported | Directional frames |
| Combat animation | Supported | Attack/hit/death |
| Fog overlay | Supported | Dedicated sheet |
| Air shadows | Supported | Two shadow sizes |
| Plains | Supported | Grass base |
| Forest | Supported | Full autotile region |
| Mountain | Supported | Full autotile region |
| Road | Supported | Multiple road forms |
| River | Supported | Water-channel autotiles |
| Sea | Supported | Water base |
| Shoal/coast | Supported | Sand/coast transitions |

### 9.2 Supported with mapping or small asset adaptation

| System | Status | Required work |
|---|---|---|
| City | Conditional | Assign one building sprite and add ownership overlay |
| Base | Conditional | Assign hangar/industrial sprite and ownership overlay |
| HQ | Conditional | Approve large command structure |
| Airport | Conditional | Approve radar/airfield structure or create derivative |
| Port | Conditional | Harbor sprite exists; add ownership overlay |
| Missile Silo | Conditional | Approve industrial/silo sprite and used-state treatment |
| Bridge | Conditional | Compose road over river/sea |
| Reef | Conditional | Approve reused water/island variant or create derivative |
| Pipes | Conditional | Create or approve industrial barrier mapping |
| Pipe Seam | Conditional | Requires distinct intact/destroyed state |
| Property capture state | Conditional | Add flags/tint/progress UI |

### 9.3 Missing and outside the MVP

| Asset/system | Status |
|---|---|
| Commander portraits | Missing |
| Commander power VFX | Missing |
| Complete HUD/UI kit | Missing |
| Icons for actions and unit stats | Missing |
| Fonts | Missing |
| Sound effects | Missing |
| Music | Missing |
| Campaign-only Black Hole structures | Missing |
| Dialogue portraits/scenes | Missing |
| Weather variants | Missing |
| Map editor UI | Missing |

---

## 10. Final MVP scope dictated by assets

The asset pack is sufficient to implement the complete standard AW2 unit roster.

The following terrain/property mechanics are safe to include immediately:

- Plain
- Forest
- Mountain
- Road
- River
- Sea
- Shoal
- City
- Base
- HQ
- Airport
- Port

The following must remain blocked until visual mapping is explicitly approved or derivative art is created:

- Reef
- Pipe
- Pipe Seam
- Missile Silo and used silo state
- Ownership-specific property variants

No additional/non-AW2 unit rows will be used in the MVP.

---

## 11. Stable identifiers

Use these identifiers in code and documentation before final semantic asset names are exported:

```text
terrain_r{row}_c{column}
unit_blue_r{row}
unit_green_r{row}
unit_red_r{row}
unit_yellow_r{row}
fog_r{row}_c{column}
shadow_small
shadow_big
```

Examples:

```text
unit_blue_r09
terrain_r04_c07
fog_r01_c03
```

This prevents semantic guesses from becoming file-system dependencies.

---

## 12. Required follow-up before implementation

Before any rendering task is considered ready:

1. Export a labeled terrain atlas showing tile ID, row and column.
2. Export a labeled unit atlas showing row IDs and animation columns.
3. Approve the proposed 19-unit AW2 mapping.
4. Approve property-to-building mapping.
5. Decide how property ownership is rendered.
6. Approve or create Reef, Pipe, Pipe Seam and Missile Silo art.
7. Define exact animation frame timing per unit category.
8. Keep all extra unit rows disabled in game data.

---

## 13. Final conclusion

The package is sufficient for Iron Grid’s core military roster and major battlefield biomes.

It is **not** a complete ready-to-ship game art package. The primary gaps are:

- Semantic property variants
- Several special AW2 terrain types
- Commander/UI art
- Audio
- Explicit metadata

These gaps do not prevent development, but they must be treated as documented asset tasks rather than silently invented by implementation agents.

---

# Cross-references

- `game-specification.md` — §7 (map/render), §8 (terrain model), §9.5 (sprite mapping), §28 (animation contract), §33.3–§33.4 (open art blockers).
- `frontend.md` — §4 rendering model, §7 animation contract.
- `master-index.md` — documentation map and loading guide (Art task profile).
