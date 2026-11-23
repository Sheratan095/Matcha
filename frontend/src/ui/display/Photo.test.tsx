/**
 * `PhotoFrame treatment="halftone"` prints the picture twice (colour plate + black plate): assistive tech must still
 * get it once, and every other treatment stays a single picture.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PhotoFrame } from './Photo'
import type { PhotoFrameProps } from './Photo'

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

function render(props: Partial<PhotoFrameProps>) {
  act(() => root.render(createElement(PhotoFrame, { alt: 'Alice on a bench', ...props })))
}

describe('PhotoFrame', () => {
  it('renders one picture without a treatment', () => {
    render({ src: '/a.jpg' })
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(1)
    expect(imgs[0].getAttribute('alt')).toBe('Alice on a bench')
  })

  it('halftone: two plates of the photo, only the first one described', () => {
    render({ src: '/a.jpg', treatment: 'halftone' })
    const imgs = container.querySelectorAll('img')
    expect(imgs).toHaveLength(2)
    expect(imgs[0].getAttribute('alt')).toBe('Alice on a bench')
    expect(imgs[1].getAttribute('alt')).toBe('')
    expect(imgs[0].getAttribute('src')).toBe(imgs[1].getAttribute('src'))
  })

  it('halftone: the poster fallback is printed twice too, announced once', () => {
    render({ src: null, treatment: 'halftone' })
    const figures = container.querySelectorAll('svg')
    expect(figures).toHaveLength(2)
    expect(figures[0].getAttribute('role')).toBe('img')
    expect(figures[0].getAttribute('aria-label')).toBe('Alice on a bench')
    expect(figures[1].getAttribute('aria-hidden')).toBe('true')
    expect(figures[1].hasAttribute('aria-label')).toBe(false)
  })
})
