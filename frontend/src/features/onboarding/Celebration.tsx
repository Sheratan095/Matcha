import type { Profile } from '@/api/types'
import { mainPicture, serialOf } from '@/features/me/profile'
import { useT } from '@/i18n'
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
  const t = useT()
  const main = mainPicture(profile)
  const first = profile.firstName?.trim() || t('nav.you')
  return (
    <Modal open={open} onClose={onGo} variant="takeover" title={t('onb.celebrationTitle')} hideTitle tone="matcha">
      <div className={s.stage}>
        <div className={s.rays} aria-hidden="true" />
        <PosterWord size="clamp(8rem, 46vw, 22rem)" tone="ink" outline className={s.word}>
          {t('onb.fresh')}
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
              {t('onb.liveStamp')}
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
            {t('onb.youreIn')}
          </Headline>
          <Text align="center" size="lead">
            {t('onb.celebrationBody', { name: first })}
          </Text>
          <Button variant="ink" size="lg" block iconRight={<IconArrowRight size={22} />} onClick={onGo}>
            {t('onb.startSwiping')}
          </Button>
        </div>

        <div className={s.band}>
          <Marquee items={[t('onb.marquee1'), t('onb.marquee2'), t('onb.marquee3'), t('onb.marquee4'), t('auth.kicker')]} tone="ink" tilt={-3} size="md" />
        </div>
      </div>
    </Modal>
  )
}
