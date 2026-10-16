/**
 * The social service (`/__mock/social/*`, docs/ARCHITECTURE.md §5.2): discovery, swipes, matches,
 * chat, likes received, blocks, and the "live" world around them.
 *
 * State is per viewer (`matcha.mock.v1.social.<viewerId>`). A new viewer is seeded deterministically
 * from their id: a few matches with short conversations, a few likes received, a deck of everyone
 * else who fits their orientation. Things that happen later (typing, replies, a new match opening the
 * conversation, a like-back) are written to a persisted agenda and run by viewer-scoped timers, so a
 * reload does not lose them and nothing fires for a viewer who has left. Every event is persisted
 * before it is pushed to `mockEvents$`, so a refetch triggered by the event already sees it.
 */
import type { Card, DiscoverSort, Match, Message, SwipeAction } from '@/api/types'
import { composeReply, starterConversation, type StarterSlot } from './chat'
import { chance, fnv, randomUuid, seeded, shuffled, uuidFrom } from './ids'
import { nestError, ok, record, unauthorized, type Handler } from './nest'
import { PEOPLE, personById, personProfile, type Person } from './people'
import { cancelTimer, cancelTimers, claimTimers, emit, hasTimer, later } from './runtime'
import { arrayOf, isNumber, isRecord, isString, load, remove, save } from './storage'
import { normaliseTagFilter, TAG_CATALOGUE } from './tags'
import { is, trim, validate } from './validate'
import { currentViewer, type Viewer } from './viewer'

const MIN = 60_000
const HOUR = 60 * MIN

/** The deck filters' defaults in the state layer (src/wb/nodes/discover.ts). */
const DEFAULT_FILTERS = { ageMin: 18, ageMax: 45, distance: 50 } as const
const SORTS: readonly DiscoverSort[] = ['best', 'distance', 'fame', 'age']
const SWIPE_ACTIONS: readonly SwipeAction[] = ['like', 'pass', 'superlike']
const DECK_SIZE = 20
const MESSAGE_LIMIT = 500
const STARTER_SLOTS: readonly StarterSlot[] = ['opened', 'chatting', 'replied', 'fresh']

/** Tuning of the live world. */
const LIVE = {
  /** Reply to the viewer: typing indicator, then the message. */
  typingAfter: [600, 1300],
  replyAfter: [1500, 5000],
  /** Second bubble after a reply. */
  followUpAfter: [1700, 3000],
  /** A new match writes first (percent of matches), and when. */
  openerChance: 50,
  openerTypingAfter: [2500, 4500],
  openerAfter: [5000, 9000],
  /** Someone the viewer liked likes back later (percent of likes / superlikes). */
  likeBackChance: 20,
  superlikeBackChance: 60,
  likeBackAfter: [8000, 25000],
  /** Immediate match on a superlike to someone who had not liked the viewer. */
  superlikeMatchChance: 70,
  /** Incoming likes: one check every so often, only while the viewer is active. */
  likeCheckEvery: [60_000, 110_000],
  likeChance: 0.6,
  idleAfter: 2 * MIN,
} as const

const between = (range: readonly [number, number]) => range[0] + Math.random() * (range[1] - range[0])
const iso = (ms: number) => new Date(ms).toISOString()

// ---------------------------------------------------------------- model

interface SwipeRecord {
  personId: string
  action: SwipeAction
  at: number
  /** The match it created (now or by a later like-back): such a swipe cannot be rewound. */
  matchId: string | null
}

interface Dated {
  personId: string
  at: number
}

interface MatchRecord {
  id: string
  personId: string
  matchedAt: number
  /** Oldest first. */
  messages: Message[]
  unread: number
  /** Reply-bank keys already used. */
  used: string[]
  /** Messages the person sent. */
  replies: number
  asked: boolean
  told: boolean
  lastPun: number
}

type AgendaKind = 'reply' | 'followUp' | 'opener' | 'likeBack'

interface AgendaItem {
  id: string
  kind: AgendaKind
  personId: string
  matchId: string | null
  /** When to emit `typing`; null for none. */
  typingAt: number | null
  dueAt: number
  /** Fixed text (follow-ups). */
  text: string | null
}

interface SocialState {
  v: 1
  viewerId: string
  /** The orientation the starter content was chosen for (`gender/preference`). */
  seedKey: string
  seededAt: number
  /** The viewer did something (swipe, message, unmatch, block): the starter content is theirs now. */
  touched: boolean
  swipes: SwipeRecord[]
  likedBy: Dated[]
  viewedBy: Dated[]
  matches: MatchRecord[]
  blocked: string[]
  agenda: AgendaItem[]
  lastLikeAt: number
  /** When each person last sent a message (they show as online for a while). */
  talkedAt: Record<string, number>
}

// ---------------------------------------------------------------- persistence

const scope = (viewerId: string) => `social.${viewerId}`

const isDated = (value: unknown): value is Dated => isRecord(value) && isString(value.personId) && isNumber(value.at)

const isSwipe = (value: unknown): value is SwipeRecord =>
  isDated(value) && SWIPE_ACTIONS.includes((value as Partial<SwipeRecord>).action as SwipeAction)

const isMessage = (value: unknown): value is Message =>
  isRecord(value) && isString(value.id) && isString(value.matchId) && isString(value.senderId) && isString(value.text) && isString(value.sentAt)

const isAgendaItem = (value: unknown): value is AgendaItem =>
  isRecord(value) && isString(value.id) && isString(value.kind) && isString(value.personId) && isNumber(value.dueAt)

function acceptMatch(value: unknown): MatchRecord | null {
  if (!isRecord(value) || !isString(value.id) || !isString(value.personId) || !isNumber(value.matchedAt)) return null
  return {
    id: value.id,
    personId: value.personId,
    matchedAt: value.matchedAt,
    messages: arrayOf(value.messages, isMessage),
    unread: isNumber(value.unread) ? value.unread : 0,
    used: arrayOf(value.used, isString),
    replies: isNumber(value.replies) ? value.replies : 0,
    asked: value.asked === true,
    told: value.told === true,
    lastPun: isNumber(value.lastPun) ? value.lastPun : -99,
  }
}

function acceptState(raw: unknown, viewerId: string): SocialState | null {
  if (!isRecord(raw) || raw.v !== 1 || raw.viewerId !== viewerId) return null
  const talkedAt: Record<string, number> = {}
  if (isRecord(raw.talkedAt)) for (const [id, at] of Object.entries(raw.talkedAt)) if (isNumber(at)) talkedAt[id] = at
  return {
    v: 1,
    viewerId,
    seedKey: isString(raw.seedKey) ? raw.seedKey : '',
    seededAt: isNumber(raw.seededAt) ? raw.seededAt : Date.now(),
    touched: raw.touched === true,
    swipes: arrayOf(raw.swipes, isSwipe).map((swipe) => ({ ...swipe, matchId: isString(swipe.matchId) ? swipe.matchId : null })),
    likedBy: arrayOf(raw.likedBy, isDated),
    viewedBy: arrayOf(raw.viewedBy, isDated),
    matches: (Array.isArray(raw.matches) ? raw.matches : []).map(acceptMatch).filter((match): match is MatchRecord => match !== null),
    blocked: arrayOf(raw.blocked, isString),
    agenda: arrayOf(raw.agenda, isAgendaItem).map((item) => ({
      ...item,
      matchId: isString(item.matchId) ? item.matchId : null,
      typingAt: isNumber(item.typingAt) ? item.typingAt : null,
      text: isString(item.text) ? item.text : null,
    })),
    lastLikeAt: isNumber(raw.lastLikeAt) ? raw.lastLikeAt : 0,
    talkedAt,
  }
}

function loadState(viewerId: string): SocialState | null {
  return load(scope(viewerId), (raw) => acceptState(raw, viewerId))
}

function store(state: SocialState): void {
  save(scope(state.viewerId), state)
}

// ---------------------------------------------------------------- who fits whom

/**
 * `male` / `female` want that gender; `both` and `other` are open to everyone (including non-binary
 * people). Unknown on either side does not filter.
 */
function accepts(preference: Viewer['sexualPreference'], gender: Viewer['gender']): boolean {
  if (!preference || !gender) return true
  return preference === 'both' || preference === 'other' || preference === gender
}

export function compatible(viewer: Viewer, person: Person): boolean {
  return accepts(viewer.sexualPreference, person.gender) && accepts(person.sexualPreference, viewer.gender)
}

const seedKeyOf = (viewer: Viewer) => `${viewer.gender ?? '-'}/${viewer.sexualPreference ?? '-'}`

const withinDefaults = (person: Person) =>
  person.age >= DEFAULT_FILTERS.ageMin && person.age <= DEFAULT_FILTERS.ageMax && person.distanceKm <= DEFAULT_FILTERS.distance

// ---------------------------------------------------------------- seeding

function starterMatch(viewer: Viewer, person: Person, slot: StarterSlot, now: number): MatchRecord {
  const starter = starterConversation(slot, person)
  const id = uuidFrom(`match:${viewer.id}:${person.id}`)
  const messages: Message[] = starter.lines.map((line, index) => ({
    id: uuidFrom(`message:${id}:${now}:${index}`),
    matchId: id,
    senderId: line.fromViewer ? viewer.id : person.id,
    text: line.text,
    sentAt: iso(now - line.minutesAgo * MIN),
  }))
  return {
    id,
    personId: person.id,
    matchedAt: now - starter.matchedMinutesAgo * MIN,
    messages,
    unread: starter.unread,
    used: [],
    replies: starter.lines.filter((line) => !line.fromViewer).length,
    asked: starter.asked,
    told: starter.told,
    lastPun: -99,
  }
}

/**
 * The starter world of a viewer, a pure function of their id and orientation (timestamps aside):
 * 3-4 matches, 4-6 likes received (about 40% of a typical deck), two more people who viewed them.
 */
function seedState(viewer: Viewer, now: number): SocialState {
  const random = seeded(fnv(`social:${viewer.id}`))
  const pool = shuffled(
    PEOPLE.filter((person) => compatible(viewer, person)),
    random,
  )
  // small pools (one-gender orientations) keep more people for the deck
  const matchCount = pool.length >= 18 ? 4 : Math.min(3, pool.length)
  const matched = pool.slice(0, matchCount)
  const rest = pool.slice(matchCount)
  const nearby = rest.filter(withinDefaults)
  const likeCount = Math.min(nearby.length, Math.max(4, Math.min(6, Math.round(nearby.length * 0.4))))
  const likers = nearby.slice(0, likeCount)
  const lurkers = rest.filter((person) => !likers.includes(person)).slice(0, 2)
  return {
    v: 1,
    viewerId: viewer.id,
    seedKey: seedKeyOf(viewer),
    seededAt: now,
    touched: false,
    swipes: [],
    likedBy: likers.map((person, index) => ({ personId: person.id, at: now - (14 + index * 173) * MIN })),
    viewedBy: [
      ...likers.map((person, index) => ({ personId: person.id, at: now - (15 + index * 173) * MIN })),
      ...lurkers.map((person, index) => ({ personId: person.id, at: now - (40 + index * 290) * MIN })),
    ],
    matches: matched.map((person, index) => starterMatch(viewer, person, STARTER_SLOTS[index] as StarterSlot, now)),
    blocked: [],
    agenda: [],
    lastLikeAt: now,
    talkedAt: {},
  }
}

/** The viewer's state, seeded on first use and reseeded while untouched if their orientation changed. */
function stateFor(viewer: Viewer, now: number): SocialState {
  let state = loadState(viewer.id)
  if (!state || (!state.touched && state.seedKey !== seedKeyOf(viewer))) {
    if (state) dropAgenda(state, () => true)
    state = seedState(viewer, now)
    store(state)
  }
  return state
}

// ---------------------------------------------------------------- cards and matches

function presence(person: Person, state: SocialState | null, now: number): { online: boolean; lastSeen: string | null } {
  const talked = state?.talkedAt[person.id] ?? 0
  if (now - talked < 10 * MIN) return { online: true, lastSeen: null }
  const quarter = 15 * MIN
  const bucket = Math.floor(now / quarter)
  if (fnv(`${person.id}:online:${bucket}`) % 100 < person.activity) return { online: true, lastSeen: null }
  // offline since a moment that is stable within the quarter hour
  const spread = person.activity >= 50 ? 3 * HOUR : 26 * HOUR
  const since = bucket * quarter - (4 * MIN + (fnv(`${person.id}:seen:${bucket}`) % spread))
  return { online: false, lastSeen: iso(Math.min(now, Math.max(since, talked))) }
}

function likedYou(state: SocialState, personId: string): boolean {
  return state.likedBy.some((like) => like.personId === personId) || state.matches.some((match) => match.personId === personId)
}

function cardOf(person: Person, viewer: Viewer, state: SocialState, now: number): Card {
  const mine = new Set(viewer.interests)
  return {
    ...personProfile(person),
    age: person.age,
    city: person.city,
    distanceKm: person.distanceKm,
    fame: person.fame,
    ...presence(person, state, now),
    likedYou: likedYou(state, person.id),
    commonTags: person.interests.filter((tag) => mine.has(tag)),
  }
}

function lastActivity(match: MatchRecord): number {
  const last = match.messages[match.messages.length - 1]
  return Math.max(match.matchedAt, last ? Date.parse(last.sentAt) : 0)
}

function matchOf(match: MatchRecord, viewer: Viewer, state: SocialState, now: number): Match | null {
  const person = personById(match.personId)
  if (!person) return null
  return {
    id: match.id,
    profile: cardOf(person, viewer, state, now),
    matchedAt: iso(match.matchedAt),
    lastMessage: match.messages[match.messages.length - 1] ?? null,
    unread: match.unread,
  }
}

function createMatch(state: SocialState, person: Person, now: number): MatchRecord {
  const match: MatchRecord = {
    id: randomUuid(),
    personId: person.id,
    matchedAt: now,
    messages: [],
    unread: 0,
    used: [],
    replies: 0,
    asked: false,
    told: false,
    lastPun: -99,
  }
  state.matches.push(match)
  return match
}

function addView(state: SocialState, personId: string, now: number): void {
  state.viewedBy = state.viewedBy.filter((view) => view.personId !== personId)
  state.viewedBy.push({ personId, at: now })
}

// ---------------------------------------------------------------- the agenda

function addAgenda(state: SocialState, item: Omit<AgendaItem, 'id'>): void {
  state.agenda.push({ id: randomUuid(), ...item })
}

function dropAgenda(state: SocialState, drop: (item: AgendaItem) => boolean): void {
  const kept: AgendaItem[] = []
  for (const item of state.agenda) {
    if (drop(item)) {
      cancelTimer(`agenda:${item.id}`)
      cancelTimer(`agenda:${item.id}:typing`)
    } else kept.push(item)
  }
  state.agenda = kept
}

/** Schedules a timer for every agenda item that has none yet (after a reload, or a new item). */
function syncAgenda(state: SocialState): void {
  const now = Date.now()
  const viewerId = state.viewerId
  for (const item of state.agenda) {
    const key = `agenda:${item.id}`
    if (hasTimer(key)) continue
    if (item.typingAt !== null && item.typingAt > now) {
      later(`${key}:typing`, item.typingAt - now, () => showTyping(viewerId, item.id))
    }
    later(key, item.dueAt > now ? item.dueAt - now : 300, () => runAgenda(viewerId, item.id))
  }
}

function maybeOpener(state: SocialState, match: MatchRecord, person: Person, now: number): void {
  if (!chance(`opener:${state.viewerId}:${person.id}`, LIVE.openerChance)) return
  addAgenda(state, {
    kind: 'opener',
    personId: person.id,
    matchId: match.id,
    typingAt: now + between(LIVE.openerTypingAfter),
    dueAt: now + between(LIVE.openerAfter),
    text: null,
  })
}

function showTyping(viewerId: string, itemId: string): void {
  const state = loadState(viewerId)
  const item = state?.agenda.find((candidate) => candidate.id === itemId)
  if (!state || !item || !item.matchId || !state.matches.some((match) => match.id === item.matchId)) return
  emit({ type: 'typing', matchId: item.matchId, userId: item.personId })
}

/** What the viewer wrote since the person last spoke. */
function unanswered(match: MatchRecord, viewerId: string): string[] {
  const out: string[] = []
  for (let i = match.messages.length - 1; i >= 0; i--) {
    const message = match.messages[i] as Message
    if (message.senderId !== viewerId) break
    out.unshift(message.text)
  }
  return out
}

function deliver(state: SocialState, match: MatchRecord, person: Person, text: string, now: number): Message {
  const message: Message = { id: randomUuid(), matchId: match.id, senderId: person.id, text, sentAt: iso(now) }
  match.messages.push(message)
  if (match.messages.length > MESSAGE_LIMIT) match.messages.splice(0, match.messages.length - MESSAGE_LIMIT)
  match.unread += 1
  match.replies += 1
  state.talkedAt[person.id] = now
  return message
}

function runAgenda(viewerId: string, itemId: string): void {
  const state = loadState(viewerId)
  const item = state?.agenda.find((candidate) => candidate.id === itemId)
  if (!state || !item) return
  state.agenda = state.agenda.filter((candidate) => candidate !== item)
  const now = Date.now()
  const person = personById(item.personId)
  const viewer = currentViewer()
  if (!person || !viewer || viewer.id !== viewerId) {
    store(state)
    return
  }

  if (item.kind === 'likeBack') {
    const swipe = state.swipes.find((candidate) => candidate.personId === person.id)
    const stillWanted =
      swipe && swipe.action !== 'pass' && !swipe.matchId && !state.blocked.includes(person.id) && !state.matches.some((m) => m.personId === person.id)
    if (!swipe || !stillWanted) {
      store(state)
      return
    }
    const match = createMatch(state, person, now)
    swipe.matchId = match.id
    maybeOpener(state, match, person, now)
    store(state)
    syncAgenda(state)
    const event = matchOf(match, viewer, state, now)
    if (event) emit({ type: 'match', match: event })
    return
  }

  const match = state.matches.find((candidate) => candidate.id === item.matchId)
  if (!match) {
    store(state)
    return
  }
  let text: string | null = item.text
  if (item.kind === 'reply') {
    const incoming = unanswered(match, viewerId)
    if (incoming.length > 0) {
      const reply = composeReply({
        person,
        viewerName: viewer.firstName,
        incoming,
        replies: match.replies,
        used: match.used,
        asked: match.asked,
        told: match.told,
        lastPun: match.lastPun,
        random: Math.random,
      })
      text = reply.text
      match.used = [...match.used, reply.key].slice(-24)
      match.asked = reply.asked
      match.told = reply.told
      if (reply.pun) match.lastPun = match.replies + 1
      if (reply.followUp) {
        addAgenda(state, {
          kind: 'followUp',
          personId: person.id,
          matchId: match.id,
          typingAt: now + 400,
          dueAt: now + between(LIVE.followUpAfter),
          text: reply.followUp,
        })
      }
    }
  } else if (item.kind === 'opener') {
    text = match.messages.length === 0 ? person.opener : null
  }
  if (!text) {
    store(state)
    return
  }
  const message = deliver(state, match, person, text, now)
  store(state)
  syncAgenda(state)
  emit({ type: 'message', matchId: match.id, message })
}

// ---------------------------------------------------------------- incoming likes

const activeAt = new Map<string, number>()

function scheduleLikes(viewerId: string): void {
  if (hasTimer('likes')) return
  later('likes', between(LIVE.likeCheckEvery), () => likeTick(viewerId))
}

function likeTick(viewerId: string): void {
  const now = Date.now()
  // idle viewer: stop; their next request starts the clock again
  if (now - (activeAt.get(viewerId) ?? 0) > LIVE.idleAfter) return
  const viewer = currentViewer()
  const state = loadState(viewerId)
  if (!viewer || viewer.id !== viewerId || !state) return
  if (now - state.lastLikeAt >= MIN) {
    const taken = new Set([
      ...state.swipes.map((swipe) => swipe.personId),
      ...state.matches.map((match) => match.personId),
      ...state.likedBy.map((like) => like.personId),
      ...state.blocked,
    ])
    const candidates = PEOPLE.filter((person) => !taken.has(person.id) && compatible(viewer, person))
    const person = candidates[Math.floor(Math.random() * candidates.length)]
    if (person && Math.random() < LIVE.likeChance) {
      state.likedBy.push({ personId: person.id, at: now })
      addView(state, person.id, now)
      state.lastLikeAt = now
      store(state)
      emit({ type: 'like', from: cardOf(person, viewer, state, now) })
    } else if (person && Math.random() < 0.5) {
      // a profile view without a like
      addView(state, person.id, now)
      store(state)
    }
  }
  scheduleLikes(viewerId)
}

// ---------------------------------------------------------------- request entry

interface Context {
  viewer: Viewer
  state: SocialState
  now: number
}

function enter(): Context {
  const viewer = currentViewer()
  if (!viewer) throw unauthorized()
  claimTimers(viewer.id)
  const now = Date.now()
  const state = stateFor(viewer, now)
  activeAt.set(viewer.id, now)
  syncAgenda(state)
  scheduleLikes(viewer.id)
  return { viewer, state, now }
}

/** Demo-mode `GET /profile/viewers`: people who viewed the viewer, most recent first. */
export function mockViewers(viewer: Viewer): { id: string; at: number }[] {
  return stateFor(viewer, Date.now()).viewedBy.map((view) => ({ id: view.personId, at: view.at }))
}

/** Demo-mode `GET /notification/online`: people online right now, plus the viewer. */
export function onlineNow(): number {
  const now = Date.now()
  return PEOPLE.filter((person) => presence(person, null, now).online).length + 1
}

function findMatch(state: SocialState, matchId: string | undefined): MatchRecord {
  const match = state.matches.find((candidate) => candidate.id === matchId)
  if (!match) throw nestError(404, 'Match not found')
  return match
}

function visiblePerson(state: SocialState, userId: string | undefined): Person {
  const person = userId ? personById(userId) : undefined
  if (!person || state.blocked.includes(person.id)) throw nestError(404, 'Profile not found')
  return person
}

// ---------------------------------------------------------------- handlers

interface DiscoverQuery {
  ageMin: number
  ageMax: number
  distance: number
  sort: DiscoverSort
  tags?: string
}

function discoverQuery(query: Record<string, string>): DiscoverQuery & { tagList: string[] } {
  const numeric = (raw: string | undefined, fallback: number) => (raw === undefined || raw === '' ? fallback : Number(raw))
  const input: Record<string, unknown> = {
    ageMin: numeric(query.ageMin, 18),
    ageMax: numeric(query.ageMax, 120),
    distance: numeric(query.distance, 20_000),
    sort: query.sort ?? 'best',
  }
  if (query.tags !== undefined) input.tags = query.tags
  const parsed = validate<DiscoverQuery>(input, {
    ageMin: { checks: [is.max(120), is.min(18), is.int()] },
    ageMax: { checks: [is.max(120), is.min(18), is.int()] },
    distance: { checks: [is.max(20_000), is.min(1), is.int()] },
    sort: { checks: [is.oneOf(SORTS)] },
    tags: { optional: true, checks: [is.maxLength(500), is.string()] },
  })
  const tagList = (parsed.tags ?? '').split(',').map(normaliseTagFilter).filter(Boolean)
  return { ...parsed, tagList }
}

function ranked(cards: Card[], sort: DiscoverSort, viewer: Viewer): Card[] {
  const score = (card: Card) =>
    card.commonTags.length * 10 +
    (card.likedYou ? 6 : 0) +
    card.fame / 10 -
    Math.min(card.distanceKm, 100) / 5 +
    (card.online ? 3 : 0) +
    (fnv(`${viewer.id}:${card.userId}`) % 100) / 25
  const order: Record<DiscoverSort, (a: Card, b: Card) => number> = {
    best: (a, b) => score(b) - score(a),
    distance: (a, b) => a.distanceKm - b.distanceKm || b.fame - a.fame,
    fame: (a, b) => b.fame - a.fame || a.distanceKm - b.distanceKm,
    age: (a, b) => a.age - b.age || a.distanceKm - b.distanceKm,
  }
  return cards.sort((a, b) => order[sort](a, b) || a.userId.localeCompare(b.userId))
}

const discover: Handler = (request) => {
  const { viewer, state, now } = enter()
  const filters = discoverQuery(request.query)
  const hidden = new Set([
    ...state.swipes.map((swipe) => swipe.personId),
    ...state.matches.map((match) => match.personId),
    ...state.blocked,
  ])
  const wanted = new Set(filters.tagList)
  const cards = PEOPLE.filter(
    (person) =>
      !hidden.has(person.id) &&
      compatible(viewer, person) &&
      person.age >= filters.ageMin &&
      person.age <= filters.ageMax &&
      person.distanceKm <= filters.distance &&
      (wanted.size === 0 || person.interests.some((tag) => wanted.has(tag))),
  ).map((person) => cardOf(person, viewer, state, now))
  return ok(ranked(cards, filters.sort, viewer).slice(0, DECK_SIZE))
}

const swipe: Handler = (request) => {
  const { viewer, state, now } = enter()
  const input = validate<{ targetId: string; action: SwipeAction }>(record(request.body), {
    targetId: { checks: [is.uuid()] },
    action: { checks: [is.oneOf(SWIPE_ACTIONS)] },
  })
  const person = visiblePerson(state, input.targetId)
  if (state.swipes.some((candidate) => candidate.personId === person.id) || state.matches.some((m) => m.personId === person.id)) {
    throw nestError(409, 'Already swiped')
  }
  state.touched = true
  let match: MatchRecord | null = null
  if (input.action !== 'pass') {
    const superlike = input.action === 'superlike'
    const key = `${viewer.id}:${person.id}`
    if (likedYou(state, person.id) || (superlike && chance(`superlike:${key}`, LIVE.superlikeMatchChance))) {
      match = createMatch(state, person, now)
      maybeOpener(state, match, person, now)
    } else if (chance(`likeback:${key}`, superlike ? LIVE.superlikeBackChance : LIVE.likeBackChance)) {
      addAgenda(state, { kind: 'likeBack', personId: person.id, matchId: null, typingAt: null, dueAt: now + between(LIVE.likeBackAfter), text: null })
    }
  }
  state.swipes.push({ personId: person.id, action: input.action, at: now, matchId: match?.id ?? null })
  store(state)
  syncAgenda(state)
  return ok({ match: match ? matchOf(match, viewer, state, now) : null })
}

const rewind: Handler = () => {
  const { viewer, state, now } = enter()
  const last = state.swipes[state.swipes.length - 1]
  const person = last ? personById(last.personId) : undefined
  if (!last || last.matchId || !person) return ok({ restored: null })
  state.swipes.pop()
  state.touched = true
  dropAgenda(state, (item) => item.kind === 'likeBack' && item.personId === person.id)
  store(state)
  return ok({ restored: cardOf(person, viewer, state, now) })
}

const matches: Handler = () => {
  const { viewer, state, now } = enter()
  const list = state.matches
    .slice()
    .sort((a, b) => lastActivity(b) - lastActivity(a))
    .map((match) => matchOf(match, viewer, state, now))
    .filter((match): match is Match => match !== null)
  return ok(list)
}

function removeMatch(state: SocialState, match: MatchRecord): void {
  state.matches = state.matches.filter((candidate) => candidate !== match)
  dropAgenda(state, (item) => item.matchId === match.id)
}

const unmatch: Handler = (_request, params) => {
  const { state } = enter()
  const match = findMatch(state, params.matchId)
  removeMatch(state, match)
  state.touched = true
  store(state)
  return ok({ ok: true })
}

const messages: Handler = (_request, params) => {
  const { state } = enter()
  const match = findMatch(state, params.matchId)
  if (match.unread !== 0) {
    match.unread = 0
    store(state)
  }
  return ok(match.messages)
}

const sendMessage: Handler = (request) => {
  const { viewer, state, now } = enter()
  const input = validate<{ matchId: string; text: string }>(record(request.body), {
    matchId: { checks: [is.uuid()] },
    text: { transform: trim, checks: [is.length(1, 1000), is.notEmpty(), is.string()] },
  })
  const match = findMatch(state, input.matchId)
  const message: Message = { id: randomUuid(), matchId: match.id, senderId: viewer.id, text: input.text, sentAt: iso(now) }
  match.messages.push(message)
  if (match.messages.length > MESSAGE_LIMIT) match.messages.splice(0, match.messages.length - MESSAGE_LIMIT)
  // writing marks the conversation read
  match.unread = 0
  state.touched = true
  // one answer to a burst of messages: the pending reply (and an unsent opener) are replaced
  dropAgenda(state, (item) => item.matchId === match.id && (item.kind === 'reply' || item.kind === 'opener'))
  const typingAt = now + between(LIVE.typingAfter)
  addAgenda(state, {
    kind: 'reply',
    personId: match.personId,
    matchId: match.id,
    typingAt,
    dueAt: Math.max(now + between(LIVE.replyAfter), typingAt + 800),
    text: null,
  })
  store(state)
  syncAgenda(state)
  return ok(message)
}

const likes: Handler = () => {
  const { viewer, state, now } = enter()
  const taken = new Set([...state.swipes.map((s) => s.personId), ...state.matches.map((m) => m.personId), ...state.blocked])
  const list = state.likedBy
    .filter((like) => !taken.has(like.personId))
    .sort((a, b) => b.at - a.at)
    .map((like) => personById(like.personId))
    .filter((person): person is Person => person !== undefined)
    .map((person) => cardOf(person, viewer, state, now))
  return ok(list)
}

const profile: Handler = (_request, params) => {
  const { viewer, state, now } = enter()
  return ok(cardOf(visiblePerson(state, params.userId), viewer, state, now))
}

const block: Handler = (request) => {
  const { state } = enter()
  const input = validate<{ userId: string; reason?: string }>(record(request.body), {
    userId: { checks: [is.uuid()] },
    reason: { optional: true, checks: [is.maxLength(500), is.string()] },
  })
  const person = personById(input.userId)
  if (!person) throw nestError(404, 'Profile not found')
  if (!state.blocked.includes(person.id)) state.blocked.push(person.id)
  const match = state.matches.find((candidate) => candidate.personId === person.id)
  if (match) removeMatch(state, match)
  dropAgenda(state, (item) => item.personId === person.id)
  state.touched = true
  store(state)
  return ok({ ok: true })
}

const tags: Handler = () => {
  const { viewer } = enter()
  return ok([...new Set([...TAG_CATALOGUE, ...viewer.interests])].sort())
}

const reset: Handler = () => {
  const viewer = currentViewer()
  if (!viewer) throw unauthorized()
  claimTimers(viewer.id)
  cancelTimers()
  remove(scope(viewer.id))
  const now = Date.now()
  store(seedState(viewer, now))
  activeAt.set(viewer.id, now)
  scheduleLikes(viewer.id)
  return ok({ ok: true })
}

export const socialRoutes: readonly { method: string; pattern: string; handler: Handler }[] = [
  { method: 'GET', pattern: '/social/discover', handler: discover },
  { method: 'POST', pattern: '/social/swipes', handler: swipe },
  { method: 'POST', pattern: '/social/swipes/rewind', handler: rewind },
  { method: 'GET', pattern: '/social/matches', handler: matches },
  { method: 'DELETE', pattern: '/social/matches/:matchId', handler: unmatch },
  { method: 'GET', pattern: '/social/matches/:matchId/messages', handler: messages },
  { method: 'POST', pattern: '/social/messages', handler: sendMessage },
  { method: 'GET', pattern: '/social/likes', handler: likes },
  { method: 'GET', pattern: '/social/profiles/:userId', handler: profile },
  { method: 'POST', pattern: '/social/blocks', handler: block },
  { method: 'GET', pattern: '/social/tags', handler: tags },
  { method: 'POST', pattern: '/social/reset', handler: reset },
]

/** Forget in-memory activity (uninstall, tests). */
export function forgetActivity(): void {
  activeAt.clear()
}
