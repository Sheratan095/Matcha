/**
 * What the calendar page and a conversation share about one date: how it looks at `now` (the stub's
 * colour and its badge), answering it (accept, decline), and the toast once a move went through.
 */
import { useState } from 'react'
import type { PlannedDate } from '@/api/types'
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
  if (date.status === 'pending' && date.startsAt <= now) return { tone: 'kraft', badge: 'No answer' }
  if (date.endsAt <= now) return { tone: 'kraft', badge: null }
  // only a date both said yes to is happening (a declined one stays declined through its hours)
  if (date.status === 'accepted') return isHappening(date, now) ? { tone: 'strawberry', badge: 'Now' } : { tone: 'matcha', badge: "It's on" }
  if (date.status === 'declined') return { tone: 'ink', badge: 'Declined' }
  return date.mine ? { tone: 'kraft', badge: 'Waiting' } : { tone: 'yolk', badge: 'Invite' }
}

const ANSWERED: Record<DateAnswer, { tone: 'matcha' | 'ink'; title: (name: string) => string }> = {
  accept: { tone: 'matcha', title: (name) => `It's a date with ${name}` },
  decline: { tone: 'ink', title: (name) => `You declined ${name}'s invite` },
  cancel: { tone: 'ink', title: () => 'Date called off' },
}

/** The toast after an answer went through. */
export function answered(date: PlannedDate, answer: DateAnswer): void {
  const { tone, title } = ANSWERED[answer]
  toast.show({ id: `date-${date.id}`, tone, title: title(nameOf(date)), message: date.title })
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
        toast.error(choice === 'accept' ? 'Could not accept' : 'Could not decline', toApiError(error).message)
      },
    )
  }
  return { busy, answer }
}
