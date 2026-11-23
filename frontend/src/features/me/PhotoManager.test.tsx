/**
 * A chosen photo goes through the editor before anything is sent: it is checked, edited, and only then uploaded.
 * The backend's 5 MB limit applies to what is sent, so a bigger picture is accepted for editing.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/api/types'
import { actions } from '@/wb'
import { PhotoManager } from './PhotoManager'

vi.mock('@/wb', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wb')>()),
  actions: { uploadPicture: vi.fn(), setMainPicture: vi.fn(), deletePicture: vi.fn() },
}))
// The editor has its own test: here it is a stand-in that hands back a fixed file.
vi.mock('./PhotoEditor', () => ({
  PhotoEditor: ({
    file,
    open,
    onApply,
    onCancel,
  }: {
    file: File
    open: boolean
    onApply: (edited: File) => void
    onCancel: () => void
  }) =>
    open ? (
      <div role="dialog">
        <span>editing {file.name}</span>
        <button type="button" onClick={() => onApply(new File(['edited'], 'edited.jpg', { type: 'image/jpeg' }))}>
          apply
        </button>
        <button type="button" onClick={onCancel}>
          cancel
        </button>
      </div>
    ) : null,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MB = 1024 * 1024
const PROFILE = { userId: 'u-me', pictures: [] } as unknown as Profile

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.mocked(actions.uploadPicture).mockResolvedValue({
    pictures: [{ id: 'p1', url: '/p1.webp', isProfile: true }],
  } as never)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

async function render() {
  await act(async () => root.render(<PhotoManager profile={PROFILE} />))
}

function file(name: string, type: string, size = 1000): File {
  const picked = new File(['x'], name, { type })
  Object.defineProperty(picked, 'size', { value: size })
  return picked
}

/** Chooses a file in the first empty slot, as the browser's picker would. */
function pickFile(picked: File) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]:not(:disabled)')!
  Object.defineProperty(input, 'files', { value: [picked], configurable: true })
  act(() => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const editor = () => document.querySelector('[role="dialog"]')
const press = async (name: string) => {
  const found = [...document.querySelectorAll('button')].find((b) => b.textContent === name)!
  await act(async () => found.click())
}

describe('PhotoManager adding a photo', () => {
  it('opens the editor and sends nothing until it hands the photo back', async () => {
    await render()
    pickFile(file('me.png', 'image/png'))
    expect(editor()?.textContent).toContain('editing me.png')
    expect(actions.uploadPicture).not.toHaveBeenCalled()

    await press('apply')
    expect(actions.uploadPicture).toHaveBeenCalledTimes(1)
    const sent = vi.mocked(actions.uploadPicture).mock.calls[0][0] as File
    expect(sent.name).toBe('edited.jpg')
    expect(editor()).toBeNull()
    expect(host.textContent).toContain('Photo 01 added.')
  })

  it('sends nothing when the editor is cancelled', async () => {
    await render()
    pickFile(file('me.jpg', 'image/jpeg'))
    await press('cancel')
    expect(editor()).toBeNull()
    expect(actions.uploadPicture).not.toHaveBeenCalled()
  })

  it('accepts a photo over the 5 MB the backend takes: the editor shrinks it', async () => {
    await render()
    pickFile(file('big.jpg', 'image/jpeg', 8 * MB))
    expect(editor()?.textContent).toContain('editing big.jpg')
  })

  it('refuses a photo beyond what the editor opens, before opening it', async () => {
    await render()
    pickFile(file('huge.jpg', 'image/jpeg', 25 * MB))
    expect(editor()).toBeNull()
    expect(host.textContent).toContain('That photo is too large')
    expect(host.textContent).toContain('the limit is 20 MB')
  })

  it('refuses what is not a JPEG, PNG or WEBP, before opening it', async () => {
    await render()
    pickFile(file('anim.gif', 'image/gif'))
    expect(editor()).toBeNull()
    expect(host.textContent).toContain('That file type isn’t supported')
  })

  it('shows the error when the upload fails, and the editor is not left open', async () => {
    vi.mocked(actions.uploadPicture).mockRejectedValue(new Error('boom'))
    await render()
    pickFile(file('me.png', 'image/png'))
    await press('apply')
    expect(editor()).toBeNull()
    expect(host.textContent).toContain('Could not add the photo')
  })

  it('opens a fresh editor for each photo', async () => {
    await render()
    pickFile(file('first.png', 'image/png'))
    await press('cancel')
    pickFile(file('second.png', 'image/png'))
    expect(editor()?.textContent).toContain('editing second.png')
  })
})
