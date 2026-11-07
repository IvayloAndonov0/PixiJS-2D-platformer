"""
Builds PixiJS spritesheet JSON files from the PNGs in public/assets/sprites/.

    pip install pillow
    python tools/build_spritesheets.py

Re-run this whenever the artist updates a sheet. It writes player.json, fx_projectiles.json
and fx_super.json next to the PNGs. Each frame gets an "anchor" so that:
  - player frames: anchor = bottom-center of the feet (so animations don't jitter vertically)
  - fx frames:     anchor = center of the effect (or bottom for ground effects)
"""

import json
import statistics
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "assets" / "sprites"
ALPHA_CUTOFF = 60  # pixels below this alpha are ignored when measuring bounds


def alpha_mask(img: Image.Image, cutoff: int = ALPHA_CUTOFF) -> Image.Image:
    return img.convert("RGBA").split()[3].point(lambda v: 255 if v > cutoff else 0)


def write_sheet(name: str, image: Image.Image, frames: dict, animations: dict) -> None:
    out = {
        "frames": frames,
        "animations": animations,
        "meta": {
            "image": f"{name}.png",
            "format": "RGBA8888",
            "size": {"w": image.width, "h": image.height},
            "scale": "1",
        },
    }
    path = SPRITES / f"{name}.json"
    path.write_text(json.dumps(out, indent=1))
    print(f"wrote {path.relative_to(ROOT)}: {len(frames)} frames, {len(animations)} animations")


def frame_entry(x: int, y: int, w: int, h: int, ax: float, ay: float) -> dict:
    return {
        "frame": {"x": x, "y": y, "w": w, "h": h},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
        "sourceSize": {"w": w, "h": h},
        "anchor": {"x": round(ax, 4), "y": round(ay, 4)},
    }


# --------------------------------------------------------------------------------------
# Player: 144px grid (matches demon_jester_grid_map.json)
# --------------------------------------------------------------------------------------

CELL = 144
# name: (row, first column, frame count)
PLAYER_ROWS = {
    "Idle": (0, 0, 8),
    "Walk": (0, 9, 9),
    "Run": (1, 0, 8),
    "Dash": (1, 9, 6),
    "Jump": (2, 0, 9),
    "Crouch": (2, 9, 8),
    "Shoot": (3, 0, 8),
    "HurtDeath": (3, 9, 9),
}
# Frames whose feet should follow the frame's own bottom edge (airborne poses drawn high in the cell).
PER_FRAME_BASELINE = {("Jump", i) for i in (2, 3, 4, 5)}

# Gameplay animations built from the raw rows: name -> list of (row name, frame index)
PLAYER_ANIMS = {
    "Idle": [("Idle", i) for i in range(8)],
    "Walk": [("Walk", i) for i in range(9)],
    "Run": [("Run", i) for i in range(8)],
    "Dash": [("Dash", i) for i in range(6)],
    "JumpStart": [("Jump", 0), ("Jump", 1)],
    "JumpRise": [("Jump", 2), ("Jump", 3)],
    "JumpFall": [("Jump", 4), ("Jump", 5)],
    "Land": [("Jump", 6), ("Jump", 7), ("Jump", 8)],
    "Crouch": [("Crouch", i) for i in range(8)],
    "Shoot": [("Shoot", i) for i in range(4)],  # frames 4-7 have the projectile baked in
    "ShootFull": [("Shoot", i) for i in range(8)],
    "Hurt": [("HurtDeath", 0), ("HurtDeath", 1)],
    "Death": [("HurtDeath", i) for i in range(2, 6)],
    "Ghost": [("HurtDeath", i) for i in range(6, 9)],
}


def build_player() -> None:
    img = Image.open(SPRITES / "player.png")
    mask = alpha_mask(img)
    frames = {}
    for anim, (row, col0, count) in PLAYER_ROWS.items():
        bottoms = []
        boxes = []
        for i in range(count):
            x, y = (col0 + i) * CELL, row * CELL
            bb = mask.crop((x, y, x + CELL, y + CELL)).getbbox()
            boxes.append((x, y, bb))
            if bb:
                bottoms.append(bb[3])
        baseline = statistics.median(bottoms) if bottoms else CELL
        for i, (x, y, bb) in enumerate(boxes):
            b = bb[3] if (anim, i) in PER_FRAME_BASELINE and bb else baseline
            frames[f"{anim}_{i}"] = frame_entry(x, y, CELL, CELL, 0.5, b / CELL)
        print(f"  {anim:10s} feet at y={baseline}")

    animations = {name: [f"{a}_{i}" for a, i in seq] for name, seq in PLAYER_ANIMS.items()}
    write_sheet("player", img, frames, animations)


# --------------------------------------------------------------------------------------
# FX strips: not on a grid, so frames are found by scanning for columns with pixels.
# --------------------------------------------------------------------------------------

def find_segments(mask: Image.Image, merge_gap: int) -> list[tuple[int, int]]:
    """Horizontal runs of non-empty columns. Runs closer than merge_gap are joined."""
    w, h = mask.size
    cols = [mask.crop((x, 0, x + 1, h)).getbbox() is not None for x in range(w)]
    segs, start = [], None
    for x, filled in enumerate(cols + [False]):
        if filled and start is None:
            start = x
        elif not filled and start is not None:
            segs.append([start, x])
            start = None
    merged = []
    for s in segs:
        if merged and s[0] - merged[-1][1] < merge_gap:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return [(a, b) for a, b in merged if b - a > 3]


def build_strip(name: str, groups: list[tuple[str, int, str]], merge_gap: int) -> None:
    """groups: (animation name, frame count, anchor mode 'center' | 'bottom') in left-to-right order."""
    img = Image.open(SPRITES / f"{name}.png")
    mask = alpha_mask(img, 40)
    segs = find_segments(mask, merge_gap)
    expected = sum(n for _, n, _ in groups)
    if len(segs) != expected:
        sys.exit(f"{name}: found {len(segs)} frames but expected {expected}: {segs}")

    frames, animations, i = {}, {}, 0
    h = img.height
    for anim, count, mode in groups:
        names = []
        anim_segs = segs[i : i + count]
        bottom = max(mask.crop((a, 0, b, h)).getbbox()[3] for a, b in anim_segs)
        for k, (a, b) in enumerate(anim_segs):
            pad_l = 3 if a >= 3 else a
            pad_r = 3 if b + 3 <= img.width else img.width - b
            x, w = a - pad_l, (b - a) + pad_l + pad_r
            ay = bottom / h if mode == "bottom" else 0.5
            fname = f"{anim}_{k}"
            frames[fname] = frame_entry(x, 0, w, h, 0.5, ay)
            names.append(fname)
        animations[anim] = names
        i += count
    write_sheet(name, img, frames, animations)


def main() -> None:
    build_player()
    build_strip(
        "fx_projectiles",
        [("Bullet", 5, "center"), ("Card", 5, "center"), ("Spark", 4, "center"), ("Ring", 2, "center"), ("Smoke", 4, "center")],
        merge_gap=6,
    )
    build_strip(
        "fx_super",
        [("SuperCircle", 5, "bottom"), ("SuperSmoke", 2, "bottom"), ("Vortex", 1, "center"), ("CardFan", 5, "center")],
        merge_gap=20,
    )


if __name__ == "__main__":
    main()
