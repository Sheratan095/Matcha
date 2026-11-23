/**
 * The photo editor's engine, apart from React: how a crop window sits on an image, how large the result is,
 * what each filter does to the pixels, and the few canvas calls that load, draw and encode.
 *
 * Everything the screen shows is the exact output (the preview is drawn by the same `paint` as the file that is
 * uploaded). Filters are plain pixel arithmetic rather than `ctx.filter`, which not every browser has, so the
 * preview, the upload and the tests all agree.
 *
 * The backend re-encodes to WebP, strips the metadata and caps the long side at 1080 px, so this only has to
 * hand it a sensible JPEG. Nothing here is sent anywhere.
 */

import type { MessageKey } from '@/i18n'

// ------------------------------------------------------------------ limits

/** Largest file the editor opens: it is resized before it is sent, so this is not the backend's 5 MB. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024
/** Longest side kept in memory while editing (a 12 MP phone picture is 4032 px): bounds canvas memory on phones. */
export const WORK_SIDE = 3200
/** Longest side of the preview canvas. */
export const PREVIEW_SIDE = 720
export const MAX_ZOOM = 3
export const OUTPUT_MIME = 'image/jpeg'
export const OUTPUT_QUALITY = 0.92

// ------------------------------------------------------------------ choices

export type CropShape = 'original' | 'card' | 'square'

export interface CropOption {
  value: CropShape
  /** The catalogue key of its name. */
  label: MessageKey
  /** width / height; `null` keeps the picture's own proportions. */
  ratio: number | null
}

export const CROPS: readonly CropOption[] = [
  { value: 'original', label: 'me.cropOriginal', ratio: null },
  // The ratio the grid tiles and the Discover card show a photo in.
  { value: 'card', label: 'me.cropCard', ratio: 3 / 4 },
  { value: 'square', label: 'me.cropSquare', ratio: 1 },
]

export type SizeId = 'small' | 'medium' | 'large'

export interface SizeOption {
  value: SizeId
  label: MessageKey
  /** Longest side of the file, in pixels. */
  side: number
}

/** Large is what the backend keeps (it never stores more than 1080 px). */
export const SIZES: readonly SizeOption[] = [
  { value: 'small', label: 'me.sizeSmall', side: 540 },
  { value: 'medium', label: 'me.sizeMedium', side: 810 },
  { value: 'large', label: 'me.sizeLarge', side: 1080 },
]

export type FilterId = 'none' | 'mono' | 'warm' | 'cool' | 'vivid' | 'fade'

/** How a filter moves each pixel: saturation, a per-channel multiplier, contrast around mid-grey, then a lift. */
export interface Look {
  saturation: number
  tint: readonly [number, number, number]
  contrast: number
  /** Added to every channel, 0-255. */
  lift: number
}

export interface FilterOption {
  value: FilterId
  label: MessageKey
  look: Look | null
}

export const FILTERS: readonly FilterOption[] = [
  { value: 'none', label: 'me.filterNone', look: null },
  { value: 'mono', label: 'me.filterMono', look: { saturation: 0, tint: [1, 1, 1], contrast: 1.12, lift: 0 } },
  { value: 'warm', label: 'me.filterWarm', look: { saturation: 1.1, tint: [1.07, 1, 0.9], contrast: 1.02, lift: 4 } },
  { value: 'cool', label: 'me.filterCool', look: { saturation: 1.05, tint: [0.92, 1, 1.08], contrast: 1.02, lift: 0 } },
  { value: 'vivid', label: 'me.filterVivid', look: { saturation: 1.4, tint: [1, 1, 1], contrast: 1.1, lift: 0 } },
  { value: 'fade', label: 'me.filterFade', look: { saturation: 0.75, tint: [1, 1, 1], contrast: 0.85, lift: 16 } },
]

// ------------------------------------------------------------------ geometry

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Quarter turns, clockwise. */
export type Turns = 0 | 1 | 2 | 3

export const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

/**
 * The crop window on an image of `imgW` x `imgH`, in the image's own pixels. At zoom 1 it is the largest
 * window of the shape's proportions that fits; zoom divides it. `focus` is where its centre sits, as a fraction
 * of the image (0.5, 0.5 = the middle); the window is kept inside the picture whatever the focus says.
 */
export function cropRect(imgW: number, imgH: number, shape: CropShape, zoom: number, focus: Point): Rect {
  const ratio = CROPS.find((option) => option.value === shape)?.ratio
  let w = imgW
  let h = imgH
  if (ratio) {
    // the largest window of that shape: it touches the picture's sides or its top and bottom
    if (imgW / imgH > ratio) w = imgH * ratio
    else h = imgW / ratio
  }
  const k = clamp(zoom, 1, MAX_ZOOM)
  w /= k
  h /= k
  return {
    x: clamp(focus.x * imgW - w / 2, 0, imgW - w),
    y: clamp(focus.y * imgH - h / 2, 0, imgH - h),
    w,
    h,
  }
}

/** The focus that puts the window where `rect` is (what the editor stores after a move: always inside the picture). */
export function focusOf(rect: Rect, imgW: number, imgH: number): Point {
  return { x: (rect.x + rect.w / 2) / imgW, y: (rect.y + rect.h / 2) / imgH }
}

/**
 * Moves the picture under the window by `dx` / `dy`, given as fractions of the window (dragging the picture right
 * by half the window's width is dx = 0.5), and returns the new focus, held inside the picture.
 */
export function pan(imgW: number, imgH: number, shape: CropShape, zoom: number, focus: Point, dx: number, dy: number): Point {
  const rect = cropRect(imgW, imgH, shape, zoom, focus)
  const moved = cropRect(imgW, imgH, shape, zoom, {
    x: (rect.x + rect.w / 2 - dx * rect.w) / imgW,
    y: (rect.y + rect.h / 2 - dy * rect.h) / imgH,
  })
  return focusOf(moved, imgW, imgH)
}

/** Where a point of the picture goes after a clockwise quarter turn (the editor follows its focus through one). */
export function turnFocus(focus: Point): Point {
  return { x: 1 - focus.y, y: focus.x }
}

/** `[width, height]` of an image after `turns` quarter turns. */
export function turnedSize(width: number, height: number, turns: Turns): [number, number] {
  return turns % 2 === 0 ? [width, height] : [height, width]
}

/** The file's size: the window's own pixels, shrunk so the long side is at most `side`, never enlarged. */
export function outputSize(rect: Rect, side: number): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(rect.w, rect.h))
  return { width: Math.max(1, Math.round(rect.w * scale)), height: Math.max(1, Math.round(rect.h * scale)) }
}

// ------------------------------------------------------------------ filters

/** Applies a filter to RGBA pixels in place (alpha is left alone). */
export function applyFilter(pixels: Uint8ClampedArray, filter: FilterId): void {
  const look = FILTERS.find((option) => option.value === filter)?.look
  if (!look) return
  const { saturation, tint, contrast, lift } = look
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const grey = 0.299 * r + 0.587 * g + 0.114 * b
    // Writing to a Uint8ClampedArray rounds and clamps to 0-255.
    pixels[i] = ((grey + (r - grey) * saturation) * tint[0] - 128) * contrast + 128 + lift
    pixels[i + 1] = ((grey + (g - grey) * saturation) * tint[1] - 128) * contrast + 128 + lift
    pixels[i + 2] = ((grey + (b - grey) * saturation) * tint[2] - 128) * contrast + 128 + lift
  }
}

// ------------------------------------------------------------------ canvas

/** An image that has been decoded, with its EXIF orientation applied and its size bounded by `WORK_SIDE`. */
export type Source = HTMLCanvasElement

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser cannot edit pictures.')
  return ctx
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

/** Decodes a picked file. Rejects when the browser cannot read it as an image. */
export async function loadSource(file: Blob): Promise<Source> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) throw new Error('empty image')
    const scale = Math.min(1, WORK_SIDE / Math.max(width, height))
    const canvas = canvasOf(width * scale, height * scale)
    const ctx = context(canvas)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The picture turned `turns` quarter turns clockwise (the same canvas for 0). */
export function turn(source: Source, turns: Turns): Source {
  if (turns === 0) return source
  const [width, height] = turnedSize(source.width, source.height, turns)
  const canvas = canvasOf(width, height)
  const ctx = context(canvas)
  ctx.translate(width / 2, height / 2)
  ctx.rotate((turns * Math.PI) / 2)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return canvas
}

/** Draws the `rect` of `source` onto `target`, resized to `width` x `height`, then filtered. */
export function paint(
  target: HTMLCanvasElement,
  source: Source,
  rect: Rect,
  size: { width: number; height: number },
  filter: FilterId,
): void {
  target.width = size.width
  target.height = size.height
  const ctx = context(target)
  // JPEG has no transparency: a see-through PNG lands on paper white, not black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, size.width, size.height)
  if (filter === 'none') return
  const pixels = ctx.getImageData(0, 0, size.width, size.height)
  applyFilter(pixels.data, filter)
  ctx.putImageData(pixels, 0, 0)
}

/** The edited picture as a JPEG file named after the original. Rejects when the browser cannot encode it. */
export async function exportFile(
  source: Source,
  rect: Rect,
  size: { width: number; height: number },
  filter: FilterId,
  name: string,
): Promise<File> {
  const canvas = canvasOf(size.width, size.height)
  paint(canvas, source, rect, size, filter)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, OUTPUT_MIME, OUTPUT_QUALITY))
  if (!blob) throw new Error('The edited photo could not be saved.')
  return new File([blob], `${name.replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`, { type: OUTPUT_MIME })
}
