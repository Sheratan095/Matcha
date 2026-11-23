/**
 * The account tab carries the compact language picker (the flag and the code): one of it, between the email and
 * the blocked people, and picking a language there switches the interface language like the sign-in pages do.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLocale, setLocale, STORAGE_KEY } from '@/i18n'
import { AccountSettings } from './AccountSettings'

// The tab's data is not under test: the blocked list stays on its loading skeleton.
vi.mock('@/wb', () => ({
  actions: {},
  refresh: vi.fn(() => Promise.resolve()),
  toApiError: (failure: unknown) => failure,
  useLoad: () => undefined,
  useNodeStatus: () => ({ status: 'loading', error: null }),
  useNodeValue: () => null,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  setLocale('en')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(MemoryRouter, null, createElement(AccountSettings))))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  localStorage.clear()
  setLocale('en')
})

const picker = () => container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
const items = () => Array.from(container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'))

describe('AccountSettings language', () => {
  it('speaks the language that is picked', () => {
    act(() => setLocale('fr'))
    const titles = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    expect(titles).toEqual(['Changer d’e-mail', 'Langue', 'Personnes bloquées', 'Se déconnecter'])
    act(() => setLocale('es'))
    expect(Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)).toEqual([
      'Cambiar el correo',
      'Idioma',
      'Personas bloqueadas',
      'Cerrar sesión',
    ])
  })

  it('has a Language card with one picker, closed, named after the language', () => {
    const card = container.querySelector('section[aria-labelledby="me-language-title"]')!
    expect(card.querySelector('h2')!.textContent).toBe('Language')
    expect(picker()).toHaveLength(1)
    expect(card.contains(picker()[0])).toBe(true)
    expect(picker()[0].getAttribute('aria-label')).toBe('Language: English')
    expect(picker()[0].getAttribute('aria-expanded')).toBe('false')
  })

  it('is the compact picker (flag and code), not the postage box', () => {
    expect(picker()[0].textContent).toBe('en')
    expect(container.textContent).not.toContain('Priority Mail')
  })

  it('sits between the email and the blocked people', () => {
    const titles = Array.from(container.querySelectorAll('h2')).map((h) => h.textContent)
    expect(titles.indexOf('Change email')).toBeLessThan(titles.indexOf('Language'))
    expect(titles.indexOf('Language')).toBeLessThan(titles.indexOf('Blocked people'))
  })

  it('switches the language and saves it', () => {
    act(() => picker()[0].click())
    expect(items().map((item) => item.textContent)).toEqual(['English', 'Français', 'Español'])
    act(() => items()[2].click())
    expect(getLocale()).toBe('es')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es')
    expect(picker()[0].getAttribute('aria-label')).toBe('Idioma: Español')
    expect(picker()[0].textContent).toBe('es')
  })
})
