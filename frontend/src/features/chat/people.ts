/** Reading people (cards and profiles) for display. */
import type { Profile } from '@/api/types'
import { t } from '@/i18n'

/** The profile picture, else the first one, else null. */
export function mainPicture(profile: Pick<Profile, 'pictures'> | null | undefined): string | null {
  const pictures = profile?.pictures ?? []
  return (pictures.find((picture) => picture.isProfile) ?? pictures[0])?.url ?? null
}

/** A first name to print; never empty. */
export function firstNameOf(profile: Pick<Profile, 'firstName' | 'lastName'> | null | undefined, fallback = t('toast.someone')): string {
  return profile?.firstName?.trim() || profile?.lastName?.trim() || fallback
}

/** 'board-games' -> 'board games'. */
export function tagLabel(tag: string): string {
  return tag.replace(/-/g, ' ')
}
