import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { cx } from '../cx'
import { Chip } from '../display/Chip'
import { IconPlus } from '../icons'
import { Field } from './Field'
import type { FieldMessages } from './Field'
import s from './TagInput.module.css'

export interface TagInputProps extends Omit<FieldMessages, 'aside'> {
  /** Current tags, without the leading '#'. */
  value: readonly string[]
  onChange: (tags: string[]) => void
  /** Catalogue to suggest from. Matching entries appear as tappable chips under the box. */
  suggestions?: readonly string[]
  /** Maximum number of tags. Shows a "03/10" counter. */
  max?: number
  /** Maximum length of one tag. Default 50. */
  maxLength?: number
  /** How many suggestions to show at most. Default 8. */
  suggestionLimit?: number
  placeholder?: string
  /** Cleans typed text into a tag. Default: lowercase, no '#', spaces become dashes. */
  normalize?: (raw: string) => string
  disabled?: boolean
  className?: string
}

function defaultNormalize(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[\s,]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Interests editor: type and press Enter (or comma) to add, Backspace on an empty box removes
 * the last tag, and catalogue suggestions are one tap away.
 */
export function TagInput({
  label,
  hideLabel,
  hint,
  error,
  value,
  onChange,
  suggestions = [],
  max,
  maxLength = 50,
  suggestionLimit = 8,
  placeholder = 'Type and press Enter',
  normalize = defaultNormalize,
  disabled,
  className,
}: TagInputProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('')
  const full = max != null && value.length >= max

  const add = (raw: string) => {
    const tag = normalize(raw).slice(0, maxLength)
    if (!tag) return
    if (value.includes(tag)) {
      setStatus(`${tag} is already added`)
      setDraft('')
      return
    }
    if (full) {
      setStatus(`You can add ${max} at most`)
      return
    }
    onChange([...value, tag])
    setStatus(`${tag} added`)
    setDraft('')
  }

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag))
    setStatus(`${tag} removed`)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      if (draft.trim()) {
        e.preventDefault()
        add(draft)
      } else if (e.key === ',') {
        e.preventDefault()
      }
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      remove(value[value.length - 1])
    }
  }

  const query = normalize(draft)
  const shown = suggestions
    .filter((t) => !value.includes(t) && (query === '' || t.includes(query)))
    .slice(0, suggestionLimit)

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
        max != null ? (
          <span className={cx(s.count, full && s.countFull)}>
            {String(value.length).padStart(2, '0')}/{String(max).padStart(2, '0')}
          </span>
        ) : undefined
      }
    >
      <div
        className={cx(s.box, error ? s.invalid : undefined, disabled && s.disabled)}
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus()
        }}
      >
        {value.map((tag) => (
          <Chip key={tag} tone="matcha" onRemove={() => remove(tag)} removeLabel={`Remove ${tag}`} disabled={disabled}>
            #{tag}
          </Chip>
        ))}
        <input
          ref={inputRef}
          id={id}
          className={s.input}
          value={draft}
          placeholder={full ? 'Full' : placeholder}
          maxLength={maxLength + 1}
          disabled={disabled}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {shown.length > 0 && !disabled ? (
        <div className={s.suggestions} role="group" aria-label="Suggestions">
          {shown.map((tag) => (
            <button key={tag} type="button" className={s.suggestion} disabled={full} onClick={() => add(tag)}>
              <IconPlus size={12} strokeWidth={4} />
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
    </Field>
  )
}
