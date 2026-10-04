import type { Profile } from '@/api/types'
import { mainPicture, serialOf } from '@/features/me/profile'
import {
  Button,
  Headline,
  IconArrowRight,
  Marquee,
  Modal,
  PhotoFrame,
  PosterWord,
  Serial,
  Stamp,
  Sticker,
  Text,
} from '@/ui'
import s from './Celebration.module.css'

export interface CelebrationProps {
  open: boolean
  profile: Profile
  /** Leaves for the deck. */
  onGo: () => void
}

/** The end of onboarding: the new card slapped onto a sunburst, a LIVE stamp, and the way to the deck. */
export function Celebration({ open, profile, onGo }: CelebrationProps) {
  const main = mainPicture(profile)
  const first = profile.firstName?.trim() || 'You'
  return (
    <Modal open={open} onClose={onGo} variant="takeover" title="Your profile is live" hideTitle tone="matcha">
      <div className={s.stage}>
        <div className={s.rays} aria-hidden="true" />
        <PosterWord size="clamp(8rem, 46vw, 22rem)" tone="ink" outline className={s.word}>
          Fresh
        </PosterWord>

        <div className={s.card}>
          <div className={s.polaroid}>
            <PhotoFrame src={main?.url} alt="" seed={profile.userId} radius="sm" ratio="4 / 5" loading="eager" />
            <span className={s.caption}>
              {first} · <Serial value={serialOf(profile.userId)} />
            </span>
          </div>
          <span className={s.stamp}>
            <Stamp tone="ink" size="lg" rotate={-11} thunk>
              Live!
            </Stamp>
          </span>
          <span className={s.sticker}>
            <Sticker tone="yolk" rotate={12} size="92px" thunk>
              Nº 01
            </Sticker>
          </span>
        </div>

        <div className={s.copy}>
          <Headline as="p" size="d1" width="condensed" print="riso" offset="paper" align="center">
            You’re in
          </Headline>
          <Text align="center" size="lead">
            Your card is in the deck, {first}. Go find someone worth a second cup.
          </Text>
          <Button variant="ink" size="lg" block iconRight={<IconArrowRight size={22} />} onClick={onGo}>
            Start swiping
          </Button>
        </div>

        <div className={s.band}>
          <Marquee items={['Profile live', 'Freshly whisked', 'Now in the deck', 'Stone-ground', 'Admit one']} tone="ink" tilt={-3} size="md" />
        </div>
      </div>
    </Modal>
  )
}
