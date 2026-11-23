import { useId } from 'react'
import type { CSSProperties } from 'react'

export type FlagCountry = 'gb' | 'fr' | 'es'

export interface FlagProps {
  country: FlagCountry
  /** Height in px (the flag is 3:2). Default 20. */
  size?: number
  className?: string
  style?: CSSProperties
}

const BLUE = 'var(--c-blue)'
const RED = 'var(--c-strawberry-deep)'
const WHITE = 'var(--c-paper-hi)'
const YELLOW = 'var(--c-yolk)'

/**
 * A small flag with the house keyline, printed in the kit's inks. Inline SVG, because emoji flags do not
 * render on Windows. Decorative: the name of the language is printed next to it.
 * `gb` stands for English, `fr` for French and `es` for Spanish in the language picker.
 */
export function Flag({ country, size = 20, className, style }: FlagProps) {
  // useId() yields characters that are not valid in a url(#…) reference
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'block', flex: 'none', ...style }}
      viewBox="0 0 60 40"
      width={size * 1.5}
      height={size}
    >
      {country === 'fr' ? (
        <>
          <rect width="20" height="40" fill={BLUE} />
          <rect x="20" width="20" height="40" fill={WHITE} />
          <rect x="40" width="20" height="40" fill={RED} />
        </>
      ) : country === 'es' ? (
        <>
          <rect width="60" height="40" fill={RED} />
          <rect y="10" width="60" height="20" fill={YELLOW} />
        </>
      ) : (
        <>
          <defs>
            <clipPath id={`${id}-s`}>
              <path d="M0,0 v30 h60 v-30 z" />
            </clipPath>
            <clipPath id={`${id}-t`}>
              <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
            </clipPath>
          </defs>
          {/* the Union Jack is drawn on a 60×30 grid and stretched to the 3:2 of the other two */}
          <g transform="scale(1 1.3333)" clipPath={`url(#${id}-s)`}>
            <path d="M0,0 v30 h60 v-30 z" fill={BLUE} />
            <path d="M0,0 L60,30 M60,0 L0,30" stroke={WHITE} strokeWidth="6" />
            <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}-t)`} stroke={RED} strokeWidth="4" />
            <path d="M30,0 v30 M0,15 h60" stroke={WHITE} strokeWidth="10" />
            <path d="M30,0 v30 M0,15 h60" stroke={RED} strokeWidth="6" />
          </g>
        </>
      )}
      <rect width="60" height="40" fill="none" stroke="var(--c-ink)" strokeWidth="5" />
    </svg>
  )
}
