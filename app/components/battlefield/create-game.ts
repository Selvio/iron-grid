import type { Coordinate } from "game-engine";
import Phaser from "phaser";

import {
  TERRAIN_TILE_PX,
  frameCount,
  unitFrame,
  type FrameRect,
  type UnitAnimation,
} from "@/app/lib/render/derive-render-data";
import { ATLAS, assetUrl, keysWithPrefix } from "@/app/lib/render/atlas";
import type { FactionId } from "@/app/components/faction-badge";
import type { AnimationStep } from "@/app/lib/render/animation-plan";
import type { PropertySprite } from "@/app/lib/render/property-map";
import type { TerrainCell } from "@/app/lib/render/terrain-map";
import type { UnitSprite } from "@/app/lib/render/unit-map";
import { stepDirection, walkFrameSpec } from "@/app/lib/render/walk-frames";

/** Faction colors for the capture-progress bar. */
const FACTION_COLOR: Record<FactionId, number> = {
  blue: 0x4c8dff,
  green: 0x4fb85f,
  red: 0xf2565b,
  yellow: 0xf2b23c,
};

/**
 * The Phaser bootstrap — a thin imperative shell over the pure render/interaction
 * modules (M10). The game is created ONCE and persists: `create()` draws the
 * static terrain + camera, then `syncModel()` (re)draws the dynamic unit/property
 * layers in place — no WebGL teardown on a state change, so the board never
 * flickers. `playAnimation()` walks a moved unit tile-by-tile with directional
 * frames (Advance-Wars style) before the caller reconciles. Animation never gates
 * gameplay (§28.2): the authoritative state is already committed when it runs.
 *
 * Every rectangle comes from the generated atlas, and each sheet the atlas
 * references is loaded as a plain texture with named sub-frames cut on demand —
 * the pack has no uniform grid to hand Phaser as a spritesheet.
 *
 * Not unit-tested — jsdom has no WebGL; the canvas is verified manually. Assets
 * are placeholder Advance-Wars rips (`game-assets/license.txt`): prototype only.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

const RENDER_SCALE = 3;
const WALK_MS_PER_TILE = 120;
const ART_SCALE_MIN = 1;
const ART_SCALE_MAX = 6;
/** How long one explosion frame holds when a unit dies. */
const EXPLOSION_MS_PER_FRAME = 45;

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
   * Re-render at a display scale relative to the 16px source tile. Tile CSS size
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

/** Texture key for an atlas file, per faction where the file is faction-specific. */
function textureKey(file: string, faction?: FactionId): string {
  return file.replace("{faction}", faction ?? "");
}

class BattlefieldScene extends Phaser.Scene implements BattlefieldHandle {
  private model: BattlefieldData;
  private readonly onReady?: (handle: BattlefieldHandle) => void;
  private artScale: number;
  private readonly unitSprites = new Map<string, Phaser.GameObjects.Image>();
  private readonly unitModels = new Map<string, UnitSprite>();
  /** Every unit/property/shadow/bar object — cleared and redrawn by syncModel. */
  private dynamicObjects: Phaser.GameObjects.GameObject[] = [];
  /** Current frame of the shared idle loop (Advance-Wars-style unit breathing). */
  private idleFrame = 0;
  /** Unit ids playing a one-shot clip; the idle loop leaves them alone. */
  private readonly animating = new Set<string>();

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
    const factions: FactionId[] = ["blue", "green", "red", "yellow"];
    const files = new Set(Object.values(ATLAS).map((entry) => entry.file));
    for (const file of files) {
      if (file.includes("{faction}")) {
        for (const faction of factions) {
          this.load.image(textureKey(file, faction), assetUrl(file, faction));
        }
      } else {
        this.load.image(textureKey(file), assetUrl(file));
      }
    }
  }

  /**
   * Registers (once) a named sub-frame of a sheet and returns the texture +
   * frame to draw it with. The pack's rectangles are irregular, so frames are
   * cut lazily by rectangle rather than declared as a uniform grid up front.
   */
  private frameOf(
    atlasKey: string,
    faction?: FactionId,
  ): { key: string; frame: string } {
    const entry = ATLAS[atlasKey as keyof typeof ATLAS];
    const key = textureKey(entry.file, faction);
    const name = `${entry.x}_${entry.y}_${entry.w}_${entry.h}`;
    const texture = this.textures.get(key);
    if (!texture.has(name)) {
      texture.add(name, 0, entry.x, entry.y, entry.w, entry.h);
    }
    return { key, frame: name };
  }

  /** Same, for a rectangle already resolved by the render model. */
  private frameOfRect(
    file: string,
    rect: FrameRect,
    faction?: FactionId,
  ): { key: string; frame: string } {
    const key = textureKey(file, faction);
    const name = `${rect.x}_${rect.y}_${rect.width}_${rect.height}`;
    const texture = this.textures.get(key);
    if (!texture.has(name)) {
      texture.add(name, 0, rect.x, rect.y, rect.width, rect.height);
    }
    return { key, frame: name };
  }

  /** The sheet a unit's frames live on, for the owning faction. */
  private unitTexture(unit: UnitSprite): string {
    return ATLAS[`unit_${unit.spriteKey}_idle_0` as keyof typeof ATLAS].file;
  }

  /**
   * Draws property buildings in their owner's colors. Buildings are taller than
   * a tile (an HQ is nearly two), so they are anchored to the tile's bottom edge
   * and allowed to overhang upward.
   */
  private drawProperties(): void {
    for (const property of this.model.properties) {
      const worldX = property.x * TERRAIN_TILE_PX;
      const worldY = (property.y + 1) * TERRAIN_TILE_PX;
      const { key, frame } = this.frameOf(property.renderTileId);
      this.dynamicObjects.push(
        this.add.image(worldX, worldY, key, frame).setOrigin(0, 1),
      );
    }
  }

  /**
   * The capture read-out for a property being taken: how many capture points
   * still stand between it and its new owner, over a bar of how far the capture
   * has come, in the capturing army's color.
   *
   * It floats in a tag just **above** the tile and is drawn **after** the units.
   * A 16 px tile is fully covered by the unit doing the capturing, so anything
   * drawn inside it either hides behind the sprite (the earlier bar) or lands on
   * the unit's face; overflowing upward is how the art already handles tall
   * buildings and how Advance Wars draws its HP numbers.
   */
  private drawCaptureIndicators(): void {
    const TAG_HEIGHT = 9;
    const BAR_HEIGHT = 2;
    for (const property of this.model.properties) {
      if (property.captureProgress <= 0) continue;
      const color =
        property.capturingFaction !== null
          ? FACTION_COLOR[property.capturingFaction]
          : 0xffffff;
      const tagX = property.x * TERRAIN_TILE_PX + 1;
      // A property on the top row has no room above it; hang the tag below.
      const tagY =
        property.y === 0
          ? TERRAIN_TILE_PX
          : property.y * TERRAIN_TILE_PX - TAG_HEIGHT;
      const tagWidth = TERRAIN_TILE_PX - 2;

      this.dynamicObjects.push(
        this.add
          .rectangle(tagX, tagY, tagWidth, TAG_HEIGHT, 0x0d1117)
          .setOrigin(0, 0)
          .setStrokeStyle(1, color),
      );
      this.dynamicObjects.push(
        this.add
          .rectangle(
            tagX,
            tagY + TAG_HEIGHT - BAR_HEIGHT,
            Math.max(1, tagWidth * property.captureProgress),
            BAR_HEIGHT,
            color,
          )
          .setOrigin(0, 0),
      );
      this.dynamicObjects.push(
        this.add
          .text(
            tagX + tagWidth / 2,
            tagY + 1,
            String(property.capturePointsRemaining),
            {
              fontFamily: "monospace",
              fontSize: "8px",
              fontStyle: "bold",
              color: "#ffffff",
            },
          )
          .setOrigin(0.5, 0)
          .setResolution(4),
      );
    }
  }

  /** Draws unit sprites, bottom-centered over their tile. */
  private drawUnits(): void {
    for (const unit of this.model.units) {
      const { key, frame } = this.frameOfRect(
        this.unitTexture(unit),
        unit.frame,
        unit.faction,
      );
      const worldX = unit.x * TERRAIN_TILE_PX + TERRAIN_TILE_PX / 2;
      const worldY = (unit.y + 1) * TERRAIN_TILE_PX;
      const sprite = this.add
        .image(worldX, worldY, key, frame)
        .setOrigin(0.5, 1);
      sprite.setFlipX(unit.faceLeft); // face the enemy base (left/right only)
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
          fontSize: "8px",
          fontStyle: "bold",
          color: "#ffffff",
          stroke: "#0d1117",
          strokeThickness: 3,
        },
      )
      .setOrigin(1, 1)
      .setResolution(4);
    this.dynamicObjects.push(label);
  }

  create(): void {
    // Static terrain — drawn once, never re-synced (fog is off, layout is fixed).
    for (const cell of this.model.terrain) {
      const worldX = cell.x * TERRAIN_TILE_PX;
      const worldY = (cell.y + 1) * TERRAIN_TILE_PX;
      for (const layer of cell.layers) {
        const { key, frame } = this.frameOf(layer.key);
        // Tiles are bottom-anchored: forests and mountains are taller than a
        // tile and overhang the cell above, as they do in the original.
        this.add
          .image(worldX + (layer.dx ?? 0), worldY + (layer.dy ?? 0), key, frame)
          .setOrigin(0, 1);
      }
      if (!cell.visible) {
        this.add
          .rectangle(
            worldX,
            worldY - TERRAIN_TILE_PX,
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

    // Advance-Wars-style idle loop: cycle the unit idle frames so the board
    // never feels frozen. Honored off under OS reduced-motion (`frontend.md` §10);
    // acted/dived/mid-walk units are left still by `tickIdle`.
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      this.time.addEvent({
        delay: 230,
        loop: true,
        callback: () => this.tickIdle(),
      });
    }
  }

  /** Advance one shared idle frame across every unit sprite. */
  private tickIdle(): void {
    this.idleFrame += 1;
    for (const [unitId, sprite] of this.unitSprites) {
      const model = this.unitModels.get(unitId);
      if (model === undefined) continue;
      // Every unit breathes (acted/greyed and dived included); a walking or
      // one-shot-clip sprite is left alone, since that animation owns its texture.
      if (this.animating.has(unitId) || this.tweens.isTweening(sprite))
        continue;
      const frames = frameCount(model.spriteKey, "idle");
      if (frames === 0) continue;
      this.setFrame(
        sprite,
        model,
        "idle",
        this.idleFrame % frames,
        model.faceLeft,
      );
    }
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
    this.animating.clear();
    this.model = data;
    this.drawProperties();
    this.drawUnits();
    this.drawCaptureIndicators(); // above the unit standing on the property
  }

  async playAnimation(steps: readonly AnimationStep[]): Promise<void> {
    for (const step of steps) {
      if (step.kind === "move") {
        await this.walkUnit(step.unitId, step.path);
      } else if (step.kind === "attack") {
        await this.playAttack(step.attackerUnitId, step.defenderUnitId);
      } else if (step.kind === "destroy") {
        await this.playDestroy(step.unitId);
      }
    }
  }

  /** Apply a clip frame to a sprite, with facing. */
  private setFrame(
    sprite: Phaser.GameObjects.Image,
    model: UnitSprite,
    animation: UnitAnimation,
    frameIndex: number,
    flipX: boolean,
  ): void {
    const rect = unitFrame(model.spriteKey, animation, frameIndex);
    const { key, frame } = this.frameOfRect(
      this.unitTexture(model),
      rect,
      model.faction,
    );
    sprite.setTexture(key, frame);
    sprite.setFlipX(flipX);
  }

  /** Reset a sprite to its resting idle frame, facing the enemy base. */
  private restIdle(sprite: Phaser.GameObjects.Image, model: UnitSprite): void {
    this.setFrame(sprite, model, "idle", 0, model.faceLeft);
  }

  /**
   * The attack beat. The pack animates combat in a separate battle scene, not on
   * the map, so a map attack is a lunge toward the defender plus a flash on the
   * hit unit — no invented frames (§28.3).
   */
  private async playAttack(
    attackerId: string,
    defenderId: string,
  ): Promise<void> {
    const attacker = this.unitSprites.get(attackerId);
    const attackerModel = this.unitModels.get(attackerId);
    const defender = this.unitSprites.get(defenderId);
    const clips: Promise<void>[] = [];

    if (attacker !== undefined && attackerModel !== undefined && defender) {
      const dx = Math.sign(defender.x - attacker.x) * 3;
      const dy = Math.sign(defender.y - attacker.y) * 3;
      if (dx !== 0) attacker.setFlipX(dx < 0);
      this.animating.add(attackerId);
      clips.push(
        new Promise<void>((resolve) => {
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, resolve);
          this.tweens.add({
            targets: attacker,
            x: attacker.x + dx,
            y: attacker.y + dy,
            duration: 110,
            yoyo: true,
            onComplete: () => {
              this.animating.delete(attackerId);
              resolve();
            },
          });
        }),
      );
    }
    if (defender !== undefined) {
      clips.push(
        new Promise<void>((resolve) => {
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, resolve);
          this.tweens.add({
            targets: defender,
            alpha: 0.2,
            duration: 90,
            yoyo: true,
            repeat: 1,
            onComplete: () => resolve(),
          });
        }),
      );
    }
    await Promise.all(clips);

    if (attacker !== undefined && attackerModel !== undefined) {
      this.restIdle(attacker, attackerModel);
    }
    if (defender !== undefined) defender.setAlpha(1);
  }

  /** Play the pack's explosion over the unit, then remove it. */
  private async playDestroy(unitId: string): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    if (sprite === undefined) return;
    const frames = keysWithPrefix("fx_explosion_");
    const first = this.frameOf(frames[0]!);
    const blast = this.add
      .image(sprite.x, sprite.y, first.key, first.frame)
      .setOrigin(0.5, 0.8);
    this.dynamicObjects.push(blast);

    await new Promise<void>((resolve) => {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, resolve);
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: frames.length * EXPLOSION_MS_PER_FRAME,
        onUpdate: (tween) => {
          const index = Math.min(
            frames.length - 1,
            Math.floor(tween.progress * frames.length),
          );
          const { key, frame } = this.frameOf(frames[index]!);
          blast.setTexture(key, frame);
          // The unit fades out under the first half of the blast.
          sprite.setAlpha(Math.max(0, 1 - tween.progress * 2));
        },
        onComplete: () => resolve(),
      });
    });
    blast.destroy();
  }

  /** Walks a unit tile-by-tile along its path with directional walk frames. */
  private async walkUnit(
    unitId: string,
    path: readonly Coordinate[],
  ): Promise<void> {
    const sprite = this.unitSprites.get(unitId);
    const model = this.unitModels.get(unitId);
    if (sprite === undefined || model === undefined || path.length < 2) return;

    for (let i = 0; i < path.length - 1; i++) {
      const { animation, flipX } = walkFrameSpec(
        stepDirection(path[i]!, path[i + 1]!),
      );
      await this.tweenSegment(sprite, model, path[i + 1]!, animation, flipX);
    }
    this.restIdle(sprite, model);
  }

  /** Tween one path segment, cycling walk frames; resolves on complete/teardown. */
  private tweenSegment(
    sprite: Phaser.GameObjects.Image,
    model: UnitSprite,
    to: Coordinate,
    animation: UnitAnimation,
    flipX: boolean,
  ): Promise<void> {
    const frames = Math.max(1, frameCount(model.spriteKey, animation));
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
          const index = Math.min(
            frames - 1,
            Math.floor(tween.progress * frames),
          );
          this.setFrame(sprite, model, animation, index, flipX);
        },
        onComplete: finish,
      });
    });
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
