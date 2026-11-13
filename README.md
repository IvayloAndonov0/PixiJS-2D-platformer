# Untitled Boss Rush

A 2D run-and-gun boss-fight game built with **PixiJS v8 + TypeScript + Vite** for the hackathon.

## Quick start

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # type-check + production build into dist/
```

## Controls

| Action        | Keys              |
| ------------- | ----------------- |
Defaults below. Players can rebind everything under **Settings** on the title screen
(keyboard keys or mouse buttons, 2 slots per action, saved in the browser's localStorage).

| Action        | Default keys      |
| ------------- | ----------------- |
| Move / aim    | WASD or arrows    |
| Crouch        | S / ↓ (on the floor). Smaller hitbox, shoots low |
| Drop through  | S / ↓ while standing on a platform |
| Jump          | Space / Z         |
| Parry         | Jump again in mid-air, timed on a **green** projectile |
| Shoot (hold)  | **Left Click** / X |
| Dash          | Left Shift / C    |
| Lock aim      | V (hold)          |
| Super         | **Right Click** / Q, when the super meter is full |
| Pause         | Esc / P (Backspace while paused quits to title) |

Menus always use fixed keys (arrows/WASD, Enter/Space, Esc), so a bad rebind can't lock you out.

**Super meter:** each bullet that hits the boss adds +1 and each parry adds +25 (tune in `SUPER` in `config.ts`).
When it's full, the special fires a big piercing shot that does heavy damage.

**Parryable projectiles:** boss bullets spawned with `{ parryable: true }` are drawn green with a white ring.
A successful parry destroys the bullet, bounces you up (so you can chain parries), and fills the meter.

Default bindings live in `DEFAULT_BINDINGS` in [src/core/Input.ts](src/core/Input.ts).

## Project layout

```
src/
  main.ts                 entry point
  config.ts               ALL tuning numbers (speeds, HP, colors, resolution)
  bosses.ts               boss registry: add new bosses here
  core/
    Game.ts               Pixi app, fixed 1280x720 letterboxed view, scene switching
    Scene.ts              base class for screens
    Input.ts              keyboard/mouse -> actions, rebinding, saved binds
  scenes/
    TitleScene.ts         title + boss select + settings
    SettingsScene.ts      keybind rebinding (keyboard + mouse)
    BossFightScene.ts     the arena: update loop, collisions, win/lose
    ResultScene.ts        win/lose screen
  entities/
    Player.ts             movement, jump, dash, 8-way shooting, i-frames
    Platform.ts           one-way platforms (jump through, drop down)
    Bullet.ts
    bosses/
      Boss.ts             base class: HP, phases, attack scheduler, shooting helpers
      ExampleBoss.ts      template boss with 3 phases
      StormCrow.ts        flying: feather fans, rain, dive-bombs, lightning strikes, tornadoes
      IronGolem.ts        ground: shockwaves, lobbed boulders, floor eruptions, rocket fist, rockfall
      HexWizard.ts        teleporter: spirals, orbs, rune walls with a gap, homing wisps, rune traps
      EclipseHeart.ts     final boss (sprite art): rings, beam, meteors, lances, blades, spikes, vortex
      art/
        BossModel.ts      base for bosses drawn in code: a rig of parts eased toward a `pose`
        CrowModel.ts      animated models (wings flap, arms swing, staff raises...)
        GolemModel.ts
        WizardModel.ts
        projectiles.ts    projectile shapes drawn in code (shared GraphicsContext per shape)
  systems/
    BulletPool.ts         spawns/culls bullets
    collision.ts          rect/circle overlap
  ui/
    HUD.ts                player HP + boss health bar
  audio.ts                music (one looping track) + one-shot SFX; MUSIC / SFX file lists
  assets.ts               loads spritesheets + images; anim("player", "Run"), image("hills")
  level/
    parkour.ts            the parkour runs before each arena (PARKOUR_1..5: floor spans, platforms, spikes, signs)
    Terrain.ts            floor/pits, one-way + moving platforms, spikes
    Background.ts         per-level backgrounds (hills, storm, quarry, arcane, eclipse): parallax layers + weather
  systems/Effects.ts      one-shot effects (sparks, smoke, parry ring, super circle) + screen shake
public/assets/
  sprites/                PNG sheets + generated .json spritesheets
  audio/                  Map/, Example Boss/ (Parkour, Boss), Player Sounds/ (Swoosh, Hurt, Death)
  fonts/
tools/
  build_spritesheets.py   regenerates the sprite .json files from the PNGs
```

All gameplay uses a fixed **1280x720** coordinate space. `GROUND_Y = 640`. Entity `x, y` is **bottom-center**.

Dev shortcuts: `http://localhost:8080/?fight=0` starts boss #0's level (parkour first),
`?fight=0&arena` skips the parkour and starts in the arena.

## Level flow

Each boss can have a **parkour intro** (`intro` in `src/bosses.ts`). The parkour is built at **negative x**
(e.g. -3200..0) and the arena is always 0..1280, so boss code keeps using simple screen coordinates.
The camera follows the player through the parkour. When they pass x = 140, a gate drops behind them,
the camera locks on the arena, the boss HUD appears and the boss wakes up. There's no going back.

Falling into a pit costs 1 HP and launches you back up out of it (keeping your momentum) with brief i-frames. Spikes hurt on touch.
Edit `src/level/parkour.ts` to change the course. Reach: full jump ≈ 155px up / 250px across, jump + dash ≈ 400px across.
Set `DEBUG_HITBOXES = true` in `config.ts` to draw hitboxes.

## Audio

`src/audio.ts` has the file lists and two kinds of playback:

- **Music**: `playMusic(file)` loops one track at a time (asking for the track already playing does nothing); `stopMusic()` stops it.
  The map plays `MUSIC.map`. Each boss can set `music: { parkour, boss }` in `src/bosses.ts`: the parkour track plays
  until the gate drops, then the boss track. Leaving a fight stops the music.
- **SFX**: `playSfx(file, volume, maxSeconds)` plays a one-shot; `maxSeconds` cuts it off with a short fade.
  Player sounds: dash plays `Swoosh`, getting hurt plays `Hurt` (with a small screen shake via `Effects.shake()`),
  menu buttons (`MenuList`, mouse click or Enter) play the UI click; dying stops the music and plays `Death` for 8 seconds, fading out, over the results screen until the player presses a key / clicks or leaves it (`stopSfx()`).

Browsers block audio until the first click or key press, so a blocked track starts on the first input.
To add a track, drop the file in `public/assets/audio/` and add it to `MUSIC` or `SFX`.

## Art pipeline

| Sheet | Layout | Animations |
|---|---|---|
| `player.png` | 144px grid, 18×4 | Idle, Walk, Run, Dash, JumpStart/JumpRise/JumpFall/Land, Crouch, Shoot, Hurt, Death, Ghost |
| `fx_projectiles.png` | free strip, auto-detected | Bullet, Card (player shot), Spark (hit), Ring (parry), Smoke |
| `fx_super.png` | free strip, auto-detected | SuperCircle, SuperSmoke, Vortex (special projectile), CardFan |
| `eclipse.png` | cut from `art/eclipse_heart_sheet.png` by hand-picked boxes (`ECLIPSE_SPRITES` in the script), haze removed | Eclipse Heart poses, projectiles, ground effects (each a 1-frame animation) |

When the artist updates a sheet:

```bash
pip install pillow
python tools/build_spritesheets.py
```

The script writes the `.json` next to each PNG. Each player animation is anchored at the character's
feet (measured automatically), so switching animations doesn't make the sprite jump.
If you add frames or animations, edit `PLAYER_ROWS` / `PLAYER_ANIMS` or the strip groups at the bottom of the script.
Export **PNG with transparency**. JPG has no alpha, so you'd get a dark box around the character.

Still needed from art: **parry** frames (currently a tint) and sprites for the other bosses.
Sprite bullets that are parryable get a green tint + white ring automatically, so the parry colour rule still holds.

## Making a new boss

1. Copy `src/entities/bosses/ExampleBoss.ts` to `MyBoss.ts` and rename the class.
2. Write attacks. An attack is a function `(dt, t) => boolean`: it runs every frame, `t` is the number of seconds since it started, and it returns `true` when it's done.
   Use the helpers `this.shootAtPlayer(...)`, `this.shootRing(...)`, `this.lob(...)` (gravity arc onto a spot) and
   `this.fireEvery(t, interval, max, fn)` (timed volleys), or call `this.bullets.spawn(x, y, vx, vy, { gravity })` directly.
   `this.justStarted`, `this.startX` and `this.count` are reset each time an attack begins.
3. List phases with `untilHpFraction` (for example `0.6` means "switch to the next phase at 60% HP").
4. Register it in `src/bosses.ts` with its arena platforms (`{ x, y, w }` list, or `[]` for a flat arena), an optional parkour `intro` and `sky` colors.
5. Optional art: draw a model in `entities/bosses/art/` (extend `BossModel`, call `this.useModel(...)`) and give bullets
   a look with `shape: { ctx: MY_SHAPE() }` (drawn in code) or `sprite: {...}` (from a spritesheet).
   Parryable bullets with a shape or sprite are tinted green with a white ring automatically.
6. Give it a node on the map in `src/level/overworld.ts` (`MAP_NODES` + a path in `MAP_PATHS`).

## Suggested team split

These areas are mostly separate files, which keeps merge conflicts down:

- **Player feel**: `Player.ts`, `config.ts` (parry, weapon types, super meter, animations)
- **Bosses**: one person per boss file in `entities/bosses/`
- **Art**: sprites in `public/assets/sprites/`; replace the `Graphics` placeholders marked `TODO(art)`
- **Audio / FX**: music, SFX, hit flashes, screen shake, particles (`TODO(audio)`, `TODO(fx)`)
- **UI / menus**: `scenes/TitleScene.ts`, `scenes/ResultScene.ts`, `ui/HUD.ts`

Search the code for `TODO(` to find the hooks.

## Git workflow

- Branch per feature: `git checkout -b boss/octopus`, `feat/parry`, `art/player-sprites`
- Run `npm run build` before pushing. It type-checks the code.
- Open small PRs into `main` often.
