import type { OwnProfile, Profile, SexualPreference } from '@/api/types'
import { useT, type MessageKey, type Translator } from '@/i18n'
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
import { REVISIT_MS, useLoad, useNodeStatus, useNodeValue } from '@/wb'
import { CompletenessMeter } from './CompletenessMeter'
import {
  genderLabel,
  interestNames,
  mainPicture,
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

const INTO: Record<SexualPreference, MessageKey> = {
  female: 'prof.intoFemale',
  male: 'prof.intoMale',
  both: 'prof.intoBoth',
  other: 'prof.intoOther',
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function identityLine(profile: Profile, t: Translator): string {
  const parts: string[] = []
  if (profile.gender) parts.push(genderLabel(profile.gender))
  if (profile.sexualPreference) parts.push(capitalise(t(INTO[profile.sexualPreference])))
  return parts.length ? parts.join(' · ') : t('me.identityEmpty')
}

/** The own profile as a poster: tilted main photo on a matcha band, the name in heavy type, the numbers. */
export function ProfileHeader({ profile, onEdit, onFix, onPreview }: ProfileHeaderProps) {
  const t = useT()
  const complete = useNodeValue('profileComplete') === true
  useLoad('myViewers', { maxAgeMs: REVISIT_MS })
  const viewers = useNodeValue('myViewers')
  const viewersStatus = useNodeStatus('myViewers')
  const main = mainPicture(profile)
  const first = profile.firstName?.trim() || t('me.headerYou')
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
            alt={main ? t('me.mainPhotoAlt', { name: first }) : ''}
            seed={profile.userId}
            shadow={4}
            radius="xl"
            tilt={-2.5}
            loading="eager"
          />
          <span className={s.stamp}>
            <Stamp tone={complete ? 'ink' : 'strawberry'} size="md" rotate={9} sub={complete ? t('me.stampInDeck') : t('me.stampNotInDeck')}>
              {complete ? t('me.stampLive') : t('me.stampDraft')}
            </Stamp>
          </span>
        </div>
        {!main ? (
          <span className={s.sticker}>
          <Sticker tone="yolk" rotate={-12} size="84px">
            {t.stack(profile.pictures.length === 0 ? 'me.stickerAddPhoto' : 'me.stickerPickMain')}
          </Sticker>
          </span>
        ) : null}
      </div>

      <div className={s.identity}>
        <Label tone="muted">
          <Serial value={serialOf(profile.userId)} /> · {t('me.memberSince', { year: since })}
        </Label>
        <Headline as="h1" id="me-name" size="d1" width="condensed" print="riso" className={s.name}>
          {first}
          {last ? <span className={s.last}> {last}</span> : null}
        </Headline>
        <p className={s.line}>
          <IconUser size={16} strokeWidth={3} />
          <Text as="span" size="sm" strong>
            {identityLine(profile, t)}
          </Text>
        </p>
      </div>

      <CompletenessMeter checks={profileChecks(profile)} onFix={onFix} />

      <StatGroup>
        <Stat value={viewerCount} label={t('me.statViewers')} />
        <Stat value={profile.interests.length} label={t('me.statInterests')} tone="strawberry" />
        <Stat value={profile.pictures.length} unit="/5" label={t('me.statPhotos')} tone="yolk" />
      </StatGroup>

      {tags.length > 0 ? (
        <ul className={s.chips} aria-label={t('me.statInterests')}>
          {tags.map((tag) => (
            <li key={tag}>
              <Chip>#{tag}</Chip>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={s.actions}>
        <Button variant="paper" icon={<IconPencil size={18} />} onClick={onEdit} className={s.grow}>
          {t('me.editProfile')}
        </Button>
        {onPreview ? (
          <IconButton label={t('me.seeAsOthers')} size="lg" onClick={onPreview}>
            <IconEye size={24} />
          </IconButton>
        ) : null}
      </div>
    </section>
  )
}
