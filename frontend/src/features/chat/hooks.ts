/** Small hooks shared by the matches, chat and activity screens. */
import { useEffect, useState } from 'react'

/** The current time, re-read every `every` ms (relative labels such as "5m"). */
export function useNow(every = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(id)
  }, [every])
  return now
}

/** True while the user asked the system to minimise motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}
