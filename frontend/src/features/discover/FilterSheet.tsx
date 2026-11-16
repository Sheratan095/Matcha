/**
 * The deck filters, edited as a draft and applied in one go (`actions.setFilters`: one deck request).
 * The search bar reuses it with its own `apply`, labels and defaults (src/features/search).
 */
import { useId, useState, type ReactNode } from 'react'
import type { DiscoverSort } from '@/api/types'
import { Button, Chip, DualSlider, Field, FormError, Segmented, Sheet, Skeleton, Slider, Stack, Text } from '@/ui'
import { actions, DEFAULT_DISCOVER_FILTERS, toApiError, useNodeStatus, useNodeValue, type DiscoverFilters } from '@/wb'
import { AGE_RANGE, DISTANCE_RANGE, FAME_RANGE, sameFilters, SORT_LABEL } from './filterRules'
import s from './FilterSheet.module.css'

const SORT_OPTIONS = (Object.keys(SORT_LABEL) as DiscoverSort[]).map((value) => ({ value, label: SORT_LABEL[value] }))

export interface FilterSheetProps {
  open: boolean
  onClose: () => void
  /** The filters in force (the draft starts from them each time the sheet opens). */
  filters: DiscoverFilters
  /** Applies the draft. Default: `actions.setFilters` (the deck). A rejection shows in the sheet. */
  apply?: (filters: DiscoverFilters) => Promise<void>
  /** Called after the new filters are applied (for the deck: and the deck reloaded). */
  onApplied?: (filters: DiscoverFilters) => void
  /** What "Reset" goes back to. Default: the deck's defaults. */
  defaults?: DiscoverFilters
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

const DECK_DEFAULTS: DiscoverFilters = { ...DEFAULT_DISCOVER_FILTERS, tags: [] }

export function FilterSheet({
  open,
  onClose,
  filters,
  apply: applyFilters = actions.setFilters,
  onApplied,
  defaults = DECK_DEFAULTS,
  title = 'Filters',
  kicker = 'Tune the deck',
  tagsHint = 'People who have at least one of these.',
  submitLabel = 'Show people',
  sortLabel = 'Order the deck by',
  formatDistance,
  formatFame,
}: FilterSheetProps) {
  const [draft, setDraft] = useState<DiscoverFilters>(filters)
  const [wasOpen, setWasOpen] = useState(open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof toApiError> | null>(null)
  const catalogue = useNodeValue('tagCatalogue')
  const catalogueStatus = useNodeStatus('interestCatalogue')
  const me = useNodeValue('myProfile')
  const tagsLabelId = useId()

  // a fresh draft each time the sheet opens
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft({ ...filters, tags: [...filters.tags] })
      setError(null)
    }
  }

  const patch = (changes: Partial<DiscoverFilters>) => setDraft((current) => ({ ...current, ...changes }))
  const toggleTag = (tag: string) =>
    setDraft((current) => ({
      ...current,
      tags: current.tags.includes(tag) ? current.tags.filter((t) => t !== tag) : [...current.tags, tag],
    }))

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
      title={title}
      kicker={kicker}
      footer={
        <div className={s.footer}>
          <Button
            variant="paper"
            onClick={() => setDraft({ ...defaults, tags: [...defaults.tags] })}
            disabled={busy || sameFilters(draft, defaults)}
          >
            Reset
          </Button>
          <Button onClick={apply} loading={busy} block>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <Stack gap={6}>
        <DualSlider
          label="Age"
          value={ageClamped}
          onChange={([ageMin, ageMax]) => patch({ ageMin, ageMax })}
          min={AGE_RANGE.min}
          max={AGE_RANGE.max}
          thumbLabels={['Minimum age', 'Maximum age']}
          format={(v) => (v >= AGE_RANGE.max ? `${v}+` : String(v))}
        />
        <Slider
          label="Maximum distance"
          value={Math.min(draft.distance, DISTANCE_RANGE.max)}
          onChange={(distance) => patch({ distance })}
          min={DISTANCE_RANGE.min}
          max={DISTANCE_RANGE.max}
          step={DISTANCE_RANGE.step}
          format={formatDistance}
          unit={formatDistance ? undefined : 'km'}
        />
        <Slider
          label="Minimum fame rating"
          value={Math.max(FAME_RANGE.min, Math.min(draft.fameMin, FAME_RANGE.max))}
          onChange={(fameMin) => patch({ fameMin })}
          min={FAME_RANGE.min}
          max={FAME_RANGE.max}
          step={FAME_RANGE.step}
          format={formatFame}
        />
        <Segmented<DiscoverSort>
          label={sortLabel}
          options={SORT_OPTIONS}
          value={draft.sort}
          onChange={(sort) => patch({ sort })}
        />
        <Field
          label="Interests"
          labelId={tagsLabelId}
          aside={draft.tags.length > 0 ? `${String(draft.tags.length).padStart(2, '0')} picked` : 'Any'}
          hint={tagsHint}
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
              The interest list could not be loaded. The other filters still work.
            </Text>
          ) : (
            <div className={s.tags} aria-hidden="true">
              {[72, 54, 90, 64, 80, 58, 70].map((width, i) => (
                <Skeleton key={i} shape="text" width={width} height={28} />
              ))}
            </div>
          )}
        </Field>
        <FormError error={error} title="Filters not applied" />
      </Stack>
    </Sheet>
  )
}
