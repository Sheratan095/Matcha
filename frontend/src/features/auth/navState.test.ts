import { describe, expect, it } from 'vitest'
import { readLoginState, safeFrom } from './navState'

describe('safeFrom', () => {
  it('lets an in-app path through, query and hash included', () => {
    for (const path of ['/', '/discover', '/chat/42', '/matches?tab=likes', '/me#photos']) {
      expect(safeFrom(path), path).toBe(path)
    }
  })

  it('refuses anything that is not a plain in-app path', () => {
    for (const value of ['', 'discover', 'https://evil.example', '//evil.example', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(safeFrom(value), value).toBeNull()
    }
  })

  it('refuses what a browser would read as "//host" once it parses the URL', () => {
    // "\" counts as "/" in a URL path; a tab or newline is stripped out of it. Neither STARTS with "//".
    const tab = String.fromCharCode(0x09)
    const newline = String.fromCharCode(0x0a)
    const carriageReturn = String.fromCharCode(0x0d)
    for (const value of ['/\\evil.example', `/${tab}/evil.example`, `/${newline}/evil.example`, `/${carriageReturn}/evil.example`, '/a\\b']) {
      expect(safeFrom(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('refuses a control character anywhere, and DEL', () => {
    expect(safeFrom(`/ok${String.fromCharCode(0x00)}`)).toBeNull()
    expect(safeFrom(`/ok${String.fromCharCode(0x7f)}`)).toBeNull()
  })

  it('never sends a signed-in user back to the login page', () => {
    expect(safeFrom('/login')).toBeNull()
    expect(safeFrom('/login?next=/me')).toBeNull()
  })

  it('refuses a value that is not a string', () => {
    for (const value of [undefined, null, 42, {}, ['/x']]) {
      expect(safeFrom(value)).toBeNull()
    }
  })
})

describe('readLoginState', () => {
  it('drops a crafted `from` and keeps nothing it cannot check', () => {
    const state = readLoginState({ from: '//evil.example', verified: 'yes', username: 'a'.repeat(100) })
    expect(state.from).toBeUndefined()
    expect(state.verified).toBe(false)
    expect(state.username).toHaveLength(40)
  })

  it('survives a history state that is not an object at all', () => {
    for (const state of [undefined, null, 'x', 7]) {
      expect(readLoginState(state)).toEqual({ from: undefined, verified: false, reset: false, username: undefined })
    }
  })
})
