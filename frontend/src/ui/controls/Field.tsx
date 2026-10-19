import { useId, useState } from 'react'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { cx } from '../cx'
import { IconChevronDown, IconEye, IconEyeOff, IconWarning } from '../icons'
import s from './Field.module.css'

// ------------------------------------------------------------------ Field (label + messages)

export interface FieldMessages {
  /** Visible label, set as a mono ticket label above the control. */
  label: ReactNode
  /** Keep the label for assistive tech but hide it visually. */
  hideLabel?: boolean
  /** Helper line under the control. */
  hint?: ReactNode
  /** Error line under the control; also flips the control to its invalid look. */
  error?: ReactNode
  /** Mono note on the right of the label row: "optional", a counter, a link. */
  aside?: ReactNode
}

export interface FieldProps extends FieldMessages {
  /** id of the control the label points at. */
  htmlFor?: string
  /** id given to the hint element (for aria-describedby). */
  hintId?: string
  /** id given to the error element (for aria-describedby). */
  errorId?: string
  /** Render the label as a span (for groups that carry their own aria-labelledby). */
  labelId?: string
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/**
 * The frame around any control: label row, the control, then hint / error.
 * TextField, TextArea, Select, Slider and TagInput already include it; use it directly for custom controls.
 */
export function Field({
  label,
  hideLabel,
  hint,
  error,
  aside,
  htmlFor,
  hintId,
  errorId,
  labelId,
  className,
  style,
  children,
}: FieldProps) {
  const LabelTag = htmlFor ? 'label' : 'span'
  return (
    <div className={cx(s.field, className)} style={style}>
      <div className={cx(s.labelRow, hideLabel && !aside && 'sr-only')}>
        <LabelTag id={labelId} htmlFor={htmlFor} className={cx(s.label, hideLabel && 'sr-only')}>
          {label}
        </LabelTag>
        {aside ? <span className={s.aside}>{aside}</span> : null}
      </div>
      {children}
      {error ? <FieldError id={errorId}>{error}</FieldError> : hint ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
    </div>
  )
}

/** Helper text under a control. */
export function FieldHint({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={s.hint}>
      {children}
    </p>
  )
}

/** Error text under a control (announced politely). */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className={s.error} role="alert">
      <IconWarning size={16} strokeWidth={2.75} />
      <span>{children}</span>
    </p>
  )
}

function useFieldIds(idProp: string | undefined, hint: ReactNode, error: ReactNode) {
  const auto = useId()
  const id = idProp ?? auto
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined
  return { id, hintId, errorId, describedBy }
}

// ------------------------------------------------------------------ TextField

export interface TextFieldProps extends Omit<ComponentProps<'input'>, 'size'>, FieldMessages {
  /** Leading icon inside the box. */
  icon?: ReactNode
  /** Trailing content inside the box (a unit, a button). */
  trailing?: ReactNode
  /** Class for the outer field wrapper (className goes to the input). */
  fieldClassName?: string
}

/** A single-line input. Lifts off the page on focus. */
export function TextField({
  label,
  hideLabel,
  hint,
  error,
  aside,
  icon,
  trailing,
  id: idProp,
  className,
  fieldClassName,
  type = 'text',
  ...rest
}: TextFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error)
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      aside={aside}
      htmlFor={id}
      hintId={hintId}
      errorId={errorId}
      className={fieldClassName}
    >
      <div className={cx(s.box, error ? s.invalid : undefined, rest.disabled && s.disabled)}>
        {icon ? <span className={s.lead}>{icon}</span> : null}
        <input
          id={id}
          type={type}
          className={cx(s.input, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {trailing ? <span className={s.trail}>{trailing}</span> : null}
      </div>
    </Field>
  )
}

// ------------------------------------------------------------------ PasswordField

export type PasswordFieldProps = Omit<TextFieldProps, 'type' | 'trailing'>

/** A password input with a show / hide toggle. */
export function PasswordField(props: PasswordFieldProps) {
  const [shown, setShown] = useState(false)
  return (
    <TextField
      {...props}
      type={shown ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      trailing={
        <button
          type="button"
          className={s.reveal}
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <IconEyeOff size={22} /> : <IconEye size={22} />}
        </button>
      }
    />
  )
}

// ------------------------------------------------------------------ TextArea

export interface TextAreaProps extends ComponentProps<'textarea'>, Omit<FieldMessages, 'aside'> {
  /** Show a "012/500" counter (needs maxLength and a string value or defaultValue). */
  counter?: boolean
  fieldClassName?: string
}

/** A multi-line input with an optional character counter. */
export function TextArea({
  label,
  hideLabel,
  hint,
  error,
  counter = true,
  id: idProp,
  className,
  fieldClassName,
  rows = 4,
  maxLength,
  value,
  defaultValue,
  onChange,
  ...rest
}: TextAreaProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error)
  const [innerLen, setInnerLen] = useState(() => String(defaultValue ?? '').length)
  const length = value != null ? String(value).length : innerLen
  const showCounter = counter && maxLength != null
  const near = maxLength != null && length >= maxLength * 0.9
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      htmlFor={id}
      hintId={hintId}
      errorId={errorId}
      className={fieldClassName}
      aside={
        showCounter ? (
          <span className={cx(s.counter, near && s.counterNear)} aria-live="off">
            {String(length).padStart(3, '0')}/{maxLength}
          </span>
        ) : undefined
      }
    >
      <div className={cx(s.box, s.area, error ? s.invalid : undefined, rest.disabled && s.disabled)}>
        <textarea
          id={id}
          rows={rows}
          maxLength={maxLength}
          value={value}
          defaultValue={defaultValue}
          className={cx(s.input, s.textarea, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setInnerLen(e.currentTarget.value.length)
            onChange?.(e)
          }}
          {...rest}
        />
      </div>
    </Field>
  )
}

// ------------------------------------------------------------------ Select

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'size' | 'children'>, FieldMessages {
  options: readonly SelectOption[]
  /** Text of an empty first option. */
  placeholder?: string
  icon?: ReactNode
  fieldClassName?: string
}

/** A native select in the house box, with a chunky chevron. */
export function Select({
  label,
  hideLabel,
  hint,
  error,
  aside,
  options,
  placeholder,
  icon,
  id: idProp,
  className,
  fieldClassName,
  ...rest
}: SelectProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(idProp, hint, error)
  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      aside={aside}
      htmlFor={id}
      hintId={hintId}
      errorId={errorId}
      className={fieldClassName}
    >
      <div className={cx(s.box, error ? s.invalid : undefined, rest.disabled && s.disabled)}>
        {icon ? <span className={s.lead}>{icon}</span> : null}
        <select
          id={id}
          className={cx(s.input, s.select, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {placeholder != null && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={s.chevron} aria-hidden="true">
          <IconChevronDown size={20} strokeWidth={3} />
        </span>
      </div>
    </Field>
  )
}
