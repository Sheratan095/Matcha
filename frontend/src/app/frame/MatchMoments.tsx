/**
 * The "It's a match" takeover for every new connection, over whatever page is open: the head of the
 * match moment queue (src/wb/matchMoments.ts), fed by realtime's `match` events and by the screens
 * whose like made the match. Several matches (a replay at sign-in) play one after the other; "Send a
 * message" goes to that conversation and drops the rest (the notification feed still lists them).
 */
import { useState } from 'react'
import { firstNameOf, mainPicture } from '@/features/chat/people'
import { useT } from '@/i18n'
import { MatchMoment } from '@/ui'
import { clearMatchMoments, dismissMatchMoment, useMatchMoment, useNodeValue, type MatchedPerson } from '@/wb'

export interface MatchMomentsProps {
  navigate: (to: string) => void
}

export function MatchMoments({ navigate }: MatchMomentsProps) {
  const t = useT()
  const current = useMatchMoment()
  const signedIn = useNodeValue('authStatus') === 'authenticated'
  const me = useNodeValue('myProfile')

  // The person on screen stays mounted through the takeover's exit animation.
  const [shown, setShown] = useState<MatchedPerson | null>(current)
  if (current && current !== shown) setShown(current)
  if (!shown) return null

  const name = shown.name?.trim() || t('toast.someone')
  return (
    <MatchMoment
      // one takeover per person: the next in the queue plays its own entrance
      key={shown.userId}
      open={signedIn && current !== null}
      onClose={dismissMatchMoment}
      me={{ name: firstNameOf(me, t('nav.you')), photo: mainPicture(me), seed: me?.userId ?? 'me' }}
      them={{ name, photo: shown.photo, seed: shown.userId }}
      onMessage={() => {
        clearMatchMoments()
        navigate(`/chat/${shown.userId}`)
      }}
    >
      {t(shown.theyLikedFirst ? 'act.matchLine' : 'kit.matchLine', { name })}
    </MatchMoment>
  )
}
