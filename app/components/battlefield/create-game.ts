import Phaser from "phaser";

import { FACTION_SHEETS } from "@/app/lib/render/derive-render-data";

/**
 * The Phaser bootstrap — a thin imperative shell (M10-T1).
 *
 * This is the one place framework code touches the canvas. It holds **no game
 * logic** (that lives in the pure render/interaction modules) and is therefore
 * not unit-tested — jsdom has no WebGL, so the canvas is verified manually / in
 * M12. Later tickets attach terrain/unit/property layers and the interaction
 * bridge to the scene created here.
 *
 * Assets are the bundled `game-assets/` pack (Aleksandr Makarov /
 * @IKnowKingRabbit — attribution in `/credits`, `game-assets/license.txt`).
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T1)
 */

const ASSET_BASE = "/game-assets";

/** Preloads the terrain/fog/shadow/faction atlases; render layers come in T2+. */
class BattlefieldScene extends Phaser.Scene {
  constructor() {
    super("battlefield");
  }

  preload(): void {
    this.load.image("tileset", `${ASSET_BASE}/tileset/tileset.png`);
    this.load.image("fog", `${ASSET_BASE}/tileset/fog-of-war.png`);
    this.load.image(
      "shadow-small",
      `${ASSET_BASE}/tileset/small-unit-shadow.png`,
    );
    this.load.image("shadow-big", `${ASSET_BASE}/tileset/big-unit-shadow.png`);
    for (const [faction, file] of Object.entries(FACTION_SHEETS)) {
      this.load.image(`units-${faction}`, `${ASSET_BASE}/units/${file}`);
    }
  }
}

/** Creates the Phaser game mounted in `container`. Call only in the browser. */
export function createBattlefieldGame(container: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: "#0b0e14",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BattlefieldScene],
  });
}
