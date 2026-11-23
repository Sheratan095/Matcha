import { useRef, useState } from 'react'
import type { ApiError, Profile, UserPicture } from '@/api/types'
import { MAX_USER_PICTURES, PICTURE_MIME_TYPES } from '@/api/types'
import { useT, type MessageKey, type Translator } from '@/i18n'
import { Button, IconStar, IconTrash, Modal, Notice, PhotoFrame, PhotoTile, Text } from '@/ui'
import { actions, toApiError } from '@/wb'
import { describe } from './errors'
import { PhotoEditor } from './PhotoEditor'
import { MAX_SOURCE_BYTES } from './photoEdit'
import s from './PhotoManager.module.css'

type Busy = { kind: 'upload' } | { kind: 'delete' | 'main'; id: string } | null

interface Problem {
  title: string
  message?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)
}

/**
 * What is checked before the editor opens. The backend's 5 MB limit applies to what is sent, which the editor
 * resizes, so a picked file may be larger than that (a phone picture often is).
 */
function checkFile(file: File, count: number, t: Translator): Problem | null {
  if (count >= MAX_USER_PICTURES) {
    return { title: t('me.photoFilesMax', { n: MAX_USER_PICTURES }), message: t('me.photoMakeRoom') }
  }
  if (!PICTURE_MIME_TYPES.includes(file.type)) {
    return { title: t('me.photoBadType'), message: t('me.photoBadTypeBody', { name: file.name }) }
  }
  if (file.size > MAX_SOURCE_BYTES) {
    return {
      title: t('me.photoTooLarge'),
      message: t('me.photoTooLargeBody', { name: file.name, size: megabytes(file.size), max: megabytes(MAX_SOURCE_BYTES) }),
    }
  }
  return null
}

function problemFrom(error: ApiError, title: MessageKey, t: Translator): Problem {
  if (error.status === 413) return { title: t('me.photoTooLarge'), message: t('me.photoLimit5') }
  return { title: t(title), message: describe(error) }
}

export interface PhotoManagerProps {
  profile: Profile
  /** Name of the grid for assistive tech. */
  label?: string
}

/**
 * Five photo slots: add (checked for type, size and count, then cropped, filtered and resized in the editor),
 * remove with a confirmation, and choose the main photo. Tolerates a profile without a main photo by offering
 * to pick one.
 */
export function PhotoManager({ profile, label }: PhotoManagerProps) {
  const t = useT()
  const pictures = profile.pictures
  const [busy, setBusy] = useState<Busy>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [pending, setPending] = useState<UserPicture | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // The picture being edited. `id` gives each pick a fresh editor (its edits start over); the editor stays
  // mounted after it closes so that it can play its exit.
  const [editing, setEditing] = useState<{ file: File; id: number } | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const picks = useRef(0)
  const gridRef = useRef<HTMLUListElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  const hasMain = pictures.some((picture) => picture.isProfile)
  const firstEmpty = pictures.length < MAX_USER_PICTURES ? pictures.length : -1
  const numberOf = (id: string) => pictures.findIndex((picture) => picture.id === id) + 1

  /** Focus moves with the photos: the control that had it is often gone after a change. */
  const focusLater = (selector: string) => {
    requestAnimationFrame(() => {
      const grid = gridRef.current
      const target = grid?.querySelector<HTMLElement>(selector) ?? grid?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')
      target?.focus()
    })
  }

  /** A file was chosen: check it, then open it in the editor. Nothing is sent until the editor hands it back. */
  const pick = (file: File) => {
    const local = checkFile(file, pictures.length, t)
    if (local) {
      setProblem(local)
      return
    }
    setProblem(null)
    picks.current += 1
    setEditing({ file, id: picks.current })
    setEditorOpen(true)
  }

  const upload = async (file: File) => {
    setEditorOpen(false)
    setProblem(null)
    setBusy({ kind: 'upload' })
    try {
      const result = await actions.uploadPicture(file)
      setAnnouncement(t('me.photoAdded', { n: pad(result.pictures.length) }))
      focusLater(result.pictures.length < MAX_USER_PICTURES ? 'input[type="file"]:not(:disabled)' : `li:nth-child(${result.pictures.length}) button`)
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'me.couldNotAdd', t))
    } finally {
      setBusy(null)
    }
  }

  const makeMain = async (picture: UserPicture) => {
    setProblem(null)
    setBusy({ kind: 'main', id: picture.id })
    try {
      await actions.setMainPicture(picture.id)
      setAnnouncement(t('me.photoNowMain', { n: pad(numberOf(picture.id)) }))
      focusLater(`[data-picture="${picture.id}"] button`)
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'me.couldNotMain', t))
    } finally {
      setBusy(null)
    }
  }

  const askRemove = (picture: UserPicture) => {
    setPending(picture)
    setConfirmOpen(true)
  }

  const remove = async () => {
    const picture = pending
    setConfirmOpen(false)
    if (!picture) return
    const number = numberOf(picture.id)
    setProblem(null)
    setBusy({ kind: 'delete', id: picture.id })
    try {
      await actions.deletePicture(picture.id)
      setAnnouncement(t('me.photoRemoved', { n: pad(number) }))
      focusLater('input[type="file"]:not(:disabled)')
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'me.couldNotRemove', t))
    } finally {
      setBusy(null)
    }
  }

  const working = busy !== null
  const pendingNumber = pending ? numberOf(pending.id) : 0

  return (
    <div className={s.manager}>
      {problem ? (
        <Notice tone="error" title={problem.title} onDismiss={() => setProblem(null)}>
          {problem.message}
        </Notice>
      ) : null}

      {pictures.length > 0 && !hasMain ? (
        <Notice
          tone="warning"
          title={t('me.noMainTitle')}
          action={
            <Button size="sm" variant="ink" icon={<IconStar size={16} filled />} disabled={working} onClick={() => makeMain(pictures[0])}>
              {t('me.usePhoto', { n: '01' })}
            </Button>
          }
        >
          {t('me.noMainBody')}
        </Notice>
      ) : null}

      <ul ref={gridRef} className={s.grid} aria-label={label ?? t('me.photosLabel')}>
        {Array.from({ length: MAX_USER_PICTURES }, (_, i) => {
          const picture = pictures[i]
          if (picture) {
            const isBusy = busy !== null && busy.kind !== 'upload' && busy.id === picture.id
            return (
              <li key={picture.id} data-picture={picture.id}>
                <PhotoTile
                  index={i + 1}
                  src={picture.url}
                  alt={t(picture.isProfile ? 'me.photoAltMain' : 'me.photoAlt', { n: pad(i + 1) })}
                  main={picture.isProfile}
                  busy={isBusy}
                  disabled={working && !isBusy}
                  onMakeMain={() => makeMain(picture)}
                  onRemove={() => askRemove(picture)}
                />
              </li>
            )
          }
          const active = i === firstEmpty
          return (
            <li key={`empty-${i}`}>
              <PhotoTile
                index={i + 1}
                label={active ? (pictures.length === 0 ? t('me.addAPhoto') : t('kit.addPhoto')) : t('me.empty')}
                busy={active && busy?.kind === 'upload'}
                disabled={!active || working}
                onPick={pick}
              />
            </li>
          )
        })}
        <li className={s.rules} data-surface="ink">
          <span className={s.rulesHead}>{t('me.rules')}</span>
          <span className={s.rule}>{t('me.ruleTypes')}</span>
          <span className={s.rule}>{t('me.ruleSize', { n: megabytes(MAX_SOURCE_BYTES) })}</span>
          <span className={s.ruleStar}>
            <IconStar size={13} filled /> {t('me.ruleStar')}
          </span>
        </li>
      </ul>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {editing ? (
        <PhotoEditor
          key={editing.id}
          file={editing.file}
          open={editorOpen}
          onCancel={() => setEditorOpen(false)}
          onApply={upload}
        />
      ) : null}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('me.removeTitle', { n: pad(pendingNumber) })}
        kicker={t('me.removeKicker')}
        size="sm"
        initialFocus={keepRef}
        footer={
          <>
            <Button ref={keepRef} variant="paper" onClick={() => setConfirmOpen(false)}>
              {t('cal.keepIt')}
            </Button>
            <Button variant="strawberry" icon={<IconTrash size={18} />} onClick={remove}>
              {t('chat.remove')}
            </Button>
          </>
        }
      >
        <div className={s.confirm}>
          {pending ? <PhotoFrame src={pending.url} alt="" radius="md" shadow={2} tilt={-3} className={s.confirmThumb} /> : null}
          <Text>
            {pictures.length === 1
              ? t('me.removeOnly')
              : pending?.isProfile
                ? t('me.removeMain')
                : t('me.removeOther')}
          </Text>
        </div>
      </Modal>
    </div>
  )
}
