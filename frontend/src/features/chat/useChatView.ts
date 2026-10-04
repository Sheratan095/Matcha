/** The behaviour of an open conversation: who is typing, and keeping the thread pinned to the bottom. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { realtime$ } from '@/wb'
import { prefersReducedMotion, TYPING_TIMEOUT_MS } from './hooks'

/** How long a message announced by realtime may take to show up in the thread before we stop waiting. */
const ARRIVAL_GRACE_MS = 5_000

/**
 * True while the partner is typing in this conversation: from their `typing` event until their
 * message is in the thread (`presentIds`), or until the timeout when no message follows.
 */
export function usePartnerTyping(matchId: string, partnerId: string | null, presentIds: readonly string[]): boolean {
  const [typing, setTyping] = useState(false)
  const [arriving, setArriving] = useState<readonly string[]>([])

  useEffect(() => {
    let timer = 0
    const subscription = realtime$.subscribe((event) => {
      if (event.type === 'typing' && event.matchId === matchId) {
        window.clearTimeout(timer)
        setTyping(true)
        timer = window.setTimeout(() => setTyping(false), TYPING_TIMEOUT_MS)
      } else if (event.type === 'message' && event.matchId === matchId) {
        if (partnerId && event.message.senderId !== partnerId) return
        window.clearTimeout(timer)
        setTyping(false)
        setArriving((ids) => [...ids, event.message.id])
      }
    })
    return () => {
      subscription.unsubscribe()
      window.clearTimeout(timer)
    }
  }, [matchId, partnerId])

  const waiting = arriving.some((id) => !presentIds.includes(id))
  useEffect(() => {
    if (arriving.length === 0) return
    const timer = window.setTimeout(() => setArriving([]), waiting ? ARRIVAL_GRACE_MS : 0)
    return () => window.clearTimeout(timer)
  }, [arriving, waiting])

  return typing || waiting
}

/** Within this many px of the end counts as "at the bottom". */
const BOTTOM_SLACK = 72

function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null
}

export interface StickToBottom {
  /** The reader is at the end of the thread (new content keeps them there). */
  pinned: boolean
  /** Scroll to the end and stay pinned. */
  scrollToBottom: (smooth?: boolean) => void
}

/**
 * Keeps the scrolling ancestor of `contentRef` at the bottom while the reader is there: new
 * messages, the typing indicator, late font loads and the on-screen keyboard do not leave them
 * looking at old messages. Once they scroll up, nothing moves under them.
 */
export function useStickToBottom(contentRef: RefObject<HTMLElement | null>): StickToBottom {
  const scrollerRef = useRef<HTMLElement | null>(null)
  const pinnedRef = useRef(true)
  /** A smooth scroll to the end is under way: its intermediate positions do not unpin. */
  const seekingRef = useRef(0)
  const [pinned, setPinned] = useState(true)

  useLayoutEffect(() => {
    const content = contentRef.current
    const scroller = scrollParent(content)
    scrollerRef.current = scroller
    if (!content || !scroller) return

    const atBottom = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= BOTTOM_SLACK
    const stick = () => {
      if (pinnedRef.current && !seekingRef.current) scroller.scrollTop = scroller.scrollHeight
    }
    const measure = () => {
      const bottom = atBottom()
      if (seekingRef.current) {
        if (!bottom) return
        window.clearTimeout(seekingRef.current)
        seekingRef.current = 0
      }
      if (bottom !== pinnedRef.current) {
        pinnedRef.current = bottom
        setPinned(bottom)
      }
    }
    // The reader takes over: a smooth scroll in progress no longer speaks for them.
    const interrupt = () => {
      if (!seekingRef.current) return
      window.clearTimeout(seekingRef.current)
      seekingRef.current = 0
    }

    stick()
    scroller.addEventListener('scroll', measure, { passive: true })
    scroller.addEventListener('wheel', interrupt, { passive: true })
    scroller.addEventListener('touchstart', interrupt, { passive: true })
    const observer = new ResizeObserver(stick)
    observer.observe(content)
    observer.observe(scroller)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', stick)
    return () => {
      interrupt()
      scroller.removeEventListener('scroll', measure)
      scroller.removeEventListener('wheel', interrupt)
      scroller.removeEventListener('touchstart', interrupt)
      observer.disconnect()
      viewport?.removeEventListener('resize', stick)
    }
  }, [contentRef])

  const scrollToBottom = useCallback((smooth = false) => {
    const scroller = scrollerRef.current
    pinnedRef.current = true
    setPinned(true)
    if (!scroller) return
    window.clearTimeout(seekingRef.current)
    seekingRef.current = 0
    if (!smooth || prefersReducedMotion()) {
      scroller.scrollTop = scroller.scrollHeight
      return
    }
    // Smooth, then make sure we really landed at the end (content may have grown meanwhile).
    seekingRef.current = window.setTimeout(() => {
      seekingRef.current = 0
      if (pinnedRef.current) scroller.scrollTop = scroller.scrollHeight
    }, 700)
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [])

  return { pinned, scrollToBottom }
}
