/**
 * The sheet that invites a connection on a date: who (fixed when it is opened from their conversation),
 * a title, the day and the times, and optionally a few words and a place to meet. One invite per send
 * (`actions.planDate`); the other side is told over the socket and answers from their calendar.
 */
import { lazy, Suspense, useId, useState, type FormEvent } from 'react'
import { MAX_EVENT_DESCRIPTION_LENGTH, MAX_EVENT_TITLE_LENGTH, type ApiError, type UserSummary } from '@/api/types'
import { useNow } from '@/features/chat/hooks'
import { useT } from '@/i18n'
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
  const t = useT()
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
  const name = chosen?.username.trim() || t('chat.yourMatchLower')
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
    if (!draft.inviteeId) found.inviteeId = t('check.datePickWho')
    if (!draft.title.trim()) found.title = t('check.dateTitle')
    if (!slot) found.when = t('check.datePickTime')
    else if (!isAhead(slot.startsAt)) found.when = t('cal.pickAhead')
    if (draft.withPlace && !draft.place) found.place = t('cal.pinPlace')
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
            title: t('cal.inviteSent', { name }),
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
      kicker={t('cal.title')}
      title={chosen ? t('cal.dateWithName', { name }) : t('chat.planDate')}
      footer={
        nobody ? (
          <Button variant="paper" onClick={close}>
            {t('kit.close')}
          </Button>
        ) : (
          <>
            <Button variant="paper" onClick={close} disabled={busy}>
              {t('kit.cancel')}
            </Button>
            <Button type="submit" form={formId} loading={busy} icon={<IconCalendar size={18} />}>
              {t('cal.sendInvite')}
            </Button>
          </>
        )
      }
    >
      {nobody ? (
        <Stack gap={4}>
          <Text>{t('cal.nobody')}</Text>
          <ButtonLink to="/discover" variant="ink" icon={<IconRegMark size={20} />}>
            {t('cal.goDiscover')}
          </ButtonLink>
        </Stack>
      ) : (
        <form id={formId} onSubmit={submit} noValidate>
          <Stack gap={4}>
            {invitee ? (
              <p className={s.with}>
                <Avatar src={invitee.profilePictureUrl} name={name} size="sm" decorative />
                <span>{t.rich('cal.withName', { name: <strong>{name}</strong> })}</span>
              </p>
            ) : (
              <Select
                label={t('cal.with')}
                placeholder={connections == null ? t('cal.loadingMatches') : t('cal.pickMatch')}
                options={people.map((person) => ({ value: person.userId, label: person.username || t('chat.yourMatch') }))}
                value={draft.inviteeId}
                onChange={(event) => set('inviteeId', event.currentTarget.value)}
                error={errors.inviteeId}
                disabled={busy}
              />
            )}

            <TextField
              label={t('cal.fieldTitle')}
              value={draft.title}
              onChange={(event) => set('title', event.currentTarget.value)}
              placeholder={t('cal.titlePlaceholder')}
              maxLength={MAX_EVENT_TITLE_LENGTH}
              autoComplete="off"
              error={errors.title}
              disabled={busy}
            />

            <div className={s.when}>
              <TextField
                label={t('cal.fieldDay')}
                type="date"
                value={draft.day}
                min={dayInput(now)}
                onChange={(event) => set('day', event.currentTarget.value)}
                error={errors.when}
                fieldClassName={s.day}
                disabled={busy}
              />
              <TextField
                label={t('cal.fieldFrom')}
                type="time"
                value={draft.start}
                onChange={(event) => set('start', event.currentTarget.value)}
                disabled={busy}
              />
              <TextField
                label={t('cal.fieldUntil')}
                type="time"
                value={draft.end}
                onChange={(event) => set('end', event.currentTarget.value)}
                hint={slot?.overnight ? t('cal.nextDay') : undefined}
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
              label={t('cal.fewWords')}
              hint={t('cal.optional')}
              value={draft.description}
              onChange={(event) => set('description', event.currentTarget.value)}
              placeholder={t('cal.wordsPlaceholder')}
              maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
              rows={3}
              disabled={busy}
            />

            <Switch
              checked={draft.withPlace}
              onChange={(event) => set('withPlace', event.currentTarget.checked)}
              description={t('cal.addPlaceHint')}
              disabled={busy}
            >
              {t('cal.addPlace')}
            </Switch>
            {draft.withPlace ? (
              <Suspense fallback={<Loader>{t('cal.unfolding')}</Loader>}>
                <LocationPicker value={draft.place} onChange={(spot) => set('place', spot)} center={center} error={errors.place} />
              </Suspense>
            ) : null}

            <FormError error={failure} title={t('cal.notSent')} />
          </Stack>
        </form>
      )}
    </Modal>
  )
}
