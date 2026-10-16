/**
 * Uploaded pictures, demo mode: decoded and downscaled in the browser, stored as a data URL small
 * enough that five of them fit in localStorage next to everything else (target <= ~140 KB each).
 *
 * Like the backend, decoding is the real validity check ("File is not a valid image"). Where there is
 * no way to decode (jsdom, very old browsers) the file is kept as-is when small, or replaced by a
 * printed placeholder, so tests and odd environments still get a working picture.
 */
import { nestError } from './nest'

const MAX_DATA_URL_CHARS = 140_000
/** Longest side and quality, tried in order until the result fits. */
const ATTEMPTS: readonly (readonly [number, number])[] = [
  [720, 0.82],
  [600, 0.76],
  [480, 0.7],
  [360, 0.62],
]

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

function isJsdom(): boolean {
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
}

/** null: not an image. 'unsupported': this environment cannot decode images. */
async function decode(file: Blob): Promise<Decoded | null | 'unsupported'> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    } catch {
      return null
    }
  }
  if (isJsdom() || typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return 'unsupported'
  }
  const objectUrl = URL.createObjectURL(file)
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () =>
      resolve({
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => URL.revokeObjectURL(objectUrl),
      })
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(null)
    }
    image.src = objectUrl
  })
}

function encode(decoded: Decoded): string | null {
  if (typeof document === 'undefined' || isJsdom()) return null
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context || decoded.width === 0 || decoded.height === 0) return null
  let best: string | null = null
  for (const [side, quality] of ATTEMPTS) {
    const scale = Math.min(1, side / Math.max(decoded.width, decoded.height))
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    // paper behind transparent PNGs (JPEG has no alpha)
    context.fillStyle = '#fbf6e6'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
    let url = canvas.toDataURL('image/webp', quality)
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality)
    best = url
    if (url.length <= MAX_DATA_URL_CHARS) break
  }
  return best
}

function readAsDataUrl(file: Blob): Promise<string | null> {
  if (typeof FileReader === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

/** A printed "photo" tile for environments that cannot handle the real one. */
export function placeholderPicture(label: string): string {
  const safe = label.replace(/[^\w .-]/g, '').slice(0, 24).toUpperCase() || 'PHOTO'
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800' viewBox='0 0 300 400'>` +
    `<rect width='300' height='400' fill='#e3d5b2'/>` +
    `<circle cx='150' cy='170' r='96' fill='#72c13c'/>` +
    `<path d='M0 300 L90 220 L160 280 L220 230 L300 300 V400 H0 Z' fill='#1d4b24'/>` +
    `<rect x='20' y='340' width='260' height='40' rx='8' fill='#15130f'/>` +
    `<text x='150' y='366' fill='#fbf6e6' font-family='monospace' font-size='15' text-anchor='middle'>${safe}</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The stored form of an uploaded picture. Throws the backend's 400 when the file is not an image. */
export async function processUpload(file: Blob, name: string): Promise<string> {
  const decoded = await decode(file)
  if (decoded === null) throw nestError(400, 'File is not a valid image')
  if (decoded !== 'unsupported') {
    try {
      const url = encode(decoded)
      if (url) return url
    } finally {
      decoded.release()
    }
  }
  if (file.size <= 100_000) {
    const url = await readAsDataUrl(file)
    if (url) return url
  }
  return placeholderPicture(name)
}
