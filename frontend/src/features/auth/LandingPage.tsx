/**
 * `/` for visitors: a poster that sells the app in one glance. Masthead, the hero (giant lettering, a
 * fanned deck with a LIKE stamp, the sign-up ticket), a ticker, three numbered steps and a colophon.
 * Signed-in users never see it (HomeGate sends them into the app).
 */
import { Link } from 'react-router-dom'
import {
  Barcode,
  ButtonLink,
  ColorBar,
  Halftone,
  Headline,
  IconArrowRight,
  IconCards,
  IconChat,
  IconHeart,
  Label,
  Marquee,
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
import { storeInfo } from '@/wb'
import { GithubButton, OrRule } from './parts'
import s from './Landing.module.css'

const STEPS = [
  {
    n: '01',
    title: 'Swipe',
    icon: <IconCards size={22} />,
    tone: 'paper',
    text: 'Every card is someone nearby. Drag right to like, left to pass, or press the buttons. A yolk star says you really mean it.',
    stamp: { word: 'Like', tone: 'strawberry' as const },
  },
  {
    n: '02',
    title: 'Match',
    icon: <IconHeart size={22} filled />,
    tone: 'matcha',
    text: 'When the like goes both ways, the press stamps it: it’s a match, and the conversation opens.',
    stamp: { word: 'Match!', tone: 'ink' as const },
  },
  {
    n: '03',
    title: 'Chat',
    icon: <IconChat size={22} />,
    tone: 'yolk',
    text: 'Say hi, trade tea opinions, plan the date. Matches and messages live under one tab.',
    stamp: { word: 'Hi!', tone: 'blue' as const },
  },
] as const

const TICKER = ['Fresh matches daily', 'Stone-ground in Paris', 'Ceremonial grade romance', 'No sugar added', 'Swipe · Match · Chat']

export default function LandingPage() {
  const demo = storeInfo.backend === 'mock'
  // In these modes BuildMarkers hangs a short tab from the top edge: the masthead leaves it room.
  const markers = demo || storeInfo.engine === 'preview'
  return (
    <div className={s.page} data-markers={markers ? '' : undefined}>
      <title>Matcha · It's a match, stone-ground</title>

      <header className={s.masthead}>
        <Link to="/" className={s.home} aria-label="Matcha home">
          <Wordmark size="sm" className={s.markSmall} />
          <Wordmark size="md" className={s.markLarge} />
        </Link>
        <p className={s.edition} aria-hidden="true">
          <Serial value="01" prefix="Nº" />
          <span>Press edition · Paris · 2026</span>
        </p>
        <nav className={s.nav} aria-label="Account">
          <ButtonLink to="/login" size="sm" variant="paper">
            Sign in
          </ButtonLink>
          <ButtonLink to="/register" size="sm" variant="ink" className={s.navJoin}>
            Join
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

          <h1 id="landing-title" className={s.title}>
            <span className={s.titleA}>It's a</span> <span className={s.titleB}>Matcha</span>
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
                Match!
              </Stamp>
            </span>
            <Sticker tone="yolk" shape="burst" size="104px" rotate={-10} className={s.sticker}>
              Free
              <br />
              to join
            </Sticker>
          </div>

          <div className={s.ticket}>
            <TicketHeader label="Admit two" meta={<Serial value={427} />} />
            <Text size="lead" className={s.lede}>
              The dating app pressed in bold ink. Swipe through people nearby, match when it's mutual, then talk it over
              a cup.
            </Text>
            <div className={s.ctas}>
              <ButtonLink to="/register" size="lg" block iconRight={<IconArrowRight size={22} strokeWidth={3} />}>
                Create account
              </ButtonLink>
              <ButtonLink to="/login" size="lg" variant="paper" block>
                I have an account
              </ButtonLink>
            </div>
            <OrRule />
            <GithubButton />
            {demo ? (
              <p className={s.demoNote}>
                <Label size="sm" inverse>
                  Demo
                </Label>
                <span>
                  Try <strong>testuser</strong> or <strong>alice</strong>, password <strong>1234</strong>. Sign-up
                  emails land in a demo inbox.
                </span>
              </p>
            ) : null}
          </div>

          <div className={s.band}>
            <Marquee items={TICKER} tone="ink" size="md" tilt={-2.5} speed={30} />
          </div>
        </section>

        <section className={s.steps} aria-labelledby="landing-how">
          <div className={s.stepsHead}>
            <Label tone="muted">How it works · three steps</Label>
            <Headline as="h2" id="landing-how" size="d2" width="condensed" print="riso" offset="strawberry">
              Swipe. Match. Chat.
            </Headline>
          </div>
          <ol className={s.stepList}>
            {STEPS.map((step, i) => (
              <li key={step.n} className={s.step} data-tone={step.tone} style={{ rotate: `${[-1.2, 0.8, -0.6][i]}deg` }}>
                <div className={s.stepTop}>
                  <span className={s.stepNumber} aria-hidden="true">
                    {step.n}
                  </span>
                  <Stamp tone={step.stamp.tone} variant="rubber" size="sm" rotate={[-9, 7, -5][i]} className={s.stepStamp}>
                    {step.stamp.word}
                  </Stamp>
                </div>
                <h3 className={s.stepTitle}>
                  <span className={s.stepIcon} aria-hidden="true">
                    {step.icon}
                  </span>
                  <span className="sr-only">Step {step.n}: </span>
                  {step.title}
                </h3>
                <p className={s.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
          <div className={s.closing}>
            <ButtonLink to="/register" size="lg" variant="ink" iconRight={<IconArrowRight size={22} strokeWidth={3} />}>
              Get your ticket
            </ButtonLink>
          </div>
        </section>
      </main>

      <footer className={s.colophon}>
        <ColorBar />
        <Label size="sm" tone="muted">
          Matcha · Press edition Nº 01 · state by WaveBinder
        </Label>
        <Link to="/styleguide" className={s.colophonLink}>
          Styleguide
        </Link>
        <Barcode value="matcha-press-edition" height={26} className={s.colophonCode} />
      </footer>
    </div>
  )
}
