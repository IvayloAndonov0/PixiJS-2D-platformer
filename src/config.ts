// Global tuning values. Tweak gameplay feel here instead of hunting through files.

/** Virtual resolution. Everything is laid out in these units, then scaled to the window. */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const GROUND_Y = 640;

/** Draw hitboxes in green. Handy when tuning art vs. collision. */
export const DEBUG_HITBOXES = false;

export const PLAYER = {
  width: 48,
  height: 72,
  speed: 360, // px/s
  jumpVelocity: 900, // px/s upward
  gravity: 2600, // px/s^2
  maxFallSpeed: 1400,
  dashSpeed: 900,
  dashDuration: 0.18, // s
  dashInvulnerable: false, // true = every dash has i-frames (otherwise only with the Shadow Dash charm)
  dashCooldown: 0.5,
  maxHp: 3,
  invulnTime: 1.2, // s of i-frames after taking a hit
  fireRate: 8, // shots per second
  spriteScale: 0.75, // player sheet cells are 144px; character is ~100px tall in them
  crouchHeight: 58, // body height while crouching (matches the crouch art; lower = easier ducking)
  parryWindow: 0.25, // s the parry hitbox stays active after pressing jump in mid-air
  parryBounce: 800, // upward velocity after a successful parry
  parryFreeze: 0.18, // s the whole game freezes on a successful parry (hit-stop)
  deathFreeze: 0.35, // s freeze at the moment of death
  deathDuration: 2.5, // s the death animation plays before the results screen
  dropThroughTime: 0.25, // s a platform is ignored after dropping through it
  pitBounceHeight: 220, // px above the floor the player is launched to after falling into a pit
};

/**
 * Default one-way platforms for the arena. { x: left edge, y: top surface, w: width }.
 * A full jump reaches ~155px up, so keep vertical gaps under ~140px.
 * Bosses can override this with their own `platforms` list.
 */
export const DEFAULT_PLATFORMS = [
  { x: 140, y: 520, w: 220 },
  { x: 440, y: 410, w: 200 },
  { x: 720, y: 520, w: 180 },
];

/** Super meter: fills from damage dealt and parries, spent on the special attack. */
export const SUPER = {
  max: 100,
  perHit: 1, // per player bullet that hits the boss
  perParry: 25, // per successful parry
  damage: 40,
  radius: 44,
  speed: 900,
  invulnTime: 0.5, // i-frames while firing the special
};

export const BULLET = {
  speed: 1100,
  damage: 1,
  radius: 8,
};

export const COLORS = {
  background: 0x2b2118,
  ground: 0x5a4632,
  platform: 0x8d6e4f,
  movingPlatform: 0x6d8fa8,
  spikes: 0xbdbdbd,
  gate: 0x3e2723,
  platformTop: 0xc8a97e,
  player: 0x4fc3f7,
  playerBullet: 0xfff176,
  boss: 0xe57373,
  bossBullet: 0xff7043,
  parryable: 0x69f0ae, // green = can be parried (pink clashed with the player's purple effects)
  special: 0x80deea,
  text: 0xfff8e1,
  bossBar: 0xd32f2f,
  superBar: 0x4dd0e1,
  superBarFull: 0xffeb3b,
};

/** Shop weapons (see core/Upgrades.ts). The Blaster uses BULLET + PLAYER.fireRate. */
export const WEAPONS = {
  spread: {
    fireRate: 5,
    angles: [-0.2, 0, 0.2], // radians, one bullet each
    speed: 950,
    range: 300, // px before the shots fizzle out
    damage: 1.8,
    radius: 7,
  },
  homing: {
    fireRate: 6,
    speed: 650,
    turnRate: 7, // radians per second the shot can curve
    life: 2.5,
    damage: 0.9,
    radius: 9,
  },
};

/** Shadow Dash charm: afterimages left behind while dashing. */
export const SHADOW_DASH = {
  tint: 0x4a3a6a,
  alpha: 0.75,
  trailEvery: 0.03, // s between afterimages
  trailLife: 0.25, // s each afterimage takes to fade
};
