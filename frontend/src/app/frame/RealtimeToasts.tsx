/**
 * Global toasts from `realtime$`: a new match, a message for a conversation that is not open, and
 * someone liking you. Each links to the right place. Renders nothing itself (the Toaster does).
 */
import { useEffect } from 'react'
import type { Card } from '@/api/types'
import { Avatar, toast } from '@/ui'
import { getNodeValue, realtime$ } from '@/wb'

function photoOf(card: Card): string | null {
  return card.pictures.find((picture) => picture.isProfile)?.url ?? card.pictures[0]?.url ?? null
}

function nameOf(card: Card | undefined): string {
  return card?.firstName?.trim() || 'Someone'
}

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 90 ? `${flat.slice(0, 88)}…` : flat
}

export interface RealtimeToastsProps {
  navigate: (to: string) => void
  /** The current route's pathname (the toasts live outside the router tree). */
  currentPath: () => string
}

export function RealtimeToasts({ navigate, currentPath }: RealtimeToastsProps) {
  useEffect(() => {
    const subscription = realtime$.subscribe((event) => {
      if (getNodeValue('authStatus') !== 'authenticated') return
      switch (event.type) {
        case 'match': {
          const person = event.match.profile
          const name = nameOf(person)
          toast.show({
            id: `match-${event.match.id}`,
            tone: 'matcha',
            title: "It's a match!",
            message: `You and ${name} like each other.`,
            icon: <Avatar src={photoOf(person)} name={name} size="sm" decorative />,
            duration: 7000,
            action: { label: 'Say hi', onClick: () => navigate(`/chat/${event.match.id}`) },
          })
          break
        }
        case 'message': {
          // The open conversation shows it already. Check the route too: right after navigating to a
          // chat, its page may not have set `activeMatchId` yet when the event arrives.
          if (getNodeValue('activeMatchId') === event.matchId) return
          if (currentPath().replace(/\/+$/, '') === `/chat/${event.matchId}`) return
          if (event.message.senderId === getNodeValue('sessionUserId')) return
          const person = getNodeValue('matches')?.find((match) => match.id === event.matchId)?.profile
          const name = nameOf(person)
          toast.show({
            id: `chat-${event.matchId}`,
            tone: 'ink',
            title: person ? `${name} sent a message` : 'New message',
            message: excerpt(event.message.text),
            icon: person ? <Avatar src={photoOf(person)} name={name} size="sm" decorative /> : undefined,
            action: { label: 'Reply', onClick: () => navigate(`/chat/${event.matchId}`) },
          })
          break
        }
        case 'like': {
          const name = nameOf(event.from)
          toast.show({
            id: `like-${event.from.userId}`,
            tone: 'yolk',
            title: `${name} liked you`,
            message: 'Like them back and it’s a match.',
            icon: <Avatar src={photoOf(event.from)} name={name} size="sm" decorative />,
            action: { label: 'See who', onClick: () => navigate('/activity') },
          })
          break
        }
        case 'typing':
          break
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate, currentPath])
  return null
}
