/**
 * The language picker: the flag opens a menu of the three languages, picking one switches the interface, saves
 * the choice and moves the checkmark; the label puts the picker in its postage box.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getLocale, setLocale, STORAGE_KEY } from '@/i18n'
import { LocaleLabel, LocalePicker } from './LocalePicker'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  setLocale('en')
})

const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!
const items = () => Array.from(container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))

describe('LocalePicker', () => {
  it('is a flag button named after the current language, closed at first', () => {
    act(() => root.render(createElement(LocalePicker)))
    expect(trigger().getAttribute('aria-label')).toBe('Language: English')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().querySelector('svg')).not.toBeNull()
    expect(items()).toHaveLength(0)
  })

  it('opens a menu of the three languages, each in its own tongue, the current one checked', () => {
    act(() => root.render(createElement(LocalePicker)))
    act(() => trigger().click())
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(items().map((item) => item.textContent)).toEqual(['English', 'Français', 'Español'])
    expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
  })

  it('switches the interface, saves the choice, closes, and renames itself', () => {
    act(() => root.render(createElement(LocalePicker)))
    act(() => trigger().click())
    act(() => items()[1].click())
    expect(getLocale()).toBe('fr')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('fr')
    expect(document.documentElement.lang).toBe('fr')
    expect(items()).toHaveLength(0)
    expect(trigger().getAttribute('aria-label')).toBe('Langue : Français')
  })

  it('moves the checkmark with the language', () => {
    act(() => root.render(createElement(LocalePicker)))
    act(() => setLocale('es'))
    act(() => trigger().click())
    expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true'])
  })
})

describe('LocaleLabel', () => {
  it('prints the label in the current language, with the picker in the postage box', () => {
    act(() => root.render(createElement(LocaleLabel)))
    expect(container.textContent).toContain('Matcha Priority Mail ®')
    expect(container.textContent).toContain('Tracking Nº')
    expect(container.querySelectorAll('button[aria-haspopup="menu"]')).toHaveLength(1)
    act(() => setLocale('fr'))
    expect(container.textContent).toContain('Matcha Courrier prioritaire ®')
    expect(container.textContent).toContain('Suivi N°')
    act(() => setLocale('es'))
    expect(container.textContent).toContain('Matcha Correo prioritario ®')
    expect(container.textContent).toContain('Seguimiento Nº')
  })
})
