/**
 * The photo editor's arithmetic: where the crop window sits, how big the file comes out, what a filter does to a
 * pixel. The canvas calls (decode, draw, encode) need a browser and are not covered here.
 */
import { describe, expect, it } from 'vitest'
import { applyFilter, clamp, cropRect, focusOf, MAX_ZOOM, outputSize, pan, turnedSize, turnFocus } from './photoEdit'

const MIDDLE = { x: 0.5, y: 0.5 }

describe('cropRect', () => {
  it('keeps the whole picture for the original shape at zoom 1', () => {
    expect(cropRect(400, 300, 'original', 1, MIDDLE)).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })

  it('cuts the largest 3:4 window out of a landscape picture, in the middle', () => {
    const rect = cropRect(400, 300, 'card', 1, MIDDLE)
    expect(rect).toEqual({ x: 87.5, y: 0, w: 225, h: 300 })
  })

  it('cuts the largest 3:4 window out of a tall picture, in the middle', () => {
    const rect = cropRect(300, 600, 'card', 1, MIDDLE)
    expect(rect.w).toBe(300)
    expect(rect.h).toBe(400)
    expect(rect.x).toBe(0)
    expect(rect.y).toBe(100)
  })

  it('cuts a square from the shorter side', () => {
    expect(cropRect(400, 300, 'square', 1, MIDDLE)).toEqual({ x: 50, y: 0, w: 300, h: 300 })
  })

  it('divides the window by the zoom, around the focus', () => {
    expect(cropRect(400, 300, 'original', 2, MIDDLE)).toEqual({ x: 100, y: 75, w: 200, h: 150 })
  })

  it('keeps the window inside the picture whatever the focus says', () => {
    expect(cropRect(400, 300, 'original', 2, { x: 0, y: 0 })).toEqual({ x: 0, y: 0, w: 200, h: 150 })
    expect(cropRect(400, 300, 'original', 2, { x: 5, y: -3 })).toEqual({ x: 200, y: 0, w: 200, h: 150 })
  })

  it('does not zoom out of the picture or past the maximum', () => {
    expect(cropRect(400, 300, 'original', 0.2, MIDDLE).w).toBe(400)
    expect(cropRect(400, 300, 'original', 99, MIDDLE).w).toBeCloseTo(400 / MAX_ZOOM)
  })

  it('has the proportions of its shape', () => {
    for (const [w, h] of [[4032, 3024], [1000, 1000], [640, 1136], [3, 1000]] as const) {
      const card = cropRect(w, h, 'card', 1.7, { x: 0.3, y: 0.8 })
      expect(card.w / card.h).toBeCloseTo(3 / 4, 6)
      const original = cropRect(w, h, 'original', 1.7, { x: 0.3, y: 0.8 })
      expect(original.w / original.h).toBeCloseTo(w / h, 6)
    }
  })
})

describe('pan', () => {
  it('moves the window against the drag, as a fraction of the window', () => {
    // 400x300 at zoom 2 shows 200x150. Dragging the picture right by half the window shows 100 px further left.
    const focus = pan(400, 300, 'original', 2, MIDDLE, 0.5, 0)
    expect(cropRect(400, 300, 'original', 2, focus)).toEqual({ x: 0, y: 75, w: 200, h: 150 })
  })

  it('stops at the edge and does not remember what it was dragged past', () => {
    const edge = pan(400, 300, 'original', 2, MIDDLE, 10, 10)
    expect(cropRect(400, 300, 'original', 2, edge)).toEqual({ x: 0, y: 0, w: 200, h: 150 })
    // dragging back moves at once: the stored focus is the real one, not the overshoot
    const back = pan(400, 300, 'original', 2, edge, -0.5, 0)
    expect(cropRect(400, 300, 'original', 2, back).x).toBe(100)
  })

  it('has nothing to move when the window is the whole picture', () => {
    const focus = pan(400, 300, 'original', 1, MIDDLE, 0.4, 0.4)
    expect(cropRect(400, 300, 'original', 1, focus)).toEqual({ x: 0, y: 0, w: 400, h: 300 })
  })
})

describe('focusOf', () => {
  it('is the centre of the window as a fraction of the picture', () => {
    expect(focusOf({ x: 0, y: 75, w: 200, h: 150 }, 400, 300)).toEqual({ x: 0.25, y: 0.5 })
  })
})

describe('turning', () => {
  it('swaps the sides for an odd number of quarter turns', () => {
    expect(turnedSize(400, 300, 0)).toEqual([400, 300])
    expect(turnedSize(400, 300, 1)).toEqual([300, 400])
    expect(turnedSize(400, 300, 2)).toEqual([400, 300])
    expect(turnedSize(400, 300, 3)).toEqual([300, 400])
  })

  it('carries the focus round a clockwise turn: top-left goes to top-right', () => {
    expect(turnFocus({ x: 0, y: 0 })).toEqual({ x: 1, y: 0 })
    expect(turnFocus({ x: 1, y: 0 })).toEqual({ x: 1, y: 1 })
    expect(turnFocus({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 })
  })

  it('is back where it started after four turns', () => {
    let focus = { x: 0.2, y: 0.7 }
    for (let i = 0; i < 4; i++) focus = turnFocus(focus)
    expect(focus.x).toBeCloseTo(0.2)
    expect(focus.y).toBeCloseTo(0.7)
  })
})

describe('outputSize', () => {
  it('shrinks the long side to the chosen size, keeping the proportions', () => {
    expect(outputSize({ x: 0, y: 0, w: 2250, h: 3000 }, 1080)).toEqual({ width: 810, height: 1080 })
    expect(outputSize({ x: 0, y: 0, w: 4000, h: 3000 }, 540)).toEqual({ width: 540, height: 405 })
  })

  it('never enlarges a window that is already small', () => {
    expect(outputSize({ x: 0, y: 0, w: 300, h: 400 }, 1080)).toEqual({ width: 300, height: 400 })
  })

  it('is at least one pixel', () => {
    expect(outputSize({ x: 0, y: 0, w: 0.2, h: 0.2 }, 1080)).toEqual({ width: 1, height: 1 })
  })
})

describe('applyFilter', () => {
  const rgba = (...values: number[]) => new Uint8ClampedArray(values)

  it('leaves the pixels alone for none', () => {
    const pixels = rgba(10, 120, 250, 255)
    applyFilter(pixels, 'none')
    expect([...pixels]).toEqual([10, 120, 250, 255])
  })

  it('never touches the alpha channel', () => {
    for (const filter of ['mono', 'warm', 'cool', 'vivid', 'fade'] as const) {
      const pixels = rgba(10, 120, 250, 77)
      applyFilter(pixels, filter)
      expect(pixels[3]).toBe(77)
    }
  })

  it('turns every pixel grey for mono, and leaves mid-grey where it is', () => {
    const pixels = rgba(200, 40, 90, 255, 128, 128, 128, 255)
    applyFilter(pixels, 'mono')
    expect(pixels[0]).toBe(pixels[1])
    expect(pixels[1]).toBe(pixels[2])
    expect([...pixels.slice(4, 7)]).toEqual([128, 128, 128])
  })

  it('makes warm redder and cooler bluer, on a grey pixel', () => {
    const warm = rgba(128, 128, 128, 255)
    const cool = rgba(128, 128, 128, 255)
    applyFilter(warm, 'warm')
    applyFilter(cool, 'cool')
    expect(warm[0]).toBeGreaterThan(warm[2])
    expect(cool[2]).toBeGreaterThan(cool[0])
  })

  it('pushes colours apart for vivid and lifts the blacks for fade', () => {
    const vivid = rgba(180, 100, 100, 255)
    applyFilter(vivid, 'vivid')
    expect(vivid[0] - vivid[1]).toBeGreaterThan(80)

    const fade = rgba(0, 0, 0, 255)
    applyFilter(fade, 'fade')
    expect(fade[0]).toBeGreaterThan(30)
  })

  it('clamps to 0-255 instead of wrapping', () => {
    const pixels = rgba(255, 255, 255, 255, 0, 0, 0, 255)
    applyFilter(pixels, 'vivid')
    expect([...pixels]).toEqual([255, 255, 255, 255, 0, 0, 0, 255])
  })
})

describe('clamp', () => {
  it('holds a value between the bounds', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
