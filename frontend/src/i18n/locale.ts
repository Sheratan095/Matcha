/**
 * The interface language: a UI preference, kept in this browser (not domain state, so not in the node graph).
 * A tiny external store: `getLocale()` anywhere, `useLocale()` in components, `setLocale()` from the picker.
 * First visit: the browser's language when we have it, English otherwise.
 */
import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { LANGUAGES, type Language } from '@/api/types'

export type Locale = Language

export const STORAGE_KEY = 'matcha.locale'
export const DEFAULT_LOCALE: Locale = 'en'

/** Each language written in itself: what the picker prints, whatever the current locale. */
export const LANGUAGE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français', es: 'Español' }

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** The saved choice, else the first browser language we translate ("fr-CA" -> fr), else English. */
export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // storage blocked: fall through to the browser's language
  }
  if (typeof navigator !== 'undefined') {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const tag of tags) {
      const base = tag?.slice(0, 2).toLowerCase()
      if (isLocale(base)) return base
    }
  }
  return DEFAULT_LOCALE
}

function applyToDocument(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

let current: Locale = detectLocale()
applyToDocument(current)
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(next: Locale): void {
  if (next === current) return
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
  applyToDocument(next)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current locale; the component re-renders when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE)
}

/**
 * `useState` for text that was worded in the current language (a server error, a banner): it reads back as
 * `initial` once the locale has changed, instead of staying on screen in the old language.
 */
export function useLocaleState<T>(initial: T): readonly [T, (next: T | ((previous: T) => T)) => void] {
  const locale = useLocale()
  const initialRef = useRef(initial)
  const [state, setState] = useState<{ locale: Locale; value: T }>({ locale, value: initial })
  const set = useCallback((next: T | ((previous: T) => T)) => {
    setState((previous) => {
      const base = previous.locale === getLocale() ? previous.value : initialRef.current
      const value = typeof next === 'function' ? (next as (previous: T) => T)(base) : next
      return { locale: getLocale(), value }
    })
  }, [])
  return [state.locale === locale ? state.value : initial, set]
}
