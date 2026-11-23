/**
 * The catalogues stay in step (same keys, same placeholders, same line stacks), the translator fills and falls
 * back, and the locale is detected, persisted and put on <html lang>.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANGUAGES } from '@/api/types'
import { dayLabel, shortAgo, upcomingLabel } from '@/features/chat/time'
import {
  CATALOGUES,
  dateFormat,
  detectLocale,
  getLocale,
  numberFormat,
  placeholdersOf,
  setLocale,
  STORAGE_KEY,
  t,
  translate,
  translatePlural,
  translatorFor,
  useLocaleState,
  useT,
  type Locale,
  type MessageKey,
} from '.'
import { DOMAINS } from './messages/app'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const KEYS = Object.keys(CATALOGUES.en) as MessageKey[]

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  setLocale('en')
})

describe('catalogues', () => {
  it('cover the same keys in every language', () => {
    for (const locale of LANGUAGES) {
      expect(Object.keys(CATALOGUES[locale]).sort(), locale).toEqual([...KEYS].sort())
    }
  })

  it.each(LANGUAGES)('%s: nothing is empty, and the placeholders match English', (locale) => {
    for (const key of KEYS) {
      const message = CATALOGUES[locale][key]
      expect(message.trim(), `${locale} ${key}`).not.toBe('')
      expect(placeholdersOf(message).sort(), `${locale} ${key}`).toEqual(placeholdersOf(CATALOGUES.en[key]).sort())
    }
  })

  it.each(LANGUAGES)('%s: line stacks keep their number of lines', (locale) => {
    for (const key of KEYS) {
      const lines = CATALOGUES.en[key].split('|').length
      expect(CATALOGUES[locale][key].split('|').length, `${locale} ${key}`).toBe(lines)
    }
  })

  it('translate a sentence the way a person would, not word for word', () => {
    expect(translate('fr', 'common.signIn')).toBe('Se connecter')
    expect(translate('es', 'common.signIn')).toBe('Iniciar sesión')
  })
})

describe('translator', () => {
  it('fills placeholders and leaves unknown ones as written', () => {
    expect(translate('en', 'rule.atLeast', { n: 8 })).toBe('At least 8 characters.')
    expect(translate('fr', 'rule.atLeast', { n: 8 })).toBe('Au moins 8 caractères.')
    expect(translate('en', 'rule.atLeast')).toBe('At least {n} characters.')
    expect(translate('en', 'rule.atLeast', { other: 1 })).toBe('At least {n} characters.')
  })

  it('follows the current locale from outside a component', () => {
    expect(t('common.or')).toBe('or')
    setLocale('es')
    expect(t('common.or')).toBe('o')
  })

  it('splits a stack of lines', () => {
    expect(translatorFor('en').lines('poster.defaultLines')).toEqual(['Whisk', 'me', 'away'])
    expect(translatorFor('fr').lines('poster.defaultLines')).toHaveLength(3)
  })

  it('puts React nodes in the placeholders', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(createElement('p', null, translatorFor('fr').rich('forgot.sentIntro', { email: createElement('strong', null, 'a@b.c'), time: '15 minutes' }))))
    expect(container.querySelector('strong')?.textContent).toBe('a@b.c')
    expect(container.textContent).toContain('Si un compte utilise a@b.c,')
    expect(container.textContent).toContain('valable 15 minutes')
    act(() => root.unmount())
  })
})

describe('locale', () => {
  function browserSpeaks(...tags: string[]) {
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(tags)
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue(tags[0] ?? 'en')
  }

  it('starts from the first browser language that is translated', () => {
    browserSpeaks('de-DE', 'fr-CA', 'en-US')
    expect(detectLocale()).toBe('fr')
    browserSpeaks('es')
    expect(detectLocale()).toBe('es')
  })

  it('falls back to English', () => {
    browserSpeaks('de-DE', 'ja')
    expect(detectLocale()).toBe('en')
  })

  it('prefers the saved choice to the browser, and ignores a junk value', () => {
    browserSpeaks('fr')
    localStorage.setItem(STORAGE_KEY, 'es')
    expect(detectLocale()).toBe('es')
    localStorage.setItem(STORAGE_KEY, 'klingon')
    expect(detectLocale()).toBe('fr')
  })

  it('saves the choice and sets the document language', () => {
    setLocale('fr')
    expect(getLocale()).toBe('fr')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
  })

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setLocale('es')).not.toThrow()
    expect(getLocale()).toBe('es')
  })
})

describe('components', () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('re-render in the new language', () => {
    function Greeting() {
      const tr = useT()
      return createElement('p', null, tr('common.signIn'))
    }
    act(() => root.render(createElement(Greeting)))
    expect(container.textContent).toBe('Sign in')
    act(() => setLocale('fr'))
    expect(container.textContent).toBe('Se connecter')
  })

  it('drop wording from the previous language instead of showing it', () => {
    let write: (value: string | null) => void = () => undefined
    function Banner() {
      const [text, setText] = useLocaleState<string | null>(null)
      write = setText
      return createElement('p', null, text ?? 'none')
    }
    act(() => root.render(createElement(Banner)))
    act(() => write(t('error.generic')))
    expect(container.textContent).toBe('Something went wrong')
    act(() => setLocale('es' satisfies Locale))
    expect(container.textContent).toBe('none')
    act(() => write(t('error.generic')))
    expect(container.textContent).toBe('Algo salió mal')
  })
})

describe('domains', () => {
  const domains = Object.entries(DOMAINS)

  it('never share a key: merging them cannot override one by accident', () => {
    const seen = new Map<string, string>()
    for (const [name, domain] of domains) {
      for (const key of Object.keys(domain.en)) {
        expect(seen.get(key), `${key} is in both ${seen.get(key)} and ${name}`).toBeUndefined()
        seen.set(key, name)
      }
    }
  })

  it('all end up in every catalogue', () => {
    for (const locale of LANGUAGES) {
      for (const [, domain] of domains) {
        for (const key of Object.keys(domain.en)) {
          expect(CATALOGUES[locale][key as MessageKey], `${locale} ${key}`).toBe(domain[locale][key as never])
        }
      }
    }
  })

  /** Wording that is the same in more than one language: a loanword, a format, nothing but placeholders. */
  const SAME = new Set([
    'common.codeLifetime',
    'act.scoreCountUnit',
    'deck.kmValue',
    'kit.actionSuperlike',
    'me.cropCard',
    'me.photoAlt',
    'me.ruleTypes',
    'me.section',
    'prof.photoAlt',
    'time.upcoming',
  ])

  it.each(['fr', 'es'] as const)('%s: a sentence is not left in English', (locale) => {
    const untranslated = (Object.keys(CATALOGUES.en) as MessageKey[]).filter((key) => {
      const english = CATALOGUES.en[key]
      return !SAME.has(key) && /\s/.test(english.trim()) && /[a-z]{3}/.test(english) && CATALOGUES[locale][key] === english
    })
    expect(untranslated).toEqual([])
  })
})

describe('plurals', () => {
  it('pick the form of the language', () => {
    expect(translatePlural('en', 'kit.commands', 1)).toBe('1 command')
    expect(translatePlural('en', 'kit.commands', 2)).toBe('2 commands')
    expect(translatePlural('es', 'kit.commands', 3)).toBe('3 comandos')
    // French counts 0 and 1 as singular
    expect(translatePlural('fr', 'kit.commands', 0)).toBe('0 commande')
    expect(translatePlural('fr', 'kit.commands', 2)).toBe('2 commandes')
  })

  it('let the caller print the count its own way', () => {
    expect(translatorFor('en').n('search.person', 3, { n: '03' })).toBe('03 people')
    expect(translatorFor('fr').n('matches.unreadCount', 1, { n: '01' })).toBe('01 non lu')
  })

  it('group thousands the way the language does', () => {
    expect(translatePlural('en', 'kit.commands', 1234)).toBe('1,234 commands')
    expect(translatePlural('fr', 'kit.commands', 1234)).toMatch(/^1\s234 commandes$/)
  })
})

describe('formats', () => {
  const saturday = new Date(2026, 10, 21, 20, 0)

  it('write dates in the interface language', () => {
    expect(dateFormat({ weekday: 'long' }, 'en').format(saturday)).toBe('Saturday')
    expect(dateFormat({ weekday: 'long' }, 'fr').format(saturday)).toBe('samedi')
    expect(dateFormat({ weekday: 'long' }, 'es').format(saturday)).toBe('sábado')
  })

  it('write numbers in the interface language', () => {
    expect(numberFormat({}, 'en').format(1234.5)).toBe('1,234.5')
    expect(numberFormat({}, 'fr').format(1234.5)).toMatch(/^1\s234,5$/)
  })

  it('follow the language through the chat time labels', () => {
    const now = saturday.getTime()
    expect(dayLabel(now, now)).toBe('Today')
    expect(shortAgo(now - 5 * 60_000, now)).toBe('5m')
    setLocale('fr')
    expect(dayLabel(now, now)).toBe("Aujourd'hui")
    expect(shortAgo(now - 5 * 60_000, now)).toBe('5 min')
    expect(upcomingLabel(now + 24 * 3_600_000, now)).toBe('Demain à 20:00')
    setLocale('es')
    expect(dayLabel(now, now)).toBe('Hoy')
    expect(upcomingLabel(now + 24 * 3_600_000, now)).toBe('Mañana, 20:00')
  })
})
