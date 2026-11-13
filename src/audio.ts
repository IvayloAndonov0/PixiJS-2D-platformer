/**
 * Background music. One track plays at a time; asking for the track that is already playing is a no-op,
 * so scenes can call `playMusic()` freely. Browsers block audio until the user interacts with the page,
 * so a blocked play() is retried on the first key press / click.
 */
const MUSIC_DIR = "assets/audio";
const VOLUME = 0.5;

/** Music files, relative to assets/audio. */
export const MUSIC = {
  map: "Map/Longing for AIR.mp3",
  exampleParkour: "Example Boss/Parkour.mp3",
  exampleBoss: "Example Boss/Boss.mp3",
} as const;

export type MusicKey = keyof typeof MUSIC;

let current: HTMLAudioElement | undefined;
let currentFile: string | undefined;
/** The track scenes last asked for; resumed if music is switched back on. */
let wantedFile: string | undefined;

const MUSIC_PREF_KEY = "boss-rush.music.v1";
let musicEnabled = loadMusicEnabled();

function loadMusicEnabled(): boolean {
  try {
    return localStorage.getItem(MUSIC_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function isMusicEnabled(): boolean {
  return musicEnabled;
}

/** Turn background music on/off (remembered between sessions). Sound effects are unaffected. */
export function setMusicEnabled(on: boolean): void {
  musicEnabled = on;
  try {
    localStorage.setItem(MUSIC_PREF_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked — the setting just won't persist.
  }
  if (!on) haltMusic();
  else if (wantedFile) playMusic(wantedFile);
}

function startWhenAllowed(audio: HTMLAudioElement): void {
  audio.play().catch(() => {
    const retry = () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      if (current === audio) audio.play().catch(() => {});
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
  });
}

/** Loop `file` (a path relative to assets/audio, or a MUSIC key's value). Does nothing if it is already playing. */
export function playMusic(file: string): void {
  wantedFile = file;
  if (!musicEnabled || currentFile === file) return;
  haltMusic();
  const audio = new Audio(encodeURI(`${MUSIC_DIR}/${file}`));
  audio.loop = true;
  audio.volume = VOLUME;
  current = audio;
  currentFile = file;
  startWhenAllowed(audio);
}

export function stopMusic(): void {
  wantedFile = undefined;
  haltMusic();
}

function haltMusic(): void {
  current?.pause();
  current = undefined;
  currentFile = undefined;
}

/** Sound effects (player + UI), relative to assets/audio. */
export const SFX = {
  swoosh: "Player Sounds/Swoosh.mp3",
  hurt: "Player Sounds/Hurt.mp3",
  death: "Player Sounds/Death.mp3",
  uiClick: "UI/floraphonic-casual-click-pop-ui-3-262120.mp3",
} as const;

interface ActiveSfx {
  audio: HTMLAudioElement;
  cancelCut: () => void;
}
const activeSfx = new Map<string, Set<ActiveSfx>>();

function fadeOutAndPause(audio: HTMLAudioElement, from: number, ms: number): void {
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms);
    audio.volume = from * (1 - t);
    if (t < 1) requestAnimationFrame(step);
    else audio.pause();
  };
  step();
}

/**
 * Play a one-shot sound. Overlapping calls play on top of each other.
 * `maxSeconds` cuts it off (with a short fade) if the file is longer than you want.
 */
export function playSfx(file: string, volume = 0.8, maxSeconds?: number): void {
  const audio = new Audio(encodeURI(`${MUSIC_DIR}/${file}`));
  audio.volume = volume;
  audio.play().catch(() => {});

  const fadeMs = 300;
  const timer =
    maxSeconds === undefined
      ? undefined
      : setTimeout(() => fadeOutAndPause(audio, volume, fadeMs), Math.max(0, maxSeconds * 1000 - fadeMs));
  const entry: ActiveSfx = { audio, cancelCut: () => clearTimeout(timer) };
  let set = activeSfx.get(file);
  if (!set) activeSfx.set(file, (set = new Set()));
  set.add(entry);
  audio.addEventListener("ended", () => set.delete(entry));
}

/** Fade out every playing instance of `file` (e.g. SFX.death when the player moves on). */
export function stopSfx(file: string): void {
  const set = activeSfx.get(file);
  if (!set) return;
  for (const { audio, cancelCut } of set) {
    cancelCut();
    if (!audio.paused) fadeOutAndPause(audio, audio.volume, 150);
  }
  set.clear();
}
