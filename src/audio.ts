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

let audioCtx: AudioContext | undefined;

/** Shared AudioContext for synthesised sounds (undefined if Web Audio is unavailable). */
function synthCtx(): AudioContext | undefined {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return undefined;
  }
}

/** One soft note: sine wave, gentle attack, exponential fade, optional pitch glide, low-passed. */
function softTone(
  ctx: AudioContext,
  { freq, endFreq = freq, start = 0, attack = 0.01, length, volume, wave = "sine", cutoff = 3000 }: {
    freq: number;
    endFreq?: number;
    start?: number;
    attack?: number;
    length: number;
    volume: number;
    wave?: OscillatorType;
    cutoff?: number;
  },
): void {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cutoff;
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + length);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** Synth effects get louder while music is playing so they stay audible over it. */
const MUSIC_BOOST = 3;
const withMusicBoost = (volume: number): number => (musicEnabled && current !== undefined ? volume * MUSIC_BOOST : volume);

/** Soft coin "ding": two gentle rising sine notes. */
export function playCoinSound(volume = 0.06): void {
  const ctx = synthCtx();
  if (!ctx) return;
  const v = withMusicBoost(volume);
  softTone(ctx, { freq: 988, start: 0, attack: 0.012, length: 0.2, volume: v });
  softTone(ctx, { freq: 1319, start: 0.07, attack: 0.012, length: 0.32, volume: v });
}

/** Quiet, low "pup": a short downward-gliding sine with a little pitch variation so held fire isn't monotone. */
export function playShootSound(volume = 0.04): void {
  const ctx = synthCtx();
  if (!ctx) return;
  const f = 330 * (0.94 + Math.random() * 0.12);
  softTone(ctx, { freq: f, endFreq: f * 0.55, attack: 0.004, length: 0.09, volume: withMusicBoost(volume), cutoff: 1500 });
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
