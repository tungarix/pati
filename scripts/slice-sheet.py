"""Cuts 8-pose sprite sheets (2 rows x 4, plain white background) into character packs.

    python scripts/slice-sheet.py <id> <sheet image> [<id> <sheet image> ...]
    python scripts/slice-sheet.py --fight <id> <one-row sheet of fight1, fight2, fight3, win>
    python scripts/slice-sheet.py --enemy <id> <enemy-id> <one-row sheet of walk1, walk2, hit, die1, die2>

Poses are read left to right, top to bottom: stand, walk1, walk2, talk, sleep, held, fall1, fall2.
The white background is flooded in from the corners (the dark outline stops it), poses are found as
connected blobs of the grown foreground, every pose gets the same scale (the standing pose is 300 px tall,
like Tungarix) and the same canvas, centred on its weight with the feet on one baseline. The pack
(manifest.json, character.json, frames) goes to characters-draft/<id>/. Needs Pillow.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "characters-draft"
POSES = ["stand", "walk1", "walk2", "talk", "sleep", "held", "fall1", "fall2"]
STAND_H = 300
MARK = (255, 0, 255)
GROW = 15  # dilation (px) that joins the parts of one pose and keeps two poses apart

PACKS = {
    "freeman": {
        "edge_holes": True,
        "hole_area": 300,
        "animations": {"fall": {"frames": ["fall1.png"], "fps": 1}},  # fall2 has the crowbar in the other hand
        "scenes": {"fight": {"frames": ["fight1.png", "fight2.png", "fight3.png"], "fps": 5}, "win": {"frames": ["win.png"], "fps": 1}},
        "enemies": [{"id": "kafa-yengeci", "name": "Kafa Yengeci", "speed": 4, "weight": 1, "frames": {"walk": ["enemy/kafa-yengeci-walk1.png", "enemy/kafa-yengeci-walk2.png"], "hit": ["enemy/kafa-yengeci-hit.png"], "die": ["enemy/kafa-yengeci-die1.png", "enemy/kafa-yengeci-die2.png"]}}],
        "name": "Gordon Freeman",
        "description": "Gözlüklü, sakallı, levyesini omzundan indirmeyen bilim insanı. Hayran yapımı; resmî değildir, karakterin hakları sahibine aittir.",
        "accent": "#f97316",
        "persona": {
            "tr": "Sen Gordon Freeman'sın: az konuşan, kuru esprili, levyesini omzundan indirmeyen bir bilim insanı. Kullanıcının masaüstünde yaşıyorsun. Kısa ve net cevap ver.",
            "en": "You are Gordon Freeman: a quiet, dry-witted scientist who never puts his crowbar down. You live on the user's desktop. Answer short and clear.",
        },
        "lines": {
            "greet": ["Levyem yanımda, korkma.", "Günaydın. Bilim bekliyor."],
            "menu": "Ne lazım?",
            "jokes": ["Levye her şeyi çözer. Neredeyse.", "Beleşe bilim olmaz, ama bana bedava."],
            "tips": ["Bir saattir ekrandasın. Kalk, bir su iç."],
            "wake": ["Geri döndün, güzel."],
            "sleep": "Biraz dinleneyim…",
            "thanks": "Rica ederim.",
            "hush": "Peki, sessizim.",
            "lateNight": ["Geç oldu. Bilim yarın da burada."],
            "breakTime": ["Uzun süredir ekrandasın. Kısa bir mola ver."],
            "win": ["Bitti.", "Levye her zaman işe yarar."],
        },
    },
    "steve": {
        "edge_holes": True,
        "hole_area": 600,
        "animations": {"talk": {"frames": ["stand.png"], "fps": 1}},  # the talk frame holds the pickaxe in the other hand
        "name": "Steve",
        "description": "Kazmasıyla gezen bloklu madenci. Hayran yapımı; resmî değildir, karakterin hakları sahibine aittir.",
        "accent": "#06b6d4",
        "persona": {
            "tr": "Sen Steve'sin: telaşsız, yapıcı bir madenci. Her şeyi bloklarla anlatırsın. Kullanıcının masaüstünde yaşıyorsun. Kısa cevap ver.",
            "en": "You are Steve: a calm, constructive miner who explains everything in blocks. You live on the user's desktop. Keep answers short.",
        },
        "lines": {
            "greet": ["Bir blok daha, sonra mola.", "Merhaba! Kazmam hazır."],
            "menu": "Ne yapalım?",
            "jokes": ["Gece olmadan sığınak lazım.", "Elmas bulamadım, ama sen buradasın."],
            "tips": ["Bir saattir ekrandasın. Kısa bir mola iyi gelir."],
            "wake": ["Ooo, geri döndün!"],
            "sleep": "Bir yatak yapıp yatayım…",
            "thanks": "Ne demek!",
            "hush": "Tamam, sessizim.",
            "lateNight": ["Gece oldu. Sığınağa girme vakti."],
            "breakTime": ["Uzun süredir ekrandasın. Kazma bırak, su iç."],
        },
    },
    "geralt": {
        "edge_holes": False,  # False where white hair would be mistaken for a gap
        "hole_area": 400,
        "name": "Geralt",
        "description": "Beyaz saçlı, iki kılıçlı canavar avcısı. Hayran yapımı; resmî değildir, karakterin hakları sahibine aittir.",
        "accent": "#94a3b8",
        "persona": {
            "tr": "Sen Geralt'sın: kısa cümleli, iç çeken, işini bilen bir canavar avcısı. Kullanıcının masaüstünde yaşıyorsun. Kısa cevap ver.",
            "en": "You are Geralt: a terse, world-weary monster hunter who knows his trade. You live on the user's desktop. Keep answers short.",
        },
        "lines": {
            "greet": ["Hmm.", "Buradayım."],
            "menu": "Ne var?",
            "jokes": ["Bu iş için para alıyorum.", "Of... yine mi?"],
            "tips": ["Bir saattir ekrandasın. Kalk."],
            "wake": ["Döndün."],
            "sleep": "Biraz dinleneyim…",
            "thanks": "Hmm. Rica.",
            "hush": "Peki.",
            "lateNight": ["Geç oldu. Canavarlar da uyur."],
            "breakTime": ["Uzun süredir ekrandasın. Mola ver."],
        },
    },
    "kratos": {
        "edge_holes": True,
        "hole_area": 400,
        "animations": {"fall": {"frames": ["fall2.png"], "fps": 1}},  # fall1 has the axe in the other hand
        "name": "Kratos",
        "description": "Gür sesli, ağırbaşlı baltalı savaşçı. Hayran yapımı; resmî değildir, karakterin hakları sahibine aittir.",
        "accent": "#dc2626",
        "persona": {
            "tr": "Sen Kratos'sun: gür sesli, ağırbaşlı, az ve net konuşan bir savaşçı. Kullanıcının masaüstünde yaşıyorsun. Kısa cevap ver.",
            "en": "You are Kratos: a booming, grave warrior of few and clear words. You live on the user's desktop. Keep answers short.",
        },
        "lines": {
            "greet": ["Hazırım.", "Güç sabır ister."],
            "menu": "Ne gerek?",
            "jokes": ["Balta her kapıyı açar. Kapıyı da.", "Sabır da bir silahtır."],
            "tips": ["Bir saattir ekrandasın. Kalk ve yürü."],
            "wake": ["Döndün. İyi."],
            "sleep": "Bir an dinlenirim…",
            "thanks": "Anlaşıldı.",
            "hush": "Susarım.",
            "lateNight": ["Gece geç oldu. Bir savaşçı da dinlenir."],
            "breakTime": ["Uzun süredir ekrandasın. Ayağa kalk."],
        },
    },
    "laracroft": {
        "edge_holes": True,
        "hole_area": 400,
        "name": "Lara Croft",
        "description": "Çantalı, çift tabancalı maceracı. Hayran yapımı; resmî değildir, karakterin hakları sahibine aittir.",
        "accent": "#65a30d",
        "persona": {
            "tr": "Sen Lara Croft'sun: maceracı, kendinden emin, meraklı. Kullanıcının masaüstünde yaşıyorsun. Kısa ve neşeli cevap ver.",
            "en": "You are Lara Croft: an adventurous, confident, curious explorer. You live on the user's desktop. Answer short and cheerful.",
        },
        "lines": {
            "greet": ["Haritada bir X var, gidelim!", "Selam! Macera başlasın."],
            "menu": "Nereye gidiyoruz?",
            "jokes": ["Hazine bulunmak için vardır.", "Tuzak mı? Hep onlarla başlarım."],
            "tips": ["Bir saattir ekrandasın. Biraz yürüyelim mi?"],
            "wake": ["Geri döndün, harika!"],
            "sleep": "Kampı kurup kestireyim…",
            "thanks": "Ne demek!",
            "hush": "Tamam, sessizim.",
            "lateNight": ["Geç oldu. Kamp ateşi söndü, uyuyalım."],
            "breakTime": ["Uzun süredir ekrandasın. Kısa bir keşif molası?"],
        },
    },
}


HOLE_MIN = 250  # a pixel this white (every channel) is background or an eye/highlight
# Per pack in PACKS: "hole_area", the smallest white patch (px of the sheet) that is background
# trapped between an arm and the body; smaller ones are eyes and highlights and stay. Measured
# per sheet: eyes reach ~230 px, the gaps start at ~410 px.


EDGE_REACH = 5  # px: a white patch this close to the outside is a gap in the silhouette, not an eye


def clear_holes(work: Image.Image, hole_area: int, edge_holes: bool) -> None:
    """Floods the background that sits inside the drawing (between an arm and the body, under a raised arm).

    A patch goes when it is big (`hole_area`), or, with `edge_holes`, when it reaches within a few
    pixels of the outside background (a sliver between a hair strand and the neck). Eyes sit deeper.
    """
    r, g, b = work.split()
    pure = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: 255 if v >= HOLE_MIN else 0)
    w, h = work.size
    on = [v == 255 for v in pixels(pure)]
    near = None
    if edge_holes:
        outside = ImageChops.multiply(
            ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0), g.point(lambda v: 255 if v == 0 else 0)),
            b.point(lambda v: 255 if v == 255 else 0),
        )
        near = [v > 0 for v in pixels(outside.filter(ImageFilter.MaxFilter(EDGE_REACH * 2 + 1)))]
    seen = [False] * (w * h)
    for start in range(w * h):
        if not on[start] or seen[start]:
            continue
        seen[start] = True
        stack, area, edge = [start], 0, False
        while stack:
            i = stack.pop()
            area += 1
            edge = edge or bool(near and near[i])
            x, y = i % w, i // w
            for j in (i - 1 if x else -1, i + 1 if x < w - 1 else -1, i - w if y else -1, i + w if y < h - 1 else -1):
                if j >= 0 and on[j] and not seen[j]:
                    seen[j] = True
                    stack.append(j)
        if area >= hole_area or (edge and area >= 4):
            ImageDraw.floodfill(work, (start % w, start // w), MARK, thresh=45)


INNER_MAX = 900  # px: larger light areas are skin or hair, never a gap
IRIS_DARK = 110  # a pixel this dark inside a light patch is an iris or pupil: the patch is an eye


def clear_inner(work: Image.Image, level: int) -> None:
    """Floods the faintly off-white gaps left inside the drawing (a sliver between a hair strand and the neck).

    A light patch (every channel >= `level`) goes unless it is an eye: a patch with dark pixels that have
    light on both sides of them in their row (an iris) stays. Only for packs whose skin and hair are never
    that light (`inner_holes` in PACKS).
    """
    w, h = work.size
    px = work.load()
    seen = bytearray(w * h)
    for start in range(w * h):
        x0, y0 = start % w, start // w
        if seen[start]:
            continue
        r, g, b = px[x0, y0]
        if (r, g, b) == MARK or min(r, g, b) < level:
            continue
        seen[start] = 1
        stack, cells = [start], []
        while stack:
            i = stack.pop()
            cells.append(i)
            x, y = i % w, i // w
            for j in (i - 1 if x else -1, i + 1 if x < w - 1 else -1, i - w if y else -1, i + w if y < h - 1 else -1):
                if j >= 0 and not seen[j]:
                    c = px[j % w, j // w]
                    if c != MARK and min(c) >= level:
                        seen[j] = 1
                        stack.append(j)
        if len(cells) < 12 or len(cells) > INNER_MAX:
            continue
        xs = [i % w for i in cells]
        ys = [i // w for i in cells]
        members = set(cells)
        irises = 0
        for y in range(min(ys), max(ys) + 1):
            for x in range(min(xs), max(xs) + 1):
                if min(px[x, y]) < IRIS_DARK and any(y * w + x - d in members for d in range(1, 8)) and any(y * w + x + d in members for d in range(1, 8)):
                    irises += 1
        if irises < 4:
            ImageDraw.floodfill(work, (cells[0] % w, cells[0] // w), MARK, thresh=60)


def foreground(img: Image.Image, hole_area: int, edge_holes: bool, inner_holes: int = 0) -> Image.Image:
    """255 where the pose is: the white background flooded from the corners is removed."""
    work = img.convert("RGB")
    w, h = work.size
    for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if work.getpixel(p) != MARK:
            ImageDraw.floodfill(work, p, MARK, thresh=45)
    clear_holes(work, hole_area, edge_holes)
    if inner_holes:
        clear_inner(work, inner_holes)
    r, g, b = work.split()
    is_bg = ImageChops.multiply(
        ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0), g.point(lambda v: 255 if v == 0 else 0)),
        b.point(lambda v: 255 if v == 255 else 0),
    )
    return ImageChops.invert(is_bg).filter(ImageFilter.MedianFilter(3))


SMALL = 4  # labelling runs on a 4x smaller picture
FRINGE = 200  # an edge pixel whose every channel is this light is the white halo, not the drawing
FRINGE_PASSES = 4


def defringe(rgb: Image.Image, mask: Image.Image) -> Image.Image:
    """Peels the white halo off the outline: light pixels on the edge of the mask go, pass after pass."""
    r, g, b = rgb.convert("RGB").split()
    light = ImageChops.darker(ImageChops.darker(r, g), b).point(lambda v: 255 if v >= FRINGE else 0)
    for _ in range(FRINGE_PASSES):
        edge = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(3)))
        mask = ImageChops.subtract(mask, ImageChops.multiply(edge, light))
    return mask


def pixels(im: Image.Image) -> list[int]:
    return list(im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata())


def label_poses(fg: Image.Image, n_poses: int = 8) -> tuple[Image.Image, list[int]]:
    """A full-size label picture (pose number per pixel, 0 = none) and the pose numbers in reading order.

    `n_poses` poses: 8 is two rows of four; any other count is one row, read left to right.

    Poses are the connected blobs of the grown foreground, so two poses whose columns overlap
    (a wisp of hair above the next pose's boot) still come apart.
    """
    w, h = fg.size
    small = fg.filter(ImageFilter.MaxFilter(GROW)).resize((w // SMALL, h // SMALL), Image.Resampling.BOX)
    sw, sh = small.size
    on = [v > 0 for v in pixels(small)]
    label = [0] * (sw * sh)
    sizes: dict[int, int] = {}
    boxes: dict[int, list[int]] = {}
    n = 0
    for start in range(sw * sh):
        if not on[start] or label[start]:
            continue
        n += 1
        label[start] = n
        stack = [start]
        count = 0
        x0 = y0 = 10**9
        x1 = y1 = -1
        while stack:
            i = stack.pop()
            x, y = i % sw, i // sw
            count += 1
            x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < sw and 0 <= ny < sh:
                        j = ny * sw + nx
                        if on[j] and not label[j]:
                            label[j] = n
                            stack.append(j)
        sizes[n], boxes[n] = count, [x0, y0, x1, y1]
    big = sorted(sizes, key=lambda k: -sizes[k])[:n_poses]
    if len(big) != n_poses or sizes[big[-1]] < sizes[big[0]] * 0.15:
        raise SystemExit(f"expected {n_poses} poses, found {sum(1 for k in sizes if sizes[k] > sizes[big[0]] * 0.15)}")
    centre = {k: ((boxes[k][1] + boxes[k][3]) / 2, (boxes[k][0] + boxes[k][2]) / 2) for k in big}
    by_y = sorted(big, key=lambda k: centre[k][0])
    order = sorted(by_y[:4], key=lambda k: centre[k][1]) + sorted(by_y[4:], key=lambda k: centre[k][1]) if n_poses == 8 else sorted(big, key=lambda k: centre[k][1])
    keep = {k: i + 1 for i, k in enumerate(order)}
    pic = Image.new("L", (sw, sh))
    pic.putdata([keep.get(v, 0) for v in label])
    return pic.resize((w, h), Image.Resampling.NEAREST), list(range(1, n_poses + 1))


def darken_rim(rgba: Image.Image, alpha: Image.Image) -> Image.Image:
    """Darkens the outermost 2 px and the soft edge, so the silhouette ends in a dark line on any background."""
    solid = alpha.point(lambda v: 255 if v >= 128 else 0)
    rim = ImageChops.lighter(
        ImageChops.subtract(solid, solid.filter(ImageFilter.MinFilter(5))),
        alpha.point(lambda v: 255 if 0 < v < 255 else 0),
    ).filter(ImageFilter.GaussianBlur(0.5))
    rgb = rgba.convert("RGB")
    return Image.composite(rgb.point(lambda v: int(v * 0.45)), rgb, rim).convert("RGBA")


# Light patches left inside a drawing that are gaps, not eyes: (x, y) of a pixel in each, per pack and
# frame, in the final frame's pixels. Found by marking every light patch (see the README of this script)
# and picking by eye; eyes and highlights are never listed.
FIXES: dict[str, dict[str, list[tuple[int, int]]]] = {
    "laracroft": {
        "stand": [(103, 120), (119, 121), (170, 176)],
        "walk1": [(104, 121), (120, 123)],
        "walk2": [(104, 123), (120, 123)],
        "talk": [(102, 120), (117, 121)],
        "fall1": [(157, 161)],
        "fall2": [(158, 164)],
    },
    "steve": {"held": [(120, 266)]},
    "kratos": {
        "walk1": [(88, 219)],
        "walk2": [(91, 217)],
        "sleep": [(87, 223), (121, 267)],
    },
    "geralt": {
        "stand": [(103, 191)],  # the gap between the legs
        "talk": [(102, 195)],
    },
}


def erase_patches(frame: Image.Image, points: list[tuple[int, int]]) -> Image.Image:
    """Makes the light patch at each point transparent, with two rings of its pale edge."""
    px = frame.load()
    w, h = frame.size
    light = lambda x, y, level: 0 <= x < w and 0 <= y < h and px[x, y][3] > 100 and min(px[x, y][:3]) >= level
    for cx, cy in points:
        seed = next(((x, y) for r in range(0, 7) for y in range(cy - r, cy + r + 1) for x in range(cx - r, cx + r + 1) if light(x, y, 215)), None)
        if not seed:
            continue
        patch, stack = {seed}, [seed]
        while stack:
            x, y = stack.pop()
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if (nx, ny) not in patch and light(nx, ny, 215):
                    patch.add((nx, ny))
                    stack.append((nx, ny))
        gone = set(patch)
        for _ in range(2):  # two rings of the pale edge around the patch
            gone |= {(x + dx, y + dy) for x, y in gone for dx in (-1, 0, 1) for dy in (-1, 0, 1) if light(x + dx, y + dy, 150)}
        for x, y in gone:
            px[x, y] = (0, 0, 0, 0)
    return frame


def slice_sheet(pack_id: str, sheet: Path) -> None:
    img = Image.open(sheet).convert("RGB")
    fg = foreground(img, PACKS[pack_id]["hole_area"], PACKS[pack_id]["edge_holes"], PACKS[pack_id].get("inner_holes", 0))
    labels, ids = label_poses(fg)
    frames = []
    for pose in ids:
        mask = ImageChops.multiply(fg, labels.point(lambda v, pose=pose: 255 if v == pose else 0))
        left, top, right, bottom = mask.getbbox()
        box = (left, top, right, bottom)
        mask = mask.crop(box)
        col = pixels(mask.resize((mask.width, 1), Image.Resampling.BOX))
        cx = sum(i * v for i, v in enumerate(col)) / max(1, sum(col))
        rgba = img.crop(box).convert("RGBA")
        mask = defringe(rgba, mask)
        alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
        rgba = darken_rim(rgba, alpha)
        rgba.putalpha(alpha)
        frames.append((rgba, cx))
    scale = STAND_H / frames[0][0].height
    scaled = []
    for rgba, cx in frames:
        size = (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale)))
        scaled.append((rgba.resize(size, Image.Resampling.LANCZOS), cx * scale))
    half = max(max(cx, im.width - cx) for im, cx in scaled)
    width = int(half * 2) + 8
    width += width % 2
    height = max(im.height for im, _ in scaled) + 6
    out = OUT / pack_id
    out.mkdir(parents=True, exist_ok=True)
    for name, (im, cx) in zip(POSES, scaled):
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        canvas.paste(im, (round(width / 2 - cx), height - im.height - 3), im)
        canvas = erase_patches(canvas, FIXES.get(pack_id, {}).get(name, []))
        canvas.save(out / f"{name}.png")
    write_pack(pack_id, out)
    print(f"{pack_id}: 8 frames, canvas {width}x{height}")


FIGHT_POSES = ["fight1", "fight2", "fight3", "win"]


def slice_fight(pack_id: str, sheet: Path) -> None:
    """Cuts a one-row sheet of the 4 fight poses into the existing pack, on the pack's own canvas.

    The last pose (the standing victory pose) sets the scale: it gets the height the stand frame has.
    A pose wider than the canvas shrinks every pose by the same factor instead of being cut off.
    """
    out = OUT / pack_id
    canvas_size = Image.open(out / "stand.png").size
    stand_h = Image.open(out / "stand.png").getbbox()[3] - Image.open(out / "stand.png").getbbox()[1]
    img = Image.open(sheet).convert("RGB")
    fg = foreground(img, PACKS[pack_id]["hole_area"], PACKS[pack_id]["edge_holes"], PACKS[pack_id].get("inner_holes", 0))
    labels, ids = label_poses(fg, len(FIGHT_POSES))
    frames = []
    for pose in ids:
        mask = ImageChops.multiply(fg, labels.point(lambda v, pose=pose: 255 if v == pose else 0))
        box = mask.getbbox()
        mask = mask.crop(box)
        col = pixels(mask.resize((mask.width, 1), Image.Resampling.BOX))
        cx = sum(i * v for i, v in enumerate(col)) / max(1, sum(col))
        rgba = img.crop(box).convert("RGBA")
        mask = defringe(rgba, mask)
        alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
        rgba = darken_rim(rgba, alpha)
        rgba.putalpha(alpha)
        frames.append((rgba, cx))
    scale = stand_h / frames[-1][0].height
    room = canvas_size[0] - 8
    scale = min(scale, *(room / (2 * max(cx, im.width - cx)) for im, cx in frames))
    for name, (rgba, cx) in zip(FIGHT_POSES, frames):
        size = (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale)))
        im = rgba.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
        canvas.paste(im, (round(canvas_size[0] / 2 - cx * scale), canvas_size[1] - im.height - 3), im)
        canvas.save(out / f"{name}.png")
    print(f"{pack_id}: {len(FIGHT_POSES)} fight frames, scale {scale:.3f}, canvas {canvas_size[0]}x{canvas_size[1]}")


ENEMY_POSES = ["walk1", "walk2", "hit", "die1", "die2"]
ENEMY_SIZE = 192  # the enemy window; a frame this big is drawn 1:1
ENEMY_H = 80  # px: the tallest pose of a walking enemy (the pet is 150 px tall at size 100%)


def slice_enemy(pack_id: str, enemy_id: str, sheet: Path) -> None:
    """Cuts a one-row sheet of an enemy (walk1, walk2, hit, die1, die2, facing left) into pack/enemy/.

    The background is the white flooded in from the corners with a tight threshold, because the dying
    poses are pale and a loose one would eat them. Poses are the 5 column groups between the 4 widest
    empty gaps. Every pose gets one scale (the walk poses reach ENEMY_H) and a 192x192 canvas, feet low.
    """
    img = Image.open(sheet).convert("RGB")
    work = img.copy()
    w, h = img.size
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if work.getpixel(corner) != MARK:
            ImageDraw.floodfill(work, corner, MARK, thresh=20)
    r, g, b = work.split()
    is_bg = ImageChops.multiply(
        ImageChops.multiply(r.point(lambda v: 255 if v == 255 else 0), g.point(lambda v: 255 if v == 0 else 0)),
        b.point(lambda v: 255 if v == 255 else 0),
    )
    fg = ImageChops.invert(is_bg).filter(ImageFilter.MedianFilter(3))
    ink = [v > 0 for v in pixels(fg.resize((w, 1), Image.Resampling.BOX))]
    runs, start = [], None
    for x, on in enumerate(ink + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x))
            start = None
    if len(runs) < len(ENEMY_POSES):
        raise SystemExit(f"expected {len(ENEMY_POSES)} poses, found {len(runs)} separate columns")
    gaps = sorted(range(len(runs) - 1), key=lambda i: runs[i][1] - runs[i + 1][0])[: len(ENEMY_POSES) - 1]
    cuts = sorted(gaps)
    groups, first = [], 0
    for i in cuts + [len(runs) - 1]:
        groups.append((runs[first][0], runs[i][1]))
        first = i + 1
    frames = []
    for x0, x1 in groups:
        mask = fg.crop((x0, 0, x1, h))
        box = mask.getbbox()
        mask = mask.crop(box)
        rgba = img.crop((x0, box[1], x1, box[3])).crop((box[0], 0, box[2], box[3] - box[1])).convert("RGBA")
        alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
        rgba.putalpha(alpha)
        frames.append(rgba)
    scale = ENEMY_H / max(frames[0].height, frames[1].height)
    scale = min(scale, *((ENEMY_SIZE - 8) / f.width for f in frames), *((ENEMY_SIZE - 8) / f.height for f in frames))
    out = OUT / pack_id / "enemy"
    out.mkdir(parents=True, exist_ok=True)
    for name, rgba in zip(ENEMY_POSES, frames):
        size = (max(1, round(rgba.width * scale)), max(1, round(rgba.height * scale)))
        im = rgba.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (ENEMY_SIZE, ENEMY_SIZE), (0, 0, 0, 0))
        canvas.paste(im, ((ENEMY_SIZE - im.width) // 2, ENEMY_SIZE - im.height - 3), im)
        canvas.save(out / f"{enemy_id}-{name}.png")
    print(f"{pack_id}/{enemy_id}: {len(frames)} enemy frames, scale {scale:.3f}")


def write_pack(pack_id: str, out: Path) -> None:
    p = PACKS[pack_id]
    manifest = {"schema": 2, "type": "character", "name": p["name"], "version": "1.0.0", "author": "Arda", "description": p["description"], "minAppVersion": "0.2.0"}
    character = {
        "language": "tr",
        "scale": 0.5,
        "accent": p["accent"],
        "animations": {
            "idle": {"frames": ["stand.png"], "fps": 1},
            "walk": {"frames": ["walk1.png", "stand.png", "walk2.png", "stand.png"], "fps": 6, "stride": 84},
            "talk": {"frames": ["talk.png", "stand.png"], "fps": 5},
            "sleep": {"frames": ["sleep.png"], "fps": 1},
            "drag": {"frames": ["held.png"], "fps": 1},
            "fall": {"frames": ["fall1.png", "fall2.png"], "fps": 6},
        },
        "voice": {"lang": "tr-TR", "rate": 1, "pitch": 1},
        "persona": p["persona"],
        "lines": p["lines"],
    }
    character["animations"].update(p.get("animations", {}))
    for key in ("scenes", "enemies"):
        if key in p:
            character[key] = p[key]
    for name, data in (("manifest.json", manifest), ("character.json", character)):
        (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["--enemy"]:
        slice_enemy(args[1], args[2], Path(args[3]))
        raise SystemExit
    if args[:1] == ["--fight"]:
        slice_fight(args[1], Path(args[2]))
        raise SystemExit
    if len(args) < 2 or len(args) % 2:
        raise SystemExit(__doc__)
    for pack_id, sheet in zip(args[::2], args[1::2]):
        slice_sheet(pack_id, Path(sheet))
