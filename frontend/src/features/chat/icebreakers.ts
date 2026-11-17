/** First lines for an empty conversation, built from what the two people share when it is known. */
import { tagLabel } from './people'

export interface Icebreaker {
  text: string
  /** The interest it is built on, when there is one. */
  tag: string | null
}

/** What the openers can be built on: interest names. */
export interface IcebreakerSource {
  /** Shared with the viewer. */
  commonTags: readonly string[]
  /** All of theirs. */
  interests: readonly string[]
}

const SHARED: readonly ((tag: string) => string)[] = [
  (tag) => `Okay, we both like ${tag}. How did you get into it?`,
  (tag) => `Settle this: where's the best place for ${tag} around here?`,
  (tag) => `Rate your ${tag} skills from 1 to 10. Be honest.`,
  (tag) => `Hot take about ${tag}. Go.`,
  (tag) => `What's the best ${tag} moment you've had this year?`,
]

const THEIRS: readonly ((tag: string) => string)[] = [
  (tag) => `I saw ${tag} on your profile. What's the story there?`,
  (tag) => `Teach me one thing about ${tag} in a single message?`,
]

const GENERIC: readonly string[] = [
  'Tea or coffee? Choose carefully, this decides everything.',
  "What's the best thing that happened to you this week?",
  'Describe your perfect Sunday in three words.',
]

const NOTHING_KNOWN: IcebreakerSource = { commonTags: [], interests: [] }

/** Up to `count` distinct openers: shared interests first, then theirs, then generic ones. */
export function icebreakersFor(person: IcebreakerSource = NOTHING_KNOWN, count = 3): Icebreaker[] {
  const out: Icebreaker[] = []
  person.commonTags.slice(0, count).forEach((tag, index) => {
    out.push({ text: SHARED[index % SHARED.length](tagLabel(tag)), tag })
  })
  const theirs = person.interests.filter((name) => !person.commonTags.includes(name))
  for (let index = 0; out.length < count && index < Math.min(theirs.length, THEIRS.length); index++) {
    out.push({ text: THEIRS[index](tagLabel(theirs[index])), tag: theirs[index] })
  }
  for (let index = 0; out.length < count && index < GENERIC.length; index++) {
    out.push({ text: GENERIC[index], tag: null })
  }
  return out
}
