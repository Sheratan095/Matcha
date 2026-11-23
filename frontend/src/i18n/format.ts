/**
 * Dates, times and numbers in the interface language. Formatters are cached per language and options; call these
 * from render (or from a function a component calls while it is subscribed to the locale with `useT`/`useLocale`),
 * never at module level, which would freeze the language the page loaded in.
 */
import { getLocale, type Locale } from './locale'

/** The regional variant used for each language: English is the British one (24-hour clock, day before month). */
const TAGS: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' }

export function localeTag(locale: Locale = getLocale()): string {
  return TAGS[locale]
}

const dates = new Map<string, Intl.DateTimeFormat>()

export function dateFormat(options: Intl.DateTimeFormatOptions, locale: Locale = getLocale()): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = dates.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(TAGS[locale], options)
    dates.set(key, format)
  }
  return format
}

const numbers = new Map<string, Intl.NumberFormat>()

export function numberFormat(options: Intl.NumberFormatOptions = {}, locale: Locale = getLocale()): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = numbers.get(key)
  if (!format) {
    format = new Intl.NumberFormat(TAGS[locale], options)
    numbers.set(key, format)
  }
  return format
}

const plurals = new Map<Locale, Intl.PluralRules>()

/** The plural category of `count` ('one', 'other'…) in a language. */
export function pluralCategory(count: number, locale: Locale = getLocale()): Intl.LDMLPluralRule {
  let rules = plurals.get(locale)
  if (!rules) {
    rules = new Intl.PluralRules(TAGS[locale])
    plurals.set(locale, rules)
  }
  return rules.select(count)
}
