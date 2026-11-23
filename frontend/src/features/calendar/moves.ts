/**
 * What the calendar page and a conversation share about one date: how it looks at `now` (the stub's
 * colour and its badge), answering it (accept, decline), and the toast once a move went through.
 */
import { useState } from 'react'
import type { PlannedDate } from '@/api/types'
import { t, type MessageKey } from '@/i18n'
import { toast, type Tone } from '@/ui'
import { actions, toApiError, type DateAnswer } from '@/wb'
import { isHappening, nameOf } from './schedule'

export interface Look {
  tone: Tone
  badge: string | null
}

/** The stub's colour and the badge of a date. */
export function lookOf(date: PlannedDate, now: number): Look {
  // an invite nobody answered before it started can no longer be answered
  if (date.status === 'pending' && date.startsAt <= now) return { tone: 'kraft', badge: t('cal.badgeNoAnswer') }
  if (date.endsAt <= now) return { tone: 'kraft', badge: null }
  // only a date both said yes to is happening (a declined one stays declined through its hours)
  if (date.status === 'accepted') return isHappening(date, now) ? { tone: 'strawberry', badge: t('time.now') } : { tone: 'matcha', badge: t('cal.badgeOn') }
  if (date.status === 'declined') return { tone: 'ink', badge: t('cal.badgeDeclined') }
  return date.mine ? { tone: 'kraft', badge: t('cal.badgeWaiting') } : { tone: 'yolk', badge: t('cal.badgeInvite') }
}

const ANSWERED: Record<DateAnswer, { tone: 'matcha' | 'ink'; title: MessageKey }> = {
  accept: { tone: 'matcha', title: 'cal.answeredAccept' },
  decline: { tone: 'ink', title: 'cal.answeredDecline' },
  cancel: { tone: 'ink', title: 'cal.answeredCancel' },
}

/** The toast after an answer went through. */
export function answered(date: PlannedDate, answer: DateAnswer): void {
  const { tone, title } = ANSWERED[answer]
  toast.show({ id: `date-${date.id}`, tone, title: t(title, { name: nameOf(date) }), message: date.title })
}

/** Accepting or declining an invite from where it is shown; `busy` is the answer on its way. */
export function useAnswerInvite(date: PlannedDate): { busy: DateAnswer | null; answer: (choice: 'accept' | 'decline') => void } {
  const [busy, setBusy] = useState<DateAnswer | null>(null)
  const answer = (choice: 'accept' | 'decline') => {
    if (busy) return
    setBusy(choice)
    actions.answerDate(date.id, choice).then(
      () => {
        setBusy(null)
        answered(date, choice)
      },
      (error: unknown) => {
        setBusy(null)
        toast.error(choice === 'accept' ? t('cal.couldNotAccept') : t('cal.couldNotDecline'), toApiError(error).message)
      },
    )
  }
  return { busy, answer }
}
