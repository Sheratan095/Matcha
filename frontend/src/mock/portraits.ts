/**
 * Generated portraits for the mock people: risograph-style poster busts as SVG data URLs.
 *
 * No network, no photographs. A portrait is a pure function of (look, seed, variant):
 * the look fixes who the person is (skin, hair, face, clothes, accessories), the seed fixes
 * the small things that make a face (eyes, brows, nose), and the variant picks the pose,
 * the crop, the expression and the colour field, so that the pictures of one person read
 * as the same person on different days.
 *
 * Drawn on a 300 x 400 sheet with the app's own ink drums (see ui/styles/tokens.css).
 * This file is self-contained on purpose (no imports at runtime).
 */

export type HairStyle =
  | 'bald'
  | 'buzz'
  | 'short'
  | 'quiff'
  | 'curls'
  | 'afro'
  | 'bob'
  | 'long'
  | 'wavy'
  | 'bun'
  | 'ponytail'
  | 'braids'
  | 'locs'
  | 'sidecut'
  | 'hijab'
  | 'turban'

export type HairColor =
  | 'black'
  | 'espresso'
  | 'brown'
  | 'chestnut'
  | 'auburn'
  | 'ginger'
  | 'blond'
  | 'platinum'
  | 'grey'
  | 'silver'
  | 'pink'
  | 'blue'
  | 'green'

export type InkName =
  | 'ink'
  | 'paper'
  | 'kraft'
  | 'matcha'
  | 'deep'
  | 'mint'
  | 'strawberry'
  | 'pink'
  | 'yolk'
  | 'butter'
  | 'blue'
  | 'sky'

export type FaceShape = 'oval' | 'round' | 'square' | 'long' | 'heart'
export type Beard = 'none' | 'stubble' | 'full' | 'moustache' | 'goatee'
export type Top = 'tee' | 'vneck' | 'turtle' | 'shirt' | 'hoodie' | 'jacket' | 'tank' | 'stripe'

export interface PortraitLook {
  /** 0 (lightest) to 6 (deepest). */
  skin: 0 | 1 | 2 | 3 | 4 | 5 | 6
  face?: FaceShape
  hair: HairStyle
  hairColor: HairColor
  /** Fringe instead of a parting, for the styles that have a hairline. */
  bangs?: boolean
  beard?: Beard
  glasses?: 'round' | 'square'
  hat?: 'beanie'
  /** Colour of the hijab, turban or beanie. */
  cloth?: InkName
  earrings?: 'stud' | 'hoop'
  freckles?: boolean
  blush?: boolean
  lips?: boolean
  lashes?: boolean
  top: Top
  topColor: InkName
  build?: 'slim' | 'broad'
}

const W = 300
const H = 400
const CX = 150
/** Top of the skull. */
const T = 98

const INKS: Record<InkName, string> = {
  ink: '#15130f',
  paper: '#fbf6e6',
  kraft: '#e3d5b2',
  matcha: '#72c13c',
  deep: '#1d4b24',
  mint: '#d3e9ae',
  strawberry: '#ff4f64',
  pink: '#ffd3d0',
  yolk: '#ffc531',
  butter: '#ffe9a8',
  blue: '#2b48f0',
  sky: '#cfd8ff',
}
const INK = INKS.ink
const PAPER = INKS.paper

/** [base, shade] */
const SKIN: readonly (readonly [string, string])[] = [
  ['#f8dcc6', '#e6b99c'],
  ['#f1c9a6', '#d9a57e'],
  ['#e2b085', '#c48c60'],
  ['#cc9364', '#ab7247'],
  ['#ab7444', '#8a5730'],
  ['#87562f', '#693f20'],
  ['#63402a', '#482b1a'],
]

const HAIR: Record<HairColor, string> = {
  black: '#1b1815',
  espresso: '#3b2a20',
  brown: '#6b4528',
  chestnut: '#8b4a29',
  auburn: '#a8492a',
  ginger: '#de7a2b',
  blond: '#ebc35c',
  platinum: '#f1e7c6',
  grey: '#9d998f',
  silver: '#d6d2c6',
  pink: '#ff4f64',
  blue: '#2b48f0',
  green: '#72c13c',
}

/** Colour fields: [field, pattern, misregistration accent]. */
const SCHEMES: readonly (readonly [InkName, InkName, InkName])[] = [
  ['yolk', 'strawberry', 'blue'],
  ['matcha', 'deep', 'yolk'],
  ['strawberry', 'pink', 'yolk'],
  ['blue', 'sky', 'strawberry'],
  ['paper', 'matcha', 'strawberry'],
  ['mint', 'matcha', 'blue'],
  ['pink', 'strawberry', 'blue'],
  ['sky', 'blue', 'strawberry'],
  ['butter', 'yolk', 'strawberry'],
  ['deep', 'matcha', 'yolk'],
  ['kraft', 'ink', 'strawberry'],
  ['yolk', 'paper', 'deep'],
]

const FACES: Record<FaceShape, { hw: number; jaw: number; cw: number; chin: number }> = {
  oval: { hw: 51, jaw: 48, cw: 26, chin: 238 },
  round: { hw: 55, jaw: 56, cw: 36, chin: 234 },
  square: { hw: 53, jaw: 64, cw: 42, chin: 236 },
  long: { hw: 48, jaw: 52, cw: 24, chin: 246 },
  heart: { hw: 53, jaw: 40, cw: 18, chin: 240 },
}

type Background = 'dots' | 'fade' | 'sun' | 'arch' | 'rays' | 'stripes' | 'split' | 'grid'
const BACKGROUNDS: readonly (readonly Background[])[] = [
  ['dots', 'arch', 'fade', 'sun', 'stripes'],
  ['stripes', 'dots', 'grid', 'fade'],
  ['sun', 'split', 'rays', 'dots'],
  ['rays', 'arch', 'grid', 'sun'],
  ['fade', 'split', 'stripes', 'arch'],
]

// ------------------------------------------------------------------ helpers

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T
}

/** Rounds to one decimal and drops the trailing zero: keeps the markup small. */
function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  let out = 0
  for (const shift of [16, 8, 0]) {
    const ca = (pa >> shift) & 255
    const cb = (pb >> shift) & 255
    out = (out << 8) | Math.round(ca + (cb - ca) * t)
  }
  return '#' + out.toString(16).padStart(6, '0')
}

const shadeOf = (colour: string) => mix(colour, INK, 0.24)

/** Euclidean RGB distance between two #rrggbb colours (0 to ~441). */
function distance(a: string, b: string): number {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  let sum = 0
  for (const shift of [16, 8, 0]) {
    const d = ((pa >> shift) & 255) - ((pb >> shift) & 255)
    sum += d * d
  }
  return Math.sqrt(sum)
}

/** Styles whose hair (or cloth) falls in front of the clothes. */
const HAIR_OVER_TOP: readonly HairStyle[] = ['long', 'wavy', 'braids', 'locs', 'hijab']

function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r)
}

/**
 * Clockwise on screen, like the hair caps: subpaths of one nonzero-filled path that overlap must turn
 * the same way, or the overlap becomes a hole (curls over a cap showed speckles of the under-print).
 */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${n(cx - rx)} ${n(cy)}a${n(rx)} ${n(ry)} 0 1 1 ${n(rx * 2)} 0a${n(rx)} ${n(ry)} 0 1 1 ${n(-rx * 2)} 0Z`
}

function path(d: string, fill: string, extra = ''): string {
  return `<path d="${d}" fill="${fill}"${extra}/>`
}

function stroke(d: string, colour: string, width: number, extra = ''): string {
  return `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${n(width)}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
}

/** Rows of round dots whose size follows `size(y)`: a halftone ramp out of dashed strokes. */
function halftone(colour: string, from: number, to: number, size: (t: number) => number): string {
  const step = 15
  let rows = ''
  let row = 0
  for (let y = from; y <= to; y += step * 0.866, row++) {
    const w = size((y - from) / Math.max(1, to - from))
    if (w < 0.8) continue
    rows += `<path d="M${row % 2 ? -7.5 : 0} ${n(y)}H${W + 8}" stroke-width="${n(w)}"/>`
  }
  return `<g stroke="${colour}" stroke-linecap="round" stroke-dasharray="0 ${step}">${rows}</g>`
}

// ------------------------------------------------------------------ the figure

interface Figure {
  /** Outlines that make up the silhouette (for the misregistered under-print). */
  silhouette: string[]
  /** Markup, back to front. */
  layers: string[]
  defs: string[]
}

type Hairline = 'arc' | 'bangs' | 'part' | 'centre'

function drawFigure(look: PortraitLook, seed: string, variant: number, topInk: string): Figure {
  const person = mulberry(hash(seed))
  const mood = mulberry(hash(`${seed}/${variant}`))
  const face = FACES[look.face ?? 'oval']
  const { hw, jaw, cw, chin } = face
  const [skin, skinShade] = SKIN[look.skin] as readonly [string, string]
  const hair = HAIR[look.hairColor]
  const cloth = INKS[look.cloth ?? 'ink']
  const deepSkin = look.skin >= 5
  const sw = look.build === 'broad' ? 124 : look.build === 'slim' ? 100 : 112
  const nw = look.build === 'broad' ? 25 : look.build === 'slim' ? 19 : 22

  const silhouette: string[] = []
  const layers: string[] = []
  const defs: string[] = []
  const solid = (d: string, fill: string, extra = '') => {
    silhouette.push(d)
    layers.push(path(d, fill, extra))
  }

  // -- shapes shared by several layers
  const headD =
    `M${CX - hw} 158C${CX - hw} 120 ${n(CX - hw * 0.72)} ${T} ${CX} ${T}S${CX + hw} 120 ${CX + hw} 158` +
    `C${CX + hw} ${158 + jaw} ${CX + cw} ${chin} ${CX} ${chin}S${CX - hw} ${158 + jaw} ${CX - hw} 158Z`
  const torsoD =
    `M${CX - nw - 4} 262C${CX - nw - 12} 288 ${CX - sw + 30} 286 ${CX - sw + 8} 302` +
    `C${CX - sw - 8} 312 ${CX - sw - 14} 344 ${CX - sw - 16} 470H${CX + sw + 16}` +
    `C${CX + sw + 14} 344 ${CX + sw + 8} 312 ${CX + sw - 8} 302C${CX + sw - 30} 286 ${CX + nw + 12} 288 ${CX + nw + 4} 262Z`

  /** Hair that hugs the skull: an outer dome and a hairline. */
  const cap = (lift: number, side: number, sb: number, line: Hairline): string => {
    const outer =
      `M${CX - hw - side} ${sb}C${CX - hw - side - 2} ${n(118 - lift * 0.5)} ${n(CX - hw * 0.72)} ${T - lift} ${CX} ${T - lift}` +
      `S${CX + hw + side + 2} ${n(118 - lift * 0.5)} ${CX + hw + side} ${sb}`
    switch (line) {
      case 'bangs':
        return `${outer}L${CX + hw - 4} ${sb - 2}L${CX + hw - 6} 150Q${CX} 139 ${CX - hw + 6} 150L${CX - hw + 4} ${sb - 2}Z`
      case 'part':
        return `${outer}L${CX + hw - 6} ${sb - 4}C${CX + hw - 8} 140 ${CX + 36} 128 ${CX + 20} ${T + 14}C${CX + 2} 146 ${CX - hw + 22} 153 ${CX - hw + 6} ${sb - 4}Z`
      case 'centre':
        return `${outer}L${CX + hw - 6} ${sb - 4}C${CX + hw - 10} 146 ${CX + 12} 138 ${CX} ${T + 10}C${CX - 12} 138 ${CX - hw + 10} 146 ${CX - hw + 6} ${sb - 4}Z`
      default:
        return `${outer}L${CX + hw - 6} ${sb - 4}C${CX + hw - 8} 136 ${CX + 24} 124 ${CX} 124S${CX - hw + 8} 136 ${CX - hw + 6} ${sb - 4}Z`
    }
  }
  const line: Hairline = look.bangs ? 'bangs' : 'part'
  const hatOn = look.hat === 'beanie'

  // -- 1. hair behind everything
  switch (look.hair) {
    case 'afro':
      if (!hatOn) solid(ellipse(CX, 144, hw + 37, 86), hair)
      else solid(ellipse(CX, 176, hw + 30, 52), hair)
      break
    case 'bob':
      solid(
        `M${CX - hw - 14} 150C${CX - hw - 20} 84 ${CX + hw + 20} 84 ${CX + hw + 14} 150V236Q${CX + hw + 14} 258 ${CX + hw - 8} 258H${CX - hw + 8}Q${CX - hw - 14} 258 ${CX - hw - 14} 236Z`,
        hair,
      )
      break
    case 'long':
      solid(
        `M${CX - hw - 14} 150C${CX - hw - 22} 80 ${CX + hw + 22} 80 ${CX + hw + 14} 150C${CX + hw + 22} 230 ${CX + hw + 34} 300 ${CX + hw + 26} 350H${CX - hw - 26}C${CX - hw - 34} 300 ${CX - hw - 22} 230 ${CX - hw - 14} 150Z`,
        hair,
      )
      break
    case 'wavy': {
      const ys = [150, 192, 234, 276, 316]
      let d = `M${CX - hw - 16} 150C${CX - hw - 24} 76 ${CX + hw + 24} 76 ${CX + hw + 16} 150`
      for (let i = 1; i < ys.length; i++) {
        const y0 = ys[i - 1] as number
        const y1 = ys[i] as number
        d += `Q${CX + hw + (i % 2 ? 38 : 12)} ${(y0 + y1) / 2} ${CX + hw + 20 + i * 3} ${y1}`
      }
      d += `H${CX - hw - 32}`
      for (let i = ys.length - 1; i >= 1; i--) {
        const y0 = ys[i - 1] as number
        const y1 = ys[i] as number
        d += `Q${CX - hw - (i % 2 ? 38 : 12)} ${(y0 + y1) / 2} ${CX - hw - (i === 1 ? 16 : 20 + (i - 1) * 3)} ${y0}`
      }
      solid(d + 'Z', hair)
      break
    }
    case 'ponytail':
      solid(
        `M${CX + hw - 12} 108C${CX + hw + 46} 92 ${CX + hw + 60} 200 ${CX + hw + 30} 272C${CX + hw + 32} 232 ${CX + hw + 22} 172 ${CX + hw - 2} 150Z`,
        hair,
      )
      break
    case 'locs':
      // a full crown the locs fall from, so no strand starts in mid-air
      solid(ellipse(CX, 146, hw + 26, 46), hair)
      for (const [dx, y0, y1] of [
        [hw + 19, 150, 262],
        [hw + 6, 160, 306],
      ] as const) {
        for (const s of [-1, 1]) {
          const x = CX + s * dx
          solid(`M${x - 7.5} ${y0}V${y1}a7.5 7.5 0 0 0 15 0V${y0}Z`, hair)
        }
      }
      break
    default:
      break
  }

  // -- 2. clothes
  const top = look.top
  const topShade = shadeOf(topInk)
  if (top === 'hoodie') {
    solid(
      `M${CX - nw - 32} 304C${CX - nw - 44} 250 ${CX - nw - 14} 224 ${CX} 224S${CX + nw + 44} 250 ${CX + nw + 32} 304Z`,
      topShade,
    )
  }
  const jacketInner = topInk === PAPER ? INKS.kraft : PAPER
  solid(torsoD, top === 'tank' ? skin : top === 'jacket' ? jacketInner : topInk)
  if (top === 'stripe' || top === 'jacket' || top === 'tank') {
    defs.push(`<clipPath id="t"><path d="${torsoD}"/></clipPath>`)
  }
  if (top === 'stripe') {
    const band = topInk === PAPER || topInk === INKS.butter || topInk === INKS.mint ? INK : PAPER
    layers.push(
      `<path d="M0 316H300M0 342H300M0 368H300M0 394H300M0 420H300" stroke="${band}" stroke-width="10" clip-path="url(#t)"/>`,
    )
  }
  if (top === 'jacket') {
    layers.push(
      `<g clip-path="url(#t)">` +
        path(
          `M0 230H${CX - nw}L${CX - 26} 470H0ZM300 230H${CX + nw}L${CX + 26} 470H300Z`,
          topInk,
        ) +
        stroke(`M${CX - nw} 262L${CX - 26} 470M${CX + nw} 262L${CX + 26} 470`, topShade, 4) +
        `</g>`,
    )
  }
  if (top === 'tank') {
    layers.push(
      path(
        `M${CX - 62} 236H${CX - 42}C${CX - 42} 300 ${CX - 26} 330 ${CX} 330S${CX + 42} 300 ${CX + 42} 236H${CX + 62}C${CX + 64} 300 ${CX + 72} 332 ${CX + 96} 352V470H${CX - 96}V352C${CX - 72} 332 ${CX - 64} 300 ${CX - 62} 236Z`,
        topInk,
        ' clip-path="url(#t)"',
      ),
    )
  }

  // -- 3. neck
  if (top === 'turtle') {
    layers.push(path(`M${CX - nw} 205V250H${CX + nw}V205Z`, skin))
    layers.push(
      path(
        `M${CX - nw - 4} 232Q${CX} 244 ${CX + nw + 4} 232V274H${CX - nw - 4}Z`,
        topInk,
      ),
    )
    layers.push(stroke(`M${CX - nw - 4} 254Q${CX} 264 ${CX + nw + 4} 254`, topShade, 3))
  } else {
    const neckD =
      top === 'vneck'
        ? `M${CX - nw} 205V264L${CX} 320L${CX + nw} 264V205Z`
        : top === 'shirt'
          ? `M${CX - nw} 205V264L${CX} 298L${CX + nw} 264V205Z`
          : top === 'tank'
            ? `M${CX - nw} 205V272H${CX + nw}V205Z`
            : `M${CX - nw} 205V268Q${CX} 304 ${CX + nw} 268V205Z`
    layers.push(path(neckD, skin))
    layers.push(path(`M${CX - nw} 214V236Q${CX} 266 ${CX + nw} 236V214Z`, skinShade))
    if (top === 'tee' || top === 'stripe' || top === 'hoodie' || top === 'jacket') {
      const rib = top === 'jacket' ? shadeOf(jacketInner) : topShade
      layers.push(stroke(`M${CX - nw - 1} 267Q${CX} 307 ${CX + nw + 1} 267`, rib, 5))
    }
    if (top === 'vneck') layers.push(stroke(`M${CX - nw - 1} 263L${CX} 322L${CX + nw + 1} 263`, topShade, 4))
    if (top === 'shirt') {
      const collar = mix(topInk, PAPER, topInk === PAPER ? 0 : 0.5)
      layers.push(
        path(
          `M${CX - nw - 5} 256L${CX - 1} 298L${CX - nw - 26} 308ZM${CX + nw + 5} 256L${CX + 1} 298L${CX + nw + 26} 308Z`,
          collar,
        ),
      )
      layers.push(stroke(`M${CX - nw - 5} 256L${CX - 1} 298L${CX - nw - 26} 308M${CX + nw + 5} 256L${CX + 1} 298L${CX + nw + 26} 308M${CX} 300V470`, topShade, 2.5))
      layers.push(path(circle(CX, 330, 3) + circle(CX, 362, 3) + circle(CX, 394, 3), topShade))
    }
    if (top === 'hoodie') {
      layers.push(stroke(`M${CX - 10} 296V342M${CX + 10} 296V332`, PAPER, 3.5))
    }
  }

  // -- 4. head
  const coversEars = ['bob', 'long', 'wavy', 'hijab', 'braids'].includes(look.hair)
  if (!coversEars) {
    solid(ellipse(CX - hw - 1, 180, 8, 13), skin)
    solid(ellipse(CX + hw + 1, 180, 8, 13), skin)
    layers.push(stroke(`M${CX - hw - 3} 176q-3 5 1 10M${CX + hw + 3} 176q3 5 -1 10`, skinShade, 2.5))
  }
  solid(headD, skin)
  defs.push(`<clipPath id="h"><path d="${headD}"/></clipPath>`)
  // a rim of shade down the right cheek
  layers.push(
    path(
      `M0 0H${W}V${H}H0Z${ellipse(CX - 13, 160, hw + 3, (chin - T) / 2 + 20)}`,
      skinShade,
      ' fill-rule="evenodd" clip-path="url(#h)"',
    ),
  )

  // -- 5. face
  const gap = 20 + Math.floor(person() * 4)
  const eyeY = 172
  const eyeStyle = deepSkin ? 'round' : pick(person, ['round', 'round', 'dot', 'tall'] as const)
  const browTilt = person() * 5 - 2
  const browWeight = 3.6 + person() * 2.2
  const noseStyle = Math.floor(person() * 3)
  const gaze = variant === 2 ? 1.6 : variant === 4 ? -1.2 : 0
  const happy = variant === 3 || (variant === 1 && mood() < 0.35)
  const browColour = mix(['bald', 'hijab', 'turban'].includes(look.hair) ? HAIR.espresso : hair, INK, 0.45)
  let faceMarks = ''
  for (const s of [-1, 1]) {
    const ex = CX + s * gap
    if (happy && !look.glasses) {
      faceMarks += stroke(`M${ex - 8} ${eyeY + 2}Q${ex} ${eyeY - 8} ${ex + 8} ${eyeY + 2}`, INK, 3.4)
    } else if (eyeStyle === 'round') {
      faceMarks +=
        path(ellipse(ex, eyeY, 8.5, 6.4), PAPER) +
        path(circle(ex + gaze, eyeY, 4.3), INK) +
        stroke(`M${ex - 9} ${eyeY - 2}Q${ex} ${eyeY - 10} ${ex + 9} ${eyeY - 2}`, INK, 2.6)
    } else if (eyeStyle === 'dot') {
      faceMarks += path(circle(ex + gaze * 0.5, eyeY, 4.8), INK)
    } else {
      faceMarks += path(ellipse(ex + gaze * 0.5, eyeY, 4.3, 6.2), INK)
    }
    if (look.lashes && !happy) {
      faceMarks += stroke(`M${ex + s * 8} ${eyeY - 4}l${s * 5} -4M${ex + s * 5} ${eyeY - 7}l${s * 3} -5`, INK, 2)
    }
    const by = 153 - (happy ? 2 : 0)
    faceMarks += stroke(
      `M${ex - s * 10} ${n(by - browTilt)}Q${ex} ${n(by - 5)} ${ex + s * 11} ${n(by + 1 + browTilt * 0.4)}`,
      browColour,
      browWeight,
    )
  }
  const noseInk = mix(skinShade, INK, 0.2)
  faceMarks +=
    noseStyle === 0
      ? stroke(`M${CX + 2} 180L${CX + 7} 196Q${CX + 3} 201 ${CX - 4} 198`, noseInk, 3.4)
      : noseStyle === 1
        ? stroke(`M${CX - 7} 196Q${CX} 203 ${CX + 7} 196`, noseInk, 3.4)
        : stroke(`M${CX - 1} 180V193M${CX - 7} 197Q${CX} 203 ${CX + 7} 197`, noseInk, 3.2)
  if (look.freckles) {
    let dots = ''
    for (const [dx, dy] of [
      [14, 190],
      [22, 186],
      [30, 191],
      [20, 195],
      [36, 186],
    ] as const) {
      dots += circle(CX - dx, dy, 1.5) + circle(CX + dx, dy, 1.5)
    }
    faceMarks += path(dots, noseInk)
  }
  if (look.blush) {
    faceMarks += path(circle(CX - 32, 198, 8) + circle(CX + 32, 198, 8), INKS.strawberry, ' opacity=".4"')
  }

  // beard under the mouth, mouth on top
  const beard = look.beard ?? 'none'
  const beardColour = beard === 'stubble' ? mix(skin, hair, 0.38) : hair
  const my = 216
  if (beard === 'full' || beard === 'stubble') {
    const d =
      `M${CX - hw - 1} 166C${CX - hw - 2} ${164 + jaw} ${CX - cw - 4} ${chin + (beard === 'full' ? 11 : 1)} ${CX} ${chin + (beard === 'full' ? 11 : 1)}` +
      `S${CX + hw + 2} ${164 + jaw} ${CX + hw + 1} 166L${CX + hw - 9} 178C${CX + hw - 12} 202 ${CX + 28} 198 ${CX + 16} 204` +
      `Q${CX} 198 ${CX - 16} 204C${CX - 28} 198 ${CX - hw + 12} 202 ${CX - hw + 9} 178Z`
    if (beard === 'full') silhouette.push(d)
    faceMarks += path(d, beardColour)
    faceMarks += path(`M${CX - 13} ${my - 3}Q${CX} ${my + 13} ${CX + 13} ${my - 3}Q${CX} ${my - 7} ${CX - 13} ${my - 3}Z`, skin)
  }
  if (beard === 'moustache' || beard === 'goatee') {
    faceMarks += path(
      `M${CX - 18} 210Q${CX - 9} 199 ${CX} 204Q${CX + 9} 199 ${CX + 18} 210Q${CX + 8} 211 ${CX} 208Q${CX - 8} 211 ${CX - 18} 210Z`,
      hair,
    )
  }
  if (beard === 'goatee') {
    faceMarks += path(
      `M${CX - 14} 224Q${CX - 20} ${chin + 5} ${CX} ${chin + 8}Q${CX + 20} ${chin + 5} ${CX + 14} 224Q${CX} 232 ${CX - 14} 224Z`,
      hair,
    )
  }
  const mouthStyle = look.lips
    ? happy
      ? 'grin'
      : 'lips'
    : happy || (deepSkin && beard === 'none')
      ? 'grin'
      : pick(mood, ['smile', 'smile', 'smirk', 'grin'] as const)
  const mouthInk = deepSkin && (beard === 'none' || beard === 'moustache') ? mix(skinShade, INK, 0.55) : INK
  if (mouthStyle === 'lips') {
    faceMarks += path(
      `M${CX - 13} ${my}Q${CX - 6} ${my - 6} ${CX} ${my - 3}Q${CX + 6} ${my - 6} ${CX + 13} ${my}Q${CX} ${my + 11} ${CX - 13} ${my}Z`,
      mix(INKS.strawberry, INK, 0.12),
    )
  } else if (mouthStyle === 'grin') {
    faceMarks +=
      path(`M${CX - 14} ${my - 3}Q${CX} ${my + 15} ${CX + 14} ${my - 3}Z`, look.lips ? mix(INKS.strawberry, INK, 0.3) : mouthInk) +
      path(`M${CX - 11} ${my - 2}H${CX + 11}L${CX + 9} ${my + 2.5}H${CX - 9}Z`, PAPER)
  } else if (mouthStyle === 'smirk') {
    faceMarks += stroke(`M${CX - 11} ${my + 2}Q${CX + 3} ${my + 8} ${CX + 14} ${my - 3}`, mouthInk, 3.4)
  } else {
    faceMarks += stroke(`M${CX - 12} ${my - 1}Q${CX} ${my + 10} ${CX + 12} ${my - 1}`, mouthInk, 3.4)
  }
  layers.push(faceMarks)

  // -- 6. hair on the head
  const frontHair = (d: string, fill = hair) => solid(d, fill)
  if (look.hair === 'hijab') {
    layers.push(path(`M${CX - hw + 4} 150Q${CX} 108 ${CX + hw - 4} 150Q${CX} 128 ${CX - hw + 4} 150Z`, shadeOf(cloth)))
    const rx = hw - 4
    solid(
      `M${CX - hw - 15} 172C${CX - hw - 24} 68 ${CX + hw + 24} 68 ${CX + hw + 15} 172C${CX + hw + 18} 228 ${CX + hw + 48} 262 ${CX + hw + 64} 304` +
        `C${CX + hw + 30} 336 ${CX + 24} 350 ${CX} 350S${CX - hw - 30} 336 ${CX - hw - 64} 304C${CX - hw - 48} 262 ${CX - hw - 18} 228 ${CX - hw - 15} 172Z` +
        `M${CX - rx} 182a${rx} 59 0 1 0 ${rx * 2} 0a${rx} 59 0 1 0 ${-rx * 2} 0Z`,
      cloth,
      ' fill-rule="evenodd"',
    )
    layers.push(
      stroke(
        `M${CX - hw + 4} 238Q${CX - 6} 262 ${CX + hw + 34} 282M${CX + hw - 8} 244Q${CX + 26} 300 ${CX - 34} 334`,
        shadeOf(cloth),
        3,
      ),
    )
  } else if (look.hair === 'turban') {
    layers.push(path(cap(1, 1, 150, 'arc'), shadeOf(cloth)))
    const turbanD = `M${CX - hw - 6} 152C${CX - hw - 18} 56 ${CX + hw + 18} 56 ${CX + hw + 6} 152C${CX + hw - 8} 138 ${CX + 18} 130 ${CX} 110C${CX - 18} 130 ${CX - hw + 8} 138 ${CX - hw - 6} 152Z`
    solid(turbanD, cloth)
    // the folds stay inside the cloth
    defs.push(`<clipPath id="tb"><path d="${turbanD}"/></clipPath>`)
    layers.push(
      stroke(
        `M${CX - hw + 2} 132Q${CX + 8} 96 ${CX + hw + 2} 106M${CX - hw + 4} 108Q${CX - 2} 82 ${CX + hw - 14} 80M${CX + 4} 114Q${CX + 30} 118 ${CX + hw + 2} 132`,
        shadeOf(cloth),
        3,
        ' clip-path="url(#tb)"',
      ),
    )
  } else if (hatOn) {
    if (look.hair !== 'bald') frontHair(cap(1, 2, look.hair === 'bob' ? 214 : look.hair === 'long' || look.hair === 'wavy' ? 198 : 170, look.bangs ? 'bangs' : 'arc'))
  } else {
    switch (look.hair) {
      case 'buzz':
        frontHair(cap(3, 1, 168, 'arc'))
        break
      case 'short':
        frontHair(cap(10, 3, 170, line))
        break
      case 'quiff':
        frontHair(
          `M${CX - hw - 3} 170C${CX - hw - 6} 124 ${CX - hw + 2} 92 ${CX - 18} 84C${CX - 2} 60 ${CX + hw + 4} 62 ${CX + hw + 7} 104` +
            `C${CX + hw + 8} 124 ${CX + hw + 4} 150 ${CX + hw + 3} 170L${CX + hw - 6} 166C${CX + hw - 8} 138 ${CX + 22} 126 ${CX - 4} 131C${CX - 24} 133 ${CX - hw + 8} 142 ${CX - hw + 6} 166Z`,
        )
        break
      case 'curls': {
        let d = cap(8, 4, 168, 'arc')
        for (let i = 0; i <= 7; i++) {
          const a = Math.PI + (i / 7) * Math.PI
          d += circle(CX + (hw + 5) * Math.cos(a), 142 + 48 * Math.sin(a), 19 + (i % 2) * 4)
        }
        d += circle(CX - 24, 121, 14) + circle(CX, 116, 15) + circle(CX + 24, 121, 14)
        frontHair(d)
        break
      }
      case 'afro':
        frontHair(cap(4, 3, 168, 'arc'))
        break
      case 'bob':
        frontHair(cap(12, 12, 216, look.bangs ? 'bangs' : 'centre'))
        break
      case 'long':
        frontHair(cap(12, 10, 200, look.bangs ? 'bangs' : 'centre'))
        break
      case 'wavy':
        frontHair(cap(14, 11, 198, line))
        break
      case 'bun':
        frontHair(cap(6, 2, 168, 'arc') + circle(CX, T - 22, 24))
        break
      case 'ponytail':
        frontHair(cap(6, 2, 168, look.bangs ? 'bangs' : 'arc'))
        break
      case 'braids':
        frontHair(cap(8, 5, 180, 'centre'))
        break
      case 'locs':
        frontHair(cap(12, 6, 176, 'arc'))
        break
      case 'sidecut':
        layers.push(path(cap(1, 1, 168, 'arc'), mix(hair, skin, 0.4)))
        frontHair(
          `M${CX - hw + 2} 152C${CX - hw - 4} 100 ${CX - 10} 72 ${CX + hw} 86C${CX + hw + 24} 96 ${CX + hw + 24} 152 ${CX + hw + 8} 188` +
            `C${CX + hw + 8} 152 ${CX + 30} 124 ${CX + 6} 122C${CX - 18} 122 ${CX - hw + 10} 134 ${CX - hw + 2} 152Z`,
        )
        break
      default:
        break
    }
  }

  // -- 7. hair in front of the shoulders
  if (look.hair === 'long' || look.hair === 'wavy') {
    for (const s of look.hair === 'wavy' ? [-1] : [-1, 1]) {
      const x = (d: number) => n(CX + s * d)
      // tapered ends rather than a blunt cut
      frontHair(
        `M${x(hw + 12)} 194C${x(hw + 19)} 250 ${x(hw + 22)} 300 ${x(hw + 6)} 338Q${x(hw - 1)} 350 ${x(hw - 9)} 356Q${x(hw - 15)} 347 ${x(hw - 20)} 336C${x(hw - 6)} 298 ${x(hw - 9)} 250 ${x(hw - 3)} 196Z`,
      )
    }
  }
  if (look.hair === 'braids') {
    let d = ''
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) d += ellipse(CX + s * (hw + 9 + i * 1.5), 190 + i * 23, 11, 14.5)
      d += circle(CX + s * (hw + 18), 328, 7)
    }
    frontHair(d)
  }
  if (look.hair === 'locs') {
    for (const s of [-1, 1]) {
      const x = CX + s * (hw - 3)
      frontHair(`M${x - 7.5} 150V284a7.5 7.5 0 0 0 15 0V150Z`)
    }
  }

  // -- 8. hat, glasses, jewellery
  if (hatOn) {
    solid(`M${CX - hw - 6} 138C${CX - hw - 12} 60 ${CX + hw + 12} 60 ${CX + hw + 6} 138Z`, cloth)
    solid(`M${CX - hw - 9} 118Q${CX} 106 ${CX + hw + 9} 118V142Q${CX} 130 ${CX - hw - 9} 142Z`, shadeOf(cloth))
    // the pompom sits on the crown (the crown peaks near y 80)
    solid(circle(CX, 75, 11), shadeOf(cloth))
  }
  if (look.glasses) {
    const g = 21
    const lens =
      look.glasses === 'round'
        ? circle(CX - g, eyeY + 1, 15.5) + circle(CX + g, eyeY + 1, 15.5)
        : `M${CX - g - 17} ${eyeY - 11}h34v19a6 6 0 0 1 -6 6h-22a6 6 0 0 1 -6 -6ZM${CX + g - 17} ${eyeY - 11}h34v19a6 6 0 0 1 -6 6h-22a6 6 0 0 1 -6 -6Z`
    layers.push(
      `<path d="${lens}" fill="${PAPER}" fill-opacity=".3" stroke="${INK}" stroke-width="3.6"/>` +
        stroke(
          `M${CX - 6} ${eyeY - 2}Q${CX} ${eyeY - 7} ${CX + 6} ${eyeY - 2}M${CX - g - 16} ${eyeY - 3}L${CX - hw - 2} ${eyeY - 8}M${CX + g + 16} ${eyeY - 3}L${CX + hw + 2} ${eyeY - 8}`,
          INK,
          3.2,
        ),
    )
  }
  if (look.earrings && !coversEars) {
    const y = 197
    layers.push(
      look.earrings === 'hoop'
        ? `<path d="${circle(CX - hw - 3, y + 6, 8)}${circle(CX + hw + 3, y + 6, 8)}" fill="none" stroke="${INKS.yolk}" stroke-width="3.2"/>`
        : path(circle(CX - hw - 2, y, 4.6) + circle(CX + hw + 2, y, 4.6), INKS.yolk),
    )
  }

  return { silhouette, layers, defs }
}

// ------------------------------------------------------------------ the sheet

function drawBackground(kind: Background, field: string, pat: string, lean: number): string {
  let out = `<rect width="${W}" height="${H}" fill="${field}"/>`
  switch (kind) {
    case 'dots':
      out +=
        `<pattern id="p" width="17" height="17" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="8.5" cy="8.5" r="3.4" fill="${pat}"/></pattern>` +
        `<rect width="${W}" height="${H}" fill="url(#p)"/>`
      break
    case 'fade':
      out += halftone(pat, 6, H, (t) => 1 + t * 13)
      break
    case 'sun':
      out += path(circle(CX - lean * 1.6, 168, 116), pat) + halftone(field, 150, 300, (t) => (t < 0.15 ? 0 : t * 12))
      break
    case 'arch':
      out +=
        path(`M44 ${H}V176a106 106 0 0 1 212 0V${H}Z`, pat) +
        stroke(`M22 ${H}V176a128 128 0 0 1 256 0V${H}`, pat, 4)
      break
    case 'rays': {
      let d = ''
      for (let i = 0; i < 12; i++) {
        const a0 = ((i * 30 - 8) * Math.PI) / 180
        const a1 = ((i * 30 + 8) * Math.PI) / 180
        d += `M${CX} 190L${n(CX + 460 * Math.cos(a0))} ${n(190 + 460 * Math.sin(a0))}L${n(CX + 460 * Math.cos(a1))} ${n(190 + 460 * Math.sin(a1))}Z`
      }
      out += path(d, pat)
      break
    }
    case 'stripes':
      out +=
        `<pattern id="p" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><rect width="34" height="15" fill="${pat}"/></pattern>` +
        `<rect width="${W}" height="${H}" fill="url(#p)"/>`
      break
    case 'split':
      out += `<rect y="228" width="${W}" height="${H - 228}" fill="${pat}"/>` + halftone(pat, 118, 226, (t) => t * 14)
      break
    case 'grid':
      out +=
        `<pattern id="p" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="${pat}" stroke-width="3"/></pattern>` +
        `<rect width="${W}" height="${H}" fill="url(#p)"/>`
      break
  }
  return out
}

const svgCache = new Map<string, string>()

/** The portrait as SVG markup. `variant` 0..4 are five different pictures of the same person. */
export function portraitSvg(look: PortraitLook, seed: string, variant = 0): string {
  const key = `${seed}/${variant}/${JSON.stringify(look)}`
  const cached = svgCache.get(key)
  if (cached) return cached

  const v = ((variant % 5) + 5) % 5
  const base = hash(seed)
  const rng = mulberry(hash(`${seed}#${v}`))
  const hairInk = ['hijab', 'turban'].includes(look.hair) || look.hat ? INKS[look.cloth ?? 'ink'] : HAIR[look.hairColor]

  // a colour field that does not swallow the clothes or the hair
  let topName: InkName = look.topColor
  let scheme = SCHEMES[0] as readonly [InkName, InkName, InkName]
  for (let i = 0; i < SCHEMES.length; i++) {
    const candidate = SCHEMES[(base + v * 5 + i) % SCHEMES.length] as readonly [InkName, InkName, InkName]
    const field = INKS[candidate[0]]
    if (candidate[0] === topName || field === hairInk) continue
    if (look.top === 'tank' || look.hair === 'bald') {
      // bare skin against a field of nearly the same colour disappears
      if (candidate[0] === 'kraft' && look.skin <= 2) continue
    }
    if (candidate[0] === 'deep' && (look.skin >= 5 || hairInk === HAIR.black || hairInk === HAIR.espresso)) continue
    scheme = candidate
    break
  }
  // a second outfit for the later pictures, never the colour of hair or cloth that falls over it
  if (v >= 2) {
    const over =
      look.hair === 'hijab'
        ? INKS[look.cloth ?? 'ink']
        : HAIR_OVER_TOP.includes(look.hair)
          ? HAIR[look.hairColor]
          : null
    const alternatives = (['paper', 'ink', 'yolk', 'blue', 'strawberry', 'matcha', 'deep'] as const).filter(
      (name) => name !== scheme[0] && name !== look.topColor && (over === null || distance(INKS[name], over) > 90),
    )
    if (alternatives.length > 0) topName = alternatives[(base >>> 3) % alternatives.length] as InkName
  }
  const field = INKS[scheme[0]]
  const pat = INKS[scheme[1]]
  const accent = INKS[scheme[2]]
  const lean = (base & 1 ? 1 : -1) * 30

  const kind = pick(rng, BACKGROUNDS[v] as readonly Background[])
  const figure = drawFigure(look, seed, v, INKS[topName])
  const pose = [
    '',
    'translate(150 206) scale(1.3) translate(-150 -188)',
    `translate(${lean} 14) rotate(${lean > 0 ? 4 : -4} 150 400)`,
    'translate(150 400) scale(.84) translate(-150 -400)',
    'translate(318 -20) scale(-1.12 1.12)',
  ][v] as string
  const dark = scheme[0] === 'deep' || scheme[0] === 'blue'
  const mark = dark ? PAPER : INK

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 ${W} ${H}">` +
    `<defs>${figure.defs.join('')}</defs>` +
    drawBackground(kind, field, pat, v === 2 ? lean : 0) +
    `<g${pose ? ` transform="${pose}"` : ''}>` +
    // the misregistered under-print: one path per shape, so overlapping shapes never cancel out
    `<g fill="${accent}" transform="translate(-7 6)">${figure.silhouette.map((d) => `<path d="${d}"/>`).join('')}</g>` +
    figure.layers.join('') +
    `</g>` +
    // print furniture: a registration mark and the drum swatches
    `<g fill="none" stroke="${mark}" stroke-width="1.6"><circle cx="21" cy="21" r="6.5"/><path d="M9 21H33M21 9V33"/></g>` +
    `<path d="M257 15h9v9h-9z" fill="${pat}"/><path d="M268 15h9v9h-9z" fill="${accent}"/><path d="M279 15h9v9h-9z" fill="${mark}"/>` +
    `</svg>`
  svgCache.set(key, svg)
  return svg
}

/** `data:` URL usable directly as `<img src>`. */
export function svgToDataUrl(svg: string): string {
  return (
    'data:image/svg+xml,' +
    svg
      .replace(/%/g, '%25')
      .replace(/#/g, '%23')
      .replace(/"/g, "'")
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/\s+/g, ' ')
      .replace(/ /g, '%20')
  )
}

export function portraitDataUrl(look: PortraitLook, seed: string, variant = 0): string {
  return svgToDataUrl(portraitSvg(look, seed, variant))
}
