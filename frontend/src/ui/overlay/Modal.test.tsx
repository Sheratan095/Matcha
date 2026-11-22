/**
 * `closeModals`: what a toast's button calls before it navigates, so no sheet stays over where it leads.
 */
import { act, createElement, Fragment } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'
import { closeModals } from './openModals'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

describe('closeModals', () => {
  it('closes the open dismissible modals, newest first, and leaves blocking and closed ones alone', () => {
    const calls: string[] = []
    const sheet = vi.fn(() => calls.push('sheet'))
    const confirm = vi.fn(() => calls.push('confirm'))
    const blocking = vi.fn(() => calls.push('blocking'))
    const closed = vi.fn(() => calls.push('closed'))
    act(() =>
      root.render(
        createElement(
          Fragment,
          null,
          createElement(Modal, { open: true, onClose: sheet, title: 'Sheet' }),
          createElement(Modal, { open: true, onClose: confirm, title: 'Confirm' }),
          createElement(Modal, { open: true, onClose: blocking, title: 'Blocking', dismissible: false }),
          createElement(Modal, { open: false, onClose: closed, title: 'Closed' }),
        ),
      ),
    )

    act(() => closeModals())

    expect(calls).toEqual(['confirm', 'sheet'])
  })

  it('forgets a modal once it is closed', () => {
    const onClose = vi.fn()
    act(() => root.render(createElement(Modal, { open: true, onClose, title: 'Sheet' })))
    act(() => root.render(createElement(Modal, { open: false, onClose, title: 'Sheet' })))

    act(() => closeModals())

    expect(onClose).not.toHaveBeenCalled()
  })
})
