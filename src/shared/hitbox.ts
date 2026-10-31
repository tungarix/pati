// The part of a frame that is actually drawn: pure, so main (pixels) and renderer (hit test) share it.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** Pixels with more alpha than this count as drawn. */
const OPAQUE = 16

/** Bounding box of the opaque pixels of a BGRA bitmap (alpha is byte 3); null when nothing is drawn. */
export function opaqueBox(bitmap: Buffer, width: number, height: number): Box | null {
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (bitmap[(y * width + x) * 4 + 3] > OPAQUE) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        y1 = y
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

export function unionBox(boxes: (Box | null)[]): Box | null {
  const list = boxes.filter((b): b is Box => !!b)
  if (!list.length) return null
  const x0 = Math.min(...list.map(b => b.x)), y0 = Math.min(...list.map(b => b.y))
  const x1 = Math.max(...list.map(b => b.x + b.w)), y1 = Math.max(...list.map(b => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Is a point of the window (DIP) inside the box? The frame is drawn at `scale` (and mirrored if `flip`)
 * around the bottom-centre of the `size`×`size` window; the box is in unscaled, unflipped frame pixels.
 */
export function inHitbox(box: Box | null, px: number, py: number, scale: number, flip: boolean, size: number): boolean {
  if (!box || scale <= 0) return false
  const ox = size / 2
  let lx = (px - ox) / scale
  const ly = (py - size) / scale
  if (flip) lx = -lx
  const fx = lx + ox, fy = ly + size
  return fx >= box.x && fx < box.x + box.w && fy >= box.y && fy < box.y + box.h
}
