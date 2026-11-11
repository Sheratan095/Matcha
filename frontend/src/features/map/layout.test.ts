import { describe, expect, it } from 'vitest'
import type { MapMatch } from '@/api/types'
import { initialsOf, kmText, placeMatches, safeImageUrl } from './layout'

const person = (userId: string, latitude: number | null, longitude: number | null): MapMatch => ({
  userId,
  username: userId,
  profilePictureUrl: null,
  latitude,
  longitude,
})

describe('placeMatches', () => {
  const rome = { latitude: 41.9, longitude: 12.5 }

  it('keeps people without a position off the map, and sorts the rest nearest first', () => {
    const { placed, unplaced } = placeMatches(
      [person('far', 45.46, 9.19), person('none', null, null), person('near', 41.91, 12.51)],
      rome,
    )
    expect(placed.map((p) => p.userId)).toEqual(['near', 'far'])
    expect(unplaced.map((p) => p.userId)).toEqual(['none'])
    expect(placed[0].km).toBeLessThan(2)
    expect(placed[1].km).toBeGreaterThan(400)
  })

  it('spreads people sharing one grid cell, without changing their distance', () => {
    const { placed } = placeMatches([person('a', 41.9, 12.5), person('b', 41.9, 12.5), person('c', 41.9, 12.5)], rome)
    const drawn = new Set(placed.map((p) => `${p.at.latitude},${p.at.longitude}`))
    expect(drawn.size).toBe(3)
    for (const p of placed) {
      expect(p.km).toBe(0)
      expect(Math.abs(p.at.latitude - 41.9)).toBeLessThan(0.01)
      expect(Math.abs(p.at.longitude - 12.5)).toBeLessThan(0.01)
    }
  })

  it('leaves a lone person exactly where they are, and has no distance without a viewer spot', () => {
    const { placed } = placeMatches([person('a', 41.9, 12.5)], null)
    expect(placed[0].at).toEqual({ latitude: 41.9, longitude: 12.5 })
    expect(placed[0].km).toBeNull()
  })
})

describe('marker safety', () => {
  it('accepts only absolute http(s) image URLs', () => {
    expect(safeImageUrl('http://img.test/a.webp')).toBe('http://img.test/a.webp')
    expect(safeImageUrl('https://img.test/a.webp')).toBe('https://img.test/a.webp')
    expect(safeImageUrl('javascript:alert(1)')).toBeNull()
    expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()
    expect(safeImageUrl('/relative.png')).toBeNull()
    expect(safeImageUrl(null)).toBeNull()
  })

  it('makes initials from any alphabet and ignores markup', () => {
    expect(initialsOf('alice_smith')).toBe('AS')
    expect(initialsOf('<img src=x>')).toBe('IS')
    expect(initialsOf('élodie')).toBe('É')
    expect(initialsOf('__')).toBe('?')
  })

  it('never claims more precision than the ~1 km grid', () => {
    expect(kmText(0.3)).toBe('<1 km')
    expect(kmText(4.4)).toBe('4 km')
  })
})
