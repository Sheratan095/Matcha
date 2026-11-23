/**
 * The editor's wiring: what the controls change reaches the preview and the exported file. jsdom has no canvas,
 * so the canvas helpers (decode, turn, paint, encode) are stood in for and the geometry is the real one.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PhotoEditor } from './PhotoEditor'
import { exportFile, loadSource, paint, turn } from './photoEdit'
import type { Source } from './photoEdit'

vi.mock('./photoEdit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photoEdit')>()),
  loadSource: vi.fn(),
  turn: vi.fn(),
  paint: vi.fn(),
  exportFile: vi.fn(),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A 4000 x 3000 picture, as a phone takes it. */
const SOURCE = { width: 4000, height: 3000 } as unknown as Source
const EDITED = new File(['edited'], 'holiday.jpg', { type: 'image/jpeg' })

let host: HTMLDivElement
let root: Root
const onCancel = vi.fn()
const onApply = vi.fn()

beforeEach(() => {
  vi.mocked(loadSource).mockResolvedValue(SOURCE)
  vi.mocked(turn).mockImplementation((source, turns) =>
    turns % 2 === 0 ? source : ({ width: source.height, height: source.width } as unknown as Source),
  )
  vi.mocked(exportFile).mockResolvedValue(EDITED)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function open(file = new File(['original'], 'holiday.png', { type: 'image/png' })) {
  await act(async () => root.render(<PhotoEditor file={file} open onCancel={onCancel} onApply={onApply} />))
  await act(async () => {}) // the decode settles
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement

function choose(value: string) {
  const input = dialog().querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)
  if (!input) throw new Error(`no "${value}" choice`)
  act(() => input.click())
}

function button(name: string): HTMLButtonElement {
  const found = [...dialog().querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === name || b.getAttribute('aria-label') === name,
  )
  if (!found) throw new Error(`no "${name}" button`)
  return found
}

/** The "810 x 1080 px" line under the sizes. */
const sizeLine = () => /\d+ × \d+ px/.exec(dialog().textContent ?? '')?.[0]

describe('PhotoEditor', () => {
  it('opens on the whole picture, at the largest size, and waits for the decode', async () => {
    let finish!: (source: Source) => void
    vi.mocked(loadSource).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await open()
    expect(button('Use photo').disabled).toBe(true)
    expect(dialog().querySelector('[aria-busy="true"]')).not.toBeNull()

    await act(async () => finish(SOURCE))
    expect(button('Use photo').disabled).toBe(false)
    expect(dialog().querySelector('canvas')).not.toBeNull()
    expect(sizeLine()).toBe('1080 × 810 px')
    expect(vi.mocked(paint).mock.lastCall?.[2]).toEqual({ x: 0, y: 0, w: 4000, h: 3000 })
  })

  it('crops to 3:4 around the middle, and sends exactly that', async () => {
    await open()
    choose('card')
    expect(sizeLine()).toBe('810 × 1080 px')
    expect(vi.mocked(paint).mock.lastCall?.[2]).toEqual({ x: 875, y: 0, w: 2250, h: 3000 })

    await act(async () => button('Use photo').click())
    expect(exportFile).toHaveBeenCalledWith(
      SOURCE,
      { x: 875, y: 0, w: 2250, h: 3000 },
      { width: 810, height: 1080 },
      'none',
      'holiday.png',
    )
    expect(onApply).toHaveBeenCalledWith(EDITED)
  })

  it('resizes: the size line follows the choice and the file takes it', async () => {
    await open()
    choose('small')
    expect(sizeLine()).toBe('540 × 405 px')
    choose('medium')
    expect(sizeLine()).toBe('810 × 608 px')
    choose('small')
    await act(async () => button('Use photo').click())
    expect(vi.mocked(exportFile).mock.lastCall?.[2]).toEqual({ width: 540, height: 405 })
  })

  it('applies the chosen filter to the preview and to the file', async () => {
    await open()
    choose('mono')
    expect(vi.mocked(paint).mock.lastCall?.[4]).toBe('mono')
    await act(async () => button('Use photo').click())
    expect(vi.mocked(exportFile).mock.lastCall?.[3]).toBe('mono')
  })

  it('turns the picture a quarter and the sizes follow its new shape', async () => {
    await open()
    act(() => button('Rotate 90°').click())
    expect(turn).toHaveBeenLastCalledWith(SOURCE, 1)
    expect(sizeLine()).toBe('810 × 1080 px')
    act(() => button('Rotate 90°').click())
    expect(sizeLine()).toBe('1080 × 810 px')
  })

  it('moves the window with the arrow keys once the picture is cropped', async () => {
    await open()
    choose('card')
    const stage = dialog().querySelector<HTMLElement>('[role="group"][aria-label="Photo preview"]')!
    act(() => {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    })
    // a tenth of the 2250 px window, towards the right
    expect(vi.mocked(paint).mock.lastCall?.[2]).toEqual({ x: 1100, y: 0, w: 2250, h: 3000 })
  })

  it('says so when the picture cannot be opened, and offers nothing to apply', async () => {
    vi.mocked(loadSource).mockRejectedValue(new Error('decode'))
    await open()
    expect(dialog().textContent).toContain('That photo can’t be opened')
    expect(dialog().querySelector('canvas')).toBeNull()
    expect(button('Use photo').disabled).toBe(true)
  })

  it('keeps the editor open and says so when the file cannot be made', async () => {
    vi.mocked(exportFile).mockRejectedValue(new Error('toBlob'))
    await open()
    await act(async () => button('Use photo').click())
    expect(dialog().textContent).toContain('Could not save the edit')
    expect(onApply).not.toHaveBeenCalled()
    expect(button('Use photo').disabled).toBe(false)
  })

  it('cancels without applying anything', async () => {
    await open()
    act(() => button('Cancel').click())
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
    expect(exportFile).not.toHaveBeenCalled()
  })
})
