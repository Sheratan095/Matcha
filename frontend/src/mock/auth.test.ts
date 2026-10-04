import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LoginResult, MockEmail, RegisterResult, SessionCheck } from '@/api/types'
import { installMockBackend, uninstallMockBackend } from './index'
import { call } from './testkit'

const NEWCOMER = {
  username: 'Jo_Doe',
  email: 'Jo.Doe@Example.com ',
  password: 'correct horse battery',
  firstName: 'Jo',
  lastName: 'Doe',
}

async function inbox(): Promise<MockEmail[]> {
  return (await call<MockEmail[]>('GET', '/__mock/dev/inbox')).data
}

beforeEach(() => {
  localStorage.clear()
  installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
})

afterEach(() => {
  uninstallMockBackend()
})

describe('demo auth journey', () => {
  it('register -> inbox token -> verify -> login -> validate -> logout', async () => {
    const registered = await call<RegisterResult>('POST', '/__mock/auth/register', NEWCOMER)
    expect(registered.status).toBe(200)
    expect(registered.data.message).toBe('Email verification required')
    expect(registered.data.userId).toMatch(/^[0-9a-f-]{36}$/)

    // not verified yet: correct password -> 403 EMAIL_NOT_VERIFIED and a fresh token
    const early = await call('POST', '/__mock/auth/login', { username: ' JO_DOE ', password: NEWCOMER.password })
    expect(early).toEqual({
      status: 403,
      data: { message: 'Email not verified', error: 'EMAIL_NOT_VERIFIED', statusCode: 403 },
    })
    const emails = await inbox()
    expect(emails).toHaveLength(2)
    const [latest, first] = emails as [MockEmail, MockEmail]
    expect(latest.to).toBe('jo.doe@example.com')
    expect(latest.kind).toBe('verify-email')
    expect(latest.token).toMatch(/^[0-9a-f]{16}$/)
    expect(latest.link).toBe(`/verify-email?token=${latest.token}`)

    // the first token was invalidated by the second
    expect((await call('POST', '/__mock/auth/verify-email', { token: first.token })).status).toBe(403)
    const verified = await call('POST', '/__mock/auth/verify-email', { token: ` ${latest.token} ` })
    expect(verified).toEqual({ status: 200, data: { message: 'Email verified successfully', userId: registered.data.userId } })

    const login = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'jo_doe', password: NEWCOMER.password })
    expect(login).toEqual({
      status: 200,
      data: { message: 'Login successful', userId: registered.data.userId, isProfileComplete: false },
    })
    expect((await call<SessionCheck>('GET', '/__mock/auth/validate')).data).toEqual({ valid: true, userId: registered.data.userId })

    const profile = await call<{ firstName: string; gender: null }>('GET', '/__mock/profile')
    expect(profile.status).toBe(200)
    expect(profile.data).toMatchObject({ firstName: 'Jo', lastName: 'Doe', gender: null, interests: [], pictures: [] })

    expect(await call('POST', '/__mock/auth/logout', {})).toEqual({ status: 200, data: { message: 'Logged out successfully' } })
    expect((await call<SessionCheck>('GET', '/__mock/auth/validate')).data).toEqual({ valid: false, userId: null })
    expect(await call('GET', '/__mock/profile')).toEqual({
      status: 401,
      data: { message: 'Missing or invalid access token', error: 'Unauthorized', statusCode: 401 },
    })
  })

  it('logs in the seeded accounts with a complete profile and generated pictures', async () => {
    for (const username of ['testuser', 'alice']) {
      const login = await call<LoginResult>('POST', '/__mock/auth/login', { username, password: '1234' })
      expect(login.status).toBe(200)
      expect(login.data.isProfileComplete).toBe(true)
      const profile = await call<{ pictures: { url: string; isProfile: boolean }[] }>('GET', '/__mock/profile')
      expect(profile.data.pictures.length).toBe(username === 'testuser' ? 5 : 2)
      expect(profile.data.pictures[0]?.url.startsWith('data:image/svg+xml,')).toBe(true)
      expect(profile.data.pictures.filter((picture) => picture.isProfile)).toHaveLength(1)
    }
    // admin's seeded hash matches no password
    expect((await call('POST', '/__mock/auth/login', { username: 'admin', password: '1234' })).status).toBe(403)
  })

  it('keeps the session across a reload (the "cookie" is in localStorage)', async () => {
    const login = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })
    uninstallMockBackend()
    installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
    expect((await call<SessionCheck>('GET', '/__mock/auth/validate')).data).toEqual({ valid: true, userId: login.data.userId })
  })
})

describe('demo auth errors', () => {
  it('reports every validation message, Nest style', async () => {
    const answer = await call('POST', '/__mock/auth/register', { username: 'a!', email: 'nope', password: 'short', firstName: 'Jean-Luc' })
    expect(answer).toEqual({
      status: 400,
      data: {
        message: [
          'username must match /^[a-z0-9_.]+$/ regular expression',
          'username must be longer than or equal to 3 characters',
          'email must be an email',
          'firstName must match /^[a-zA-Z]+$/ regular expression',
          'lastName must match /^[a-zA-Z]+$/ regular expression',
          'lastName must be longer than or equal to 1 characters',
          'lastName must be a string',
          'lastName should not be empty',
          'password must be longer than or equal to 8 characters',
        ],
        error: 'Bad Request',
        statusCode: 400,
      },
    })
  })

  it('rejects common passwords, reserved usernames and taken names', async () => {
    const base = { ...NEWCOMER, username: 'someone', email: 'someone@example.com' }
    expect(await call('POST', '/__mock/auth/register', { ...base, password: 'password123' })).toEqual({
      status: 400,
      data: { message: 'This password is too common. Please choose a more secure password.', error: 'COMMON_PASSWORD', statusCode: 400 },
    })
    expect(await call('POST', '/__mock/auth/register', { ...base, username: 'Admin' })).toEqual({
      status: 400,
      data: { message: "This username isn't available. Please choose a different username.", error: 'RESERVED_USERNAME', statusCode: 400 },
    })
    expect(await call('POST', '/__mock/auth/register', { ...base, username: 'alice' })).toEqual({
      status: 409,
      data: { message: 'User already exists', error: 'Conflict', statusCode: 409 },
    })
    expect(await call('POST', '/__mock/auth/register', { ...base, email: 'alice@matcha.local' })).toEqual({
      status: 409,
      data: { message: 'Email already in use', error: 'Conflict', statusCode: 409 },
    })
  })

  it('answers 403 Invalid credentials for an unknown user and a wrong password alike', async () => {
    const body = { message: 'Invalid credentials', error: 'Forbidden', statusCode: 403 }
    expect(await call('POST', '/__mock/auth/login', { username: 'nobody', password: 'whatever' })).toEqual({ status: 403, data: body })
    expect(await call('POST', '/__mock/auth/login', { username: 'alice', password: 'wrong' })).toEqual({ status: 403, data: body })
    expect(await call('POST', '/__mock/auth/login', {})).toEqual({
      status: 400,
      data: {
        message: ['username should not be empty', 'username must be a string', 'password should not be empty', 'password must be a string'],
        error: 'Bad Request',
        statusCode: 400,
      },
    })
  })

  it('resets a password through the inbox (201), refusing reuse and bad tokens', async () => {
    const forgot = await call('POST', '/__mock/auth/forgot-password', { email: 'ALICE@matcha.local' })
    expect(forgot.status).toBe(201)
    // same answer for an unknown address, and no email
    expect((await call('POST', '/__mock/auth/forgot-password', { email: 'ghost@example.com' })).status).toBe(201)
    const emails = await inbox()
    expect(emails).toHaveLength(1)
    const reset = emails[0] as MockEmail
    expect(reset).toMatchObject({ to: 'alice@matcha.local', kind: 'reset-password' })
    expect(reset.token).toMatch(/^[0-9a-f]{24}$/)

    expect(await call('POST', '/__mock/auth/reset-password', { token: 'deadbeef', password: 'a fine new password' })).toEqual({
      status: 403,
      data: { message: 'Invalid or expired reset token', error: 'Forbidden', statusCode: 403 },
    })
    const done = await call('POST', '/__mock/auth/reset-password', { token: reset.token, password: 'a fine new password' })
    expect(done).toEqual({ status: 201, data: { message: 'Password reset successfully' } })
    expect((await call('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })).status).toBe(403)
    expect((await call('POST', '/__mock/auth/login', { username: 'alice', password: 'a fine new password' })).status).toBe(200)

    await call('POST', '/__mock/auth/forgot-password', { email: 'alice@matcha.local' })
    const second = (await inbox())[0] as MockEmail
    expect(await call('POST', '/__mock/auth/reset-password', { token: second.token, password: 'a fine new password' })).toEqual({
      status: 400,
      data: { message: 'The new password must be different from the previous one.', error: 'PASSWORD_REUSE', statusCode: 400 },
    })
  })

  it('changes the email only once the new address is verified', async () => {
    await call('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })
    expect(await call('POST', '/__mock/auth/change-email', { newEmail: 'alice@matcha.local' })).toEqual({
      status: 400,
      data: { message: 'New email is the same as the current email', error: 'Bad Request', statusCode: 400 },
    })
    expect(await call('POST', '/__mock/auth/change-email', { newEmail: 'testuser@matcha.local' })).toEqual({
      status: 409,
      data: { message: 'Email already exists', error: 'Conflict', statusCode: 409 },
    })
    expect((await call('POST', '/__mock/auth/change-email', { newEmail: 'alice@wonder.land' })).status).toBe(200)
    const mail = (await inbox())[0] as MockEmail
    expect(mail).toMatchObject({ to: 'alice@wonder.land', kind: 'verify-email' })
    // until it is verified, the new address is not the account's address
    await call('POST', '/__mock/auth/forgot-password', { email: 'alice@wonder.land' })
    expect(await inbox()).toHaveLength(1)
    expect((await call('POST', '/__mock/auth/verify-email', { token: mail.token })).status).toBe(200)
    await call('POST', '/__mock/auth/forgot-password', { email: 'alice@wonder.land' })
    expect(await inbox()).toHaveLength(2)
    expect(((await inbox())[0] as MockEmail)).toMatchObject({ to: 'alice@wonder.land', kind: 'reset-password' })
  })

  it('refuses refresh without a session (403) and accepts it with one', async () => {
    expect(await call('POST', '/__mock/auth/refresh', {})).toEqual({
      status: 403,
      data: { message: 'Invalid refresh token', error: 'Forbidden', statusCode: 403 },
    })
    const login = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'testuser', password: '1234' })
    expect(await call('POST', '/__mock/auth/refresh', new FormData())).toEqual({
      status: 200,
      data: { message: 'Tokens refreshed', userId: login.data.userId },
    })
  })

  it('does not serve auth or profile when auth is real; the inbox is then empty', async () => {
    installMockBackend({ auth: false, getViewerId: () => null, latency: 0 })
    expect(await call('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })).toEqual({
      status: 404,
      data: { message: 'Cannot POST /login', error: 'Not Found', statusCode: 404 },
    })
    expect((await call('GET', '/__mock/profile')).status).toBe(404)
    expect(await call('GET', '/__mock/dev/inbox')).toEqual({ status: 200, data: [] })
  })
})
