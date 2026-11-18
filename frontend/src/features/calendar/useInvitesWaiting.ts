import { useNow } from '@/features/chat/hooks'
import { useNodeValue } from '@/wb'
import { invitesWaiting } from './schedule'

/** Invites still waiting for your answer: an unanswered one stops counting once it has started. */
export function useInvitesWaiting(): number {
  const dates = useNodeValue('dates')
  const now = useNow(60_000)
  return invitesWaiting(dates, now)
}
