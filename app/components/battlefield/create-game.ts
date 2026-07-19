import type { Coordinate } from "game-engine";
import Phaser from "phaser";

import {
  FACTION_SHEETS,
  TERRAIN_TILE_PX,
  UNIT_ROW_HEIGHT_PX,
  UNIT_SHEET_HEADER_PX,
  terrainTileFrame,
  unitFrame,
  type UnitAnimation,
} from "@/app/lib/render/derive-render-data";
import type { FactionId } from "@/app/components/faction-badge";
import type { AnimationStep } from "@/app/lib/render/animation-plan";
import type { PropertySprite } from "@/app/lib/render/property-map";
import type { TerrainCell } from "@/app/lib/render/terrain-map";
import type { UnitSprite } from "@/app/lib/render/unit-map";
import { stepDirection, walkFrameSpec } from "@/app/lib/render/walk-frames";

/** Faction tint colors for the programmatic property ownership overlay (§33.4). */
const FACTION_TINT: Record<FactionId, number> = {
  blue: 0x4c8dff,
  green: 0x4fb85f,
  red: 0xf2565b,
  yellow: 0xf2b23c,
};

/**
 * Soften a faction color slightly toward white so HARD_LIGHT ownership washes
 * stay close to `--faction-*` without reading neon.
 */
function ownershipTint(faction: FactionId): number {
  const hex = FACTION_TINT[faction];
  const amount = 0.18;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((hex >> 16) & 0xff);
  const g = mix((hex >> 8) & 0xff);
  const b = mix(hex & 0xff);
  return (r << 16) | (g << 8) | b;
}

/**
 * The Phaser bootstrap — a thin imperative shell over the pure render/interaction
 * modules (M10). The game is created ONCE and persists: `create()` draws the
 * static terrain + camera, then `syncModel()` (re)draws the dynamic unit/property
 * layers in place — no WebGL teardown on a state change, so the board never
 * flickers. `playAnimation()` walks a moved unit tile-by-tile with directional
 * frames (Advance-Wars style) before the caller reconciles. Animation never gates
 * gameplay (§28.2): the authoritative state is already committed when it runs.
 *
 * Not unit-tested — jsdom has no WebGL; the canvas is verified manually. Assets
 * are the bundled `game-assets/` pack (Aleksandr Makarov / @IKnowKingRabbit —
 * attribution in `/credits`, `game-assets/license.txt`).
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */

const ASSET_BASE = "/game-assets";
const RENDER_SCALE = 2;
const WALK_MS_PER_TILE = 120;
const ART_SCALE_MIN = 1;
const ART_SCALE_MAX = 4;

/** Snap camera zoom so each tile lands on a whole CSS pixel. */
function clampArtScale(artScale: number): number {
  const tilePx = Math.round(
    Math.min(
      TERRAIN_TILE_PX * ART_SCALE_MAX,
      Math.max(TERRAIN_TILE_PX * ART_SCALE_MIN, TERRAIN_TILE_PX * artScale),
    ),
  );
  return tilePx / TERRAIN_TILE_PX;
}

function displaySize(mapSpan: number, artScale: number): number {
  return mapSpan * Math.round(TERRAIN_TILE_PX * artScale);
}

/** The imperative surface the React controller drives on the live scene. */
export interface BattlefieldHandle {
  /** Redraw the dynamic (unit + property) layers from a fresh model, in place. */
  syncModel(data: BattlefieldData): void;
  /** Play a resolved-event plan; resolves when the animation completes. */
  playAnimation(steps: readonly AnimationStep[]): Promise<void>;
  /**
   * Re-render at a display scale relative to the 24px source tile. Tile CSS size
   * is always rounded to a whole pixel so seams stay crisp.
   */
  setArtScale(artScale: number): void;
}

export interface BattlefieldData {
  readonly terrain: readonly TerrainCell[];
  readonly properties: readonly PropertySprite[];
  readonly units: readonly UnitSprite[];
  readonly mapWidth: number;
  readonly mapHeight: number;
}

class BattlefieldScene extends Phaser.Scene implements BattlefieldHandle {
  private model: BattlefieldData;
  private readonly onReady?: (handle: BattlefieldHandle) => void;
  private artScale: number;
  private readonly unitSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly unitModels = new Map<string, UnitSprite>();
  /** Every unit/property/shadow/bar object — cleared and redrawn by syncModel. */
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    data: BattlefieldData,
    onReady?: (handle: BattlefieldHandle) => void,
    artScale: number = RENDER_SCALE,
  ) {
    super("battlefield");
    this.model = data;
    this.onReady = onReady;
    this.artScale = clampArtScale(artScale);
  }

  preload(): void {
    this.load.spritesheet("tileset", `${ASSET_BASE}/tileset/tileset.png`, {
      frameWidth: TERRAIN_TILE_PX,
      frameHeight: TERRAIN_TILE_PX,
    });
    this.load.image("fog", `${ASSET_BASE}/tileset/fog-of-war.png`);
    this.load.image("shadow", `${ASSET_BASE}/tileset/small-unit-shadow.png`);
    for (const [faction, file] of Object.entries(FACTION_SHEETS)) {
      this.load.image(`units-${faction}`, `${ASSET_BASE}/units/${file}`);
    }
  }

  private tilesetFrameIndex(renderTileId: string): number {
    const columns = Math.max(1, Math.floor(240 / TERRAIN_TILE_PX)); // 10-wide tileset
    const frame = terrainTileFrame(renderTileId);
    return (frame.y / TERRAIN_TILE_PX) * columns + frame.x / TERRAIN_TILE_PX;
  }

  /** Draws property buildings with the §33.4 ownership tint + capture bar. */
  private drawProperties(): void {
    for (const property of this.model.properties) {
      const worldX = property.x * TERRAIN_TILE_PX;
      const worldY = property.y * TERRAIN_TILE_PX;
      const building = this.add
        .image(
          worldX,
          worldY,
          "tileset",
          this.tilesetFrameIndex(property.renderTileId),
        )
        .setOrigin(0, 0);
      // An in-progress capture remains untinted (the building's white artwork).
      // The faction-colored progress bar communicates who is capturing it.
      const tintFaction =
        property.captureProgress > 0 ? null : property.ownerFaction;
      // Default MULTIPLY crushes dark factory art (base r14_c00). Phaser 4
      // HARD_LIGHT keeps shading; ownershipTint softens chroma slightly.
      if (tintFaction !== null) {
        building
          .setTint(ownershipTint(tintFaction))
          .setTintMode(Phaser.TintModes.HARD_LIGHT);
      }
      this.dynamicObjects.push(building);
      if (property.captureProgress > 0) {
        const barColor =
          property.capturingFaction !== null
            ? FACTION_TINT[property.capturingFaction]
            : 0xffffff;
        // Track under the fill so partial progress reads clearly on the tile.
        this.dynamicObjects.push(
          this.add
            .rectangle(
              worldX + 2,
              worldY + TERRAIN_TILE_PX - 5,
              TERRAIN_TILE_PX - 4,
              4,
              0x1a1f2a,
            )
            .setOrigin(0, 0),
        );
        this.dynamicObjects.push(
          this.add
            .rectangle(
              worldX + 2,
              worldY + TERRAIN_TILE_PX - 5,
              (TERRAIN_TILE_PX - 4) * property.captureProgress,
              4,
              barColor,
            )
            .setOrigin(0, 0),
        );
      }
    }
  }

  /** Registers a named atlas sub-frame on a faction sheet if it isn't already. */
  private ensureFrame(key: string, x: number, y: number): string {
    const name = `f${y}_${x}`;
    const texture = this.textures.get(key);
    if (!texture.has(name)) {
      texture.add(name, 0, x, y, UNIT_ROW_HEIGHT_PX, UNIT_ROW_HEIGHT_PX);
    }
    return name;
  }

  /** Draws unit sprites, bottom-centered over their 24px tile. */
  private drawUnits(): void {
    for (const unit of this.model.units) {
      const key = `units-${unit.faction}`;
      const frameName = this.ensureFrame(key, unit.frame.x, unit.frame.y);
      const worldX = unit.x * TERRAIN_TILE_PX + TERRAIN_TILE_PX / 2;
      const worldY = (unit.y + 1) * TERRAIN_TILE_PX;
      if (unit.shadow) {
        this.dynamicObjects.push(
          this.add.image(worldX, worldY, "shadow").setOrigin(0.5, 1),
        );
      }
      const sprite = this.add
        .image(worldX, worldY, key, frameName)
        .setOrigin(0.5, 1);
      if (unit.greyed) sprite.setTint(0x8a94a3);
      if (unit.submerged) sprite.setAlpha(0.55);
      this.unitSprites.set(unit.unitId, sprite);
      this.unitModels.set(unit.unitId, unit);
      this.dynamicObjects.push(sprite);
      this.drawHpBadge(unit);
    }
  }

  /**
   * The Advance-Wars HP number, drawn in the tile's bottom-right corner only when
   * the unit is damaged (display HP below 10, §27.4). Full-health units show
   * nothing; the number reads white with a dark outline for legibility.
   */
  private drawHpBadge(unit: UnitSprite): void {
    if (unit.displayHp >= 10) return;
    const label = this.add
      .text(
        (unit.x + 1) * TERRAIN_TILE_PX,
        (unit.y + 1) * TERRAIN_TILE_PX,
        String(unit.displayHp),
        {
          fontFamily: "monospace",
          fontSize: "11px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#0d1117",
          strokeThickness: 3,
        },
      )
      .setOrigin(1, 1)
      .setResolution(3);
    this.dynamicObjects.push(label);
  }

  create(): void {
    // Static terrain — drawn once, never re-synced (fog is off, layout is fixed).
    for (const cell of this.model.terrain) {
      const worldX = cell.x * TERRAIN_TILE_PX;
      const worldY = cell.y * TERRAIN_TILE_PX;
      for (const tileId of cell.layers) {
        this.add
          .image(worldX, worldY, "tileset", this.tilesetFrameIndex(tileId))
          .setOrigin(0, 0);
      }
      if (!cell.visible) {
        this.add
          .rectangle(
            worldX,
            worldY,
            TERRAIN_TILE_PX,
            TERRAIN_TILE_PX,
            0x0d1117,
            0.45,
          )
          .setOrigin(0, 0);
      }
    }
    this.cameras.main
      .setBounds(
        0,
        0,
        this.model.mapWidth * TERRAIN_TILE_PX,
        this.model.mapHeight * TERRAIN_TILE_PX,
      )
      .setRoundPixels(true)
      .setZoom(this.artScale);

    this.syncModel(this.model); // initial dynamic draw
    this.onReady?.(this);
  }

  /** Resize the canvas + camera; tile size stays on whole CSS pixels. */
  setArtScale(artScale: number): void {
    const scale = clampArtScale(artScale);
    this.artScale = scale;
    this.cameras.main.setZoom(scale);
    this.scale.resize(
      displaySize(this.model.mapWidth, scale),
      displaySize(this.model.mapHeight, scale),
    );
  }

  /** Redraw the dynamic unit + property layers from a fresh model, in place. */
  syncModel(data: BattlefieldData): void {
    this.tweens.killAll(); // no sprite is mid-walk when we tear its object down
    for (const object of this.dynamicObjects) object.destroy();
    this.dynamicObjects = [];
    this.unitSprites.clear();
    this.unitModels.clear();
    this.model = data;
    this.drawProperties();
    this.drawUnits();
  }

  async playAnimation(steps: readonly AnimationStep[]): Promise<void> {
    for (const step of steps) {
      if (step.kind === "move") {
        await this.walkUnit(step.unitId, step.path);
      } else if (step.kind === "attack") {
        this.unitSprites.get(step.defenderUnitId)?.setTint(0xffffff);
      } else if (step.kind === "destroy") {
        const sprite = this.unitSprites.get(step.unitId);
        if (sprite !== undefined) {
          this.tweens.add({ targets: sprite, alpha: 0, duration: 200 });
        }
      }
    }
  }

  /** Walks a unit tile-by-tile along its path with directional walk frames. */
  private async walkUnit(
    unitId: string,
    path: readonly Coordinate[],
  ): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    const model = this.unitModels.get(unitId);
    if (sprite === undefined || model === undefined || path.length < 2) return;
    const spriteRow =
      (model.frame.y - UNIT_SHEET_HEADER_PX) / UNIT_ROW_HEIGHT_PX;

    for (let i = 0; i < path.length - 1; i++) {
      const { animation, flipX } = walkFrameSpec(
        stepDirection(path[i]!, path[i + 1]!),
      );
      await this.tweenSegment(
        sprite,
        path[i + 1]!,
        model.faction,
        spriteRow,
        animation,
        flipX,
      );
    }
    this.setWalkFrame(sprite, model.faction, spriteRow, "idle", false, 0);
  }

  /** Tween one path segment, cycling walk frames; resolves on complete/teardown. */
  private tweenSegment(
    sprite: Phaser.GameObjects.Image,
    to: Coordinate,
    faction: FactionId,
    spriteRow: number,
    animation: UnitAnimation,
    flipX: boolean,
  ): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        resolve();
      };
      // If the scene tears down mid-walk, don't leave the caller hanging.
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, finish);
      this.events.once(Phaser.Scenes.Events.DESTROY, finish);
      this.tweens.add({
        targets: sprite,
        x: to.x * TERRAIN_TILE_PX + TERRAIN_TILE_PX / 2,
        y: (to.y + 1) * TERRAIN_TILE_PX,
        duration: WALK_MS_PER_TILE,
        onUpdate: (tween) => {
          const frames = 5; // longest walk animation; setWalkFrame clamps per anim
          const index = Math.min(
            frames - 1,
            Math.floor(tween.progress * frames),
          );
          this.setWalkFrame(
            sprite,
            faction,
            spriteRow,
            animation,
            flipX,
            index,
          );
        },
        onComplete: finish,
      });
    });
  }

  /** Slice a walk/idle frame from the faction sheet and apply it + facing. */
  private setWalkFrame(
    sprite: Phaser.GameObjects.Image,
    faction: FactionId,
    spriteRow: number,
    animation: UnitAnimation,
    flipX: boolean,
    frameIndex: number,
  ): void {
    const key = `units-${faction}`;
    const rect = unitFrame(spriteRow, animation, frameIndex);
    const name = this.ensureFrame(key, rect.x, rect.y);
    sprite.setTexture(key, name);
    sprite.setFlipX(flipX);
  }
}

/** Creates the Phaser game mounted in `container`. Call only in the browser. */
export function createBattlefieldGame(
  container: HTMLElement,
  data: BattlefieldData,
  onReady?: (handle: BattlefieldHandle) => void,
  artScale: number = RENDER_SCALE,
): Phaser.Game {
  const scale = clampArtScale(artScale);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: "#0d1117",
    pixelArt: true,
    scale: {
      // Fixed size — CSS zoom must not drive Phaser.Scale.RESIZE (it desyncs the
      // canvas from the board after non-1.0 zoom).
      mode: Phaser.Scale.NONE,
      width: displaySize(data.mapWidth, scale),
      height: displaySize(data.mapHeight, scale),
    },
    scene: [new BattlefieldScene(data, onReady, scale)],
  });
}
