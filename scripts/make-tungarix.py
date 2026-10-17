"""Tungarix karakter paketinin PNG karelerini piksel ızgaralarından üretir.

    python scripts/make-tungarix.py

characters/tungarix/ içine stand.png, walk.png, sleep.png, held.png, talk.png yazar.
Kareler 1x boyuttadır; character.json'daki "scale" büyütmeyi uygulama yapar.
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "characters" / "tungarix"

PALETTE = {
    "k": "#1E1A1A", "g": "#7D84A3", "G": "#555C7A", "w": "#E3E5F0", "b": "#3D5AFE",
    "r": "#C62F2F", "R": "#8E1F1F", "y": "#F2B632", "n": "#000000", "S": "#9DB4FF",
}

HEAD = [
    "...kk..............kk...",
    "..kgGk............kGgk..",
    "..kgwGk..........kGwgk..",
    ".bkgwwGk........kGwwgkb.",
    ".bkgwwgGkkkkkkkkGgwwgkb.",
    "bbkggggggggggggggggggkbb",
    "bkggggggggggggggggggggkb",
    ".kgkkkkkkkkkkkkkkkkkkgk.",
    ".kgkSkkkkkggggkSkkkkkgk.",
    ".kgkkkkkkkggggkkkkkkkgk.",
    ".kggkkkkkgwwwwgkkkkkggk.",
    ".kgggwwwwwwwwwwwwwwgggk.",
    "..kggwwwwwwnnwwwwwwggk..",
    "...kgwwwwwwwwwwwwwwgk...",
    "....kwwwwwwwwkkkwwwk....",  # the smirk
    ".....kkwwwwwwwwwwkk.....",
]
TALK_MOUTH = "....kwwwwwkRRkwwwwwk...."
BODY = [
    "..yyyyrrrrkkkkrrrryyyy..",
    ".yyyyyrrrRkkkkRrrryyyyy.",
    ".ykykyrrrRkyykRrrrykyky.",
    "...rrrrrrRkyykRrrrrrr...",
    "...rrrrrrRkkkkRrrrrrr...",
    "...gggrrrRkkkkRrrrggg...",
]
BLANK = "." * 24
LEGS_STAND = ["....kkkkkk....kkkkkk....", "...kkkkkkk....kkkkkkk..."]
LEGS_WALK = ["...kkkkkk......kkkkkk...", "..kkkkkk........kkkkkk.."]
LEGS_HELD = ["......kk........kk......", "......kk........kk......"]


def held_body():
    body = list(BODY)
    body[0] = "gg" + body[0][2:-2] + "gg"
    body[5] = "...rrrrrrRkkkkRrrrrr...."
    return body


def talk_head():
    head = list(HEAD)
    head[14] = TALK_MOUTH
    return head


FRAMES = {
    "stand": [BLANK] + HEAD + BODY + LEGS_STAND,
    "walk": HEAD + BODY + LEGS_WALK + [BLANK],
    "talk": [BLANK] + talk_head() + BODY + LEGS_STAND,
    "sleep": [BLANK] * 3 + HEAD + BODY[:4] + ["..kkkkkkkkk....kkkkkkkkk"[:24]],
    "held": HEAD + held_body() + LEGS_HELD + [BLANK],
}


def png(grid):
    """An RGBA PNG of the grid, '.' fully transparent."""
    w, h = len(grid[0]), len(grid)
    rows = []
    for row in grid:
        assert len(row) == w, row
        line = bytearray(b"\x00")
        for ch in row:
            if ch == ".":
                line += b"\x00\x00\x00\x00"
            else:
                hx = PALETTE[ch].lstrip("#")
                line += bytes(int(hx[i:i + 2], 16) for i in (0, 2, 4)) + b"\xff"
        rows.append(bytes(line))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, grid in FRAMES.items():
        (OUT / f"{name}.png").write_bytes(png(grid))
        print(f"{name}.png  {len(grid[0])}x{len(grid)}")


if __name__ == "__main__":
    main()
