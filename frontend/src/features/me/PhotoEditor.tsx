import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { numberFormat, useT } from '@/i18n'
import { Button, IconButton, IconRotate, Modal, Notice, Segmented, Slider, Spinner } from '@/ui'
import {
  CROPS,
  FILTERS,
  MAX_ZOOM,
  PREVIEW_SIDE,
  SIZES,
  cropRect,
  exportFile,
  focusOf,
  loadSource,
  outputSize,
  paint,
  pan,
  turn,
  turnFocus,
} from './photoEdit'
import type { CropShape, FilterId, Point, SizeId, Source, Turns } from './photoEdit'
import s from './PhotoEditor.module.css'

interface Edit {
  turns: Turns
  crop: CropShape
  zoom: number
  /** Where the crop window is centred, as a fraction of the (turned) picture. */
  focus: Point
  filter: FilterId
  size: SizeId
}

const START: Edit = { turns: 0, crop: 'original', zoom: 1, focus: { x: 0.5, y: 0.5 }, filter: 'none', size: 'large' }

/** An arrow key moves the window by this share of its own size. */
const NUDGE = 0.1

/** What went wrong, kept as a kind so it is worded in the language the page is in when it shows. */
interface Problem {
  kind: 'open' | 'save'
}

export interface PhotoEditorProps {
  /** The picked picture. Mount a fresh editor (a new `key`) for each one: the edits start over. */
  file: File
  open: boolean
  onCancel: () => void
  /** The edited picture, a JPEG ready for `actions.uploadPicture`. */
  onApply: (edited: File) => void
}

/**
 * The step between choosing a photo and uploading it: crop (original, 3:4 as on the cards, or square; drag to
 * place it, zoom, rotate), a filter and a size. The preview is the file that will be sent. Nothing leaves the
 * browser until "Use photo".
 */
export function PhotoEditor({ file, open, onCancel, onApply }: PhotoEditorProps) {
  const t = useT()
  const [base, setBase] = useState<Source | null>(null)
  const [edit, setEdit] = useState<Edit>(START)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null)
  const hintId = useId()

  useEffect(() => {
    let live = true
    loadSource(file).then(
      (source) => {
        if (live) setBase(source)
      },
      () => {
        if (live) setProblem({ kind: 'open' })
      },
    )
    return () => {
      live = false
    }
  }, [file])

  const source = useMemo(() => (base ? turn(base, edit.turns) : null), [base, edit.turns])
  const rect = source ? cropRect(source.width, source.height, edit.crop, edit.zoom, edit.focus) : null
  const sideOf = SIZES.find((option) => option.value === edit.size)?.side ?? SIZES[SIZES.length - 1].side
  const output = rect ? outputSize(rect, sideOf) : null

  // The preview is drawn by the same code as the file. Everything it depends on is spelled out here.
  const { crop, zoom, focus, filter } = edit
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !source) return
    const view = cropRect(source.width, source.height, crop, zoom, focus)
    paint(canvas, source, view, outputSize(view, PREVIEW_SIDE), filter)
  }, [source, crop, zoom, focus, filter])

  const change = (changes: Partial<Edit>) => setEdit((previous) => ({ ...previous, ...changes }))

  const rotate = () =>
    setEdit((previous) => ({ ...previous, turns: ((previous.turns + 1) % 4) as Turns, focus: turnFocus(previous.focus) }))

  const setZoom = (next: number) => {
    if (!source) return
    // the window shrinks or grows around its centre and may have to slide back inside the picture
    setEdit((previous) => ({
      ...previous,
      zoom: next,
      focus: focusOf(cropRect(source.width, source.height, previous.crop, next, previous.focus), source.width, source.height),
    }))
  }

  const move = (dx: number, dy: number) => {
    if (!source) return
    setEdit((previous) => ({
      ...previous,
      focus: pan(source.width, source.height, previous.crop, previous.zoom, previous.focus, dx, dy),
    }))
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!source || event.button > 0) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const grip = drag.current
    const box = canvasRef.current?.getBoundingClientRect()
    if (!grip || grip.pointer !== event.pointerId || !box || !box.width || !box.height) return
    move((event.clientX - grip.x) / box.width, (event.clientY - grip.y) / box.height)
    grip.x = event.clientX
    grip.y = event.clientY
  }

  const onPointerEnd = () => {
    drag.current = null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // an arrow shows more of the picture on that side: the picture itself moves the other way
    const step: Record<string, [number, number]> = {
      ArrowLeft: [NUDGE, 0],
      ArrowRight: [-NUDGE, 0],
      ArrowUp: [0, NUDGE],
      ArrowDown: [0, -NUDGE],
    }
    const found = step[event.key]
    if (!found) return
    event.preventDefault()
    move(found[0], found[1])
  }

  const apply = async () => {
    if (!source || !rect || !output || saving) return
    setSaving(true)
    setProblem(null)
    try {
      onApply(await exportFile(source, rect, output, edit.filter, file.name))
    } catch {
      setProblem({ kind: 'save' })
      setSaving(false)
    }
    // on success the manager closes the editor: the button stays busy until then
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('me.editorTitle')}
      kicker={t('me.removeKicker')}
      size="md"
      footer={
        <>
          <Button variant="paper" onClick={onCancel}>
            {t('kit.cancel')}
          </Button>
          <Button loading={saving} disabled={!source} onClick={apply}>
            {t('me.editorUse')}
          </Button>
        </>
      }
    >
      <div className={s.editor}>
        {problem ? (
          <Notice tone="error" title={problem.kind === 'open' ? t('me.editorCantOpen') : t('me.editorCantSave')}>
            {problem.kind === 'open' ? t('me.editorCantOpenBody', { name: file.name }) : t('me.editorCantSaveBody')}
          </Notice>
        ) : null}

        {source ? (
          <div
            className={s.stage}
            role="group"
            aria-label={t('me.editorPreview')}
            aria-describedby={hintId}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={onKeyDown}
          >
            <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />
          </div>
        ) : problem ? null : (
          <div className={s.stage} aria-busy="true">
            <span className={s.loading}>
              <Spinner size={32} label={t('me.editorOpening')} />
            </span>
          </div>
        )}
        {source ? (
          <div className={s.meta}>
            <IconButton label={t('me.editorRotate')} size="sm" onClick={rotate}>
              <IconRotate size={20} />
            </IconButton>
            <p id={hintId} className={s.hint}>
              {t('me.editorDrag')}
              <span className="sr-only">{t('me.editorDragSr')}</span>
            </p>
            {output ? <span className={s.dims}>{`${output.width} × ${output.height} px`}</span> : null}
          </div>
        ) : null}

        <Segmented
          label={t('me.editorCrop')}
          options={CROPS.map((option) => ({ value: option.value, label: t(option.label) }))}
          value={edit.crop}
          onChange={(value) => change({ crop: value })}
          disabled={!source}
        />

        <Slider
          label={t('me.editorZoom')}
          value={edit.zoom}
          min={1}
          max={MAX_ZOOM}
          step={0.05}
          format={(value) => `${numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}×`}
          disabled={!source}
          onChange={setZoom}
        />

        <Segmented
          label={t('me.editorFilter')}
          options={FILTERS.map((option) => ({ value: option.value, label: t(option.label) }))}
          value={edit.filter}
          onChange={(value) => change({ filter: value })}
          disabled={!source}
        />

        <Segmented
          label={t('me.editorSize')}
          options={SIZES.map((option) => ({ value: option.value, label: t(option.label) }))}
          value={edit.size}
          onChange={(value) => change({ size: value })}
          hint={t('me.editorSizeHint')}
          disabled={!source}
        />
      </div>
    </Modal>
  )
}
