import type { OwnProfile, Profile } from '@/api/types'
import {
  Button,
  Chip,
  Headline,
  IconButton,
  IconEye,
  IconPencil,
  IconUser,
  Label,
  Pattern,
  PhotoFrame,
  PosterWord,
  Serial,
  Stamp,
  Stat,
  StatGroup,
  Sticker,
  Text,
} from '@/ui'
import { useNodeStatus, useNodeValue } from '@/wb'
import { CompletenessMeter } from './CompletenessMeter'
import {
  GENDER_LABEL,
  interestNames,
  mainPicture,
  PREFERENCE_LABEL,
  profileChecks,
  serialOf,
  type CheckKey,
} from './profile'
import s from './ProfileHeader.module.css'

export interface ProfileHeaderProps {
  profile: OwnProfile
  onEdit: () => void
  onFix: (key: CheckKey) => void
  /** "See how others see you". Hidden when omitted. */
  onPreview?: () => void
}

function identityLine(profile: Profile): string {
  const parts: string[] = []
  if (profile.gender) parts.push(GENDER_LABEL[profile.gender])
  if (profile.sexualPreference) parts.push(`Into ${PREFERENCE_LABEL[profile.sexualPreference]}`)
  return parts.length ? parts.join(' · ') : 'Gender and preference not set'
}

/** The own profile as a poster: tilted main photo on a matcha band, the name in heavy type, the numbers. */
export function ProfileHeader({ profile, onEdit, onFix, onPreview }: ProfileHeaderProps) {
  const complete = useNodeValue('profileComplete') === true
  const viewers = useNodeValue('myViewers')
  const viewersStatus = useNodeStatus('myViewers')
  const main = mainPicture(profile)
  const first = profile.firstName?.trim() || 'You'
  const last = profile.lastName?.trim()
  const tags = interestNames(profile)
  const since = new Date(profile.createdAt).getFullYear()
  const viewerCount = viewers ? viewers.viewers.length : viewersStatus.status === 'error' ? '–' : '··'

  return (
    <section className={s.header} aria-labelledby="me-name">
      <div className={s.band} data-tone="matcha">
        <Pattern kind="dots" tone="ink" opacity={0.2} />
        <PosterWord size="clamp(7rem, 52cqw, 15rem)" tone="ink" outline className={s.bandWord}>
          {first}
        </PosterWord>
        <div className={s.hero}>
          <PhotoFrame
            src={main?.url}
            alt={main ? `${first}’s main photo` : ''}
            seed={profile.userId}
            shadow={4}
            radius="xl"
            tilt={-2.5}
            loading="eager"
          />
          <span className={s.stamp}>
            <Stamp tone={complete ? 'ink' : 'strawberry'} size="md" rotate={9} sub={complete ? 'In the deck' : 'Not in the deck'}>
              {complete ? 'Live' : 'Draft'}
            </Stamp>
          </span>
        </div>
        {!main ? (
          <span className={s.sticker}>
          <Sticker tone="yolk" rotate={-12} size="84px">
            {profile.pictures.length === 0 ? (
              <>
                Add a<br />
                photo
              </>
            ) : (
              <>
                Pick a<br />
                main
              </>
            )}
          </Sticker>
          </span>
        ) : null}
      </div>

      <div className={s.identity}>
        <Label tone="muted">
          <Serial value={serialOf(profile.userId)} /> · Member since {since}
        </Label>
        <Headline as="h1" id="me-name" size="d1" width="condensed" print="riso" className={s.name}>
          {first}
          {last ? <span className={s.last}> {last}</span> : null}
        </Headline>
        <p className={s.line}>
          <IconUser size={16} strokeWidth={3} />
          <Text as="span" size="sm" strong>
            {identityLine(profile)}
          </Text>
        </p>
      </div>

      <CompletenessMeter checks={profileChecks(profile)} onFix={onFix} />

      <StatGroup>
        <Stat value={viewerCount} label="Viewers" />
        <Stat value={profile.interests.length} label="Interests" tone="strawberry" />
        <Stat value={profile.pictures.length} unit="/5" label="Photos" tone="yolk" />
      </StatGroup>

      {tags.length > 0 ? (
        <ul className={s.chips} aria-label="Interests">
          {tags.map((tag) => (
            <li key={tag}>
              <Chip>#{tag}</Chip>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={s.actions}>
        <Button variant="paper" icon={<IconPencil size={18} />} onClick={onEdit} className={s.grow}>
          Edit profile
        </Button>
        {onPreview ? (
          <IconButton label="See how others see you" size="lg" onClick={onPreview}>
            <IconEye size={24} />
          </IconButton>
        ) : null}
      </div>
    </section>
  )
}
