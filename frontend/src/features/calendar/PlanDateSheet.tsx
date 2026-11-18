/**
 * The sheet that invites a connection on a date: who (fixed when it is opened from their conversation),
 * a title, the day and the times, and optionally a few words and a place to meet. One invite per send
 * (`actions.planDate`); the other side is told over the socket and answers from their calendar.
 */
import { lazy, Suspense, useId, useState, type FormEvent } from 'react'
import { MAX_EVENT_DESCRIPTION_LENGTH, MAX_EVENT_TITLE_LENGTH, type ApiError, type UserSummary } from '@/api/types'
import { useNow } from '@/features/chat/hooks'
import type { PlacedSpot } from '@/features/location/geo'
import {
  Avatar,
  Button,
  ButtonLink,
  FormError,
  IconCalendar,
  IconRegMark,
  Label,
  Loader,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextArea,
  TextField,
  toast,
} from '@/ui'
import { actions, toApiError, useNodeValue } from '@/wb'
import { dayInput, defaultSlot, longDayLabel, slotFrom, timeRange } from './schedule'
import s from './PlanDateSheet.module.css'

// Leaflet only loads when a place is asked for.
const LocationPicker = lazy(() => import('@/features/location/LocationPicker').then((module) => ({ default: module.LocationPicker })))

interface Draft {
  inviteeId: string
  title: string
  description: string
  /** 'YYYY-MM-DD'. */
  day: string
  /** 'HH:MM'. */
  start: string
  end: string
  withPlace: boolean
  place: PlacedSpot | null
}

type FieldName = 'inviteeId' | 'title' | 'when' | 'place'

/** The error a change of each field clears. */
const FIELD_OF: Partial<Record<keyof Draft, FieldName>> = {
  inviteeId: 'inviteeId',
  title: 'title',
  day: 'when',
  start: 'when',
  end: 'when',
  withPlace: 'place',
  place: 'place',
}

export interface PlanDateSheetProps {
  open: boolean
  onClose: () => void
  /** The connection, when the sheet opens from their conversation; otherwise the user picks one. */
  invitee?: UserSummary | null
}

function freshDraft(invitee: UserSummary | null): Draft {
  return { inviteeId: invitee?.userId ?? '', title: '', description: '', ...defaultSlot(Date.now()), withPlace: false, place: null }
}

/** Still ahead right now (read when the form is sent, not while rendering). */
function isAhead(time: number): boolean {
  return time > Date.now()
}

export function PlanDateSheet({ open, onClose, invitee = null }: PlanDateSheetProps) {
  const formId = useId()
  const connections = useNodeValue('connections')
  const myProfile = useNodeValue('myProfile')
  const now = useNow(60_000)

  const [draft, setDraft] = useState<Draft>(() => freshDraft(invitee))
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [failure, setFailure] = useState<ApiError | null>(null)
  const [busy, setBusy] = useState(false)
  // Every opening starts a new draft (adjusting state while rendering, React's sanctioned pattern).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(freshDraft(invitee))
      setErrors({})
      setFailure(null)
      setBusy(false)
    }
  }

  const people = Array.isArray(connections?.matches) ? connections.matches : []
  const chosen = invitee ?? people.find((person) => person.userId === draft.inviteeId) ?? null
  const name = chosen?.username.trim() || 'your match'
  const nobody = !invitee && connections != null && people.length === 0
  const slot = slotFrom(draft.day, draft.start, draft.end)
  const center =
    myProfile && myProfile.latitude != null && myProfile.longitude != null
      ? { latitude: myProfile.latitude, longitude: myProfile.longitude }
      : null

  const set = <Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    const field = FIELD_OF[key]
    if (field && errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const close = () => {
    if (!busy) onClose()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const found: Partial<Record<FieldName, string>> = {}
    if (!draft.inviteeId) found.inviteeId = 'Pick who the date is with.'
    if (!draft.title.trim()) found.title = 'Give the date a title.'
    if (!slot) found.when = 'Pick a day and a time.'
    else if (!isAhead(slot.startsAt)) found.when = 'Pick a time that is still ahead.'
    if (draft.withPlace && !draft.place) found.place = 'Tap the map to pin the place, or switch it off.'
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length > 0 || !slot) return
    setBusy(true)
    const place = draft.withPlace && draft.place ? { latitude: draft.place.latitude, longitude: draft.place.longitude } : null
    actions
      .planDate({
        inviteeId: draft.inviteeId,
        title: draft.title,
        description: draft.description,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        place,
      })
      .then(
        (planned) => {
          setBusy(false)
          toast.show({
            id: `date-${planned.eventId}`,
            tone: 'matcha',
            title: `Invite sent to ${name}`,
            message: `${longDayLabel(slot.startsAt, Date.now())} · ${timeRange(slot)}`,
            icon: <IconCalendar size={20} />,
          })
          onClose()
        },
        (error: unknown) => {
          setBusy(false)
          setFailure(toApiError(error))
        },
      )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      dismissible={!busy}
      size="md"
      kicker="Calendar"
      title={chosen ? `A date with ${name}` : 'Plan a date'}
      footer={
        nobody ? (
          <Button variant="paper" onClick={close}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="paper" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={busy} icon={<IconCalendar size={18} />}>
              Send invite
            </Button>
          </>
        )
      }
    >
      {nobody ? (
        <Stack gap={4}>
          <Text>Dates are planned with your matches, and you have none yet. Like someone who likes you back first.</Text>
          <ButtonLink to="/discover" variant="ink" icon={<IconRegMark size={20} />}>
            Go to Discover
          </ButtonLink>
        </Stack>
      ) : (
        <form id={formId} onSubmit={submit} noValidate>
          <Stack gap={4}>
            {invitee ? (
              <p className={s.with}>
                <Avatar src={invitee.profilePictureUrl} name={name} size="sm" decorative />
                <span>
                  With <strong>{name}</strong>
                </span>
              </p>
            ) : (
              <Select
                label="With"
                placeholder={connections == null ? 'Loading your matches…' : 'Pick a match'}
                options={people.map((person) => ({ value: person.userId, label: person.username || 'Your match' }))}
                value={draft.inviteeId}
                onChange={(event) => set('inviteeId', event.currentTarget.value)}
                error={errors.inviteeId}
                disabled={busy}
              />
            )}

            <TextField
              label="Title"
              value={draft.title}
              onChange={(event) => set('title', event.currentTarget.value)}
              placeholder="Drinks by the river"
              maxLength={MAX_EVENT_TITLE_LENGTH}
              autoComplete="off"
              error={errors.title}
              disabled={busy}
            />

            <div className={s.when}>
              <TextField
                label="Day"
                type="date"
                value={draft.day}
                min={dayInput(now)}
                onChange={(event) => set('day', event.currentTarget.value)}
                error={errors.when}
                fieldClassName={s.day}
                disabled={busy}
              />
              <TextField
                label="From"
                type="time"
                value={draft.start}
                onChange={(event) => set('start', event.currentTarget.value)}
                disabled={busy}
              />
              <TextField
                label="Until"
                type="time"
                value={draft.end}
                onChange={(event) => set('end', event.currentTarget.value)}
                hint={slot?.overnight ? 'The next day' : undefined}
                disabled={busy}
              />
            </div>
            {slot && !errors.when ? (
              <Label tone="muted" className={s.summary}>
                <span aria-live="polite">
                  {longDayLabel(slot.startsAt, now)} · {timeRange(slot)}
                </span>
              </Label>
            ) : null}

            <TextArea
              label="A few words"
              hint="Optional"
              value={draft.description}
              onChange={(event) => set('description', event.currentTarget.value)}
              placeholder="I know a place with the best matcha in town."
              maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
              rows={3}
              disabled={busy}
            />

            <Switch
              checked={draft.withPlace}
              onChange={(event) => set('withPlace', event.currentTarget.checked)}
              description="Pin where you will meet. They see it on a map."
              disabled={busy}
            >
              Add a place
            </Switch>
            {draft.withPlace ? (
              <Suspense fallback={<Loader>Unfolding the map</Loader>}>
                <LocationPicker value={draft.place} onChange={(spot) => set('place', spot)} center={center} error={errors.place} />
              </Suspense>
            ) : null}

            <FormError error={failure} title="The invite was not sent" />
          </Stack>
        </form>
      )}
    </Modal>
  )
}
