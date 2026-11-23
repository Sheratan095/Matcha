/**
 * Looking a message up: `t('key', { name })` anywhere (rules, error mappers), `const t = useT()` in components so
 * they re-render when the locale changes. The English catalogue is the fallback for a key a language lacks.
 */
import { Fragment, useMemo, type ReactNode } from 'react'
import { en, type MessageKey, type Messages } from './messages/en'
import { es } from './messages/es'
import { fr } from './messages/fr'
import { numberFormat, pluralCategory } from './format'
import { getLocale, useLocale, type Locale } from './locale'

export type { MessageKey, Messages } from './messages/en'

export const CATALOGUES: Record<Locale, Messages> = { en, fr, es }

export type Params = Readonly<Record<string, string | number>>

/**
 * A message with one form per plural category: `'matches.count.one'`, `'matches.count.other'` (every language
 * has both; `{n}` is the count). The key to give `t.n` is the part before the category.
 */
export type PluralKey = MessageKey extends infer K ? (K extends `${infer Base}.other` ? Base : never) : never

const PLACEHOLDER = /\{(\w+)\}/g

function lookup(locale: Locale, key: MessageKey): string {
  return CATALOGUES[locale][key] ?? en[key]
}

/** `{name}` placeholders filled from `params`; an unknown placeholder stays as written. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const template = lookup(locale, key)
  if (!params) return template
  return template.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole))
}

/** The form of a plural message that `count` calls for in a language (`other` when the language lacks it). */
export function translatePlural(locale: Locale, key: PluralKey, count: number, params?: Params): string {
  const specific = `${key}.${pluralCategory(count, locale)}`
  const picked = (specific in en ? specific : `${key}.other`) as MessageKey
  return translate(locale, picked, { n: numberFormat({}, locale).format(count), ...params })
}

/** The placeholders a message uses, in order of appearance. */
export function placeholdersOf(message: string): string[] {
  return Array.from(message.matchAll(PLACEHOLDER), (match) => match[1])
}

/** Same as `translate`, but the placeholders may be React nodes ("We sent a link to <strong>{email}</strong>"). */
function translateRich(locale: Locale, key: MessageKey, nodes: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = lookup(locale, key).split(PLACEHOLDER)
  // split() with a capture group alternates text, name, text, name…
  return parts.map((part, index) =>
    index % 2 === 0 ? part : <Fragment key={index}>{part in nodes ? nodes[part] : `{${part}}`}</Fragment>,
  )
}

export interface Translator {
  (key: MessageKey, params?: Params): string
  /** A message with one form per plural category, `{n}` filled with the count: `t.n('x.count', 3)`. */
  n(key: PluralKey, count: number, params?: Params): string
  /** A message with React nodes in its placeholders. */
  rich(key: MessageKey, nodes: Readonly<Record<string, ReactNode>>): ReactNode
  /** A stack of short lines (`a|b|c`): poster lettering, stickers. */
  lines(key: MessageKey): string[]
  /** The same stack as one node, a line break between the lines (a sticker's text). */
  stack(key: MessageKey): ReactNode
  readonly locale: Locale
}

export function translatorFor(locale: Locale): Translator {
  const t = ((key: MessageKey, params?: Params) => translate(locale, key, params)) as Translator
  return Object.assign(t, {
    n: (key: PluralKey, count: number, params?: Params) => translatePlural(locale, key, count, params),
    rich: (key: MessageKey, nodes: Readonly<Record<string, ReactNode>>) => translateRich(locale, key, nodes),
    lines: (key: MessageKey) => lookup(locale, key).split('|'),
    stack: (key: MessageKey) =>
      lookup(locale, key)
        .split('|')
        .map((line, index) => (
          <Fragment key={index}>
            {index > 0 ? <br /> : null}
            {line}
          </Fragment>
        )),
    locale,
  })
}

/** The message in the current locale. For code that is not a component; components use `useT`. */
export function t(key: MessageKey, params?: Params): string {
  return translate(getLocale(), key, params)
}

/** `t.n` for code that is not a component: the plural form for the current locale. */
export function tn(key: PluralKey, count: number, params?: Params): string {
  return translatePlural(getLocale(), key, count, params)
}

/** The translator for the current locale; the component re-renders when the locale changes. */
export function useT(): Translator {
  const locale = useLocale()
  return useMemo(() => translatorFor(locale), [locale])
}
