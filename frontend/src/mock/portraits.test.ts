import { describe, expect, it } from 'vitest'
import { PEOPLE, personPictures } from './people'
import { portraitDataUrl, portraitSvg } from './portraits'

describe('portraits', () => {
  it('are deterministic, distinct per variant, valid SVG and a few KB', () => {
    const parser = new DOMParser()
    for (const person of PEOPLE) {
      const svgs = person.shots.map((variant) => portraitSvg(person.look, `person:${person.key}`, variant))
      expect(new Set(svgs).size).toBe(svgs.length)
      for (const svg of svgs) {
        const doc = parser.parseFromString(svg, 'image/svg+xml')
        expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
        expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 300 400')
      }
      const pictures = personPictures(person)
      expect(pictures.length).toBeGreaterThanOrEqual(2)
      expect(pictures.length).toBeLessThanOrEqual(4)
      expect(pictures.filter((picture) => picture.isProfile)).toHaveLength(1)
      for (const picture of pictures) {
        expect(picture.url.startsWith('data:image/svg+xml,')).toBe(true)
        expect(picture.url.length).toBeLessThan(10_000)
        // the data URL decodes back to well-formed markup
        const decoded = decodeURIComponent(picture.url.slice('data:image/svg+xml,'.length))
        expect(parser.parseFromString(decoded, 'image/svg+xml').getElementsByTagName('parsererror')).toHaveLength(0)
      }
    }
    const first = PEOPLE[0]!
    expect(portraitDataUrl(first.look, 'x', 1)).toBe(portraitDataUrl({ ...first.look }, 'x', 1))
  })

  it('gives everyone a unique id and the people are varied', () => {
    expect(new Set(PEOPLE.map((person) => person.id)).size).toBe(PEOPLE.length)
    expect(PEOPLE.length).toBeGreaterThanOrEqual(30)
    expect(PEOPLE.length).toBeLessThanOrEqual(36)
    const ages = PEOPLE.map((person) => person.age)
    expect(Math.min(...ages)).toBeLessThanOrEqual(20)
    expect(Math.max(...ages)).toBeGreaterThanOrEqual(46)
    expect(new Set(PEOPLE.map((person) => person.gender)).size).toBe(3)
    expect(new Set(PEOPLE.map((person) => person.sexualPreference)).size).toBe(4)
    expect(new Set(PEOPLE.map((person) => person.look.hair)).size).toBe(16)
    expect(new Set(PEOPLE.map((person) => person.look.skin)).size).toBe(7)
    for (const person of PEOPLE) {
      expect(person.interests.length).toBeGreaterThanOrEqual(3)
      expect(person.interests.length).toBeLessThanOrEqual(6)
      expect(person.biography.length).toBeLessThanOrEqual(500)
    }
  })
})
