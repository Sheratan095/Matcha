import { useState, type FormEvent } from 'react'
import type { OwnProfile } from '@/api/types'
import { savedSpot, sameSpot, type PlacedSpot } from '@/features/location/geo'
import { LocationPicker } from '@/features/location/LocationPicker'
import { locationMode, modeAfterSaving, setLocationMode, type LocationMode } from '@/features/location/mode'
import { useT } from '@/i18n'
import { Button, Card, FormError, Headline, IconCheck, Stack, Switch, Text } from '@/ui'
import { actions, toApiError } from '@/wb'
import { describe } from './errors'
import { SECTION_IDS } from './profile'
import s from './EditSections.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The own location: the saved spot on a map, a new one saved on demand, and whether it follows the device.
 * On the Me page it is a numbered section; elsewhere (the Map page) leave `number` out. `onSaved` runs
 * once a new spot is stored.
 */
export function LocationSection({ profile, number, onSaved }: { profile: OwnProfile; number?: number; onSaved?: () => void }) {
  const t = useT()
  const saved = savedSpot(profile)
  const [base, setBase] = useState(saved)
  const [draft, setDraft] = useState<PlacedSpot | null>(saved)
  const [mode, setMode] = useState<LocationMode>(() => locationMode(profile.userId))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The saved spot changed elsewhere (the automatic refresh, another tab): follow it unless edited here.
  const savedChanged = saved && base ? !sameSpot(saved, base, 0.001) : saved !== base
  if (savedChanged) {
    setBase(saved)
    if (!draft || (base && sameSpot(draft, base, 0.001))) setDraft(saved)
  }

  const dirty = draft !== null && (!saved || !sameSpot(draft, saved))
  const titleId = `${SECTION_IDS.location}-title`
  const state = saving
    ? t('me.stateSaving')
    : dirty
      ? t('me.stateUnsaved')
      : justSaved
        ? t('me.stateSaved')
        : saved
          ? t('me.stateUpToDate')
          : t('me.stateNotSet')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft || !dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      await actions.setLocation(draft)
      const next = modeAfterSaving(draft.source, mode)
      setLocationMode(profile.userId, next)
      setMode(next)
      setJustSaved(true)
      onSaved?.()
    } catch (failure) {
      setError(describe(toApiError(failure)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card as="section" id={SECTION_IDS.location} aria-labelledby={titleId} label={number === undefined ? t('me.locSpot') : t('me.section', { n: pad(number) })} meta={state} className={s.section}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Stack gap={2}>
            <Headline as="h2" id={titleId} size="d3" width="condensed">
              {t('me.locTitle')}
            </Headline>
            <Text size="sm" muted>
              {t('me.locIntro')}
            </Text>
          </Stack>
          <LocationPicker
            value={draft}
            onChange={(spot) => {
              setDraft(spot)
              setJustSaved(false)
            }}
          />
          <Switch
            checked={mode === 'auto'}
            onChange={(event) => {
              const next: LocationMode = event.currentTarget.checked ? 'auto' : 'manual'
              setLocationMode(profile.userId, next)
              setMode(next)
            }}
            description={t('me.locAutoHint')}
          >
            {t('me.locAuto')}
          </Switch>
          <FormError error={error} title={t('me.notSaved')} />
          <div className={s.actions}>
            <span className={s.status} role="status">
              {justSaved && !dirty ? (
                <span className={s.saved}>
                  <IconCheck size={16} strokeWidth={4} /> {t('me.stateSaved')}
                </span>
              ) : null}
            </span>
            {dirty && !saving ? (
              <Button variant="ghost" onClick={() => setDraft(saved)}>
                {t('me.undo')}
              </Button>
            ) : null}
            <Button type="submit" loading={saving} disabled={!dirty}>
              {t('me.save')}
            </Button>
          </div>
        </Stack>
      </form>
    </Card>
  )
}
