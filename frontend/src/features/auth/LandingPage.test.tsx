/**
 * The landing page carries the language label in its colophon, once, in the language that is picked.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import LandingPage from './LandingPage'

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

const render = () => act(() => root.render(createElement(MemoryRouter, null, createElement(LandingPage))))

describe('LandingPage', () => {
  it('ends with the language label, one picker for the whole page', () => {
    render()
    const footer = container.querySelector('footer')!
    expect(footer.textContent).toContain('Matcha Priority Mail ®')
    expect(container.querySelectorAll('button[aria-haspopup="menu"]')).toHaveLength(1)
    expect(footer.querySelector('button[aria-haspopup="menu"]')!.getAttribute('aria-label')).toBe('Language: English')
  })

  it('switches the page and the label together', () => {
    render()
    act(() => setLocale('es'))
    expect(container.querySelector('footer')!.textContent).toContain('Matcha Correo prioritario ®')
    expect(container.querySelector('button[aria-haspopup="menu"]')!.getAttribute('aria-label')).toBe('Idioma: Español')
  })
})
