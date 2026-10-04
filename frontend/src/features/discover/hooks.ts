/** Screen-level helpers for the deck: image preloading, a polite live region, and fitting the viewport. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Card } from '@/api/types'
import { mainPicture } from '@/features/profile/format'

const preloaded = new Set<string>()
const PRELOAD_MEMORY = 200

function preload(url: string): void {
  if (preloaded.has(url)) return
  if (preloaded.size >= PRELOAD_MEMORY) preloaded.clear()
  preloaded.add(url)
  const image = new Image()
  image.decoding = 'async'
  image.src = url
  // decode off the main thread now, so the card underneath paints at once when it comes up
  image.decode?.().catch(() => undefined)
}

/**
 * Warms the images of the next cards: the main picture of the next few, and every picture of the
 * live card (the profile sheet's carousel).
 */
export function usePreloadDeck(cards: readonly Card[], ahead = 5): void {
  const key = cards
    .slice(0, ahead)
    .map((card) => card.userId)
    .join(',')
  const latest = useRef(cards)
  useLayoutEffect(() => {
    latest.current = cards
  })
  useEffect(() => {
    const next = latest.current.slice(0, ahead)
    for (const card of next) {
      const url = mainPicture(card)?.url
      if (url) preload(url)
    }
    for (const picture of next[0]?.pictures ?? []) preload(picture.url)
  }, [key, ahead])
}

/** A polite live region: `announce(text)` speaks it (even when it is the same text as last time). */
export function useAnnouncer(): [message: string, announce: (text: string) => void] {
  const [message, setMessage] = useState('')
  const timer = useRef(0)
  const announce = useCallback((text: string) => {
    window.clearTimeout(timer.current)
    setMessage('')
    // cleared first, then set: screen readers announce a repeated message too
    timer.current = window.setTimeout(() => setMessage(text), 60)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [message, announce]
}

/**
 * Writes `--fit-top` (the element's distance from the top of the document) on the element, so CSS can
 * size it to the rest of the viewport whatever sits above it (top bar, banner, padding).
 */
export function useViewportFit<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    let frame = 0
    let last = -1
    const measure = () => {
      frame = 0
      const top = Math.max(0, Math.round(element.getBoundingClientRect().top + window.scrollY))
      if (top === last) return
      last = top
      element.style.setProperty('--fit-top', `${top}px`)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    window.addEventListener('resize', schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [])
  return ref
}
