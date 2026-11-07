import { loadAssets } from "./assets";
import { Game } from "./core/Game";
import { BossFightScene } from "./scenes/BossFightScene";
import { TitleScene } from "./scenes/TitleScene";

(async () => {
  const game = new Game();
  await game.init(document.getElementById("app")!);
  await loadAssets();

  // Dev shortcuts:
  //   ?fight=0         start boss #0's level (parkour first)
  //   ?fight=0&arena   skip the parkour, start locked in the arena
  const params = new URLSearchParams(location.search);
  const fight = params.get("fight");
  game.changeScene(
    fight !== null ? new BossFightScene(game, Number(fight) || 0, params.has("arena")) : new TitleScene(game),
  );
})();
