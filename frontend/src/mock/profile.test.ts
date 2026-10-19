import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LoginResult, PicturesResult, Profile, RegisterResult, ViewersResult, MockEmail } from '@/api/types'
import { installMockBackend, uninstallMockBackend } from './index'
import { PEOPLE } from './people'
import { call, fakeFile, form } from './testkit'

async function newUser(): Promise<string> {
  const registered = await call<RegisterResult>('POST', '/__mock/auth/register', {
    username: 'newbie',
    email: 'newbie@example.com',
    password: 'a long enough password',
    firstName: 'Nina',
    lastName: 'Bee',
  })
  const mail = (await call<MockEmail[]>('GET', '/__mock/dev/inbox')).data[0] as MockEmail
  await call('POST', '/__mock/auth/verify-email', { token: mail.token })
  await call('POST', '/__mock/auth/login', { username: 'newbie', password: 'a long enough password' })
  return registered.data.userId
}

beforeEach(() => {
  localStorage.clear()
  installMockBackend({ auth: true, getViewerId: () => null, latency: 0 })
})

afterEach(() => {
  uninstallMockBackend()
})

describe('profile update and completeness', () => {
  it('applies only the given fields, normalises interests and flips completeness', async () => {
    const userId = await newUser()
    const partial = await call<Profile>('PATCH', '/__mock/profile', { gender: 'female', biography: '   ', unknownField: 'dropped' })
    expect(partial.status).toBe(200)
    expect(partial.data).toMatchObject({ userId, firstName: 'Nina', gender: 'female', sexualPreference: null })
    expect(partial.data).not.toHaveProperty('unknownField')

    const loginIncomplete = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'newbie', password: 'a long enough password' })
    expect(loginIncomplete.data.isProfileComplete).toBe(false)

    const full = await call<Profile>('PATCH', '/__mock/profile', {
      sexualPreference: 'both',
      biography: 'Hello there.',
      interests: [' Vegan', 'vegan', 'HIKING', ''],
    })
    expect(full.data.interests.map((tag) => tag.name)).toEqual(['vegan', 'hiking'])
    expect(full.data.interests[0]?.id).toMatch(/^[0-9a-f-]{36}$/)
    const login = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'newbie', password: 'a long enough password' })
    expect(login.data.isProfileComplete).toBe(true)

    // explicit null clears; empty strings read back as null
    const cleared = await call<Profile>('PATCH', '/__mock/profile', { lastName: null, biography: '' })
    expect(cleared.data).toMatchObject({ lastName: null, biography: null })
    expect((await call<LoginResult>('POST', '/__mock/auth/login', { username: 'newbie', password: 'a long enough password' })).data.isProfileComplete).toBe(false)
  })

  it('validates like the backend DTO', async () => {
    await newUser()
    expect(
      await call('PATCH', '/__mock/profile', {
        gender: 'robot',
        sexualPreference: 'all',
        firstName: 'x'.repeat(51),
        biography: 12,
        interests: ['ok', 'y'.repeat(51), 3],
      }),
    ).toEqual({
      status: 400,
      data: {
        message: [
          'firstName must be shorter than or equal to 50 characters',
          'gender must be one of the following values: male, female, other',
          'sexualPreference must be one of the following values: male, female, both, other',
          'biography must be shorter than or equal to 500 characters',
          'biography must be a string',
          'each value in interests must be shorter than or equal to 50 characters',
          'each value in interests must be a string',
        ],
        error: 'Bad Request',
        statusCode: 400,
      },
    })
    expect((await call('PATCH', '/__mock/profile', { interests: 'hiking' })).data).toMatchObject({ message: ['interests must be an array'] })
  })

  it('reads other profiles: accounts, mock people, 404 and 400', async () => {
    const alice = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })
    const testuser = await call<LoginResult>('POST', '/__mock/auth/login', { username: 'testuser', password: '1234' })
    const person = PEOPLE[0]!
    const seen = await call<Profile>('GET', `/__mock/profile/${alice.data.userId}`)
    expect(seen.data).toMatchObject({ firstName: 'Alice', lastName: 'Wonderland' })
    const mock = await call<Profile>('GET', `/__mock/profile/${person.id}`)
    expect(mock.data).toMatchObject({ userId: person.id, firstName: person.firstName })
    expect(mock.data).not.toHaveProperty('age')
    expect(await call('GET', '/__mock/profile/00000000-0000-4000-8000-000000000000')).toEqual({
      status: 404,
      data: { message: 'Profile not found', error: 'Not Found', statusCode: 404 },
    })
    expect(await call('GET', '/__mock/profile/pictures')).toEqual({
      status: 400,
      data: { message: ['userId must be a UUID'], error: 'Bad Request', statusCode: 400 },
    })
    expect((await call('GET', `/__mock/profile/${alice.data.userId}/is-complete`)).data).toEqual({ isComplete: true })

    // testuser viewed alice: alice sees it among her viewers (next to the mock people who did)
    await call('POST', '/__mock/auth/login', { username: 'alice', password: '1234' })
    const viewers = await call<ViewersResult>('GET', '/__mock/profile/viewers')
    expect(viewers.data.viewers).toContain(testuser.data.userId)
    expect(viewers.data.viewers.length).toBeGreaterThan(2)
  })

  it('serves the online count as a bare number', async () => {
    await newUser()
    const online = await call<number>('GET', '/__mock/notification/online')
    expect(online.status).toBe(200)
    expect(typeof online.data).toBe('number')
    expect(online.data).toBeGreaterThanOrEqual(1)
  })
})

describe('pictures', () => {
  it('uploads up to five, first one is the profile picture', async () => {
    await newUser()
    const first = await call<PicturesResult>('POST', '/__mock/profile/pictures', form('file', fakeFile('me.jpg', 'image/jpeg'), 'me.jpg'))
    expect(first.status).toBe(200)
    expect(first.data.pictures).toHaveLength(1)
    expect(first.data.pictures[0]).toMatchObject({ isProfile: true })
    // no canvas in jsdom: a small file is kept as a data URL
    expect(first.data.pictures[0]?.url.startsWith('data:')).toBe(true)
    for (let i = 2; i <= 5; i++) {
      const next = await call<PicturesResult>('POST', '/__mock/profile/pictures', form('file', fakeFile(`p${i}.png`, 'image/png'), `p${i}.png`))
      expect(next.data.pictures).toHaveLength(i)
    }
    expect(await call('POST', '/__mock/profile/pictures', form('file', fakeFile('six.webp', 'image/webp')))).toEqual({
      status: 400,
      data: { message: 'You can upload at most 5 pictures', error: 'Bad Request', statusCode: 400 },
    })
  })

  it('enforces type, size and field rules', async () => {
    await newUser()
    expect(await call('POST', '/__mock/profile/pictures', form('file', fakeFile('anim.gif', 'image/gif')))).toEqual({
      status: 400,
      data: { message: 'Only JPEG, PNG and WEBP images are allowed', error: 'Bad Request', statusCode: 400 },
    })
    expect(await call('POST', '/__mock/profile/pictures', form('file', fakeFile('huge.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)))).toEqual({
      status: 413,
      data: { message: 'File too large', error: 'Payload Too Large', statusCode: 413 },
    })
    expect(await call('POST', '/__mock/profile/pictures', form('photo', fakeFile('me.jpg', 'image/jpeg')))).toEqual({
      status: 400,
      data: { message: 'Unexpected field', error: 'Bad Request', statusCode: 400 },
    })
    expect(await call('POST', '/__mock/profile/pictures', new FormData())).toEqual({
      status: 400,
      data: { message: 'Missing "file" field', error: 'Bad Request', statusCode: 400 },
    })
    // a big file that cannot be decoded here still yields a usable picture
    const big = await call<PicturesResult>('POST', '/__mock/profile/pictures', form('file', fakeFile('big.jpg', 'image/jpeg', 3 * 1024 * 1024)))
    expect(big.data.pictures[0]?.url.startsWith('data:image/svg+xml,')).toBe(true)
  })

  it('deletes and sets the main picture, promoting another when the main one goes', async () => {
    await call('POST', '/__mock/auth/login', { username: 'testuser', password: '1234' })
    const profile = (await call<Profile>('GET', '/__mock/profile')).data
    const [main, second] = profile.pictures as [Profile['pictures'][0], Profile['pictures'][0]]
    expect(main.isProfile).toBe(true)

    const swapped = await call<PicturesResult>('PATCH', `/__mock/profile/pictures/${second.id}/profile`)
    expect(swapped.data.pictures.filter((p) => p.isProfile).map((p) => p.id)).toEqual([second.id])

    const removed = await call<PicturesResult>('DELETE', `/__mock/profile/pictures/${second.id}`)
    expect(removed.data.pictures).toHaveLength(4)
    expect(removed.data.pictures.filter((p) => p.isProfile)).toHaveLength(1)

    expect(await call('DELETE', `/__mock/profile/pictures/${second.id}`)).toEqual({
      status: 404,
      data: { message: 'Picture not found', error: 'Not Found', statusCode: 404 },
    })
    expect(await call('DELETE', '/__mock/profile/pictures/nope')).toEqual({
      status: 400,
      data: { message: ['pictureId must be a UUID'], error: 'Bad Request', statusCode: 400 },
    })
  })
})
