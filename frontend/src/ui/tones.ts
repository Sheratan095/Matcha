/** The colour fields of the kit. See styles/tones.css for what each one resolves to. */
export type Tone = 'ink' | 'paper' | 'kraft' | 'matcha' | 'deep' | 'strawberry' | 'yolk' | 'blue'

export const TONES: readonly Tone[] = [
  'ink',
  'paper',
  'kraft',
  'matcha',
  'deep',
  'strawberry',
  'yolk',
  'blue',
]

/** The raw drum colour of a tone, for ornaments that paint in a single colour. */
export const TONE_COLOR: Record<Tone, string> = {
  ink: 'var(--c-ink)',
  paper: 'var(--c-paper-hi)',
  kraft: 'var(--c-paper-lo)',
  matcha: 'var(--c-matcha)',
  deep: 'var(--c-matcha-deep)',
  strawberry: 'var(--c-strawberry)',
  yolk: 'var(--c-yolk)',
  blue: 'var(--c-blue)',
}
