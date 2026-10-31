/**
 * Demo-mode stand-in for the auth service (`/__mock/auth/*`) and the dev inbox (`/__mock/dev/inbox`),
 * plus the store of demo accounts and their profiles (served by profiles.ts).
 *
 * Same paths, bodies, validation, status codes and error bodies as docs/API_CONTRACT.md §2.1 and §3.
 * Demo conveniences: the session "cookie" is a localStorage entry, and emails land in the dev inbox.
 */
import type {
  Gender,
  Language,
  MockEmail,
  Profile,
  SexualPreference,
} from '@/api/types'
import { LANGUAGES } from '@/api/types'
import { fnv, randomHex, randomUuid, uuidFrom } from './ids'
import { nestError, ok, record, text, unauthorized, type Handler, type MockRequest } from './nest'
import { portraitDataUrl, type PortraitLook } from './portraits'
import { claimTimers, runtime } from './runtime'
import { arrayOf, isNumber, isRecord, isString, load, remove, save } from './storage'
import { toInterestTags } from './tags'
import { is, trim, trimLower, validate, type Check } from './validate'

// ---------------------------------------------------------------- model

export interface Account {
  id: string
  username: string
  email: string
  /** Set by change-email until the new address is verified. */
  pendingEmail: string | null
  passwordHash: string
  emailVerified: boolean
  language: Language
  createdAt: string
}

export interface StoredPicture {
  id: string
  /** A data URL, or `portrait:<look>:<variant>` for the generated pictures of the seeded accounts. */
  src: string
  isProfile: boolean
  createdAt: string
}

export interface AccountProfile {
  firstName: string | null
  lastName: string | null
  gender: Gender | null
  sexualPreference: SexualPreference | null
  biography: string | null
  /** Lowercase names, no duplicates. */
  interests: string[]
  /** Upload order. */
  pictures: StoredPicture[]
  createdAt: string
  updatedAt: string
}

interface TokenRecord {
  token: string
  userId: string
  /** Address the email went to (the pending one for an email change). */
  email: string
  expiresAt: number
}

interface ViewRecord {
  viewerId: string
  viewedId: string
  at: number
}

interface AuthDb {
  v: 1
  accounts: Account[]
  profiles: Record<string, AccountProfile>
  verifyTokens: TokenRecord[]
  resetTokens: TokenRecord[]
  /** Newest first. */
  inbox: MockEmail[]
  views: ViewRecord[]
}

const DB_SCOPE = 'auth'
const SESSION_SCOPE = 'session'
const TOKEN_TTL_MS = 60 * 60 * 1000
const INBOX_LIMIT = 50

// ---------------------------------------------------------------- policies (backend/infra/security/policies)

/** The technical entries of reserved-usernames.txt (the offensive-word entries are not reproduced). */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'superuser', 'system', 'internal', 'api', 'auth', 'matcha', 'support', 'help',
  'contact', 'info', 'mail', 'webmaster', 'postmaster', 'hostmaster', 'null', 'undefined', 'none',
])

/** The entries of common-password.txt that pass the 8-character minimum (shorter ones fail validation first). */
const COMMON_PASSWORDS = new Set([
  'password', '12345678', '123456789', 'p@ssword', 'football', 'iloveyou', 'sunshine', 'baseball', 'qwertyuiop',
  '1234567890', 'trustno1', 'princess', 'superman', 'swimming', 'basketball', 'computer', 'password123', 'nicholas',
  'christopher', 'elizabeth', 'patricia', 'jennifer', 'margaret', 'kathleen', 'fernando', 'alejandro', 'christian',
  'emmanuel',
])

/** Not security: the demo only needs to compare passwords without storing them in clear. */
function hashPassword(password: string): string {
  return `mock1$${fnv(password, 0x2545f491).toString(36)}${fnv(password, 0x9e3779b9).toString(36)}`
}

// ---------------------------------------------------------------- seed (backend/infra/db/seeds/001_users.sql)

const SEED_DATE = '2026-09-30T08:45:31.644Z'

/** Generated pictures of the seeded accounts. */
const ACCOUNT_LOOKS: Readonly<Record<string, PortraitLook>> = {
  testuser: { skin: 3, hair: 'curls', hairColor: 'espresso', glasses: 'round', earrings: 'stud', top: 'tee', topColor: 'matcha' },
  alice: { skin: 0, face: 'oval', hair: 'long', hairColor: 'blond', blush: true, top: 'vneck', topColor: 'blue' },
}

function seedPictures(key: string, variants: readonly number[]): StoredPicture[] {
  return variants.map((variant, index) => ({
    id: uuidFrom(`account-picture:${key}:${variant}`),
    src: `portrait:${key}:${variant}`,
    isProfile: index === 0,
    createdAt: SEED_DATE,
  }))
}

function seedDb(): AuthDb {
  const account = (username: string, passwordHash: string): Account => ({
    id: uuidFrom(`account:${username}`),
    username,
    email: `${username}@matcha.local`,
    pendingEmail: null,
    passwordHash,
    emailVerified: true,
    language: 'en',
    createdAt: SEED_DATE,
  })
  const testuser = account('testuser', hashPassword('1234'))
  const alice = account('alice', hashPassword('1234'))
  // `fake_hash_1` in the seed: no password matches it.
  const admin = account('admin', 'fake_hash_1')
  const profile = (fields: Partial<AccountProfile>): AccountProfile => ({
    firstName: null,
    lastName: null,
    gender: null,
    sexualPreference: null,
    biography: null,
    interests: [],
    pictures: [],
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    ...fields,
  })
  return {
    v: 1,
    accounts: [testuser, alice, admin],
    profiles: {
      [testuser.id]: profile({
        firstName: 'Test',
        lastName: 'User',
        gender: 'other',
        sexualPreference: 'other',
        biography: 'I am a test user for this site.',
        interests: ['hiking', 'photography'],
        pictures: seedPictures('testuser', [0, 1, 2, 3, 4]),
      }),
      [alice.id]: profile({
        firstName: 'Alice',
        lastName: 'Wonderland',
        gender: 'female',
        sexualPreference: 'both',
        biography: 'Curiouser and curiouser.',
        interests: ['travel', 'reading'],
        pictures: seedPictures('alice', [0, 2]),
      }),
      [admin.id]: profile({ firstName: 'Admin', lastName: 'User', gender: 'other', sexualPreference: 'other' }),
    },
    verifyTokens: [],
    resetTokens: [],
    inbox: [],
    views: [],
  }
}

// ---------------------------------------------------------------- persistence

const isAccount = (value: unknown): value is Account =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.username) &&
  isString(value.email) &&
  isString(value.passwordHash) &&
  typeof value.emailVerified === 'boolean'

const isToken = (value: unknown): value is TokenRecord =>
  isRecord(value) && isString(value.token) && isString(value.userId) && isString(value.email) && isNumber(value.expiresAt)

const isEmail = (value: unknown): value is MockEmail =>
  isRecord(value) && isString(value.to) && isString(value.token) && isString(value.link) && isString(value.kind)

const isView = (value: unknown): value is ViewRecord =>
  isRecord(value) && isString(value.viewerId) && isString(value.viewedId) && isNumber(value.at)

const isPicture = (value: unknown): value is StoredPicture =>
  isRecord(value) && isString(value.id) && isString(value.src) && typeof value.isProfile === 'boolean'

function acceptProfile(value: unknown): AccountProfile | null {
  if (!isRecord(value)) return null
  const nullableString = (field: unknown) => (isString(field) ? field : null)
  return {
    firstName: nullableString(value.firstName),
    lastName: nullableString(value.lastName),
    gender: nullableString(value.gender) as Gender | null,
    sexualPreference: nullableString(value.sexualPreference) as SexualPreference | null,
    biography: nullableString(value.biography),
    interests: arrayOf(value.interests, isString),
    pictures: arrayOf(value.pictures, isPicture),
    createdAt: isString(value.createdAt) ? value.createdAt : SEED_DATE,
    updatedAt: isString(value.updatedAt) ? value.updatedAt : SEED_DATE,
  }
}

function acceptDb(raw: unknown): AuthDb | null {
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.profiles)) return null
  const accounts = arrayOf(raw.accounts, isAccount).map((account) => ({
    ...account,
    pendingEmail: isString(account.pendingEmail) ? account.pendingEmail : null,
    language: LANGUAGES.includes(account.language) ? account.language : 'en',
    createdAt: isString(account.createdAt) ? account.createdAt : SEED_DATE,
  }))
  if (accounts.length === 0) return null
  const profiles: Record<string, AccountProfile> = {}
  for (const [id, value] of Object.entries(raw.profiles)) {
    const profile = acceptProfile(value)
    if (profile) profiles[id] = profile
  }
  return {
    v: 1,
    accounts,
    profiles,
    verifyTokens: arrayOf(raw.verifyTokens, isToken),
    resetTokens: arrayOf(raw.resetTokens, isToken),
    inbox: arrayOf(raw.inbox, isEmail),
    views: arrayOf(raw.views, isView),
  }
}

export function authDb(): AuthDb {
  let db = load(DB_SCOPE, acceptDb)
  if (!db) {
    db = seedDb()
    save(DB_SCOPE, db)
  }
  return db
}

/** Persists the accounts store; false when the browser storage is full. */
export function saveAuthDb(): boolean {
  return save(DB_SCOPE, authDb())
}

// ---------------------------------------------------------------- session ("cookie")

interface SessionDoc {
  userId: string
}

const acceptSession = (raw: unknown): SessionDoc | null => (isRecord(raw) && isString(raw.userId) ? { userId: raw.userId } : null)

/** The signed-in demo account, or null. */
export function sessionUserId(): string | null {
  const session = load(SESSION_SCOPE, acceptSession)
  if (!session) return null
  return authDb().accounts.some((account) => account.id === session.userId) ? session.userId : null
}

function startSession(userId: string): void {
  save(SESSION_SCOPE, { userId } satisfies SessionDoc)
}

function endSession(): void {
  remove(SESSION_SCOPE)
}

export function requireAccount(): Account {
  const userId = sessionUserId()
  const account = userId ? authDb().accounts.find((candidate) => candidate.id === userId) : undefined
  if (!account) throw unauthorized()
  return account
}

// ---------------------------------------------------------------- profiles (shared with profiles.ts)

export function accountProfile(userId: string): AccountProfile | undefined {
  return authDb().profiles[userId]
}

export function pictureUrl(src: string): string {
  const generated = /^portrait:([a-z]+):(\d)$/.exec(src)
  if (!generated) return src
  const look = ACCOUNT_LOOKS[generated[1] as string]
  return look ? portraitDataUrl(look, `account:${generated[1]}`, Number(generated[2])) : ''
}

/** Wire shape; empty strings read as null, like the backend. */
export function toProfile(userId: string, profile: AccountProfile): Profile {
  const orNull = (value: string | null) => (value ? value : null)
  return {
    userId,
    firstName: orNull(profile.firstName),
    lastName: orNull(profile.lastName),
    gender: profile.gender,
    sexualPreference: profile.sexualPreference,
    biography: orNull(profile.biography),
    interests: toInterestTags(profile.interests),
    pictures: profile.pictures.map((picture) => ({ id: picture.id, url: pictureUrl(picture.src), isProfile: picture.isProfile })),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

/** The backend rule: gender, preference, a non-empty biography and at least one interest. */
export function isProfileComplete(profile: AccountProfile | undefined): boolean {
  return Boolean(profile && profile.gender && profile.sexualPreference && profile.biography?.trim() && profile.interests.length > 0)
}

/** Records that `viewerId` opened `viewedId`'s profile (once per pair, like the backend). */
export function recordAccountView(viewerId: string, viewedId: string, at: number): void {
  if (viewerId === viewedId) return
  const db = authDb()
  if (db.views.some((view) => view.viewerId === viewerId && view.viewedId === viewedId)) return
  db.views.push({ viewerId, viewedId, at })
  saveAuthDb()
}

/** Accounts that viewed `userId`, with when. */
export function accountViewers(userId: string): { id: string; at: number }[] {
  return authDb()
    .views.filter((view) => view.viewedId === userId)
    .map((view) => ({ id: view.viewerId, at: view.at }))
}

// ---------------------------------------------------------------- emails

function sendEmail(kind: MockEmail['kind'], to: string, token: string): void {
  const db = authDb()
  const path = kind === 'verify-email' ? '/verify-email' : '/reset-password'
  db.inbox.unshift({ to, kind, token, link: `${path}?token=${token}`, sentAt: new Date().toISOString() })
  db.inbox.length = Math.min(db.inbox.length, INBOX_LIMIT)
}

/** One live verification token per user; a new one invalidates the previous one. */
function issueVerification(account: Account, to = account.email): void {
  const db = authDb()
  const token = randomHex(8)
  db.verifyTokens = db.verifyTokens.filter((record) => record.userId !== account.id)
  db.verifyTokens.push({ token, userId: account.id, email: to, expiresAt: Date.now() + TOKEN_TTL_MS })
  sendEmail('verify-email', to, token)
}

function issueReset(account: Account): void {
  const db = authDb()
  const token = randomHex(12)
  db.resetTokens = db.resetTokens.filter((record) => record.userId !== account.id)
  db.resetTokens.push({ token, userId: account.id, email: account.email, expiresAt: Date.now() + TOKEN_TTL_MS })
  sendEmail('reset-password', account.email, token)
}

// ---------------------------------------------------------------- DTOs (checks in class-validator report order)

const PASSWORD: readonly Check[] = [is.matches(/^(?!\s*$).+$/), is.length(8, 128), is.notEmpty(), is.string()]
const NAME: readonly Check[] = [is.matches(/^[a-zA-Z]+$/), is.length(1, 50), is.string(), is.notEmpty()]
const EMAIL: readonly Check[] = [is.length(0, 100), is.notEmpty(), is.email()]
const REQUIRED_STRING: readonly Check[] = [is.notEmpty(), is.string()]

function body(request: MockRequest): Record<string, unknown> {
  return record(request.body)
}

function checkPasswordPolicy(password: string, previousHash?: string): void {
  if (COMMON_PASSWORDS.has(password)) {
    throw nestError(400, 'This password is too common. Please choose a more secure password.', 'COMMON_PASSWORD')
  }
  if (previousHash !== undefined && hashPassword(password) === previousHash) {
    throw nestError(400, 'The new password must be different from the previous one.', 'PASSWORD_REUSE')
  }
}

// ---------------------------------------------------------------- handlers

const register: Handler = (request) => {
  const input = validate<{
    username: string
    email: string
    firstName: string
    lastName: string
    language?: Language
    password: string
  }>(body(request), {
    username: { transform: trimLower, checks: [is.matches(/^[a-z0-9_.]+$/), is.length(3, 20), is.notEmpty(), is.string()] },
    email: { transform: trimLower, checks: EMAIL },
    firstName: { transform: trim, checks: NAME },
    lastName: { transform: trim, checks: NAME },
    language: { optional: true, checks: [is.oneOf(LANGUAGES)] },
    password: { checks: PASSWORD },
  })
  checkPasswordPolicy(input.password)
  if (RESERVED_USERNAMES.has(input.username)) {
    throw nestError(400, "This username isn't available. Please choose a different username.", 'RESERVED_USERNAME')
  }
  const db = authDb()
  if (db.accounts.some((account) => account.username === input.username)) throw nestError(409, 'User already exists')
  if (db.accounts.some((account) => account.email === input.email)) throw nestError(409, 'Email already in use')

  const now = new Date().toISOString()
  const account: Account = {
    id: randomUuid(),
    username: input.username,
    email: input.email,
    pendingEmail: null,
    passwordHash: hashPassword(input.password),
    emailVerified: false,
    language: input.language ?? 'en',
    createdAt: now,
  }
  db.accounts.push(account)
  db.profiles[account.id] = {
    firstName: input.firstName,
    lastName: input.lastName,
    gender: null,
    sexualPreference: null,
    biography: null,
    interests: [],
    pictures: [],
    createdAt: now,
    updatedAt: now,
  }
  issueVerification(account)
  saveAuthDb()
  return ok({ message: 'Email verification required', date: now, userId: account.id })
}

const verifyEmail: Handler = (request) => {
  const { token } = validate<{ token: string }>(body(request), { token: { transform: trim, checks: REQUIRED_STRING } })
  const db = authDb()
  const now = Date.now()
  const found = db.verifyTokens.find((candidate) => candidate.token === token && candidate.expiresAt > now)
  const account = found ? db.accounts.find((candidate) => candidate.id === found.userId) : undefined
  if (!found || !account) throw nestError(403, 'Invalid or expired verification token')
  if (account.pendingEmail && found.email === account.pendingEmail) {
    account.email = account.pendingEmail
    account.pendingEmail = null
  }
  account.emailVerified = true
  db.verifyTokens = db.verifyTokens.filter((candidate) => candidate.userId !== account.id)
  saveAuthDb()
  return ok({ message: 'Email verified successfully', userId: account.id })
}

const login: Handler = (request) => {
  const input = validate<{ username: string; password: string }>(body(request), {
    username: { transform: trimLower, checks: REQUIRED_STRING },
    password: { checks: REQUIRED_STRING },
  })
  const db = authDb()
  const account = db.accounts.find((candidate) => candidate.username === input.username)
  // Same body for an unknown username and a wrong password.
  if (!account || account.passwordHash !== hashPassword(input.password)) throw nestError(403, 'Invalid credentials')
  if (!account.emailVerified) {
    issueVerification(account)
    saveAuthDb()
    throw nestError(403, 'Email not verified', 'EMAIL_NOT_VERIFIED')
  }
  startSession(account.id)
  return ok({ message: 'Login successful', userId: account.id, isProfileComplete: isProfileComplete(accountProfile(account.id)) })
}

const refresh: Handler = () => {
  const userId = sessionUserId()
  if (!userId) throw nestError(403, 'Invalid refresh token')
  return ok({ message: 'Tokens refreshed', userId })
}

const logout: Handler = () => {
  endSession()
  // the viewer is gone: their typing, replies and incoming likes stop here
  claimTimers(null)
  return ok({ message: 'Logged out successfully' })
}

const validateSession: Handler = () => {
  const userId = sessionUserId()
  return ok(userId ? { valid: true, userId } : { valid: false, userId: null })
}

const forgotPassword: Handler = (request) => {
  const { email } = validate<{ email: string }>(body(request), { email: { transform: trimLower, checks: EMAIL } })
  const account = authDb().accounts.find((candidate) => candidate.email === email)
  if (account) {
    issueReset(account)
    saveAuthDb()
  }
  // Same answer whether or not the address exists.
  return ok({ message: 'If an account with this email exists, you will receive a password reset link shortly' })
}

const resetPassword: Handler = (request) => {
  const input = validate<{ token: string; password: string }>(body(request), {
    token: { transform: trim, checks: REQUIRED_STRING },
    password: { checks: PASSWORD },
  })
  const db = authDb()
  const now = Date.now()
  const found = db.resetTokens.find((candidate) => candidate.token === input.token && candidate.expiresAt > now)
  if (!found) throw nestError(403, 'Invalid or expired reset token')
  const account = db.accounts.find((candidate) => candidate.id === found.userId)
  if (!account) throw nestError(403, 'User not found')
  checkPasswordPolicy(input.password, account.passwordHash)
  account.passwordHash = hashPassword(input.password)
  db.resetTokens = db.resetTokens.filter((candidate) => candidate.userId !== account.id)
  saveAuthDb()
  return ok({ message: 'Password reset successfully' })
}

const changeEmail: Handler = (request) => {
  const account = requireAccount()
  const { newEmail } = validate<{ newEmail: string }>(body(request), { newEmail: { transform: trimLower, checks: EMAIL } })
  if (account.email === newEmail) throw nestError(400, 'New email is the same as the current email')
  if (authDb().accounts.some((candidate) => candidate.email === newEmail)) throw nestError(409, 'Email already exists')
  account.pendingEmail = newEmail
  issueVerification(account, newEmail)
  saveAuthDb()
  return ok({ message: 'Email change initiated. Please verify your new email address.' })
}

/** The `mock` service exists in every mode; with the real backend the mock sent nothing (real emails go out). */
const inbox: Handler = () => ok(runtime.options.auth ? authDb().inbox : [])

/** Served in every mode. */
export const devRoutes: readonly { method: string; pattern: string; handler: Handler }[] = [
  { method: 'GET', pattern: '/dev/inbox', handler: inbox },
]

/** Demo mode only. */
export const authRoutes: readonly { method: string; pattern: string; handler: Handler }[] = [
  { method: 'POST', pattern: '/auth/register', handler: register },
  { method: 'POST', pattern: '/auth/verify-email', handler: verifyEmail },
  { method: 'POST', pattern: '/auth/login', handler: login },
  { method: 'POST', pattern: '/auth/refresh', handler: refresh },
  { method: 'POST', pattern: '/auth/logout', handler: logout },
  { method: 'GET', pattern: '/auth/validate', handler: validateSession },
  { method: 'POST', pattern: '/auth/forgot-password', handler: forgotPassword },
  { method: 'POST', pattern: '/auth/reset-password', handler: resetPassword },
  { method: 'POST', pattern: '/auth/change-email', handler: changeEmail },
  { method: 'GET', pattern: '/auth/health', handler: () => text('OK') },
]
