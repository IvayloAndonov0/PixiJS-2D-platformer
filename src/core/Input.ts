/**
 * Input: maps keyboard keys and mouse buttons onto actions.
 *
 * - Gameplay actions (Action) can be rebound by players in the Settings screen and are saved in localStorage.
 * - Menu navigation (MenuAction) uses fixed keys so a bad rebind can never lock anyone out of the menus.
 *
 * Bindings are stored as strings: KeyboardEvent.code ("KeyX", "Space", "ArrowLeft"...) or
 * "Mouse0" (left), "Mouse1" (middle), "Mouse2" (right), "Mouse3"/"Mouse4" (side buttons).
 */

export type Action = "left" | "right" | "up" | "down" | "jump" | "shoot" | "dash" | "lock" | "special" | "pause";

export type MenuAction = "up" | "down" | "left" | "right" | "confirm" | "back" | "clear";

/** Each action has this many binding slots (primary, secondary). */
export const SLOTS = 2;

/** Display order + labels for the Settings screen. */
export const ACTION_LABELS: Record<Action, string> = {
  left: "Move Left",
  right: "Move Right",
  up: "Aim Up",
  down: "Crouch / Aim Down",
  jump: "Jump / Parry",
  shoot: "Shoot",
  dash: "Dash",
  lock: "Lock Aim",
  special: "Super",
  pause: "Pause",
};

export const ACTIONS = Object.keys(ACTION_LABELS) as Action[];

/** Default bindings. `null` = empty slot. */
export const DEFAULT_BINDINGS: Record<Action, (string | null)[]> = {
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  jump: ["Space", "KeyZ"],
  shoot: ["Mouse0", "KeyX"],
  dash: ["ShiftLeft", "KeyC"],
  lock: ["KeyV", null],
  special: ["Mouse2", "KeyQ"],
  pause: ["Escape", "KeyP"],
};

const MENU_BINDINGS: Record<MenuAction, string[]> = {
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  confirm: ["Enter", "Space"],
  back: ["Escape"],
  clear: ["Backspace", "Delete"],
};

const STORAGE_KEY = "boss-rush.keybinds.v1";

export class Input {
  bindings: Record<Action, (string | null)[]> = loadBindings();

  private held = new Set<string>();
  private pressed = new Set<string>();
  /** When set, the next key/mouse press is handed to this callback instead of being treated as input. */
  private captureCallback?: (code: string | null) => void;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.code.startsWith("Arrow") || e.code === "Tab") e.preventDefault();
      if (this.captureCallback) {
        // Escape cancels a rebind instead of being bound.
        this.finishCapture(e.code === "Escape" ? null : e.code);
        return;
      }
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));

    window.addEventListener("mousedown", (e) => {
      const code = `Mouse${e.button}`;
      if (this.captureCallback) {
        this.finishCapture(code);
        return;
      }
      this.pressed.add(code);
      this.held.add(code);
    });
    window.addEventListener("mouseup", (e) => this.held.delete(`Mouse${e.button}`));
    // Right click is a game button, not a browser menu.
    window.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("blur", () => this.held.clear());
  }

  // ---------- Gameplay queries ----------

  /** True while the action is held. */
  isDown(action: Action): boolean {
    return this.bindings[action].some((k) => k !== null && this.held.has(k));
  }

  /** True only on the frame the action was first pressed. */
  wasPressed(action: Action): boolean {
    return this.bindings[action].some((k) => k !== null && this.pressed.has(k));
  }

  /** -1 (left), 0, or 1 (right). */
  axisX(): number {
    return (this.isDown("right") ? 1 : 0) - (this.isDown("left") ? 1 : 0);
  }

  /** -1 (up), 0, or 1 (down). */
  axisY(): number {
    return (this.isDown("down") ? 1 : 0) - (this.isDown("up") ? 1 : 0);
  }

  /** Fixed, non-rebindable menu keys. */
  menuPressed(action: MenuAction): boolean {
    return MENU_BINDINGS[action].some((k) => this.pressed.has(k));
  }

  /** Called by Game at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
  }

  // ---------- Rebinding ----------

  get isCapturing(): boolean {
    return this.captureCallback !== undefined;
  }

  /** Wait for the next key or mouse button. Escape cancels (callback gets null). */
  captureNext(callback: (code: string | null) => void): void {
    this.captureCallback = callback;
  }

  /** Put `code` in a slot. If another action already uses it, it's removed from there. */
  bind(action: Action, slot: number, code: string | null): void {
    if (code !== null) {
      for (const a of ACTIONS) {
        this.bindings[a] = this.bindings[a].map((k) => (k === code ? null : k));
      }
    }
    this.bindings[action][slot] = code;
    this.save();
  }

  resetToDefaults(): void {
    this.bindings = cloneBindings(DEFAULT_BINDINGS);
    this.save();
  }

  /** Human-readable label for the HUD / settings, e.g. "Left Click", "Space", "X". */
  labelFor(action: Action): string {
    return this.bindings[action].filter((k): k is string => k !== null).map(codeLabel).join(" / ") || "unbound";
  }

  private finishCapture(code: string | null): void {
    const cb = this.captureCallback;
    this.captureCallback = undefined;
    // Don't let the press that set the binding also trigger gameplay/menu input this frame.
    this.held.clear();
    this.pressed.clear();
    cb?.(code);
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // Storage blocked (private mode etc.) — bindings just won't persist.
    }
  }
}

function cloneBindings(b: Record<Action, (string | null)[]>): Record<Action, (string | null)[]> {
  const out = {} as Record<Action, (string | null)[]>;
  for (const a of ACTIONS) out[a] = [...b[a]];
  return out;
}

/** Load saved bindings, falling back to defaults for anything missing or malformed. */
function loadBindings(): Record<Action, (string | null)[]> {
  const result = cloneBindings(DEFAULT_BINDINGS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const saved = JSON.parse(raw) as Partial<Record<Action, unknown>>;
    for (const a of ACTIONS) {
      const slots = saved[a];
      if (Array.isArray(slots) && slots.length === SLOTS && slots.every((k) => k === null || typeof k === "string")) {
        result[a] = slots as (string | null)[];
      }
    }
  } catch {
    // Ignore corrupt / unavailable storage.
  }
  return result;
}

const MOUSE_LABELS: Record<string, string> = {
  Mouse0: "Left Click",
  Mouse1: "Middle Click",
  Mouse2: "Right Click",
  Mouse3: "Mouse Back",
  Mouse4: "Mouse Forward",
};

const ARROWS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

export function codeLabel(code: string | null): string {
  if (code === null) return "—";
  if (MOUSE_LABELS[code]) return MOUSE_LABELS[code];
  if (ARROWS[code]) return ARROWS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code.replace(/(Left|Right)$/, " $1"); // "ShiftLeft" -> "Shift Left"
}
