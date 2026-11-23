/** First lines for an empty conversation, built from what the two people share when it is known. */
import { t, type MessageKey } from '@/i18n'
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

// The openers are catalogue messages (`chat.ice…`), read in the language the page is in when they are built.
const SHARED: readonly MessageKey[] = ['chat.iceShared1', 'chat.iceShared2', 'chat.iceShared3', 'chat.iceShared4', 'chat.iceShared5']

const THEIRS: readonly MessageKey[] = ['chat.iceTheirs1', 'chat.iceTheirs2']

const GENERIC: readonly MessageKey[] = ['chat.iceGeneric1', 'chat.iceGeneric2', 'chat.iceGeneric3']

const NOTHING_KNOWN: IcebreakerSource = { commonTags: [], interests: [] }

/** Up to `count` distinct openers: shared interests first, then theirs, then generic ones. */
export function icebreakersFor(person: IcebreakerSource = NOTHING_KNOWN, count = 3): Icebreaker[] {
  const out: Icebreaker[] = []
  person.commonTags.slice(0, count).forEach((tag, index) => {
    out.push({ text: t(SHARED[index % SHARED.length], { tag: tagLabel(tag) }), tag })
  })
  const theirs = person.interests.filter((name) => !person.commonTags.includes(name))
  for (let index = 0; out.length < count && index < Math.min(theirs.length, THEIRS.length); index++) {
    out.push({ text: t(THEIRS[index], { tag: tagLabel(theirs[index]) }), tag: theirs[index] })
  }
  for (let index = 0; out.length < count && index < GENERIC.length; index++) {
    out.push({ text: t(GENERIC[index]), tag: null })
  }
  return out
}
