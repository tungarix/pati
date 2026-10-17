"""Cuts the Tungarix sprite sheet (art/tungarix-sheet.webp) into character frames.

    python scripts/slice-tungarix.py

Needs Pillow. The sheet has a light checkerboard painted in instead of real
transparency; it is removed by flooding it from the edges (the character's dark
outline stops the flood). Poses are found as blocks separated by empty rows and
columns, read left to right, top to bottom, and named by POSES. Every frame gets
the same canvas and scale with the feet on one baseline, at twice the on-screen
size (character.json has "scale": 0.5).
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "art" / "tungarix-sheet.webp"
OUT = ROOT / "characters" / "tungarix"

# Sheet order: name, drawn facing left (mirrored so every frame faces right), standing upright.
# Generators draw rows at slightly different sizes; each row is scaled so its upright
# poses match the standing height, and the rest of the row follows.
POSES = [
    ("stand", False, True), ("walk1", False, True), ("walk2", True, True), ("talk", True, True),
    ("sleep", True, False), ("held", False, False), ("fall1", True, False), ("fall2", True, False),
    ("dust1", False, True), ("dust2", False, True), ("dust3", False, True), ("guitar1", False, False), ("guitar2", False, False),
]
STAND_HEIGHT = 300  # px, the standing pose in the output (150 on screen at scale 0.5)
GAP = 6  # empty px that separate two poses
MIN_POSE = 60  # narrower blocks are sparkles or dust puffs belonging to a neighbour


def background_mask(img):
    """255 where the painted checkerboard is, flooded in from the border."""
    r, g, b = img.split()
    lo = ImageChops.darker(ImageChops.darker(r, g), b)
    hi = ImageChops.lighter(ImageChops.lighter(r, g), b)
    light = lo.point(lambda v: 255 if v >= 222 else 0)
    grey = ImageChops.subtract(hi, lo).point(lambda v: 255 if v <= 14 else 0)
    cand = ImageChops.multiply(light, grey)  # light and colourless: could be background
    w, h = cand.size
    px = cand.load()
    for x in range(w):
        for y in (0, h - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(cand, (x, y), 128)
    for y in range(h):
        for x in (0, w - 1):
            if px[x, y] == 255:
                ImageDraw.floodfill(cand, (x, y), 128)
    bg = cand.point(lambda v: 255 if v == 128 else 0)
    # Eat one pixel into the pale anti-aliased fringe around the outline.
    return bg.filter(ImageFilter.MaxFilter(3))


def runs(occupied, gap):
    """[start, end) spans of True separated by at least `gap` False."""
    spans, start, empty = [], None, 0
    for i, on in enumerate(occupied):
        if on:
            if start is None:
                start = i
            empty = 0
        elif start is not None:
            empty += 1
            if empty >= gap:
                spans.append((start, i - empty + 1))
                start, empty = None, 0
    if start is not None:
        spans.append((start, len(occupied) - empty))
    return spans


def blocks(alpha):
    w, h = alpha.size
    rows = [alpha.crop((0, y, w, y + 1)).getbbox() is not None for y in range(h)]
    found = []
    for top, bottom in runs(rows, GAP):
        band = alpha.crop((0, top, w, bottom))
        cols = [band.crop((x, 0, x + 1, bottom - top)).getbbox() is not None for x in range(w)]
        spans = runs(cols, GAP)
        merged = []
        for s in spans:  # small bits join the nearest wide block
            if s[1] - s[0] < MIN_POSE and merged:
                merged[-1] = (merged[-1][0], s[1])
            elif merged and merged[-1][1] - merged[-1][0] < MIN_POSE:
                merged[-1] = (merged[-1][0], s[1])
            else:
                merged.append(s)
        for left, right in merged:
            box = alpha.crop((left, top, right, bottom)).getbbox()
            found.append(((left + box[0], top + box[1], left + box[2], top + box[3]), top))
    return found


def main():
    sheet = Image.open(SHEET).convert("RGB")
    alpha = ImageChops.invert(background_mask(sheet))
    rgba = sheet.convert("RGBA")
    rgba.putalpha(alpha)
    boxes = blocks(alpha)
    assert len(boxes) == len(POSES), f"found {len(boxes)} poses, expected {len(POSES)}: {boxes}"

    height = lambda b: b[3] - b[1]
    row_scale = {}
    for (_, _, upright), (box, row) in zip(POSES, boxes):
        if upright:
            row_scale.setdefault(row, []).append(height(box))
    # A row without upright poses keeps the first row's scale.
    first = boxes[0][1]
    k = {row: STAND_HEIGHT / max(hs) for row, hs in row_scale.items()}
    crops = []
    for (name, mirrored, _), (box, row) in zip(POSES, boxes):
        scale = k.get(row, k[first])
        im = rgba.crop(box)
        if mirrored:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        crops.append((name, im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)))

    cw = max(im.width for _, im in crops) + 8
    ch = max(im.height for _, im in crops) + 6
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()
    for name, im in crops:
        canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(im, ((cw - im.width) // 2, ch - 3 - im.height))  # feet on the baseline
        canvas.save(OUT / f"{name}.png", optimize=True)
    print(f"{len(crops)} frames, {cw}x{ch}, in {OUT}")


if __name__ == "__main__":
    main()
