/**
 * The deck filters, edited as a draft and applied in one go (`actions.setFilters`: one deck request).
 * The search bar reuses it with its own `apply`, labels and defaults, and with `people` (gender and
 * preference, src/features/search). The interest list loads the first time the sheet opens.
 */
import { useId, useState, type ReactNode } from 'react'
import type { DiscoverSort, Gender, SexualPreference } from '@/api/types'
import { genderOptions, preferenceOptions } from '@/features/me/profile'
import { useT } from '@/i18n'
import { Button, Chip, DualSlider, Field, FormError, Segmented, Sheet, Skeleton, Slider, Stack, Text } from '@/ui'
import { actions, DEFAULT_DISCOVER_FILTERS, toApiError, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { AGE_RANGE, DISTANCE_RANGE, FAME_RANGE, sameFilters, SORT_KEY, type SheetFilters } from './filterRules'
import s from './FilterSheet.module.css'

const SORTS = Object.keys(SORT_KEY) as DiscoverSort[]

const pad2 = (n: number) => String(n).padStart(2, '0')

/** A labelled row of toggle chips; nothing picked means "any". */
function ChipChoice<V extends string>({
  label,
  hint,
  options,
  picked,
  onToggle,
}: {
  label: string
  hint: string
  options: readonly { value: V; label: string }[]
  picked: readonly V[]
  onToggle: (value: V) => void
}) {
  const t = useT()
  const labelId = useId()
  return (
    <Field
      label={label}
      labelId={labelId}
      aside={picked.length > 0 ? t.n('deck.picked', picked.length, { n: pad2(picked.length) }) : t('deck.any')}
      hint={hint}
    >
      <div role="group" aria-labelledby={labelId} className={s.tags}>
        {options.map((option) => {
          const selected = picked.includes(option.value)
          return (
            <Chip key={option.value} onClick={() => onToggle(option.value)} selected={selected} tone={selected ? 'matcha' : 'paper'} size="sm">
              {option.label}
            </Chip>
          )
        })}
      </div>
    </Field>
  )
}

function toggle<V>(list: readonly V[] = [], value: V): V[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export interface FilterSheetProps {
  open: boolean
  onClose: () => void
  /** The filters in force (the draft starts from them each time the sheet opens). */
  filters: SheetFilters
  /** Applies the draft. Default: `actions.setFilters` (the deck). A rejection shows in the sheet. */
  apply?: (filters: SheetFilters) => Promise<void>
  /** Called after the new filters are applied (for the deck: and the deck reloaded). */
  onApplied?: (filters: SheetFilters) => void
  /** What "Reset" goes back to. Default: the deck's defaults. */
  defaults?: SheetFilters
  /** Also edit who people are: their gender and whom they are into (the search). Default false. */
  people?: boolean
  title?: ReactNode
  kicker?: ReactNode
  /** Under the interests: how several tags combine. Default: at least one of them. */
  tagsHint?: ReactNode
  submitLabel?: ReactNode
  /** Label of the sort control. Default: "Order the deck by". */
  sortLabel?: ReactNode
  /** How the distance read-out prints. Default: the kilometres. */
  formatDistance?: (km: number) => string
  /** How the minimum fame read-out prints. Default: the number. */
  formatFame?: (fame: number) => string
}

const DECK_DEFAULTS: SheetFilters = { ...DEFAULT_DISCOVER_FILTERS, tags: [] }

/** A copy the draft can change without touching `filters`. */
function draftOf(filters: SheetFilters): SheetFilters {
  return {
    ...filters,
    tags: [...filters.tags],
    ...(filters.genders ? { genders: [...filters.genders] } : {}),
    ...(filters.preferences ? { preferences: [...filters.preferences] } : {}),
  }
}

export function FilterSheet({
  open,
  onClose,
  filters,
  apply: applyFilters = actions.setFilters,
  onApplied,
  defaults = DECK_DEFAULTS,
  people = false,
  title,
  kicker,
  tagsHint,
  submitLabel,
  sortLabel,
  formatDistance,
  formatFame,
}: FilterSheetProps) {
  const t = useT()
  const [draft, setDraft] = useState<SheetFilters>(filters)
  const [wasOpen, setWasOpen] = useState(open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null)
  useLoad('interestCatalogue', { enabled: open })
  const catalogue = useNodeValue('tagCatalogue')
  const catalogueStatus = useNodeStatus('interestCatalogue')
  const me = useNodeValue('myProfile')
  const tagsLabelId = useId()

  // a fresh draft each time the sheet opens
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(draftOf(filters))
      setError(null)
    }
  }

  const patch = (changes: Partial<SheetFilters>) => setDraft((current) => ({ ...current, ...changes }))
  const toggleTag = (tag: string) => setDraft((current) => ({ ...current, tags: toggle(current.tags, tag) }))
  const toggleGender = (gender: Gender) => setDraft((current) => ({ ...current, genders: toggle(current.genders, gender) }))
  const togglePreference = (preference: SexualPreference) =>
    setDraft((current) => ({ ...current, preferences: toggle(current.preferences, preference) }))

  // own interests first, then the rest of the catalogue; selected tags missing from it stay visible
  const mine = (me?.interests ?? []).map((tag) => tag.name)
  const all = catalogue ?? []
  const tagList = [...new Set([...mine.filter((tag) => all.includes(tag)), ...all, ...draft.tags])]

  const apply = async () => {
    if (busy) return
    if (sameFilters(draft, filters)) {
      onClose()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await applyFilters(draft)
      onApplied?.(draft)
      onClose()
    } catch (failure) {
      setError(toApiError(failure))
    } finally {
      setBusy(false)
    }
  }

  const ageClamped: [number, number] = [
    Math.max(AGE_RANGE.min, Math.min(draft.ageMin, AGE_RANGE.max)),
    Math.max(AGE_RANGE.min, Math.min(draft.ageMax, AGE_RANGE.max)),
  ]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title ?? t('deck.filtersTitle')}
      kicker={kicker ?? t('deck.filtersKicker')}
      footer={
        <div className={s.footer}>
          <Button variant="paper" onClick={() => setDraft(draftOf(defaults))} disabled={busy || sameFilters(draft, defaults)}>
            {t('deck.reset')}
          </Button>
          <Button onClick={apply} loading={busy} block>
            {submitLabel ?? t('deck.showPeople')}
          </Button>
        </div>
      }
    >
      <Stack gap={6}>
        <DualSlider
          label={t('deck.segAge')}
          value={ageClamped}
          onChange={([ageMin, ageMax]) => patch({ ageMin, ageMax })}
          min={AGE_RANGE.min}
          max={AGE_RANGE.max}
          thumbLabels={[t('deck.minAge'), t('deck.maxAge')]}
          format={(v) => (v >= AGE_RANGE.max ? `${v}+` : String(v))}
        />
        <Slider
          label={t('deck.maxDistance')}
          value={Math.min(draft.distance, DISTANCE_RANGE.max)}
          onChange={(distance) => patch({ distance })}
          min={DISTANCE_RANGE.min}
          max={DISTANCE_RANGE.max}
          step={DISTANCE_RANGE.step}
          format={formatDistance}
          unit={formatDistance ? undefined : 'km'}
        />
        <Slider
          label={t('deck.minFame')}
          value={Math.max(FAME_RANGE.min, Math.min(draft.fameMin, FAME_RANGE.max))}
          onChange={(fameMin) => patch({ fameMin })}
          min={FAME_RANGE.min}
          max={FAME_RANGE.max}
          step={FAME_RANGE.step}
          format={formatFame}
        />
        {people ? (
          <>
            <ChipChoice
              label={t('deck.gender')}
              hint={t('deck.genderHint')}
              options={genderOptions()}
              picked={draft.genders ?? []}
              onToggle={toggleGender}
            />
            <ChipChoice
              label={t('deck.interestedIn')}
              hint={t('deck.interestedInHint')}
              options={preferenceOptions()}
              picked={draft.preferences ?? []}
              onToggle={togglePreference}
            />
          </>
        ) : null}
        <Segmented<DiscoverSort>
          label={sortLabel ?? t('deck.sortLabel')}
          options={SORTS.map((value) => ({ value, label: t(SORT_KEY[value]) }))}
          value={draft.sort}
          onChange={(sort) => patch({ sort })}
        />
        <Field
          label={t('deck.interests')}
          labelId={tagsLabelId}
          aside={draft.tags.length > 0 ? t.n('deck.picked', draft.tags.length, { n: pad2(draft.tags.length) }) : t('deck.any')}
          hint={tagsHint ?? t('deck.tagsHint')}
        >
          {catalogue ? (
            <div role="group" aria-labelledby={tagsLabelId} className={s.tags}>
              {tagList.map((tag) => {
                const selected = draft.tags.includes(tag)
                return (
                  <Chip key={tag} onClick={() => toggleTag(tag)} selected={selected} tone={selected ? 'matcha' : 'paper'} size="sm">
                    #{tag}
                  </Chip>
                )
              })}
            </div>
          ) : catalogueStatus.status === 'error' ? (
            <Text size="sm" muted>
              {t('deck.tagsFailed')}
            </Text>
          ) : (
            <div className={s.tags} aria-hidden="true">
              {[72, 54, 90, 64, 80, 58, 70].map((width, i) => (
                <Skeleton key={i} shape="text" width={width} height={28} />
              ))}
            </div>
          )}
        </Field>
        <FormError error={error} title={t('deck.filtersNotApplied')} />
      </Stack>
    </Sheet>
  )
}
