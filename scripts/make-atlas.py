"""Atlas karakter paketinin PNG karelerini geometriyle üretir.

    python scripts/make-atlas.py [önizleme.png]

Holografik bir asistan küresi: gölgeli küre, etrafında bir halka, ortada göz şeridi,
altında süzülme ışıltısı. Kareler 24x24 (1x); character.json'daki "scale" büyütür.
Bir yol verilirse bütün kareleri 8x büyütülmüş tek bir önizleme PNG'sine de yazar.
"""

import math
import struct
import sys
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "characters" / "atlas"
W = H = 24

BRIGHT = {
    "outline": (12, 74, 110, 255),
    "dark": (14, 116, 144, 255),
    "core": (56, 189, 248, 255),
    "light": (165, 243, 252, 255),
    "spec": (240, 253, 255, 255),
    "visor": (8, 47, 73, 255),
    "eye": (224, 255, 255, 255),
    "ring": (125, 211, 252, 230),
    "glow": (56, 189, 248, 90),
}
# Asleep: the same shapes, powered down.
DIM = {k: (int(r * 0.55), int(g * 0.6), int(b * 0.7), a) for k, (r, g, b, a) in BRIGHT.items()}
DIM["glow"] = (0, 0, 0, 0)


def frame(dy=0, eye="normal", dim=False, ring_tilt=0.0, glow=True):
    pal = DIM if dim else BRIGHT
    px = [[(0, 0, 0, 0)] * W for _ in range(H)]
    cx, cy, r = 11.5, 10.5 + dy, 7.6

    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H:
            px[y][x] = c

    # hover glow under the orb
    if glow and not dim:
        for y in range(19, 23):
            for x in range(W):
                if ((x - cx) / 5.5) ** 2 + ((y - 20.5 - dy * 0.3) / 1.4) ** 2 <= 1:
                    put(x, y, pal["glow"])

    def ring(front):
        rx, ry = 11.2, 2.4
        for y in range(H):
            for x in range(W):
                tx, ty = x - cx, y - cy - ring_tilt * (x - cx) / rx
                d = (tx / rx) ** 2 + (ty / ry) ** 2
                if 0.72 <= d <= 1.12 and (ty >= 0) == front:
                    put(x, y, pal["ring"])

    ring(front=False)  # the half behind the orb, drawn first
    for y in range(H):
        for x in range(W):
            dx, dyy = x - cx, y - cy
            dist = math.hypot(dx, dyy)
            if dist > r:
                continue
            if dist > r - 1.1:
                c = pal["outline"]
            elif dx + dyy < -6.5:
                c = pal["spec"]
            elif dx + dyy < -2.5:
                c = pal["light"]
            elif dx + dyy > 5:
                c = pal["dark"]
            else:
                c = pal["core"]
            put(x, y, c)

    # visor band with the eye
    vy = round(cy)
    for x in range(round(cx - 5), round(cx + 6)):
        for y in (vy - 1, vy):
            if math.hypot(x - cx, y - cy) <= r - 1.1:
                put(x, y, pal["visor"])
    ex = round(cx)
    if eye == "normal":
        for x in range(ex - 2, ex + 2):
            put(x, vy - 1, pal["eye"])
            put(x, vy, pal["eye"])
    elif eye == "wide":
        for x in range(ex - 3, ex + 3):
            put(x, vy - 1, pal["eye"])
            put(x, vy, pal["eye"])
        put(ex - 1, vy - 2, pal["eye"])
        put(ex, vy - 2, pal["eye"])
    elif eye == "closed":
        for x in range(ex - 2, ex + 2):
            put(x, vy, pal["eye"])
    elif eye == "round":
        for x, y in [(ex - 1, vy - 2), (ex, vy - 2), (ex - 2, vy - 1), (ex + 1, vy - 1), (ex - 2, vy), (ex + 1, vy), (ex - 1, vy + 1), (ex, vy + 1)]:
            put(x, y, pal["eye"])

    ring(front=True)
    return px


FRAMES = {
    "stand": frame(),
    "float": frame(dy=-1),
    "talk": frame(eye="wide"),
    "sleep": frame(dy=2, eye="closed", dim=True),
    "held": frame(dy=-1, eye="round", ring_tilt=1.2, glow=False),
}


def png(pixels, scale=1):
    h, w = len(pixels), len(pixels[0])
    rows = []
    for row in pixels:
        line = bytearray()
        for c in row:
            line += bytes(c) * scale
        rows.extend([b"\x00" + bytes(line)] * scale)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w * scale, h * scale, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, pixels in FRAMES.items():
        (OUT / f"{name}.png").write_bytes(png(pixels))
        print(f"{name}.png")
    if len(sys.argv) > 1:
        sheet = [sum((FRAMES[n][y] + [(30, 34, 44, 255)] * 2 for n in FRAMES), []) for y in range(H)]
        bg = (30, 34, 44, 255)
        sheet = [[c if c[3] else bg for c in row] for row in sheet]
        Path(sys.argv[1]).write_bytes(png(sheet, scale=8))


if __name__ == "__main__":
    main()
