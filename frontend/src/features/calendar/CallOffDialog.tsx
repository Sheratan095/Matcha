/** Asks before a date is called off (or, when they declined it, removed from your calendar). */
import { useState } from 'react'
import type { ApiError, PlannedDate } from '@/api/types'
import { useT } from '@/i18n'
import { Button, FormError, Modal, Stack, Text } from '@/ui'
import { actions, toApiError } from '@/wb'
import { answered } from './moves'
import { nameOf } from './schedule'

export function CallOffDialog({ date, onClose }: { date: PlannedDate | null; onClose: () => void }) {
  const t = useT()
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

  const name = shown ? nameOf(shown) : t('cal.them')
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
      kicker={t('cal.title')}
      title={declined ? t('cal.removeTitle') : t('cal.callOffTitle', { name })}
      footer={
        <>
          <Button variant="paper" onClick={close} disabled={busy}>
            {t('cal.keepIt')}
          </Button>
          <Button variant="strawberry" loading={busy} onClick={confirm}>
            {declined ? t('chat.remove') : t('chat.callOff')}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Text>
          {declined
            ? t('cal.declinedBody', { name, title: shown?.title ?? '' })
            : t('cal.callOffBody', { name, title: shown?.title ?? '' })}
        </Text>
        <FormError error={error} title={t('cal.couldNotCallOff')} />
      </Stack>
    </Modal>
  )
}
