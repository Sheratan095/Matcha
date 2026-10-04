import { useRef, useState } from 'react'
import type { ApiError, Profile, UserPicture } from '@/api/types'
import { MAX_PICTURE_BYTES, MAX_USER_PICTURES, PICTURE_MIME_TYPES } from '@/api/types'
import { Button, IconStar, IconTrash, Modal, Notice, PhotoFrame, PhotoTile, Text } from '@/ui'
import { actions, toApiError } from '@/wb'
import { describe } from './errors'
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

/** The same checks the backend makes, before anything is sent. */
function checkFile(file: File, count: number): Problem | null {
  if (count >= MAX_USER_PICTURES) {
    return { title: `You already have ${MAX_USER_PICTURES} photos`, message: 'Remove one to make room for another.' }
  }
  if (!PICTURE_MIME_TYPES.includes(file.type)) {
    return {
      title: 'That file type isn’t supported',
      message: `“${file.name}” is not a JPEG, PNG or WEBP image. Pick one of those.`,
    }
  }
  if (file.size > MAX_PICTURE_BYTES) {
    return {
      title: 'That photo is too large',
      message: `“${file.name}” weighs ${megabytes(file.size)} MB; the limit is 5 MB.`,
    }
  }
  return null
}

function problemFrom(error: ApiError, action: string): Problem {
  if (error.status === 413) return { title: 'That photo is too large', message: 'The limit is 5 MB.' }
  return { title: `Could not ${action}`, message: describe(error) }
}

export interface PhotoManagerProps {
  profile: Profile
  /** Name of the grid for assistive tech. */
  label?: string
}

/**
 * Five photo slots: upload (checked for type, size and count first), remove with a confirmation, and
 * choose the main photo. Tolerates a profile without a main photo by offering to pick one.
 */
export function PhotoManager({ profile, label = 'Your photos' }: PhotoManagerProps) {
  const pictures = profile.pictures
  const [busy, setBusy] = useState<Busy>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [pending, setPending] = useState<UserPicture | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
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

  const upload = async (file: File) => {
    const local = checkFile(file, pictures.length)
    if (local) {
      setProblem(local)
      return
    }
    setProblem(null)
    setBusy({ kind: 'upload' })
    try {
      const result = await actions.uploadPicture(file)
      setAnnouncement(`Photo ${pad(result.pictures.length)} added.`)
      focusLater(result.pictures.length < MAX_USER_PICTURES ? 'input[type="file"]:not(:disabled)' : `li:nth-child(${result.pictures.length}) button`)
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'add the photo'))
    } finally {
      setBusy(null)
    }
  }

  const makeMain = async (picture: UserPicture) => {
    setProblem(null)
    setBusy({ kind: 'main', id: picture.id })
    try {
      await actions.setMainPicture(picture.id)
      setAnnouncement(`Photo ${pad(numberOf(picture.id))} is now your main photo.`)
      focusLater(`[data-picture="${picture.id}"] button`)
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'change the main photo'))
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
      setAnnouncement(`Photo ${pad(number)} removed.`)
      focusLater('input[type="file"]:not(:disabled)')
    } catch (failure) {
      setProblem(problemFrom(toApiError(failure), 'remove the photo'))
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
          title="No main photo"
          action={
            <Button size="sm" variant="ink" icon={<IconStar size={16} filled />} disabled={working} onClick={() => makeMain(pictures[0])}>
              Use photo 01
            </Button>
          }
        >
          Your card shows a poster until you choose one. Press the star on the photo you want people to see first.
        </Notice>
      ) : null}

      <ul ref={gridRef} className={s.grid} aria-label={label}>
        {Array.from({ length: MAX_USER_PICTURES }, (_, i) => {
          const picture = pictures[i]
          if (picture) {
            const isBusy = busy !== null && busy.kind !== 'upload' && busy.id === picture.id
            return (
              <li key={picture.id} data-picture={picture.id}>
                <PhotoTile
                  index={i + 1}
                  src={picture.url}
                  alt={`Photo ${pad(i + 1)}${picture.isProfile ? ', your main photo' : ''}`}
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
                label={active ? (pictures.length === 0 ? 'Add a photo' : 'Add photo') : 'Empty'}
                busy={active && busy?.kind === 'upload'}
                disabled={!active || working}
                onPick={upload}
              />
            </li>
          )
        })}
        <li className={s.rules} data-surface="ink">
          <span className={s.rulesHead}>Rules</span>
          <span className={s.rule}>JPEG, PNG, WEBP</span>
          <span className={s.rule}>5 MB max</span>
          <span className={s.ruleStar}>
            <IconStar size={13} filled /> = main
          </span>
        </li>
      </ul>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Remove photo ${pad(pendingNumber)}?`}
        kicker="Photos"
        size="sm"
        initialFocus={keepRef}
        footer={
          <>
            <Button ref={keepRef} variant="paper" onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
            <Button variant="strawberry" icon={<IconTrash size={18} />} onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        <div className={s.confirm}>
          {pending ? <PhotoFrame src={pending.url} alt="" radius="md" shadow={2} tilt={-3} className={s.confirmThumb} /> : null}
          <Text>
            {pending?.isProfile
              ? 'This is your main photo. Once it’s gone, choose another one with the star.'
              : 'It leaves your card straight away. You can always upload it again.'}
          </Text>
        </div>
      </Modal>
    </div>
  )
}
