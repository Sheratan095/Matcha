/**
 * `/` for visitors: a poster that sells the app in one glance. Masthead, the hero (giant lettering, a
 * fanned deck with a LIKE stamp, the sign-up ticket), a ticker, three numbered steps and a colophon
 * with the language picker. Signed-in users never see it (HomeGate sends them into the app).
 */
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '@/i18n'
import {
  Barcode,
  ButtonLink,
  ColorBar,
  Halftone,
  Headline,
  IconArrowRight,
  IconChat,
  IconHeart,
  IconRegMark,
  Label,
  LocaleLabel,
  PhotoFrame,
  ProfileCard,
  RegMark,
  Serial,
  Stamp,
  Sticker,
  Text,
  TicketHeader,
  Wordmark,
} from '@/ui'
import { GithubButton, OrRule } from './parts'
import s from './Landing.module.css'

const STEPS = [
  { n: '01', icon: <IconRegMark size={22} />, tone: 'paper', ink: 'strawberry', title: 'landing.step1.title', text: 'landing.step1.text', stamp: 'landing.step1.stamp' },
  { n: '02', icon: <IconHeart size={22} filled />, tone: 'matcha', ink: 'ink', title: 'landing.step2.title', text: 'landing.step2.text', stamp: 'landing.step2.stamp' },
  { n: '03', icon: <IconChat size={22} />, tone: 'yolk', ink: 'blue', title: 'landing.step3.title', text: 'landing.step3.text', stamp: 'landing.step3.stamp' },
] as const

export default function LandingPage() {
  const t = useT()
  const hero = [t('landing.heroA'), t('landing.heroB')]
  return (
    <div className={s.page}>
      <title>{t('landing.docTitle')}</title>

      <header className={s.masthead}>
        <Link to="/" className={s.home} aria-label={t('poster.home')}>
          <Wordmark size="sm" className={s.markSmall} />
          <Wordmark size="md" className={s.markLarge} />
        </Link>
        <p className={s.edition} aria-hidden="true">
          <Serial value="01" prefix={t('poster.serialPrefix')} />
          <span>{t('landing.edition')}</span>
        </p>
        <nav className={s.nav} aria-label={t('landing.navLabel')}>
          <ButtonLink to="/login" size="sm" variant="paper">
            {t('common.signIn')}
          </ButtonLink>
          <ButtonLink to="/register" size="sm" variant="ink" className={s.navJoin}>
            {t('landing.join')}
          </ButtonLink>
        </nav>
      </header>

      <main id="main" className={s.main}>
        <section className={s.hero} aria-labelledby="landing-title">
          <div className={s.sun} aria-hidden="true">
            <Halftone from="bottom-left" tone="ink" columns={16} opacity={0.22} />
          </div>
          <RegMark size={24} className={s.regA} />
          <RegMark size={24} className={s.regB} />

          <h1 id="landing-title" className={s.title} style={{ '--n-stack': Math.max(...hero.map((line) => line.length)), '--n-row': hero.join(' ').length } as CSSProperties}>
            <span className={s.titleA}>{hero[0]}</span> <span className={s.titleB}>{hero[1]}</span>
          </h1>

          <div className={s.art} aria-hidden="true">
            <div className={s.back1}>
              <PhotoFrame src={null} alt="" seed="landing-jo" ratio="3 / 4.6" radius="xl" shadow={3} />
            </div>
            <div className={s.back2}>
              <PhotoFrame src={null} alt="" seed="landing-ines" ratio="3 / 4.6" radius="xl" shadow={3} />
            </div>
            <div className={s.front}>
              <ProfileCard
                name="Alice"
                age={27}
                seed="u-alice"
                city="Paris 11e"
                distanceKm={2}
                online
                tags={['matcha', 'risograph', 'jazz']}
                commonTags={['matcha']}
                stamp="like"
                serial={4211}
              />
            </div>
            <span className={s.matchStamp}>
              <Stamp tone="matcha" size="lg" rotate={-12} thunk sub="Nº 0427">
                {t('landing.matchStamp')}
              </Stamp>
            </span>
            <Sticker tone="yolk" shape="burst" size="104px" rotate={-10} className={s.sticker}>
              {t.stack('common.freeSticker')}
            </Sticker>
          </div>

          <div className={s.ticket}>
            <TicketHeader label={t('landing.ticket')} meta={<Serial value={427} />} />
            <Text size="lead" className={s.lede}>
              {t('landing.lede')}
            </Text>
            <div className={s.ctas}>
              <ButtonLink to="/register" size="lg" block iconRight={<IconArrowRight size={22} strokeWidth={3} />}>
                {t('common.createAccount')}
              </ButtonLink>
              <ButtonLink to="/login" size="lg" variant="paper" block>
                {t('landing.haveAccount')}
              </ButtonLink>
            </div>
            <OrRule />
            <GithubButton />
          </div>

        </section>

        <section className={s.steps} aria-labelledby="landing-how">
          <div className={s.stepsHead}>
            <Label tone="muted">{t('landing.howLabel')}</Label>
            <Headline as="h2" id="landing-how" size="d2" width="condensed" print="riso" offset="strawberry">
              {t('landing.howTitle')}
            </Headline>
          </div>
          <ol className={s.stepList}>
            {STEPS.map((step, i) => (
              <li key={step.n} className={s.step} data-tone={step.tone} style={{ rotate: `${[-1.2, 0.8, -0.6][i]}deg` }}>
                <div className={s.stepTop}>
                  <span className={s.stepNumber} aria-hidden="true">
                    {step.n}
                  </span>
                  <Stamp tone={step.ink} variant="rubber" size="sm" rotate={[-9, 7, -5][i]} className={s.stepStamp}>
                    {t(step.stamp)}
                  </Stamp>
                </div>
                <h3 className={s.stepTitle}>
                  <span className={s.stepIcon} aria-hidden="true">
                    {step.icon}
                  </span>
                  <span className="sr-only">{t('landing.stepSr', { n: step.n })}</span>
                  {t(step.title)}
                </h3>
                <p className={s.stepText}>{t(step.text)}</p>
              </li>
            ))}
          </ol>
          <div className={s.closing}>
            <ButtonLink to="/register" size="lg" variant="ink" iconRight={<IconArrowRight size={22} strokeWidth={3} />}>
              {t('landing.closing')}
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className={s.colophon}>
        <ColorBar />
        <Label size="sm" tone="muted">
          {t('landing.colophon')}
        </Label>
        <Link to="/styleguide" className={s.colophonLink}>
          Styleguide
        </Link>
        <Barcode value="matcha-press-edition" height={26} className={s.colophonCode} />
        <div className={s.colophonLocale}>
          <LocaleLabel side="up" />
        </div>
      </footer>
    </div>
  )
}
