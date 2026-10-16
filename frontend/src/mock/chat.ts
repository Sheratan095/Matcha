/**
 * What the mock people say: the starter conversations of a new viewer and the replies to what the
 * viewer writes. Replies loosely follow cues (a greeting, a question, an invitation, one of the
 * person's interests...), use the person's own job, fact and question, avoid repeating themselves
 * within a conversation, and allow themselves a tea pun now and then.
 */
import type { Person } from './people'

// ---------------------------------------------------------------- helpers

/** Lowercase without accents, for cue matching. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** 'board-games' -> 'board games'. */
export function tagLabel(tag: string): string {
  return tag.replace(/-/g, ' ')
}

/** Interests that read well in "how did you get into ...?". */
const PURSUITS = new Set([
  'hiking', 'photography', 'travel', 'reading', 'gaming', 'cooking', 'fitness', 'music', 'art', 'yoga', 'climbing',
  'cycling', 'running', 'swimming', 'surfing', 'dancing', 'cinema', 'anime', 'theatre', 'poetry', 'jazz', 'techno',
  'vinyl', 'karaoke', 'design', 'fashion', 'thrifting', 'gardening', 'board-games', 'chess', 'astronomy', 'coding',
  'baking', 'wine', 'football', 'volunteering', 'languages', 'ceramics', 'skateboarding',
])

export function signatureTag(person: Person): string {
  return person.interests.find((tag) => PURSUITS.has(tag)) ?? person.interests[0] ?? 'music'
}

/** Words that count as mentioning a tag. */
const TAG_WORDS: Readonly<Record<string, readonly string[]>> = {
  vegan: ['vegan', 'plant based'],
  hiking: ['hike', 'hiking', 'trail', 'trek'],
  photography: ['photo', 'photography', 'camera', 'film roll'],
  travel: ['travel', 'trip', 'abroad', 'holiday'],
  reading: ['book', 'books', 'reading', 'novel', 'novels'],
  gaming: ['video game', 'video games', 'gaming', 'console'],
  cooking: ['cook', 'cooking', 'recipe', 'dinner'],
  fitness: ['gym', 'workout', 'fitness', 'training'],
  music: ['music', 'song', 'album', 'band', 'playlist'],
  art: ['art', 'drawing', 'painting', 'museum'],
  matcha: ['matcha', 'tea'],
  coffee: ['coffee', 'espresso', 'latte'],
  climbing: ['climb', 'climbing', 'bouldering'],
  cycling: ['bike', 'cycling', 'cycle'],
  running: ['running', 'marathon', 'jogging'],
  dancing: ['dance', 'dancing'],
  cinema: ['film', 'films', 'movie', 'movies', 'cinema'],
  'board-games': ['board game', 'board games', 'boardgame'],
  dogs: ['dog', 'dogs', 'puppy'],
  cats: ['cat', 'cats', 'kitten'],
  wine: ['wine', 'vin'],
  football: ['football', 'soccer'],
  baking: ['bake', 'baking', 'cake', 'croissant'],
  languages: ['language', 'languages', 'german', 'italian', 'spanish'],
}

function mentionedTag(text: string, person: Person): string | null {
  for (const tag of person.interests) {
    const words = TAG_WORDS[tag] ?? [tagLabel(tag)]
    if (words.some((word) => new RegExp(`\\b${word}\\b`).test(text))) return tag
  }
  return null
}

// ---------------------------------------------------------------- reply banks
// `{ name}` expands to " <viewer's first name>" or nothing; `{tag}`, `{city}`, `{job}`, `{fact}`,
// `{question}` come from the person.

type Cue =
  | 'bye'
  | 'thanks'
  | 'greeting'
  | 'howAreYou'
  | 'work'
  | 'date'
  | 'weekend'
  | 'interest'
  | 'tea'
  | 'compliment'
  | 'laugh'
  | 'long'
  | 'question'
  | 'statement'

const BANK: Readonly<Record<Cue, readonly string[]>> = {
  bye: ['Night{ name}! Talk tomorrow?', 'Sleep well :) This was nice.', 'Go, go! But come back.', 'See you soon, I hope.'],
  thanks: ['Anytime :)', 'Of course! Your turn to make my day now.', "Don't mention it. Actually, do, I like compliments."],
  greeting: [
    "Hey{ name}! How's your day going?",
    'Hi! I was secretly hoping you would write first.',
    'Hello hello. Good timing, I just put the kettle on.',
    "Hey :) Okay, I'll admit it, I was waiting for this.",
    'Hiii. Tell me one good thing that happened today.',
  ],
  howAreYou: [
    "Pretty good! Long day, but this helps. You?",
    'Honestly? Caffeinated and optimistic. How about you?',
    'Good! Just got home and kicked my shoes off. And you?',
    "Better now. Today was a lot. What's your news?",
  ],
  work: [
    "I'm {job}. It's as fun as it sounds, most days. What about you?",
    "Officially? I'm {job}. Unofficially, a professional overthinker.",
    "I'm {job}. Ask me anything, I love talking shop. Too much, probably.",
  ],
  date: [
    "I'd like that. Thursday after work?",
    "Yes! I know a tiny place near {city}. You'd like it, I think.",
    "Let's do it. You pick the place, I'll be on time. Mostly.",
    "Okay, but I'm warning you now: I always order dessert.",
  ],
  weekend: [
    'Nothing fixed yet. Probably some {tag}, and a long lunch. You?',
    'Plans is a strong word. I have intentions. One of them involves {tag}.',
    "Keeping it free for now... why, do you have ideas?",
    "Sleep, {tag}, repeat. It's a good system.",
  ],
  interest: [
    "Wait, you're into {tag} too? Okay, now I have questions.",
    '{Tag}! Finally someone who gets it.',
    "You had me at {tag}, honestly.",
    'Careful, I can talk about {tag} for hours.',
  ],
  tea: [
    'Coffee in the morning, tea after four. I contain multitudes.',
    'I take mine strong. The tea, I mean. And the opinions.',
    'Matcha, always. I have a whisk and I know how to use it.',
  ],
  compliment: [
    "Stop it, I'm blushing. (Don't stop.)",
    "That's very kind. Your photos made me smile too.",
    "You're sweet. Suspiciously sweet. I like it.",
  ],
  laugh: [
    "Glad I'm not the only one laughing at my own jokes.",
    "Okay, you're funny. That's going in my notes.",
    "Haha, stop, I'm on the metro and people are looking.",
  ],
  long: [
    "Okay, I read that twice. I love a proper message.",
    'This is the best message I got all week, and I mean it.',
  ],
  question: [
    "Ooh, good question. I'll answer, but you go first.",
    'Honestly, it changes every week. This week: yes.',
    'Hmm. Can I answer that one in person?',
    'Short answer: yes. Long answer: over a drink?',
    "That's a long story. The short version involves a ferry and a lost umbrella.",
    "I'd have to think. What would you say?",
  ],
  statement: [
    'Ha, I like that.',
    "Okay, that's a very good answer.",
    "Tell me more, I'm listening.",
    'Same, honestly. We might be onto something.',
    "You're easy to talk to, you know that?",
    "Noted. Filed under 'promising'.",
    'I was not expecting that, and I love it.',
    'Fair. Very fair.',
    'Wait, really? Okay, now I am curious.',
    'That made me smile. Thank you.',
  ],
}

const PUNS: readonly string[] = [
  "Not to be dramatic, but this chat is very much my cup of tea.",
  "I think we're brewing something here.",
  "Matcha made in heaven? Too soon? Too soon.",
  "I'd say more, but I don't want to spill the tea.",
  'Sorry. That was weak. Like my first cup of the day.',
]

function cueOf(message: string, person: Person): { cue: Cue; tag: string | null } {
  const text = plain(message).trim()
  const short = text.length <= 30
  if (/\b(good ?night|bonne nuit|bye|see you|talk (soon|later|tomorrow)|a demain|gotta go)\b/.test(text)) return { cue: 'bye', tag: null }
  if (short && /\b(thanks|thank you|merci|cheers|thx)\b/.test(text)) return { cue: 'thanks', tag: null }
  if (/\bhow (are|r) (you|u)\b|how'?s it going|how is it going|how have you been|how was your (day|week)|\b(ca|ça) va\b/.test(text)) {
    return { cue: 'howAreYou', tag: null }
  }
  if (short && /^(hi+|hey+|hello|hiya|yo|salut|bonjour|coucou|hola|ciao|good (morning|evening|afternoon))\b/.test(text)) {
    return { cue: 'greeting', tag: null }
  }
  if (/what do you do|for a living|your job|do you work|what('?s| is) your work|where do you work/.test(text)) return { cue: 'work', tag: null }
  if (/\b(grab|get|have|go for) (a |some )?(drink|drinks|coffee|tea|matcha|dinner|lunch|brunch)\b|\bmeet( up)?\b|\b(a )?date\b|\bgo out\b/.test(text)) {
    return { cue: 'date', tag: null }
  }
  if (/\b(weekend|tonight|plans|this evening|saturday|sunday|friday)\b/.test(text)) return { cue: 'weekend', tag: null }
  const tag = mentionedTag(text, person)
  if (tag) return { cue: 'interest', tag }
  if (/\b(tea|matcha|coffee|chai|latte)\b/.test(text)) return { cue: 'tea', tag: null }
  if (/\b(cute|beautiful|handsome|gorgeous|pretty|lovely|love your|nice (smile|photo|photos|pic)|great smile)\b/.test(text)) {
    return { cue: 'compliment', tag: null }
  }
  if (/\b(ha(ha)+|he(he)+|lol|lmao|mdr|ptdr)\b/.test(text)) return { cue: 'laugh', tag: null }
  if (text.length > 220) return { cue: 'long', tag: null }
  if (text.includes('?')) return { cue: 'question', tag: null }
  return { cue: 'statement', tag: null }
}

function fill(template: string, person: Person, viewerName: string | null, tag: string): string {
  const label = tagLabel(tag)
  return template
    .replace(/\{ name\}/g, viewerName ? ` ${viewerName}` : '')
    .replace(/\{tag\}/g, label)
    .replace(/\{Tag\}/g, label.charAt(0).toUpperCase() + label.slice(1))
    .replace(/\{city\}/g, person.city)
    .replace(/\{job\}/g, person.job)
}

// ---------------------------------------------------------------- replies

export interface ReplyContext {
  person: Person
  viewerName: string | null
  /** What the viewer wrote since the person last spoke, oldest first. */
  incoming: readonly string[]
  /** Replies the person already sent in this conversation. */
  replies: number
  /** Bank keys already used in this conversation. */
  used: readonly string[]
  /** The person already asked their question. */
  asked: boolean
  /** The person already told their fact. */
  told: boolean
  /** `replies` at the last pun (-99 when none). */
  lastPun: number
  random: () => number
}

export interface Reply {
  text: string
  key: string
  /** A second bubble, sent a moment later. */
  followUp: string | null
  asked: boolean
  told: boolean
  pun: boolean
}

function pickFrom(cue: Cue, used: readonly string[], random: () => number): { template: string; key: string } {
  const bank = BANK[cue]
  const start = Math.floor(random() * bank.length)
  for (let offset = 0; offset < bank.length; offset++) {
    const index = (start + offset) % bank.length
    const key = `${cue}:${index}`
    if (!used.includes(key)) return { template: bank[index] as string, key }
  }
  return { template: bank[start] as string, key: `${cue}:${start}` }
}

export function composeReply(context: ReplyContext): Reply {
  const { person, viewerName, random } = context
  const last = context.incoming[context.incoming.length - 1] ?? ''
  const all = context.incoming.join(' ')
  let { cue, tag } = cueOf(last, person)
  // a greeting followed by more words is a conversation, not a greeting
  if (cue === 'statement' && context.incoming.length > 1) cue = cueOf(all, person).cue
  const { template, key } = pickFrom(cue, context.used, random)
  const text = fill(template, person, viewerName, tag ?? signatureTag(person))

  let followUp: string | null = null
  let asked = context.asked
  let told = context.told
  let pun = false
  const asksBack = cue === 'greeting' || cue === 'howAreYou' || cue === 'work' || text.endsWith('?')
  if (!asksBack && !asked && context.replies >= 1 && random() < 0.5) {
    followUp = person.question
    asked = true
  } else if (!told && context.replies >= 2 && cue !== 'bye' && random() < 0.35) {
    followUp = `Random fact, since we're here: ${person.fact}`
    told = true
  } else if (cue !== 'bye' && context.replies - context.lastPun >= 5 && random() < 0.15) {
    followUp = PUNS[Math.floor(random() * PUNS.length)] as string
    pun = true
  }
  return { text, key, followUp, asked, told, pun }
}

// ---------------------------------------------------------------- starter conversations

export type StarterSlot = 'opened' | 'chatting' | 'replied' | 'fresh'

export interface StarterLine {
  fromViewer: boolean
  text: string
  /** How long ago it was sent, in minutes. */
  minutesAgo: number
}

export interface Starter {
  matchedMinutesAgo: number
  lines: StarterLine[]
  /** Lines from the person the viewer has not read. */
  unread: number
  asked: boolean
  told: boolean
}

/** The conversation a new viewer finds in a seeded match. */
export function starterConversation(slot: StarterSlot, person: Person): Starter {
  const them = (text: string, minutesAgo: number): StarterLine => ({ fromViewer: false, text, minutesAgo })
  const you = (text: string, minutesAgo: number): StarterLine => ({ fromViewer: true, text, minutesAgo })
  const tag = tagLabel(signatureTag(person))
  switch (slot) {
    case 'opened':
      return { matchedMinutesAgo: 55, lines: [them(person.opener, 24)], unread: 1, asked: false, told: false }
    case 'chatting':
      return {
        matchedMinutesAgo: 2 * 24 * 60,
        lines: [
          you(`Hi ${person.firstName}! Okay, I have to ask: how did you get into ${tag}?`, 44 * 60),
          them("Ha, everyone asks! It started as a phase and now it's basically my whole personality.", 43 * 60),
          you("Respect. Tell me something about you that isn't on your profile.", 42 * 60),
          them(person.fact, 3 * 60),
          them(person.question, 3 * 60 - 1),
        ],
        unread: 2,
        asked: true,
        told: true,
      }
    case 'replied':
      return {
        matchedMinutesAgo: 4 * 24 * 60,
        lines: [
          them(person.opener, 94 * 60),
          you('Ha! Okay, you have my attention.', 93 * 60),
          them(person.fact, 92 * 60),
          you("That's brilliant. I'm stealing that story.", 20 * 60),
          them(`Steal away. Your turn though: ${lowerFirst(person.question)}`, 19 * 60),
        ],
        unread: 0,
        asked: true,
        told: true,
      }
    case 'fresh':
      return { matchedMinutesAgo: 3 * 60, lines: [], unread: 0, asked: false, told: false }
  }
}

function lowerFirst(text: string): string {
  // keep "I" and proper nouns at the start as they are
  return /^(I\b|I'|[A-Z][a-z]+[A-Z])/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1)
}
