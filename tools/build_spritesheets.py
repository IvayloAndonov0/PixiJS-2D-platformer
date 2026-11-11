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
    build_eclipse()


# --------------------------------------------------------------------------------------
# Eclipse Heart: a loose concept sheet (art/eclipse_heart_sheet.png), not on a grid.
# Sprites are cut out by hand-picked boxes, cleaned of the faint background haze,
# and packed into public/assets/sprites/eclipse.png. Each sprite is a 1-frame animation.
# --------------------------------------------------------------------------------------

ECLIPSE_SRC = ROOT / "art" / "eclipse_heart_sheet.png"
ECLIPSE_HAZE = 30  # alpha at or below this is background haze and gets removed
LABEL_SCALE = 4  # blobs are found on a 1/4 size copy (fast enough without numpy)

# name: (left, top, right, bottom in the source, mode, anchor)
#   mode "blob": keep only blobs whose center is inside the box (stops neighbours bleeding in)
#   mode "box":  keep everything in the box except pixels that belong to a "blob" sprite
#                or that fall in one of its ECLIPSE_EXCLUDE rectangles
#   anchor "center" or "bottom"
ECLIPSE_SPRITES = {
    # Row 1: full body poses
    "Pose1": (16, 8, 304, 334, "blob", "bottom"),
    "Pose2": (310, 8, 592, 336, "blob", "bottom"),
    "Pose3": (598, 8, 846, 322, "blob", "bottom"),
    "Pose4": (848, 8, 1152, 336, "blob", "bottom"),
    "Pose5": (1155, 6, 1525, 382, "blob", "bottom"),
    # Row 3: orbs, stars, crescents
    "OrbBig": (8, 500, 134, 612, "blob", "center"),
    "OrbCracked": (136, 510, 200, 610, "blob", "center"),
    "OrbSmall": (204, 515, 296, 600, "blob", "center"),
    "OrbHalo": (296, 498, 412, 616, "blob", "center"),
    "OrbCrescent": (412, 502, 532, 616, "blob", "center"),
    "OrbTiny": (540, 522, 620, 600, "blob", "center"),
    "StarOrb": (628, 496, 744, 620, "blob", "center"),
    "Star": (744, 510, 816, 612, "blob", "center"),
    "CrescentSmall": (816, 504, 888, 592, "blob", "center"),
    "CrescentA": (896, 504, 968, 616, "blob", "center"),
    "StarGold": (988, 512, 1112, 616, "blob", "center"),
    "CrescentB": (1112, 516, 1192, 616, "blob", "center"),
    "StarPurple": (1196, 512, 1308, 620, "blob", "center"),
    "RingOval": (1384, 518, 1524, 610, "blob", "center"),
    # Row 4: streaks, spear, lance
    "Comet": (12, 610, 208, 700, "blob", "center"),
    "CrescentDash": (208, 618, 344, 704, "blob", "center"),
    "Bolt": (356, 618, 552, 690, "blob", "center"),
    "Spear": (556, 612, 866, 698, "box", "center"),
    "Lance": (1000, 614, 1296, 698, "blob", "center"),
    "VoidOrb": (1300, 610, 1400, 700, "blob", "center"),
    "VoidOrbSmall": (1400, 610, 1516, 690, "blob", "center"),
    # Row 5: blades, vortex, meteors
    "BladeBig": (12, 696, 160, 840, "blob", "center"),
    "BladeA": (196, 700, 300, 832, "blob", "center"),
    "BladeSwirl": (300, 696, 472, 832, "blob", "center"),
    "Vortex": (468, 698, 680, 832, "blob", "center"),
    "BladeThin": (684, 692, 766, 828, "blob", "center"),
    "Shard": (766, 700, 824, 808, "blob", "center"),
    "Meteor1": (844, 696, 972, 852, "box", "center"),  # touches the ground row, so cut by box
    "MeteorSmall": (976, 688, 1052, 800, "blob", "center"),
    "Meteor2": (1052, 696, 1150, 840, "blob", "center"),
    "Meteor3": (1150, 696, 1256, 840, "blob", "center"),
    "MeteorImpact": (1256, 704, 1400, 844, "blob", "bottom"),
    "MeteorTall": (1400, 684, 1462, 864, "blob", "center"),
    "Meteor4": (1462, 692, 1528, 836, "blob", "center"),
    # Row 6: ground effects (these touch each other, so they're cut by box)
    "Smoke1": (16, 850, 176, 1004, "box", "bottom"),
    "Smoke2": (176, 850, 372, 1004, "box", "bottom"),
    "Flame": (372, 870, 508, 1004, "box", "bottom"),
    "Spikes": (508, 876, 748, 1004, "box", "bottom"),
    "Rift": (744, 826, 916, 1004, "box", "bottom"),
    "SpikesWide": (916, 876, 1134, 1004, "box", "bottom"),
    "Eruption": (1134, 876, 1332, 1004, "box", "bottom"),
    "Portal": (1332, 876, 1534, 1004, "box", "bottom"),
}

# Areas a "box" sprite must leave out because a neighbour overlaps its box there.
ECLIPSE_EXCLUDE = {
    "Meteor1": [(844, 826, 870, 852)],  # top-right edge of the Rift orb
    "Rift": [(870, 826, 972, 852)],  # bottom of Meteor1
}


def label_blobs(alpha: Image.Image) -> tuple[list[list[int]], list[tuple[float, float]]]:
    """Connected blobs on a downscaled mask. Returns (label grid [y][x], center of each label)."""
    from PIL import ImageFilter

    small = alpha.resize((alpha.width // LABEL_SCALE, alpha.height // LABEL_SCALE), Image.BOX)
    small = small.point(lambda v: 255 if v > 45 else 0).filter(ImageFilter.MaxFilter(3))
    w, h = small.size
    px = small.load()
    labels = [[0] * w for _ in range(h)]
    centers: list[tuple[float, float]] = [(0, 0)]
    for y in range(h):
        for x in range(w):
            if not px[x, y] or labels[y][x]:
                continue
            lid = len(centers)
            stack = [(x, y)]
            labels[y][x] = lid
            x0 = x1 = x
            y0 = y1 = y
            while stack:
                cx, cy = stack.pop()
                x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not labels[ny][nx]:
                        labels[ny][nx] = lid
                        stack.append((nx, ny))
            centers.append(((x0 + x1 + 1) / 2 * LABEL_SCALE, (y0 + y1 + 1) / 2 * LABEL_SCALE))
    return labels, centers


def build_eclipse() -> None:
    if not ECLIPSE_SRC.exists():
        print(f"skipped eclipse: {ECLIPSE_SRC.relative_to(ROOT)} not found")
        return
    src = Image.open(ECLIPSE_SRC).convert("RGBA")
    # Remove the haze and stretch the remaining alpha back to 0..255.
    alpha = src.getchannel("A").point(
        lambda v: 0 if v <= ECLIPSE_HAZE else round((v - ECLIPSE_HAZE) * 255 / (255 - ECLIPSE_HAZE))
    )
    src.putalpha(alpha)
    labels, centers = label_blobs(alpha)
    lw, lh = len(labels[0]), len(labels)

    def inside(c: tuple[float, float], box: tuple[int, int, int, int]) -> bool:
        return box[0] <= c[0] < box[2] and box[1] <= c[1] < box[3]

    # Which blobs belong to which "blob" sprite.
    owned: dict[str, set[int]] = {}
    claimed: set[int] = set()
    for name, (l, t, r, b, mode, _) in ECLIPSE_SPRITES.items():
        if mode == "blob":
            ids = {i for i, c in enumerate(centers) if i and inside(c, (l, t, r, b))}
            if not ids:
                sys.exit(f"eclipse: no blob found for {name}")
            owned[name] = ids
            claimed |= ids

    def label_at(x: int, y: int) -> int:
        return labels[min(lh - 1, y // LABEL_SCALE)][min(lw - 1, x // LABEL_SCALE)]

    cut: dict[str, Image.Image] = {}
    for name, (l, t, r, b, mode, _) in ECLIPSE_SPRITES.items():
        piece = src.crop((l, t, r, b))
        a = piece.getchannel("A")
        ap = a.load()
        for y in range(b - t):
            for x in range(r - l):
                if not ap[x, y]:
                    continue
                lid = label_at(l + x, t + y)
                if mode == "blob":
                    keep = lid in owned[name]
                else:
                    keep = lid not in claimed and not any(
                        el <= l + x < er and et <= t + y < eb for el, et, er, eb in ECLIPSE_EXCLUDE.get(name, [])
                    )
                if not keep:
                    ap[x, y] = 0
        piece.putalpha(a)
        bbox = a.getbbox()
        if not bbox:
            sys.exit(f"eclipse: {name} came out empty")
        cut[name] = piece.crop(bbox)

    # Shelf-pack, tallest first.
    width, pad = 2048, 2
    placed: dict[str, tuple[int, int]] = {}
    x, y, shelf_h = pad, pad, 0
    for n in sorted(cut, key=lambda n: -cut[n].height):
        im = cut[n]
        if x + im.width + pad > width:
            x, y, shelf_h = pad, y + shelf_h + pad, 0
        placed[n] = (x, y)
        x += im.width + pad
        shelf_h = max(shelf_h, im.height)
    sheet = Image.new("RGBA", (width, y + shelf_h + pad), (0, 0, 0, 0))
    frames, animations = {}, {}
    for n, (fx, fy) in placed.items():
        im = cut[n]
        sheet.paste(im, (fx, fy))
        ay = 1.0 if ECLIPSE_SPRITES[n][5] == "bottom" else 0.5
        frames[n] = frame_entry(fx, fy, im.width, im.height, 0.5, ay)
        animations[n] = [n]
    sheet.save(SPRITES / "eclipse.png", optimize=True)
    write_sheet("eclipse", sheet, frames, animations)


if __name__ == "__main__":
    main()
