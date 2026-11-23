import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { OwnProfile } from '@/api/types'
import { MAX_BIOGRAPHY_LENGTH, MAX_INTEREST_LENGTH } from '@/api/types'
import { dateOfBirthBounds, MIN_AGE } from '@/features/auth/rules'
import { useT, type MessageKey } from '@/i18n'
import { savedSpot, sameSpot, type PlacedSpot } from '@/features/location/geo'
import { LocationPicker } from '@/features/location/LocationPicker'
import { locationMode, modeAfterSaving, setLocationMode } from '@/features/location/mode'
import { describe } from '@/features/me/errors'
import { focusFirstInvalid } from '@/features/me/focus'
import { PhotoManager } from '@/features/me/PhotoManager'
import { ProfileLoading, ProfileUnavailable, SignedOut } from '@/features/me/ProfileStatus'
import { canSetDateOfBirth, genderOptions, preferenceOptions } from '@/features/me/profile'
import { useMyProfile } from '@/features/me/useMyProfile'
import { useProfileDraft, type ProfileDraftApi } from '@/features/me/useProfileDraft'
import { useTagCatalogue } from '@/features/me/useTagCatalogue'
import {
  Button,
  FormError,
  Headline,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconLogout,
  IconPlus,
  Label,
  Notice,
  PosterWord,
  Screen,
  Segmented,
  Steps,
  TagInput,
  Text,
  TextArea,
  TextField,
  toast,
  Wordmark,
} from '@/ui'
import { actions, tagFromInput, toApiError, useNodeValue } from '@/wb'
import { Celebration } from './Celebration'
import { firstRequiredGap, resumeStep, STEPS } from './steps'
import s from './Onboarding.module.css'

const FORM_ID = 'onboarding-step'
const pad = (n: number) => String(n).padStart(2, '0')

/** The openers under the biography: what the button says, and what it starts the biography with. */
const BIO_STARTERS: readonly { label: MessageKey; text: MessageKey }[] = [
  { label: 'onb.starterSundayLabel', text: 'onb.starterSundayText' },
  { label: 'onb.starterGoodLabel', text: 'onb.starterGoodText' },
  { label: 'onb.starterCoffeeLabel', text: 'onb.starterCoffeeText' },
]

// ---------------------------------------------------------------- frame

function OnboardingHeader({ current }: { current: number | null }) {
  const t = useT()
  const navigate = useNavigate()
  const [leaving, setLeaving] = useState(false)
  const logout = async () => {
    setLeaving(true)
    try {
      await actions.logout()
      navigate('/', { replace: true })
    } catch {
      setLeaving(false)
      toast.error(t('me.logOutFailed'), t('onb.tryMoment'))
    }
  }
  return (
    <div className={s.top}>
      <div className={s.topRow}>
        <Wordmark size="sm" />
        <Button variant="ghost" size="sm" icon={<IconLogout size={16} />} loading={leaving} onClick={logout}>
          {t('me.logOut')}
        </Button>
      </div>
      {current !== null ? <Steps current={current + 1} total={STEPS.length} labels={STEPS.map((step) => t(step.label))} /> : null}
    </div>
  )
}

function Frame({ children, footer, poster, current }: { children: ReactNode; footer?: ReactNode; poster?: string; current: number | null }) {
  return (
    <Screen header={<OnboardingHeader current={current} />} footer={footer} poster={poster}>
      {children}
    </Screen>
  )
}

// ---------------------------------------------------------------- steps

/**
 * Names and gender; the date of birth too while the profile has none (a GitHub sign-up: registering asks
 * for it). It is set once, then only the age shows.
 */
function AboutFields({ form, askBirthday }: { form: ProfileDraftApi; askBirthday: boolean }) {
  const t = useT()
  const [bounds] = useState(dateOfBirthBounds)
  return (
    <>
      <div className={s.names}>
        <TextField
          label={t('me.labelFirstName')}
          autoComplete="given-name"
          maxLength={50}
          value={form.value.firstName}
          onChange={(e) => form.set('firstName', e.currentTarget.value)}
          error={form.errors.firstName}
        />
        <TextField
          label={t('me.labelLastName')}
          autoComplete="family-name"
          maxLength={50}
          value={form.value.lastName}
          onChange={(e) => form.set('lastName', e.currentTarget.value)}
          error={form.errors.lastName}
        />
      </div>
      {askBirthday ? (
        <TextField
          label={t('me.labelBirth')}
          type="date"
          autoComplete="bday"
          min={bounds.min}
          max={bounds.max}
          value={form.value.dateOfBirth}
          onChange={(e) => form.set('dateOfBirth', e.currentTarget.value)}
          error={form.errors.dateOfBirth}
          hint={t('onb.birthHint', { n: MIN_AGE })}
        />
      ) : null}
      <Segmented
        label={t('onb.iAm')}
        options={genderOptions()}
        value={form.value.gender}
        onChange={(value) => form.set('gender', value)}
        error={form.errors.gender}
        size="lg"
        stacked
      />
    </>
  )
}

function IntoFields({ form }: { form: ProfileDraftApi }) {
  const t = useT()
  return (
    <Segmented
      label={t('me.showMe')}
      options={preferenceOptions()}
      value={form.value.sexualPreference}
      onChange={(value) => form.set('sexualPreference', value)}
      error={form.errors.sexualPreference}
      tone="strawberry"
      size="lg"
      stacked
    />
  )
}

function BioFields({ form }: { form: ProfileDraftApi }) {
  const t = useT()
  const bio = form.value.biography
  const add = (starter: string) => {
    const joined = (bio.trim() ? `${bio.trimEnd()}\n${starter}` : starter).slice(0, MAX_BIOGRAPHY_LENGTH)
    form.set('biography', joined)
    // once React has committed the new value: caret at the end, ready to finish the sentence
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const area = document.getElementById('onboarding-bio') as HTMLTextAreaElement | null
        if (!area) return
        area.focus()
        const end = Math.min(joined.length, area.value.length)
        area.setSelectionRange(end, end)
      }),
    )
  }
  return (
    <>
      <TextArea
        id="onboarding-bio"
        label={t('me.labelBiography')}
        maxLength={MAX_BIOGRAPHY_LENGTH}
        rows={6}
        value={bio}
        placeholder={t('onb.bioPlaceholder')}
        onChange={(e) => form.set('biography', e.currentTarget.value)}
        error={form.errors.biography}
      />
      <div className={s.starters} role="group" aria-label={t('onb.needStart')}>
        <Label tone="muted" as="span">
          {t('onb.needStart')}
        </Label>
        <div className={s.starterRow}>
          {BIO_STARTERS.map((starter) => (
            <Button key={starter.label} size="sm" variant="paper" icon={<IconPlus size={14} />} onClick={() => add(`${t(starter.text)} `)}>
              {t(starter.label)}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}

function InterestFields({ form }: { form: ProfileDraftApi }) {
  const t = useT()
  const catalogue = useTagCatalogue()
  const count = form.value.interests.length
  return (
    <>
      <TagInput
        label={t('me.labelInterests')}
        value={form.value.interests}
        onChange={(tags) => form.set('interests', tags)}
        normalize={tagFromInput}
        suggestions={catalogue.tags}
        suggestionLimit={14}
        maxLength={MAX_INTEREST_LENGTH}
        hint={catalogue.hint}
        error={form.errors.interests}
      />
      <p className={s.tally} aria-live="polite">
        {t.rich(count === 0 ? 'onb.tallyNone' : count === 1 ? 'onb.tallyOne' : 'onb.tallyMany', {
          n: <span className={s.tallyNumber}>{pad(count)}</span>,
        })}
      </p>
    </>
  )
}

// ---------------------------------------------------------------- wizard

function Wizard({ profile }: { profile: OwnProfile }) {
  const t = useT()
  const navigate = useNavigate()
  const [start] = useState(() => resumeStep(profile))
  const [index, setIndex] = useState(() => Math.min(start, STEPS.length - 1))
  const [celebrating, setCelebrating] = useState(false)
  const [gapNotice, setGapNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const stepRef = useRef<HTMLFormElement>(null)
  const form = useProfileDraft(profile)
  /** The location step's pin: saved separately from the profile draft. */
  const [spot, setSpot] = useState<PlacedSpot | null>(() => savedSpot(profile))
  const [spotError, setSpotError] = useState<string | undefined>()
  const [spotFailure, setSpotFailure] = useState<string | null>(null)
  const [savingSpot, setSavingSpot] = useState(false)
  const saving = form.saving || savingSpot
  const complete = useNodeValue('profileComplete') === true
  /** Set by `go`: once the new step has rendered, scroll to its top and focus its first field. */
  const moved = useRef(false)

  useEffect(() => {
    const el = stepRef.current
    if (!moved.current || !el) return
    moved.current = false
    // the screen's scrolling middle (kit Screen): back to the top-left of the new step
    el.closest('main')?.scrollTo({ top: 0, left: 0 })
    el.querySelector<HTMLElement>(
      'input:not([type="file"]):not(:disabled):not([data-skip-autofocus]), textarea, input[type="file"]:not(:disabled)',
    )?.focus({
      preventScroll: true,
    })
  }, [index])

  if (start >= STEPS.length && !celebrating) return <Navigate to="/discover" replace />

  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const go = (next: number) => {
    moved.current = true
    setIndex(next)
    setAnnouncement(t('onb.stepAnnounce', { n: next + 1, total: STEPS.length, label: t(STEPS[next].label) }))
  }

  const finish = () => {
    const gap = firstRequiredGap(profile)
    if (!complete || gap >= 0) {
      const target = gap >= 0 ? gap : 0
      setGapNotice(
        STEPS[target].key === 'photos'
          ? t('onb.gapPhoto')
          : t('onb.gapStep', { label: t(STEPS[target].label).toLowerCase() }),
      )
      go(target)
      return
    }
    setCelebrating(true)
  }

  /** The location step: saves the pin when it moved. Returns false (and says why) when it cannot go on. */
  const saveSpot = async (): Promise<boolean> => {
    if (!spot) {
      setSpotError(t('onb.placePin'))
      return false
    }
    const stored = savedSpot(profile)
    if (stored && sameSpot(stored, spot)) return true
    setSavingSpot(true)
    setSpotFailure(null)
    try {
      await actions.setLocation(spot)
      setLocationMode(profile.userId, modeAfterSaving(spot.source, locationMode(profile.userId)))
      return true
    } catch (failure) {
      setSpotFailure(describe(toApiError(failure)))
      return false
    } finally {
      setSavingSpot(false)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (last) {
      finish()
      return
    }
    if (step.key === 'location') {
      if (await saveSpot()) {
        setGapNotice(null)
        go(index + 1)
      }
      return
    }
    const ok = await form.save(step.fields, { keepDraft: true })
    if (!ok) {
      focusFirstInvalid(stepRef.current)
      return
    }
    setGapNotice(null)
    go(index + 1)
  }

  const leave = () => {
    navigate('/discover', { replace: true })
    toast.show({ tone: 'matcha', title: t('onb.inDeckTitle'), message: t('onb.inDeckBody') })
  }

  const nextLabel = last ? t('onb.finish') : t('onb.continue')

  return (
    <Frame
      current={index}
      poster={step.poster}
      footer={
        <div className={s.footer}>
          {index > 0 ? (
            <Button
              variant="paper"
              size="lg"
              icon={<IconArrowLeft size={22} />}
              aria-label={t('onb.backTo', { label: t(STEPS[index - 1].label).toLowerCase() })}
              title={t('kit.back')}
              disabled={saving}
              onClick={() => go(index - 1)}
            />
          ) : null}
          <Button
            type="submit"
            form={FORM_ID}
            size="lg"
            loading={saving}
            className={s.grow}
            iconRight={last ? <IconCheck size={20} strokeWidth={3.5} /> : <IconArrowRight size={20} />}
          >
            {saving ? t('me.stateSaving') : nextLabel}
          </Button>
        </div>
      }
    >
      <title>{t('onb.docTitle', { label: t(step.label) })}</title>
      <form
        key={step.key}
        id={FORM_ID}
        ref={stepRef}
        className={s.step}
        onSubmit={onSubmit}
        noValidate
        aria-labelledby="onboarding-title"
      >
        <PosterWord size="clamp(10rem, 62cqw, 17rem)" tone={step.tone} outline className={s.numeral}>
          {pad(index + 1)}
        </PosterWord>

        <header className={s.head}>
          <Label tone="muted">
            {t('onb.stepKicker', { n: pad(index + 1), label: t(step.label) })}
          </Label>
          <Headline as="h1" id="onboarding-title" size="d2" width="condensed" print="riso" offset={step.tone}>
            {t.stack(step.title)}
          </Headline>
          <Text size="lead" className={s.lead}>
            {t(step.lead)}
          </Text>
        </header>

        {gapNotice ? (
          <Notice tone="warning" title={t('onb.almost')} onDismiss={() => setGapNotice(null)}>
            {gapNotice}
          </Notice>
        ) : null}

        <div className={s.fields}>
          {step.key === 'about' ? <AboutFields form={form} askBirthday={canSetDateOfBirth(profile)} /> : null}
          {step.key === 'into' ? <IntoFields form={form} /> : null}
          {step.key === 'bio' ? <BioFields form={form} /> : null}
          {step.key === 'interests' ? <InterestFields form={form} /> : null}
          {step.key === 'location' ? (
            <LocationPicker
              value={spot}
              onChange={(next) => {
                setSpot(next)
                setSpotError(undefined)
              }}
              locateWhenEmpty
              error={spotError}
            />
          ) : null}
          {step.key === 'photos' ? <PhotoManager profile={profile} /> : null}
        </div>

        <FormError error={step.key === 'location' ? spotFailure : form.formError} title={t('me.notSaved')} />
      </form>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <Celebration open={celebrating} profile={profile} onGo={leave} />
    </Frame>
  )
}

/** `/onboarding`: complete the profile one step at a time; each step saves what it changed. */
export default function OnboardingPage() {
  const t = useT()
  const me = useMyProfile()
  if (me.state === 'ready') return <Wizard profile={me.profile} />
  return (
    <Frame current={null}>
      <div className={s.status}>
        {me.state === 'loading' ? <ProfileLoading caption={t('onb.settingOut')} /> : null}
        {me.state === 'error' ? <ProfileUnavailable error={me.error} /> : null}
        {me.state === 'signed-out' ? <SignedOut /> : null}
      </div>
    </Frame>
  )
}
