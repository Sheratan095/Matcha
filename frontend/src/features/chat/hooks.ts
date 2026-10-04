/** Small hooks shared by the matches, chat and activity screens. */
import { useEffect, useState } from 'react'
import { realtime$ } from '@/wb'

/** The current time, re-read every `every` ms (relative labels such as "5m"). */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(id)
  }, [every])
  return now
}

/** How long a `typing` event keeps the indicator up when no message follows. */
export const TYPING_TIMEOUT_MS = 9_000

/**
 * Match ids whose partner is typing right now, from the `typing` events of `realtime$`. An entry
 * goes away when that partner's message arrives, or after `TYPING_TIMEOUT_MS`.
 */
export function useTypingMatches(): ReadonlySet<string> {
  const [typing, setTyping] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    const timers = new Map<string, number>()
    const stop = (matchId: string) => {
      window.clearTimeout(timers.get(matchId))
      timers.delete(matchId)
      setTyping((current) => {
        if (!current.has(matchId)) return current
        const next = new Set(current)
        next.delete(matchId)
        return next
      })
    }
    const subscription = realtime$.subscribe((event) => {
      if (event.type === 'typing') {
        window.clearTimeout(timers.get(event.matchId))
        timers.set(
          event.matchId,
          window.setTimeout(() => stop(event.matchId), TYPING_TIMEOUT_MS),
        )
        setTyping((current) => (current.has(event.matchId) ? current : new Set(current).add(event.matchId)))
      } else if (event.type === 'message') {
        stop(event.matchId)
      }
    })
    return () => {
      subscription.unsubscribe()
      timers.forEach((id) => window.clearTimeout(id))
    }
  }, [])
  return typing
}

/** True while the user asked the system to minimise motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
