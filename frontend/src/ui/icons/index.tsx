import type { ReactNode, SVGProps } from 'react'

/**
 * Matcha icon set. Drawn on a 24 grid with a 2.5 stroke, round caps and joins, in currentColor.
 * `filled` paints the closed shapes solid (the stroke stays, so the weight matches).
 * One exception: filled `IconRegMark` prints its quadrants in the kit's inks, not in currentColor.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** Pixel size of the square icon. Default 24. */
  size?: number | string
  /** Stroke width on the 24 grid. Default 2.5. */
  strokeWidth?: number
  /** Fill closed shapes with currentColor. */
  filled?: boolean
  /** Accessible name. Without it the icon is decorative (aria-hidden). */
  title?: string
}

export type IconComponent = (props: IconProps) => ReactNode

function make(displayName: string, draw: (filled: boolean) => ReactNode): IconComponent {
  function Icon({ size = 24, strokeWidth = 2.5, filled = false, title, ...rest }: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        role={title ? 'img' : undefined}
        aria-label={title}
        aria-hidden={title ? undefined : true}
        {...rest}
      >
        {draw(filled)}
      </svg>
    )
  }
  Icon.displayName = displayName
  return Icon
}

const f = (filled: boolean) => (filled ? 'currentColor' : 'none')

/** An 8-tooth cog outline, computed once so the teeth are exactly regular. */
const GEAR = (() => {
  const pt = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180
    return `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`
  }
  const pts: string[] = []
  for (let i = 0; i < 8; i++) {
    const a = i * 45
    pts.push(pt(7.3, a - 15), pt(10.2, a - 9), pt(10.2, a + 9), pt(7.3, a + 15))
  }
  return `M${pts.join('L')}Z`
})()

export const IconHeart = make('IconHeart', (filled) => (
  <path
    fill={f(filled)}
    d="M12 20.6s-7.4-4.5-9.2-9.4C1.5 7.5 3.7 4 7.2 4c2 0 3.7 1 4.8 2.7C13.1 5 14.8 4 16.8 4c3.5 0 5.7 3.5 4.4 7.2-1.8 4.9-9.2 9.4-9.2 9.4z"
  />
))

export const IconX = make('IconX', () => <path d="M5.5 5.5l13 13M18.5 5.5l-13 13" />)

export const IconStar = make('IconStar', (filled) => (
  <path
    fill={f(filled)}
    d="M12 2.8l2.75 5.95 6.45.8-4.75 4.45 1.25 6.4L12 17.25 6.3 20.4l1.25-6.4L2.8 9.55l6.45-.8z"
  />
))

export const IconUndo = make('IconUndo', () => (
  <>
    <path d="M8.5 4.5L3.5 9.5l5 5" />
    <path d="M4 9.5h10.25a5.25 5.25 0 0 1 0 10.5H10" />
  </>
))

export const IconChat = make('IconChat', (filled) => (
  <path
    fill={f(filled)}
    d="M4.5 4.5h15a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H13l-5 4v-4H4.5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"
  />
))

export const IconUser = make('IconUser', (filled) => (
  <>
    <circle cx="12" cy="8" r="4.25" fill={f(filled)} />
    <path fill={f(filled)} d="M3.75 21c0-4.4 3.7-7 8.25-7s8.25 2.6 8.25 7z" />
  </>
))

export const IconLeaf = make('IconLeaf', (filled) => (
  <>
    <path fill={f(filled)} d="M4.6 19.4C3.9 10.9 9.3 4.3 20.2 3.8c.6 10.9-5.9 16.4-15.6 15.6z" />
    <path d="M3 21l1.6-1.6" />
    {!filled && <path d="M4.6 19.4L13.5 10.5" />}
  </>
))

export const IconSettings = make('IconSettings', (filled) => (
  <>
    <path fill={f(filled)} d={GEAR} />
    <circle cx="12" cy="12" r="2.75" fill={filled ? 'var(--icon-hole, var(--c-paper-hi))' : 'none'} />
  </>
))

export const IconCamera = make('IconCamera', (filled) => (
  <>
    <path
      fill={f(filled)}
      d="M4.5 7.25H7l1.75-2.75h6.5L17 7.25h2.5a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9.25a2 2 0 0 1 2-2z"
    />
    <circle cx="12" cy="13.25" r="3.25" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
  </>
))

export const IconSliders = make('IconSliders', () => (
  <>
    <path d="M3 6.5h8.5M17.5 6.5H21M3 17.5h3.5M12.5 17.5H21" />
    <circle cx="14.5" cy="6.5" r="2.75" />
    <circle cx="9.5" cy="17.5" r="2.75" />
  </>
))

export const IconSend = make('IconSend', (filled) => (
  <>
    <path fill={f(filled)} d="M21 3L3.25 9.75l7 4 4 7z" />
    <path d="M21 3L10.25 13.75" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
  </>
))

export const IconArrowLeft = make('IconArrowLeft', () => <path d="M20 12H4.5M10.5 5.5L4 12l6.5 6.5" />)
export const IconArrowRight = make('IconArrowRight', () => <path d="M4 12h15.5M13.5 5.5L20 12l-6.5 6.5" />)
export const IconChevronLeft = make('IconChevronLeft', () => <path d="M15 5l-7 7 7 7" />)
export const IconChevronRight = make('IconChevronRight', () => <path d="M9 5l7 7-7 7" />)
export const IconChevronDown = make('IconChevronDown', () => <path d="M5 9l7 7 7-7" />)
export const IconChevronUp = make('IconChevronUp', () => <path d="M5 15l7-7 7 7" />)

export const IconMore = make('IconMore', () => (
  <>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </>
))

export const IconCheck = make('IconCheck', () => <path d="M4.5 12.75l5 5L19.5 6.5" />)

export const IconEye = make('IconEye', () => (
  <>
    <path d="M2.25 12S5.75 5.5 12 5.5 21.75 12 21.75 12 18.25 18.5 12 18.5 2.25 12 2.25 12z" />
    <circle cx="12" cy="12" r="2.75" />
  </>
))

export const IconEyeOff = make('IconEyeOff', () => (
  <>
    <path d="M9.4 5.9A9.3 9.3 0 0 1 12 5.5c6.25 0 9.75 6.5 9.75 6.5a17 17 0 0 1-2.6 3.4M14.5 18.1a9.3 9.3 0 0 1-2.5.4C5.75 18.5 2.25 12 2.25 12a17 17 0 0 1 4-4.6" />
    <path d="M3.5 3.5l17 17" />
  </>
))

export const IconBolt = make('IconBolt', (filled) => (
  <path fill={f(filled)} d="M13.75 2.5L4.5 13.75h6.25l-1 7.75 9.75-11.75h-6.5z" />
))

export const IconPin = make('IconPin', (filled) => (
  <>
    <path fill={f(filled)} d="M12 21.5s-7.25-6-7.25-11.5a7.25 7.25 0 0 1 14.5 0c0 5.5-7.25 11.5-7.25 11.5z" />
    <circle cx="12" cy="10" r="2.5" fill={filled ? 'var(--icon-hole, var(--c-paper-hi))' : 'none'} stroke={filled ? 'none' : undefined} />
  </>
))

export const IconLogout = make('IconLogout', () => (
  <>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
    <path d="M15.5 7.5L20 12l-4.5 4.5M20 12H9.5" />
  </>
))

export const IconMail = make('IconMail', (filled) => (
  <>
    <rect x="2.75" y="5" width="18.5" height="14" rx="2" fill={f(filled)} />
    <path d="M3.5 7.25l8.5 6.25 8.5-6.25" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
  </>
))

export const IconLock = make('IconLock', (filled) => (
  <>
    <rect x="4.5" y="10.25" width="15" height="11" rx="2" fill={f(filled)} />
    <path d="M8 10V7.25a4 4 0 0 1 8 0V10" />
    <path d="M12 14.75v2" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
  </>
))

/** GitHub mark (solid). */
export const IconGithub = make('IconGithub', () => (
  <path
    fill="currentColor"
    stroke="none"
    d="M12 .7C5.65.7.5 5.85.5 12.2c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.25.8-.55v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.55a11.5 11.5 0 0 0 7.9-10.9C23.5 5.85 18.35.7 12 .7z"
  />
))

export const IconTrash = make('IconTrash', () => (
  <>
    <path d="M3.75 6.75h16.5M9 6.5V4h6v2.5" />
    <path d="M5.75 7l1 13.25h10.5l1-13.25M10 11v5.5M14 11v5.5" />
  </>
))

export const IconPlus = make('IconPlus', () => <path d="M12 4.5v15M4.5 12h15" />)
export const IconMinus = make('IconMinus', () => <path d="M4.5 12h15" />)

export const IconInfo = make('IconInfo', () => (
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 11.25v5.5" />
    <circle cx="12" cy="7.6" r="0.9" fill="currentColor" />
  </>
))

export const IconWarning = make('IconWarning', () => (
  <>
    <path d="M12 3.25L22 20.25H2z" />
    <path d="M12 9.75v4.5" />
    <circle cx="12" cy="17.25" r="0.8" fill="currentColor" />
  </>
))

export const IconSearch = make('IconSearch', () => (
  <>
    <circle cx="10.5" cy="10.5" r="6.75" />
    <path d="M15.5 15.5L21 21" />
  </>
))

export const IconBell = make('IconBell', (filled) => (
  <>
    <path fill={f(filled)} d="M5.75 16.25V11a6.25 6.25 0 0 1 12.5 0v5.25l2 2.5H3.75z" />
    <path d="M10 21.75h4" />
  </>
))

export const IconShield = make('IconShield', (filled) => (
  <path fill={f(filled)} d="M12 2.5l8.25 3v6.25c0 5-3.6 8.5-8.25 10-4.65-1.5-8.25-5-8.25-10V5.5z" />
))

export const IconBlock = make('IconBlock', () => (
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M5.5 5.5l13 13" />
  </>
))

export const IconPencil = make('IconPencil', () => (
  <>
    <path d="M4 20l1-4.5L16.25 4.25a1.75 1.75 0 0 1 2.5 0l1 1a1.75 1.75 0 0 1 0 2.5L8.5 19z" />
    <path d="M14 6.5l3.5 3.5" />
  </>
))

export const IconFlame = make('IconFlame', (filled) => (
  <path
    fill={f(filled)}
    d="M12 2.5c.5 3.5 5.75 6 5.75 11.75a5.75 5.75 0 0 1-11.5 0c0-2 .75-3.5 2-4.75.25 1.5 1 2.5 2 3 .25-3.5-.5-6.5 1.75-10z"
  />
))

export const IconImage = make('IconImage', () => (
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.75" cy="9.25" r="1.75" />
    <path d="M3.5 17.5l5.5-5 4 3.5 3-2.5 4.5 4" />
  </>
))

export const IconClock = make('IconClock', () => (
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 6.75V12l3.5 2.25" />
  </>
))

export const IconCalendar = make('IconCalendar', (filled) => (
  <>
    <rect x="3.25" y="5" width="17.5" height="15.75" rx="2.5" fill={f(filled)} />
    <path d="M3.25 10h17.5" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
    <path d="M8 2.75v4.5M16 2.75v4.5" />
    {filled ? null : <circle cx="8.5" cy="15" r="1.25" fill="currentColor" stroke="none" />}
  </>
))

export const IconRefresh = make('IconRefresh', () => (
  <>
    <path d="M20 12a8 8 0 0 1-14.25 5M4 12a8 8 0 0 1 14.25-5" />
    <path d="M18.5 3v4.25h-4.25M5.5 21v-4.25h4.25" />
  </>
))

/** A chawan (matcha bowl) with steam. */
export const IconCup = make('IconCup', (filled) => (
  <>
    <path fill={f(filled)} d="M3 11h18c0 5.5-3.5 9.5-9 9.5S3 16.5 3 11z" />
    <path d="M8.5 7.5c-1-1.25 1-2 0-3.5M12.5 7.5c-1-1.25 1-2 0-3.5M16.5 7.5c-1-1.25 1-2 0-3.5" />
  </>
))

export const IconGlobe = make('IconGlobe', () => (
  <>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.75 12h18.5M12 2.5c3 3 3.75 6 3.75 9.5S15 18.5 12 21.5c-3-3-3.75-6-3.75-9.5S9 5.5 12 2.5z" />
  </>
))

export const IconFlag = make('IconFlag', (filled) => (
  <>
    <path fill={f(filled)} d="M5 4h13.5l-3 4.5 3 4.5H5z" />
    <path d="M5 3v18.5" />
  </>
))

export const IconExternal = make('IconExternal', () => (
  <>
    <path d="M13.5 4.5h6v6M19.5 4.5L11 13" />
    <path d="M17.5 14v4.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H10" />
  </>
))

export const IconSparkle = make('IconSparkle', (filled) => (
  <path
    fill={f(filled)}
    d="M12 2.5c.75 5.25 4.25 8.75 9.5 9.5-5.25.75-8.75 4.25-9.5 9.5-.75-5.25-4.25-8.75-9.5-9.5 5.25-.75 8.75-4.25 9.5-9.5z"
  />
))

export const IconTicket = make('IconTicket', (filled) => (
  <>
    <path
      fill={f(filled)}
      d="M3 6.5h18v3.75a1.75 1.75 0 0 0 0 3.5v3.75H3v-3.75a1.75 1.75 0 0 0 0-3.5z"
    />
    <path d="M14.5 7v1.5M14.5 11.25v1.5M14.5 15.5V17" stroke={filled ? 'var(--icon-hole, var(--c-paper-hi))' : undefined} />
  </>
))

export const IconCards = make('IconCards', (filled) => (
  <>
    <rect x="7" y="3" width="12" height="16" rx="2" transform="rotate(8 13 11)" />
    <rect x="4.5" y="5" width="12" height="16" rx="2" fill={filled ? 'currentColor' : 'var(--icon-back, none)'} />
  </>
))

/**
 * The four process quadrants (cyan, magenta, yellow, black positions) of a disc of radius `r` around (12, 12),
 * in the kit's drums: blue top-left, strawberry top-right, yolk bottom-left, ink-2 bottom-right. Each one can
 * be swapped from CSS: `--reg-c`, `--reg-m`, `--reg-y`, `--reg-k`.
 */
function regQuadrants(r: number): ReactNode {
  const arc = `A${r} ${r} 0 0 0`
  return (
    <>
      <path d={`M12 12V${12 - r}${arc} ${12 - r} 12z`} fill="var(--reg-c, var(--c-blue))" stroke="none" />
      <path d={`M12 12H${12 + r}${arc} 12 ${12 - r}z`} fill="var(--reg-m, var(--c-strawberry))" stroke="none" />
      <path d={`M12 12H${12 - r}${arc} 12 ${12 + r}z`} fill="var(--reg-y, var(--c-yolk))" stroke="none" />
      <path d={`M12 12V${12 + r}${arc} ${12 + r} 12z`} fill="var(--reg-k, var(--c-ink-2))" stroke="none" />
    </>
  )
}

/**
 * A registration mark: ring, crosshair and centre dot in currentColor (`public/emptycross.svg`). `filled` is
 * the colour version (`public/stylizedcross.svg`): the four process quadrants print blue, strawberry, yolk
 * and ink-2. The app uses it, empty, for "info" and for Discover.
 */
export const IconRegMark = make('IconRegMark', (filled) => (
  <>
    {filled && regQuadrants(7)}
    <circle cx="12" cy="12" r="7" />
    <path d="M2 12h20M12 2v20" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </>
))

/** Every icon by name, for the styleguide and for data-driven use. */
export const ICONS = {
  heart: IconHeart,
  x: IconX,
  star: IconStar,
  undo: IconUndo,
  chat: IconChat,
  user: IconUser,
  leaf: IconLeaf,
  settings: IconSettings,
  camera: IconCamera,
  sliders: IconSliders,
  send: IconSend,
  arrowLeft: IconArrowLeft,
  arrowRight: IconArrowRight,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  chevronDown: IconChevronDown,
  chevronUp: IconChevronUp,
  more: IconMore,
  check: IconCheck,
  eye: IconEye,
  eyeOff: IconEyeOff,
  bolt: IconBolt,
  pin: IconPin,
  logout: IconLogout,
  mail: IconMail,
  lock: IconLock,
  github: IconGithub,
  trash: IconTrash,
  plus: IconPlus,
  minus: IconMinus,
  info: IconInfo,
  warning: IconWarning,
  search: IconSearch,
  bell: IconBell,
  shield: IconShield,
  block: IconBlock,
  pencil: IconPencil,
  flame: IconFlame,
  image: IconImage,
  clock: IconClock,
  calendar: IconCalendar,
  refresh: IconRefresh,
  cup: IconCup,
  globe: IconGlobe,
  flag: IconFlag,
  external: IconExternal,
  sparkle: IconSparkle,
  ticket: IconTicket,
  cards: IconCards,
  regMark: IconRegMark,
} as const satisfies Record<string, IconComponent>

export type IconName = keyof typeof ICONS
