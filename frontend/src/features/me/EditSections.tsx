import { useState, type FormEvent, type ReactNode } from 'react'
import type { OwnProfile, Profile } from '@/api/types'
import { MAX_BIOGRAPHY_LENGTH, MAX_INTEREST_LENGTH } from '@/api/types'
import {
  Button,
  Card,
  FormError,
  Headline,
  IconCheck,
  Segmented,
  Stack,
  TagInput,
  Text,
  TextArea,
  TextField,
} from '@/ui'
import { dateOfBirthBounds, MIN_AGE } from '@/features/auth/rules'
import { tagFromInput } from '@/wb'
import { focusFirstInvalid } from './focus'
import { LocationSection } from './LocationSection'
import {
  canSetDateOfBirth,
  GENDER_OPTIONS,
  isEmptyChange,
  PREFERENCE_OPTIONS,
  SECTION_IDS,
  type DraftKey,
  type EditableProfile,
} from './profile'
import { useProfileDraft, type ProfileDraftApi } from './useProfileDraft'
import { useTagCatalogue } from './useTagCatalogue'
import s from './EditSections.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

interface SectionProps {
  id: string
  number: number
  title: string
  intro?: ReactNode
  form: ProfileDraftApi
  keys: readonly DraftKey[]
  children: ReactNode
}

/** One editable block: its own form, its own partial save, its own saved / error feedback. */
function Section({ id, number, title, intro, form, keys, children }: SectionProps) {
  const dirty = !isEmptyChange(form.changesFor(keys))
  const titleId = `${id}-title`
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const element = event.currentTarget
    void form.save(keys).then((ok) => {
      if (!ok) focusFirstInvalid(element)
    })
  }
  const state = form.saving ? 'Saving' : dirty ? 'Unsaved' : form.saved ? 'Saved' : 'Up to date'
  return (
    <Card as="section" id={id} aria-labelledby={titleId} label={`Section ${pad(number)}`} meta={state} className={s.section}>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap={4}>
          <Stack gap={2}>
            <Headline as="h2" id={titleId} size="d3" width="condensed">
              {title}
            </Headline>
            {intro ? (
              <Text size="sm" muted>
                {intro}
              </Text>
            ) : null}
          </Stack>
          {children}
          <FormError error={form.formError} title="Not saved" />
          <div className={s.actions}>
            <span className={s.status} role="status">
              {form.saved && !dirty ? (
                <span className={s.saved}>
                  <IconCheck size={16} strokeWidth={4} /> Saved
                </span>
              ) : null}
            </span>
            {dirty && !form.saving ? (
              <Button variant="ghost" onClick={form.reset}>
                Undo
              </Button>
            ) : null}
            <Button type="submit" loading={form.saving} disabled={!dirty}>
              Save
            </Button>
          </div>
        </Stack>
      </form>
    </Card>
  )
}

/** Names, and the date of birth while there is none (GitHub sign-ups): it can be set once, here or in onboarding. */
function NamesSection({ profile }: { profile: EditableProfile }) {
  const form = useProfileDraft(profile)
  const askBirthday = canSetDateOfBirth(profile)
  const [bounds] = useState(dateOfBirthBounds)
  return (
    <Section
      id={SECTION_IDS.names}
      number={1}
      title={askBirthday ? 'Names & birthday' : 'Names'}
      intro="Your first name is printed on your card."
      form={form}
      keys={askBirthday ? ['firstName', 'lastName', 'dateOfBirth'] : ['firstName', 'lastName']}
    >
      <div className={s.pair}>
        <TextField
          label="First name"
          autoComplete="given-name"
          maxLength={50}
          value={form.value.firstName}
          onChange={(e) => form.set('firstName', e.currentTarget.value)}
          error={form.errors.firstName}
        />
        <TextField
          label="Last name"
          autoComplete="family-name"
          maxLength={50}
          value={form.value.lastName}
          onChange={(e) => form.set('lastName', e.currentTarget.value)}
          error={form.errors.lastName}
        />
      </div>
      {askBirthday ? (
        <TextField
          label="Date of birth"
          type="date"
          autoComplete="bday"
          min={bounds.min}
          max={bounds.max}
          value={form.value.dateOfBirth}
          onChange={(e) => form.set('dateOfBirth', e.currentTarget.value)}
          error={form.errors.dateOfBirth}
          hint={`Required to appear in Discover. ${MIN_AGE}+ only: others see your age, never the date, and it can't be changed later.`}
        />
      ) : null}
    </Section>
  )
}

function IdentitySection({ profile }: { profile: Profile }) {
  const form = useProfileDraft(profile)
  return (
    <Section
      id={SECTION_IDS.identity}
      number={2}
      title="You & your type"
      intro="Discover shows you people who match this, and shows you to them."
      form={form}
      keys={['gender', 'sexualPreference']}
    >
      <Segmented
        label="I am"
        options={GENDER_OPTIONS}
        value={form.value.gender}
        onChange={(value) => form.set('gender', value)}
        error={form.errors.gender}
        block
      />
      <Segmented
        label="Show me"
        options={PREFERENCE_OPTIONS}
        value={form.value.sexualPreference}
        onChange={(value) => form.set('sexualPreference', value)}
        error={form.errors.sexualPreference}
        tone="strawberry"
      />
    </Section>
  )
}

function BiographySection({ profile }: { profile: Profile }) {
  const form = useProfileDraft(profile)
  return (
    <Section id={SECTION_IDS.biography} number={3} title="Biography" form={form} keys={['biography']}>
      <TextArea
        label="About you"
        maxLength={MAX_BIOGRAPHY_LENGTH}
        rows={5}
        value={form.value.biography}
        onChange={(e) => form.set('biography', e.currentTarget.value)}
        error={form.errors.biography}
        hint="Required to appear in Discover."
      />
    </Section>
  )
}

function InterestsSection({ profile }: { profile: Profile }) {
  const form = useProfileDraft(profile)
  const catalogue = useTagCatalogue()
  return (
    <Section
      id={SECTION_IDS.interests}
      number={4}
      title="Interests"
      intro="Shared interests are printed first on other people’s cards."
      form={form}
      keys={['interests']}
    >
      <TagInput
        label="Your interests"
        value={form.value.interests}
        onChange={(tags) => form.set('interests', tags)}
        normalize={tagFromInput}
        suggestions={catalogue.tags}
        maxLength={MAX_INTEREST_LENGTH}
        hint={catalogue.hint}
        error={form.errors.interests}
      />
    </Section>
  )
}

/** The editable parts of the own profile, one partial save each. */
export function EditSections({ profile }: { profile: OwnProfile }) {
  return (
    <Stack gap={6}>
      <NamesSection profile={profile} />
      <IdentitySection profile={profile} />
      <BiographySection profile={profile} />
      <InterestsSection profile={profile} />
      <LocationSection profile={profile} number={5} />
    </Stack>
  )
}
