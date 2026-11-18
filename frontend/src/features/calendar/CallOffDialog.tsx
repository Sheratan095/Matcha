/** Asks before a date is called off (or, when they declined it, removed from your calendar). */
import { useState } from 'react'
import type { ApiError, PlannedDate } from '@/api/types'
import { Button, FormError, Modal, Stack, Text } from '@/ui'
import { actions, toApiError } from '@/wb'
import { answered } from './moves'
import { nameOf } from './schedule'

export function CallOffDialog({ date, onClose }: { date: PlannedDate | null; onClose: () => void }) {
  // Keep the last date on screen while the dialog plays its exit.
  const [shown, setShown] = useState<PlannedDate | null>(date)
  if (date && date !== shown) setShown(date)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [wasOpen, setWasOpen] = useState(date !== null)
  if ((date !== null) !== wasOpen) {
    setWasOpen(date !== null)
    if (date) setError(null)
  }

  const name = shown ? nameOf(shown) : 'them'
  const declined = shown?.status === 'declined'
  const close = () => {
    if (!busy) onClose()
  }
  const confirm = () => {
    if (!shown || busy) return
    setBusy(true)
    setError(null)
    actions.answerDate(shown.id, 'cancel').then(
      () => {
        setBusy(false)
        answered(shown, 'cancel')
        onClose()
      },
      (failure: unknown) => {
        setBusy(false)
        setError(toApiError(failure))
      },
    )
  }

  return (
    <Modal
      open={date !== null}
      onClose={close}
      dismissible={!busy}
      size="sm"
      kicker="Calendar"
      title={declined ? 'Remove this date?' : `Call off the date with ${name}?`}
      footer={
        <>
          <Button variant="paper" onClick={close} disabled={busy}>
            Keep it
          </Button>
          <Button variant="strawberry" loading={busy} onClick={confirm}>
            {declined ? 'Remove' : 'Call off'}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Text>
          {declined
            ? `${name} said no to “${shown?.title ?? ''}”. It leaves your calendar.`
            : `“${shown?.title ?? ''}” leaves both calendars, and ${name} is told. This can’t be undone.`}
        </Text>
        <FormError error={error} title="Could not call it off" />
      </Stack>
    </Modal>
  )
}
