/**
 * The signed-out frame carries the language label (the parcel label with the picker in its postage box), once,
 * in the language that is picked.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setLocale } from '@/i18n'
import { AuthLayout } from './Auth'

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

function render() {
  act(() =>
    root.render(
      <MemoryRouter>
        <AuthLayout title="Sign in">
          <form />
        </AuthLayout>
      </MemoryRouter>,
    ),
  )
}

describe('AuthLayout', () => {
  it('has one language label, whose picker is closed and named after the language', () => {
    render()
    expect(container.textContent).toContain('Matcha Priority Mail ®')
    const pickers = container.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
    expect(pickers).toHaveLength(1)
    expect(pickers[0].getAttribute('aria-label')).toBe('Language: English')
    expect(pickers[0].getAttribute('aria-expanded')).toBe('false')
  })

  it('prints the label in the language that is picked', () => {
    render()
    act(() => setLocale('fr'))
    expect(container.textContent).toContain('Matcha Courrier prioritaire ®')
    expect(container.querySelector('button[aria-haspopup="menu"]')!.getAttribute('aria-label')).toBe('Langue : Français')
  })
})
