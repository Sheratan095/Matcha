import { useId } from 'react'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IconCheck } from '../icons'
import type { Tone } from '../tones'
import { Field } from './Field'
import type { FieldMessages } from './Field'
import s from './Choice.module.css'

// ------------------------------------------------------------------ Segmented

export interface SegmentedOption<V extends string> {
  value: V
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export interface SegmentedProps<V extends string> extends Omit<FieldMessages, 'aside'> {
  options: readonly SegmentedOption<V>[]
  value: V | null
  onChange: (value: V) => void
  /** Radio group name. Generated when omitted. */
  name?: string
  /** Colour of the chosen chip. Default matcha. */
  tone?: Tone
  size?: 'md' | 'lg'
  /** Chips share the row equally (otherwise they wrap at their natural width). */
  block?: boolean
  /** Stack the chips in one column of big targets (onboarding choices). */
  stacked?: boolean
  disabled?: boolean
  className?: string
}

/**
 * Single-choice chips (a radio group). The chosen chip stays pressed into the page.
 * Use for gender, preference, sort order: 2 to 5 short options.
 */
export function Segmented<V extends string>({
  label,
  hideLabel,
  hint,
  error,
  options,
  value,
  onChange,
  name,
  tone = 'matcha',
  size = 'md',
  block,
  stacked,
  disabled,
  className,
}: SegmentedProps<V>) {
  const auto = useId()
  const group = name ?? auto
  const labelId = `${auto}-label`
  const hintId = `${auto}-hint`
  const errorId = `${auto}-error`
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      labelId={labelId}
      hintId={hintId}
      errorId={errorId}
      className={className}
    >
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        aria-invalid={error ? true : undefined}
        className={cx(s.segmented, s[`seg-${size}`], block && s.segBlock, stacked && s.segStacked)}
      >
        {options.map((o) => (
          <label key={o.value} className={s.chip} data-tone={tone}>
            <input
              type="radio"
              className={s.native}
              name={group}
              value={o.value}
              checked={value === o.value}
              disabled={disabled || o.disabled}
              onChange={() => onChange(o.value)}
            />
            <span className={s.chipFace}>
              {o.icon ? <span className={s.chipIcon}>{o.icon}</span> : null}
              <span>{o.label}</span>
            </span>
          </label>
        ))}
      </div>
    </Field>
  )
}

// ------------------------------------------------------------------ Checkbox

export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'children'> {
  /** The label text (can contain links). */
  children: ReactNode
  /** Smaller line under the label. */
  description?: ReactNode
  error?: ReactNode
}

/** A chunky checkbox with its label. */
export function Checkbox({ children, description, error, className, id: idProp, ...rest }: CheckboxProps) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className={cx(s.check, className)}>
      <span className={s.checkControl}>
        <input
          id={id}
          type="checkbox"
          className={s.native}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : description ? `${id}-desc` : undefined}
          {...rest}
        />
        <span className={s.checkBox} aria-hidden="true">
          <IconCheck size={18} strokeWidth={4} />
        </span>
      </span>
      <span className={s.checkText}>
        <label htmlFor={id} className={s.checkLabel}>
          {children}
        </label>
        {description ? (
          <span id={`${id}-desc`} className={s.checkDesc}>
            {description}
          </span>
        ) : null}
        {error ? (
          <span id={`${id}-error`} className={s.checkError} role="alert">
            {error}
          </span>
        ) : null}
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ Switch

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'children' | 'role'> {
  children: ReactNode
  description?: ReactNode
}

/** An on/off switch: a slug that slides in a slot. Label on the left, switch on the right. */
export function Switch({ children, description, className, id: idProp, ...rest }: SwitchProps) {
  const auto = useId()
  const id = idProp ?? auto
  return (
    <div className={cx(s.switch, className)}>
      <span className={s.checkText}>
        <label htmlFor={id} className={s.checkLabel}>
          {children}
        </label>
        {description ? (
          <span id={`${id}-desc`} className={s.checkDesc}>
            {description}
          </span>
        ) : null}
      </span>
      <span className={s.switchControl}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className={s.native}
          aria-describedby={description ? `${id}-desc` : undefined}
          {...rest}
        />
        <span className={s.track} aria-hidden="true">
          <span className={s.onOff}>ON</span>
          <span className={s.thumb} />
        </span>
      </span>
    </div>
  )
}

// ------------------------------------------------------------------ Slider

export interface SliderProps extends Omit<FieldMessages, 'aside'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** How the value prints next to the label. Default: the number. */
  format?: (value: number) => string
  /** Unit printed after the value ("km"). */
  unit?: string
  disabled?: boolean
  id?: string
  name?: string
  className?: string
}

/** A single-value range slider with a big mono read-out. */
export function Slider({
  label,
  hideLabel,
  hint,
  error,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  format,
  unit,
  disabled,
  id: idProp,
  name,
  className,
}: SliderProps) {
  const auto = useId()
  const id = idProp ?? auto
  const frac = max > min ? (value - min) / (max - min) : 0
  const text = format ? format(value) : String(value)
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      htmlFor={id}
      hintId={`${id}-hint`}
      errorId={`${id}-error`}
      className={className}
      aside={
        <output htmlFor={id} className={s.readout}>
          {text}
          {unit ? <small>{unit}</small> : null}
        </output>
      }
    >
      <div className={cx(s.slider, disabled && s.sliderDisabled)} style={{ '--to': frac } as CSSProperties}>
        <span className={s.rail} aria-hidden="true" />
        <input
          id={id}
          name={name}
          type="range"
          className={s.range}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuetext={unit ? `${text} ${unit}` : text}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
      </div>
    </Field>
  )
}

// ------------------------------------------------------------------ DualSlider

export interface DualSliderProps extends Omit<FieldMessages, 'aside'> {
  /** [low, high]. */
  value: readonly [number, number]
  onChange: (value: [number, number]) => void
  min?: number
  max?: number
  step?: number
  /** Smallest allowed distance between the two thumbs. Default 1 step. */
  minGap?: number
  format?: (value: number) => string
  unit?: string
  /** Accessible names of the two thumbs. Default ["Minimum", "Maximum"]. */
  thumbLabels?: readonly [string, string]
  disabled?: boolean
  className?: string
}

/** Two thumbs on one rail (an age range). Each thumb is a real, separately focusable slider. */
export function DualSlider({
  label,
  hideLabel,
  hint,
  error,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  minGap,
  format,
  unit,
  thumbLabels = ['Minimum', 'Maximum'],
  disabled,
  className,
}: DualSliderProps) {
  const id = useId()
  const gap = minGap ?? step
  const [lo, hi] = value
  const span = max - min || 1
  const fmt = (v: number) => (format ? format(v) : String(v))
  const labelId = `${id}-label`
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      labelId={labelId}
      hintId={`${id}-hint`}
      errorId={`${id}-error`}
      className={className}
      aside={
        <output className={s.readout}>
          {fmt(lo)}
          <i aria-hidden="true">–</i>
          <span className="sr-only"> to </span>
          {fmt(hi)}
          {unit ? <small>{unit}</small> : null}
        </output>
      }
    >
      <div
        role="group"
        aria-labelledby={labelId}
        className={cx(s.slider, s.dual, disabled && s.sliderDisabled)}
        style={{ '--from': (lo - min) / span, '--to': (hi - min) / span } as CSSProperties}
      >
        <span className={s.rail} aria-hidden="true" />
        <input
          type="range"
          className={s.range}
          min={min}
          max={max}
          step={step}
          value={lo}
          disabled={disabled}
          aria-label={thumbLabels[0]}
          aria-valuetext={unit ? `${fmt(lo)} ${unit}` : fmt(lo)}
          onChange={(e) => onChange([Math.min(Number(e.currentTarget.value), hi - gap), hi])}
        />
        <input
          type="range"
          className={s.range}
          min={min}
          max={max}
          step={step}
          value={hi}
          disabled={disabled}
          aria-label={thumbLabels[1]}
          aria-valuetext={unit ? `${fmt(hi)} ${unit}` : fmt(hi)}
          onChange={(e) => onChange([lo, Math.max(Number(e.currentTarget.value), lo + gap)])}
        />
      </div>
    </Field>
  )
}
