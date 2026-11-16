import { describe, expect, it } from 'vitest'
import { normaliseTags, tagFromInput } from './filters'

// Invisible and hostile characters are built from their code point, never typed or pasted.
const cp = (...codes: number[]) => String.fromCodePoint(...codes)
const NUL = cp(0x00)
const RLO = cp(0x202e)
const ZWSP = cp(0x200b)
const ACUTE = cp(0x0301)
const E_ACUTE = cp(0x00e9)
const FAMILY = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467)
const GUITAR = cp(0x1f3b8)
const JAPAN = cp(0x65e5, 0x672c, 0x8a9e)

describe('normaliseTags', () => {
  it('lowercases, drops a leading #, collapses spaces, removes duplicates and empties', () => {
    expect(normaliseTags(['  #Vegan ', 'Rock   N  Roll', 'vegan', '#', '  '])).toEqual(['vegan', 'rock n roll'])
  })

  it('splits on commas, like the ?tags= filter value', () => {
    expect(normaliseTags(['Hiking,#Yoga, Jazz'])).toEqual(['hiking', 'yoga', 'jazz'])
  })

  it('keeps every tag the backend accepts', () => {
    const tags = ['c++', 'c#', "it's", 'sci-fi', 'dr.who', 'snake_case', JAPAN, `${GUITAR} guitar`, FAMILY, `caf${E_ACUTE}`]
    expect(normaliseTags(tags)).toEqual(tags)
  })

  it('composes accents the way the backend does (NFC), so both sides see the same string', () => {
    expect(normaliseTags([`cafe${ACUTE}`])).toEqual([`caf${E_ACUTE}`])
  })

  it('drops the characters the backend would refuse, so a save never fails on them', () => {
    expect(normaliseTags(['<script>alert(1)</script>'])).toEqual(['scriptalert1script'])
    expect(normaliseTags(['"><svg/onload=alert(1)>'])).toEqual(['svgonloadalert1'])
    expect(normaliseTags(['javascript:alert(1)'])).toEqual(['javascriptalert1'])
    // 'a/b', 'a\\b' and 'a=b' all lose their symbol and become the same 'ab': one entry survives.
    expect(normaliseTags(['r&b', 'a/b', 'a\\b', 'a=b', '{{7*7}}', '${x}', '%3Cb%3E'])).toEqual(['rb', 'ab', '77', 'x', '3cb3e'])
  })

  it('removes control and invisible characters', () => {
    expect(normaliseTags([`ve${NUL}${ZWSP}${RLO}gan`])).toEqual(['vegan'])
  })

  it('strips leading punctuation: a tag starts with a letter, a digit or an emoji', () => {
    expect(normaliseTags(['-vegan', '.hidden', "'quoted", '__x', '+1'])).toEqual(['vegan', 'hidden', 'quoted', 'x', '1'])
  })

  it('leaves nothing for text that has no usable character', () => {
    expect(normaliseTags(['<>', '&&&', '###', `${ZWSP}${RLO}`])).toEqual([])
  })
})

describe('tagFromInput (what the interests box turns typed text into)', () => {
  it('turns spaces and commas into dashes, like the kit default it replaces', () => {
    expect(tagFromInput('Hiking Trip')).toBe('hiking-trip')
    expect(tagFromInput('Rock, jazz')).toBe('rock-jazz')
    expect(tagFromInput('  #Vegan  ')).toBe('vegan')
    expect(tagFromInput('--a--')).toBe('a')
  })

  it('cleans hostile input as it is typed', () => {
    expect(tagFromInput('<img src=x onerror=alert(1)>')).toBe('img-srcx-onerroralert1')
    expect(tagFromInput(`ve${NUL}gan`)).toBe('vegan')
  })

  it('returns an empty string when nothing usable is left, which the box then ignores', () => {
    expect(tagFromInput('<>')).toBe('')
    expect(tagFromInput('   ')).toBe('')
  })

  it('agrees with normaliseTags once the dashes are in: a typed tag survives the save step unchanged', () => {
    for (const typed of ['Hiking Trip', 'c++', "It's", `${GUITAR} guitar`, '<b>bold</b>']) {
      const chip = tagFromInput(typed)
      expect(normaliseTags([chip]), typed).toEqual([chip])
    }
  })
})
