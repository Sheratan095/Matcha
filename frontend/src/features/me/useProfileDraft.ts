import { useState } from 'react'
import type { ProfileUpdatePayload } from '@/api/types'
import { t } from '@/i18n'
import { actions, toApiError } from '@/wb'
import { splitApiError } from './errors'
import {
  draftOf,
  draftProblems,
  isEmptyChange,
  profileChanges,
  type DraftKey,
  type EditableProfile,
  type ProfileDraft,
} from './profile'

/** Request property → label, for server validation messages (worded when the problem comes up). */
function fieldLabels(): Record<DraftKey, string> {
  return {
    firstName: t('me.labelFirstName'),
    lastName: t('me.labelLastName'),
    dateOfBirth: t('me.labelBirth'),
    gender: t('me.labelGender'),
    sexualPreference: t('me.labelPreference'),
    biography: t('me.labelBiography'),
    interests: t('me.labelInterests'),
  }
}

export type FieldErrors = Partial<Record<DraftKey, string>>

export interface SaveOptions {
  /** Keep the draft after a successful save (a wizard keeps what later steps hold). Default false. */
  keepDraft?: boolean
}

export interface ProfileDraftApi {
  /** What the form shows: the draft, or the saved profile when nothing was edited. */
  value: ProfileDraft
  set: <K extends DraftKey>(key: K, next: ProfileDraft[K]) => void
  /** Drops the edits (and the errors). */
  reset: () => void
  changesFor: (keys: readonly DraftKey[]) => ProfileUpdatePayload
  /**
   * Checks the given fields, then sends what changed among them (`actions.updateProfile`, a partial
   * PATCH). Resolves true when the fields are valid and saved (or had nothing to save).
   */
  save: (keys: readonly DraftKey[], options?: SaveOptions) => Promise<boolean>
  saving: boolean
  /** The last save sent something and succeeded, and nothing was edited since. */
  saved: boolean
  errors: FieldErrors
  /** Messages that belong to no field. */
  formError: string[]
}

/** A form over the own profile: draft, client checks, partial save, and server errors per field. */
export function useProfileDraft(profile: EditableProfile): ProfileDraftApi {
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string[]>([])

  const value = draft ?? draftOf(profile)

  const set = <K extends DraftKey>(key: K, next: ProfileDraft[K]) => {
    setDraft((current) => ({ ...(current ?? draftOf(profile)), [key]: next }))
    setSaved(false)
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current))
    setFormError((current) => (current.length ? [] : current))
  }

  const reset = () => {
    setDraft(null)
    setErrors({})
    setFormError([])
  }

  const changesFor = (keys: readonly DraftKey[]) => profileChanges(profile, value, keys)

  const save = async (keys: readonly DraftKey[], options: SaveOptions = {}) => {
    if (saving) return false
    const problems = draftProblems(value, keys, draftOf(profile))
    if (Object.values(problems).some(Boolean)) {
      setErrors(problems)
      return false
    }
    const changes = changesFor(keys)
    setErrors({})
    setFormError([])
    if (isEmptyChange(changes)) return true
    setSaving(true)
    try {
      await actions.updateProfile(changes)
      if (!options.keepDraft) setDraft(null)
      setSaved(true)
      return true
    } catch (failure) {
      const split = splitApiError(toApiError(failure), fieldLabels())
      setErrors(split.fields)
      setFormError(split.form)
      return false
    } finally {
      setSaving(false)
    }
  }

  return { value, set, reset, changesFor, save, saving, saved, errors, formError }
}
