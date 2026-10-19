/**
 * Demo-mode stand-in for the profile service (`/__mock/profile/*`) and `/__mock/notification/online`.
 * Same paths, validation, limits, status codes and error bodies as docs/API_CONTRACT.md §2.2, §2.3
 * and §4, with the intended behaviour where the backend has a known bug:
 * - an unknown profile is 404 "Profile not found" (the backend answers 500);
 * - non-string values and `interests: null` are 400s (the backend answers 500);
 * - duplicate and empty interest names are dropped (the backend answers 500 / stores '');
 * - deleting the profile picture promotes the oldest remaining one, and an upload while there is no
 *   profile picture becomes it (the backend leaves the user without one).
 * `GET /profile/{userId}` also resolves the mock people.
 */
import { MAX_PICTURE_BYTES, MAX_USER_PICTURES, PICTURE_MIME_TYPES, type ProfileUpdatePayload } from '@/api/types'
import {
  accountProfile,
  accountViewers,
  authDb,
  isProfileComplete,
  recordAccountView,
  requireAccount,
  saveAuthDb,
  toProfile,
  type AccountProfile,
} from './accounts'
import { randomUuid } from './ids'
import { processUpload } from './images'
import { nestError, ok, record, text, type Handler } from './nest'
import { personById, personProfile } from './people'
import { mockViewers, onlineNow } from './social'
import { normaliseInterest } from './tags'
import { is, trim, uuidParam, validate } from './validate'
import { currentViewer } from './viewer'

function myProfile(): { userId: string; profile: AccountProfile } {
  const account = requireAccount()
  const profile = accountProfile(account.id)
  // the backend's answer when the profile row is missing
  if (!profile) throw nestError(500, 'Failed to fetch profile')
  return { userId: account.id, profile }
}

function picturesOf(userId: string, profile: AccountProfile) {
  return { pictures: toProfile(userId, profile).pictures }
}

// ---------------------------------------------------------------- profile

const getMine: Handler = () => {
  const { userId, profile } = myProfile()
  return ok(toProfile(userId, profile))
}

const updateMine: Handler = (request) => {
  const { userId, profile } = myProfile()
  const input = validate<{ [Key in keyof ProfileUpdatePayload]: ProfileUpdatePayload[Key] | null }>(record(request.body), {
    firstName: { optional: true, transform: trim, checks: [is.maxLength(50), is.string()] },
    lastName: { optional: true, transform: trim, checks: [is.maxLength(50), is.string()] },
    gender: { optional: true, checks: [is.oneOf(['male', 'female', 'other'])] },
    sexualPreference: { optional: true, checks: [is.oneOf(['male', 'female', 'both', 'other'])] },
    biography: { optional: true, checks: [is.maxLength(500), is.string()] },
    interests: { optional: true, checks: [is.each.maxLength(50), is.each.string(), is.array()] },
  })
  if (input.interests === null) throw nestError(400, ['interests must be an array'])
  // an explicit null clears the column; an absent field is left alone
  if (input.firstName !== undefined) profile.firstName = input.firstName
  if (input.lastName !== undefined) profile.lastName = input.lastName
  if (input.gender !== undefined) profile.gender = input.gender
  if (input.sexualPreference !== undefined) profile.sexualPreference = input.sexualPreference
  if (input.biography !== undefined) profile.biography = input.biography
  if (input.interests !== undefined) {
    profile.interests = [...new Set(input.interests.map(normaliseInterest).filter(Boolean))]
  }
  profile.updatedAt = new Date().toISOString()
  if (!saveAuthDb()) throw nestError(500, 'Failed to update profile')
  return ok(toProfile(userId, profile))
}

/** `POST /profile`: unauthenticated, as in the backend (the OAuth workaround). */
const create: Handler = (request) => {
  const input = validate<{ userId: string; firstName?: string; lastName?: string }>(record(request.body), {
    userId: { checks: [is.uuid()] },
    firstName: { optional: true, transform: trim, checks: [is.maxLength(50), is.string()] },
    lastName: { optional: true, transform: trim, checks: [is.maxLength(50), is.string()] },
  })
  const db = authDb()
  if (db.profiles[input.userId]) throw nestError(409, 'Profile already exists')
  if (!db.accounts.some((account) => account.id === input.userId)) throw nestError(500, 'Profile creation failed')
  const now = new Date().toISOString()
  db.profiles[input.userId] = {
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    gender: null,
    sexualPreference: null,
    biography: null,
    interests: [],
    pictures: [],
    createdAt: now,
    updatedAt: now,
  }
  saveAuthDb()
  return ok({ message: 'Profile created', userId: input.userId })
}

// Resolves a viewer id to its username and profile picture, from the demo accounts or the mock people.
const resolveViewer = (id: string) => {
  const profilePicture = (pictures: { url: string; isProfile: boolean }[]) =>
    (pictures.find((picture) => picture.isProfile) ?? pictures[0])?.url ?? null

  const account = authDb().accounts.find((candidate) => candidate.id === id)
  if (account) {
    const profile = accountProfile(id)
    const pictures = profile ? toProfile(id, profile).pictures : []
    return { viewerId: id, username: account.username, profilePictureUrl: profilePicture(pictures) }
  }
  const person = personById(id)
  if (person)
    return { viewerId: id, username: person.key, profilePictureUrl: profilePicture(personProfile(person).pictures) }
  return { viewerId: id, username: id, profilePictureUrl: null }
}

const viewers: Handler = () => {
  const account = requireAccount()
  const viewer = currentViewer()
  const people = viewer ? mockViewers(viewer) : []
  const all = [...people, ...accountViewers(account.id)].sort((a, b) => b.at - a.at)
  const ids = [...new Set(all.map((entry) => entry.id))]
  return ok({ viewers: ids.map(resolveViewer) })
}

const isComplete: Handler = (_request, params) => {
  const userId = uuidParam(params.userId, 'userId')
  const isCompleteValue = personById(userId) ? true : isProfileComplete(accountProfile(userId))
  return ok({ isComplete: isCompleteValue })
}

const getOne: Handler = (_request, params) => {
  const account = requireAccount()
  const userId = uuidParam(params.userId, 'userId')
  const person = personById(userId)
  if (person) return ok(personProfile(person))
  const profile = accountProfile(userId)
  if (!profile) throw nestError(404, 'Profile not found')
  recordAccountView(account.id, userId, Date.now())
  return ok(toProfile(userId, profile))
}

// ---------------------------------------------------------------- pictures

const isFile = (value: FormDataEntryValue): value is File => typeof value !== 'string'

const upload: Handler = async (request) => {
  const { userId, profile } = myProfile()
  // multer's checks, in multer's order: field name, file count, declared type, size
  const files = request.form ? [...request.form.entries()].filter(([, value]) => isFile(value)) : []
  if (files.some(([field]) => field !== 'file')) throw nestError(400, 'Unexpected field')
  if (files.length > 1) throw nestError(400, 'Too many files')
  const file = files[0]?.[1] as File | undefined
  if (file && !PICTURE_MIME_TYPES.includes(file.type)) throw nestError(400, 'Only JPEG, PNG and WEBP images are allowed')
  if (file && file.size > MAX_PICTURE_BYTES) throw nestError(413, 'File too large')
  if (!file) throw nestError(400, 'Missing "file" field')
  if (profile.pictures.length >= MAX_USER_PICTURES) {
    throw nestError(400, `You can upload at most ${MAX_USER_PICTURES} pictures`)
  }
  const src = await processUpload(file, file.name)
  const picture = {
    id: randomUuid(),
    src,
    isProfile: !profile.pictures.some((candidate) => candidate.isProfile),
    createdAt: new Date().toISOString(),
  }
  profile.pictures.push(picture)
  if (!saveAuthDb()) {
    // the browser storage is full: undo, like a failed object-storage write
    profile.pictures = profile.pictures.filter((candidate) => candidate !== picture)
    throw nestError(500, 'Failed to store picture')
  }
  return ok(picturesOf(userId, profile))
}

const removePicture: Handler = (_request, params) => {
  const { userId, profile } = myProfile()
  const pictureId = uuidParam(params.pictureId, 'pictureId')
  const picture = profile.pictures.find((candidate) => candidate.id === pictureId)
  if (!picture) throw nestError(404, 'Picture not found')
  profile.pictures = profile.pictures.filter((candidate) => candidate !== picture)
  const first = profile.pictures[0]
  if (picture.isProfile && first) first.isProfile = true
  saveAuthDb()
  return ok(picturesOf(userId, profile))
}

const setMain: Handler = (_request, params) => {
  const { userId, profile } = myProfile()
  const pictureId = uuidParam(params.pictureId, 'pictureId')
  if (!profile.pictures.some((candidate) => candidate.id === pictureId)) throw nestError(404, 'Picture not found')
  for (const picture of profile.pictures) picture.isProfile = picture.id === pictureId
  saveAuthDb()
  return ok(picturesOf(userId, profile))
}

// ---------------------------------------------------------------- routes (specific paths before /:userId)

export const profileRoutes: readonly { method: string; pattern: string; handler: Handler }[] = [
  { method: 'GET', pattern: '/profile', handler: getMine },
  { method: 'PATCH', pattern: '/profile', handler: updateMine },
  { method: 'POST', pattern: '/profile', handler: create },
  { method: 'GET', pattern: '/profile/health', handler: () => text('OK') },
  { method: 'GET', pattern: '/profile/viewers', handler: viewers },
  { method: 'POST', pattern: '/profile/pictures', handler: upload },
  { method: 'DELETE', pattern: '/profile/pictures/:pictureId', handler: removePicture },
  { method: 'PATCH', pattern: '/profile/pictures/:pictureId/profile', handler: setMain },
  { method: 'GET', pattern: '/profile/:userId/is-complete', handler: isComplete },
  { method: 'GET', pattern: '/profile/:userId', handler: getOne },
  // a bare number sent as text, like the notification service
  { method: 'GET', pattern: '/notification/online', handler: () => text(onlineNow()) },
]
