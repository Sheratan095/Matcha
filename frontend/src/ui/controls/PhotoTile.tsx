import { useId } from 'react'
import type { CSSProperties } from 'react'
import { cx } from '../cx'
import { Spinner } from '../display/Loader'
import { IconCamera, IconStar, IconTrash } from '../icons'
import s from './PhotoTile.module.css'

export interface PhotoTileProps {
  /** The picture in this slot. Empty slot when null / undefined. */
  src?: string | null
  alt?: string
  /** Called with the chosen file (empty slot). The input is reset afterwards. */
  onPick?: (file: File) => void
  /** Shows a remove button on a filled slot. */
  onRemove?: () => void
  /** Shows a "make main" button on a filled slot that is not already the main picture. */
  onMakeMain?: () => void
  /** Marks the profile picture with a MAIN sticker. */
  main?: boolean
  /** Uploading / deleting: covers the tile with a spinner and disables it. */
  busy?: boolean
  disabled?: boolean
  /** Default: jpeg, png, webp. */
  accept?: string
  /** Text of the empty slot. Default "Add photo". */
  label?: string
  /** Slot number, printed in mono in the corner (1-based). */
  index?: number
  /** CSS aspect-ratio. Default "3 / 4". */
  ratio?: string
  className?: string
  style?: CSSProperties
}

/** One slot of the photo grid: an empty "add" tile or a picture with its actions. */
export function PhotoTile({
  src,
  alt = '',
  onPick,
  onRemove,
  onMakeMain,
  main,
  busy,
  disabled,
  accept = 'image/jpeg,image/png,image/webp',
  label = 'Add photo',
  index,
  ratio = '3 / 4',
  className,
  style,
}: PhotoTileProps) {
  const id = useId()
  const number = index != null ? String(index).padStart(2, '0') : null
  const vars = { aspectRatio: ratio, ...style } as CSSProperties

  if (!src) {
    return (
      <label htmlFor={id} className={cx(s.tile, s.empty, disabled && s.off, busy && s.busyTile, className)} style={vars}>
        <input
          id={id}
          type="file"
          className={s.file}
          accept={accept}
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) onPick?.(file)
          }}
        />
        {number ? <span className={s.number}>{number}</span> : null}
        <span className={s.plus}>{busy ? <Spinner size={24} label="Uploading" /> : <IconCamera size={24} />}</span>
        <span className={s.addLabel}>{busy ? 'Uploading' : label}</span>
      </label>
    )
  }

  return (
    <div className={cx(s.tile, s.filled, main && s.isMain, className)} style={vars}>
      <img className={s.img} src={src} alt={alt} draggable={false} />
      {number ? <span className={cx(s.number, s.numberOn)}>{number}</span> : null}
      {main ? <span className={s.main}>Main</span> : null}
      {(onRemove || (onMakeMain && !main)) && (
        <div className={s.actions}>
          {onMakeMain && !main ? (
            <button
              type="button"
              className={cx(s.act, s.actMain)}
              aria-label="Make main photo"
              title="Make main photo"
              disabled={disabled || busy}
              onClick={onMakeMain}
            >
              <IconStar size={18} filled />
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className={cx(s.act, s.actRemove)}
              aria-label="Remove photo"
              title="Remove photo"
              disabled={disabled || busy}
              onClick={onRemove}
            >
              <IconTrash size={18} />
            </button>
          ) : null}
        </div>
      )}
      {busy ? (
        <span className={s.busy}>
          <Spinner size={32} label="Working" />
        </span>
      ) : null}
    </div>
  )
}
