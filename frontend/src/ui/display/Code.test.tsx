/**
 * `CommandBlock`: comments get no prompt, and Copy puts the commands (not the comments, not the prompts) on the clipboard.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBlock } from './Code'

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
  vi.unstubAllGlobals()
})

const LINES = ['# bring it up', 'make infra', 'pnpm --filter @matcha/profile test | tail -n 20']

describe('CommandBlock', () => {
  it('prompts every command but not the comment, and counts the commands in the strip', () => {
    act(() => root.render(createElement(CommandBlock, { lines: LINES, prompt: 'PS>', copy: false })))
    const lines = [...container.querySelectorAll('code > span')]
    expect(lines.map((l) => l.getAttribute('data-prompt'))).toEqual([null, 'PS>', 'PS>'])
    expect(container.textContent).toContain('2 commands')
    expect(container.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Terminal, 2 commands')
  })

  it('highlights the command and its flags, and restarts after a pipe', () => {
    act(() => root.render(createElement(CommandBlock, { lines: [LINES[2]], copy: false })))
    const spans = [...container.querySelectorAll('code > span > span')]
    const text = (kind: string) => spans.filter((el) => el.className.includes(kind)).map((el) => el.textContent)
    expect(text('cmd')).toEqual(['pnpm', 'tail'])
    expect(text('flag')).toEqual(['--filter', '-n'])
    expect(text('op')).toEqual(['|'])
  })

  it('copies the commands only', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    act(() => root.render(createElement(CommandBlock, { lines: LINES })))
    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Copy')
    await act(async () => button?.click())
    expect(writeText).toHaveBeenCalledWith('make infra\npnpm --filter @matcha/profile test | tail -n 20')
    expect(container.querySelector('button')?.textContent).toBe('Copied')
  })

  it('has no Copy button where there is no clipboard', () => {
    vi.stubGlobal('navigator', {})
    act(() => root.render(createElement(CommandBlock, { lines: LINES })))
    expect(container.querySelector('button')).toBeNull()
  })
})
