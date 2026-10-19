/** First lines for an empty conversation, built from what the two people share. */
import type { Card } from '@/api/types'
import { tagLabel } from './people'

export interface Icebreaker {
  text: string
  /** The interest it is built on, when there is one. */
  tag: string | null
}

const SHARED: readonly ((tag: string, city: string) => string)[] = [
  (tag) => `Okay, we both like ${tag}. How did you get into it?`,
  (tag, city) => `Settle this: where's the best place for ${tag} around ${city}?`,
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

/** Up to `count` distinct openers: shared interests first, then theirs, then generic ones. */
export function icebreakersFor(person: Pick<Card, 'commonTags' | 'interests' | 'city'>, count = 3): Icebreaker[] {
  const out: Icebreaker[] = []
  const shared = person.commonTags.slice(0, count)
  shared.forEach((tag, index) => {
    const template = SHARED[index % SHARED.length]
    out.push({ text: template(tagLabel(tag), person.city || 'town'), tag })
  })
  const theirs = person.interests.map((interest) => interest.name).filter((name) => !person.commonTags.includes(name))
  for (let index = 0; out.length < count && index < Math.min(theirs.length, THEIRS.length); index++) {
    out.push({ text: THEIRS[index](tagLabel(theirs[index])), tag: theirs[index] })
  }
  for (let index = 0; out.length < count && index < GENERIC.length; index++) {
    out.push({ text: GENERIC[index], tag: null })
  }
  return out
}
