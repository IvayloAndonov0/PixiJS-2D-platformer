import { Application, Graphics } from "pixi.js";

(async () => {
  const app = new Application();
  await app.init({
    background: "#1e1e2e",
    resizeTo: window,
    antialias: false,
  });
  document.getElementById("app")!.appendChild(app.canvas);

  // Placeholder: a ground strip and a player box to confirm rendering works
  const ground = new Graphics().rect(0, 0, app.screen.width, 40).fill(0x4caf50);
  ground.y = app.screen.height - 40;
  app.stage.addChild(ground);

  const player = new Graphics().rect(-16, -32, 32, 32).fill(0xffcc00);
  player.position.set(app.screen.width / 2, ground.y);
  app.stage.addChild(player);

  app.ticker.add(() => {
    // game loop goes here
  });
})();
