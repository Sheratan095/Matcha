import { useState } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter, useInRouterContext } from 'react-router-dom'
import {
  ActionButton,
  ActionList,
  Avatar,
  Badge,
  Barcode,
  Button,
  ButtonLink,
  Card,
  ChatBubble,
  ChatComposer,
  ChatThread,
  Checkbox,
  Chip,
  ColorBar,
  CountBadge,
  CropMarks,
  DayDivider,
  DualSlider,
  EmptyState,
  FormError,
  Halftone,
  Headline,
  ICONS,
  IconArrowRight,
  IconBlock,
  IconCards,
  IconChat,
  IconCup,
  IconFlag,
  IconHeart,
  IconMail,
  IconSearch,
  IconSettings,
  IconSliders,
  IconSparkle,
  IconTrash,
  IconUser,
  IconButton,
  Label,
  ListRow,
  Loader,
  LogoMark,
  Marquee,
  Menu,
  Modal,
  Notice,
  PageHeader,
  PasswordField,
  Pattern,
  Perforation,
  PhotoFrame,
  PhotoTile,
  PosterWord,
  ProfileCard,
  RegMark,
  Row,
  Segmented,
  Select,
  Serial,
  Sheet,
  Skeleton,
  Slider,
  Spinner,
  Stack,
  Stamp,
  Stat,
  StatGroup,
  Steps,
  Sticker,
  Switch,
  TabPanel,
  Tabs,
  TagInput,
  Text,
  TextArea,
  TextField,
  TicketHeader,
  Toaster,
  TypingIndicator,
  Wordmark,
  toast,
} from '../index'
import type { Gender, SexualPreference } from '@/api/types'
import { AuthDemo, ChatDemo, MatchDemo, ShellDemo } from './Demos'
import type { DemoName } from './Demos'
import { Patterns } from './Patterns'
import s from './Styleguide.module.css'

// ------------------------------------------------------------------ scaffolding

const SECTIONS = [
  ['ink', 'Ink & paper'],
  ['type', 'Type'],
  ['shape', 'Outline & press'],
  ['icons', 'Icons'],
  ['lettering', 'Lettering'],
  ['furniture', 'Print furniture'],
  ['buttons', 'Buttons'],
  ['forms', 'Forms'],
  ['display', 'Display'],
  ['overlays', 'Overlays'],
  ['chat', 'Chat'],
  ['layout', 'Layout'],
  ['patterns', 'Patterns'],
] as const

function Section({ id, n, title, intro, children }: { id: string; n: number; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={s.section} aria-labelledby={`${id}-h`}>
      <header className={s.sectionHead}>
        <span className={s.sectionNo}>{String(n).padStart(2, '0')}</span>
        <Headline id={`${id}-h`} as="h2" size="d1" width="condensed" print="riso">
          {title}
        </Headline>
        {intro ? <Text className={s.sectionIntro}>{intro}</Text> : null}
      </header>
      {children}
    </section>
  )
}

function Spec({ label, children, wide, note }: { label: string; children: ReactNode; wide?: boolean; note?: ReactNode }) {
  return (
    <div className={wide ? s.specWide : s.spec}>
      <TicketHeader label={label} meta={note} className={s.specLabel} />
      <div className={s.specBody}>{children}</div>
    </div>
  )
}

const SWATCHES = [
  { token: '--c-paper', name: 'Paper', hex: '#F1E7CF', note: 'the sheet' },
  { token: '--c-paper-hi', name: 'Card stock', hex: '#FBF6E6', note: 'panels, inputs' },
  { token: '--c-paper-lo', name: 'Kraft', hex: '#E3D5B2', note: 'wells, mat' },
  { token: '--c-ink', name: 'Ink', hex: '#15130F', note: 'text, lines, shadows', dark: true },
  { token: '--c-ink-2', name: 'Ink 2', hex: '#3B362D', note: 'secondary text', dark: true },
  { token: '--c-ink-3', name: 'Ink 3', hex: '#625B4B', note: 'muted · 5.5:1', dark: true },
  { token: '--c-matcha', name: 'Matcha', hex: '#72C13C', note: 'brand · ink on it 8.3:1' },
  { token: '--c-matcha-deep', name: 'Tin green', hex: '#1D4B24', note: 'green text · 8.2:1', dark: true },
  { token: '--c-matcha-tint', name: 'Matcha tint', hex: '#D3E9AE', note: 'washes' },
  { token: '--c-strawberry', name: 'Strawberry', hex: '#FF4F64', note: 'likes, danger · 5.8:1' },
  { token: '--c-strawberry-deep', name: 'Strawberry deep', hex: '#B3122D', note: 'error text · 5.6:1', dark: true },
  { token: '--c-strawberry-tint', name: 'Strawberry tint', hex: '#FFD3D0', note: 'error wash' },
  { token: '--c-yolk', name: 'Yolk', hex: '#FFC531', note: 'super-likes · 11.7:1' },
  { token: '--c-yolk-deep', name: 'Yolk deep', hex: '#7A4F00', note: 'yolk as text', dark: true },
  { token: '--c-yolk-tint', name: 'Yolk tint', hex: '#FFE9A8', note: 'highlight wash' },
  { token: '--c-blue', name: 'Cobalt', hex: '#2B48F0', note: 'info, focus · paper on it 5.2:1', dark: true },
  { token: '--c-blue-tint', name: 'Cobalt tint', hex: '#CFD8FF', note: 'info wash' },
] as const

const TYPE_SCALE = [
  ['mega', '--fs-mega', 'Matcha'],
  ['d1', '--fs-d1', 'Discover'],
  ['d2', '--fs-d2', 'Your matches'],
  ['d3', '--fs-d3', 'Pick your interests'],
  ['d4', '--fs-d4', 'Profile viewers this week'],
  ['d5', '--fs-d5', 'Settings and privacy'],
] as const

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Woman' },
  { value: 'male', label: 'Man' },
  { value: 'other', label: 'Other' },
]
const PREFS: { value: SexualPreference; label: string }[] = [
  { value: 'female', label: 'Women' },
  { value: 'male', label: 'Men' },
  { value: 'both', label: 'Both' },
  { value: 'other', label: 'Other' },
]
const CATALOGUE = ['matcha', 'climbing', 'risograph', 'jazz', 'ramen', 'cats', 'hiking', 'ceramics', 'film', 'vinyl', 'running', 'poetry', 'tea']

// ------------------------------------------------------------------ the page

function Guide() {
  const [gender, setGender] = useState<Gender | null>('female')
  const [pref, setPref] = useState<SexualPreference | null>('both')
  const [sort, setSort] = useState<'best' | 'distance' | 'fame' | 'age'>('best')
  const [distance, setDistance] = useState(25)
  const [ages, setAges] = useState<[number, number]>([24, 36])
  const [tags, setTags] = useState<string[]>(['matcha', 'risograph', 'jazz'])
  const [bio, setBio] = useState('Prints posters on a risograph, climbs on Sundays, makes a serious bowl of usucha.')
  const [tab, setTab] = useState<'likes' | 'viewers' | 'matches'>('likes')
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [filters, setFilters] = useState(false)
  const [stampKey, setStampKey] = useState(0)
  const [draft, setDraft] = useState('')
  const [notify, setNotify] = useState(true)

  return (
    <div className={s.page}>
      <Toaster />
      <a href="#ink" className={s.skip}>
        Skip to content
      </a>

      {/* ------------------------------------------------------------ masthead */}
      <header className={s.masthead}>
        <div className={s.mastTop}>
          <Wordmark size="lg" tagline="Press edition · design system" />
          <div className={s.mastMeta}>
            <Serial value="01" prefix="Vol." />
            <Barcode value="matcha-press-edition" height={34} caption />
          </div>
        </div>
        <div className={s.mastWord} aria-hidden="true">
          <PosterWord size="min(31vw, 25rem)" width="condensed" tone="ink">
            Press
          </PosterWord>
          <PosterWord size="min(31vw, 25rem)" width="condensed" tone="ink" outline className={s.mastWord2}>
            Edition
          </PosterWord>
        </div>
        <Sticker tone="yolk" size="clamp(96px, 22vw, 150px)" rotate={12} className={s.mastSticker}>
          Grade
          <br />
          A+
        </Sticker>
        <p className={s.mastLead}>
          Matcha as printed matter: tea tins, letterpress posters, punch cards and stickers. Five ink drums on warm stock, 3px
          keylines, hard shadows, and type used as a design element.
        </p>
        <Marquee items={['Tactile', 'Bold', 'Typographic', 'Pressed, not blurred', 'Ink on paper']} tone="ink" tilt={-1.5} className={s.mastBand} />
      </header>

      <div className={s.layout}>
        <nav className={s.toc} aria-label="Styleguide sections">
          <Label tone="muted">Contents</Label>
          <ol>
            {SECTIONS.map(([id, name], i) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {name}
                </a>
              </li>
            ))}
          </ol>
          <div className={s.tocDemos}>
            <Label tone="muted">Full-page demos</Label>
            <a href="?demo=shell">AppShell</a>
            <a href="?demo=auth">AuthLayout</a>
            <a href="?demo=chat">Screen · chat</a>
            <a href="?demo=match">Match moment</a>
          </div>
        </nav>

        <main className={s.content}>
          {/* ------------------------------------------------------------ 1 ink */}
          <Section
            id="ink"
            n={1}
            title="Ink & paper"
            intro="Five drums (black, matcha, strawberry, yolk, cobalt) on three paper stocks. Flat fields only: no gradients, no blur. Text on matcha, strawberry and yolk is always ink; text on cobalt and tin green is card stock."
          >
            <div className={s.swatches}>
              {SWATCHES.map((c) => (
                <div key={c.token} className={s.swatch}>
                  <span className={s.chipColor} style={{ background: `var(${c.token})` }} />
                  <span className={s.swatchName}>{c.name}</span>
                  <code>{c.token}</code>
                  <span className={s.swatchMeta}>
                    {c.hex} · {c.note}
                  </span>
                </div>
              ))}
            </div>
            <div className={s.grid3}>
              <Spec label="Paper grain" note="body::after">
                <div className={s.stock} style={{ background: 'var(--c-paper)' }}>
                  <Label>Paper</Label>
                </div>
              </Spec>
              <Spec label="Tones" note="data-tone">
                <Row gap={2} wrap>
                  {(['ink', 'paper', 'kraft', 'matcha', 'deep', 'strawberry', 'yolk', 'blue'] as const).map((t) => (
                    <Badge key={t} tone={t}>
                      {t}
                    </Badge>
                  ))}
                </Row>
              </Spec>
              <Spec label="Colour bar">
                <ColorBar />
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 2 type */}
          <Section
            id="type"
            n={2}
            title="Type"
            intro="Archivo variable at weight 900 for everything that shouts, uppercase, leading 0.8–0.9. The width axis runs from condensed (62) to expanded (125). Space Mono for tickets, serials and metadata. Running text is Archivo at normal width."
          >
            <Spec label="Display scale" wide note="Headline size=…">
              <Stack gap={3}>
                {TYPE_SCALE.map(([size, token, word]) => (
                  <div key={size} className={s.typeRow}>
                    <Label tone="muted" className={s.typeMeta}>
                      {size} · {token}
                    </Label>
                    <Headline as="p" size={size} width="condensed">
                      {word}
                    </Headline>
                  </div>
                ))}
              </Stack>
            </Spec>
            <Spec label="Width axis" wide note="font-stretch 62% → 125%">
              <div className={s.widths}>
                {(['condensed', 'narrow', 'normal', 'wide', 'expanded'] as const).map((w) => (
                  <div key={w}>
                    <Label tone="muted">{w}</Label>
                    <Headline as="p" size="d2" width={w}>
                      Tea
                    </Headline>
                  </div>
                ))}
              </div>
            </Spec>
            <Spec label="Print treatments" wide note="Headline print=…">
              <div className={s.prints}>
                <div>
                  <Label tone="muted">solid</Label>
                  <Headline as="p" size="d1" width="condensed">
                    Steep
                  </Headline>
                </div>
                <div>
                  <Label tone="muted">riso · offset strawberry</Label>
                  <Headline as="p" size="d1" width="condensed" print="riso" offset="strawberry">
                    Steep
                  </Headline>
                </div>
                <div>
                  <Label tone="muted">overprint · matcha × strawberry</Label>
                  <Headline as="p" size="d1" width="condensed" print="overprint" ink="matcha" offset="strawberry">
                    Steep
                  </Headline>
                </div>
                <div>
                  <Label tone="muted">outline · yolk plate</Label>
                  <Headline as="p" size="d1" width="condensed" print="outline" offset="yolk">
                    Steep
                  </Headline>
                </div>
                <div>
                  <Label tone="muted">worn</Label>
                  <Headline as="p" size="d1" width="condensed" worn>
                    Steep
                  </Headline>
                </div>
                <div>
                  <Label tone="muted">expanded italic</Label>
                  <Headline as="p" size="d3" width="expanded" italic print="riso" offset="blue">
                    Steep
                  </Headline>
                </div>
              </div>
            </Spec>
            <div className={s.grid2}>
              <Spec label="Mono labels" note="Label">
                <Stack gap={3} align="start">
                  <Label>Ticket label · 12px</Label>
                  <Label size="sm" tone="muted">
                    Micro · metadata · 11px
                  </Label>
                  <Label boxed>Boxed · Admit one</Label>
                  <Label inverse>Inverse · Nº 004211</Label>
                  <Label tone="strawberry">Error tone</Label>
                </Stack>
              </Spec>
              <Spec label="Running text" note="Text">
                <Stack gap={3}>
                  <Text size="lead">Lead · Find someone who takes their tea as seriously as you do.</Text>
                  <Text>
                    Body · Swipe right to like, left to pass. A like on someone who already liked you is a match, and a match opens a
                    chat. <a href="#type">Links</a> are bold with a matcha underline.
                  </Text>
                  <Text size="sm" muted>
                    Small muted · Last seen 2 hours ago in Paris 11e.
                  </Text>
                </Stack>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 3 shape */}
          <Section
            id="shape"
            n={3}
            title="Outline & press"
            intro="Every object has a 3px ink keyline (2px on small parts) and a hard, unblurred offset shadow. Controls float 4px above the page; hover lifts one more pixel, pressing drives them into their shadow."
          >
            <div className={s.grid3}>
              <Spec label="Shadows" note="--sh-1 … --sh-4">
                <Row gap={5} wrap>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className={s.shadowBox} style={{ boxShadow: `var(--sh-${n})` }}>
                      <Label size="sm">sh-{n}</Label>
                    </div>
                  ))}
                </Row>
              </Spec>
              <Spec label="Radii" note="--r-xs … --r-xl">
                <Row gap={3} wrap>
                  {['xs', 'sm', 'md', 'lg', 'xl', 'pill'].map((r) => (
                    <div key={r} className={s.radiusBox} style={{ borderRadius: `var(--r-${r})` }}>
                      <Label size="sm">{r}</Label>
                    </div>
                  ))}
                </Row>
              </Spec>
              <Spec label="Press it" note="hover · active">
                <Stack gap={4} align="start">
                  <Button>Press me</Button>
                  <Text size="xs" muted>
                    Rest: 4px up. Hover: 5px. Active: 0px, the shadow disappears under the button.
                  </Text>
                </Stack>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 4 icons */}
          <Section
            id="icons"
            n={4}
            title="Icons"
            intro="Drawn for the kit on a 24 grid: 2.5 stroke, round joins, currentColor. Most closed shapes have a filled variant for active states."
          >
            <div className={s.icons}>
              {Object.entries(ICONS).map(([name, Icon]) => (
                <div key={name} className={s.icon}>
                  <Row gap={2}>
                    <Icon size={28} />
                    <Icon size={28} filled />
                  </Row>
                  <Label size="sm">{name}</Label>
                </div>
              ))}
            </div>
          </Section>

          {/* ------------------------------------------------------------ 5 lettering */}
          <Section id="lettering" n={5} title="Lettering" intro="The brand lockup, stamps, stickers and ticker bands. Lettering is a design element: let it be big, rotated and cropped.">
            <Spec label="Wordmark · xl" wide>
              <Wordmark size="xl" />
            </Spec>
            <div className={s.grid2}>
              <Spec label="Wordmark" note="Wordmark size=…">
                <Stack gap={5} align="start">
                  <Wordmark size="lg" tagline />
                  <Row gap={6} wrap>
                    <Wordmark size="md" />
                    <Wordmark size="sm" />
                    <LogoMark size={44} />
                    <LogoMark size={28} flat />
                  </Row>
                  <div className={s.inkPlate} data-surface="ink">
                    <Wordmark size="md" tone="paper" tagline="On ink" />
                  </div>
                </Stack>
              </Spec>
              <Spec
                label="Stamps"
                note={
                  <button type="button" className={s.replay} onClick={() => setStampKey((k) => k + 1)}>
                    ↻ replay thunk
                  </button>
                }
              >
                <div className={s.stamps} key={stampKey}>
                  <Stamp tone="strawberry" size="lg" rotate={-12} thunk>
                    Like
                  </Stamp>
                  <Stamp tone="ink" size="lg" rotate={9} thunk>
                    Nope
                  </Stamp>
                  <Stamp tone="yolk" size="lg" rotate={-5} thunk>
                    Super
                  </Stamp>
                  <Stamp tone="matcha" size="lg" rotate={6} thunk sub="12 · 03 · 2026">
                    Match!
                  </Stamp>
                  <Stamp variant="rubber" tone="strawberry" size="md" rotate={-8} thunk>
                    Sold out
                  </Stamp>
                  <Stamp variant="rubber" tone="deep" size="md" rotate={4} thunk>
                    Approved
                  </Stamp>
                  <Stamp variant="rubber" tone="blue" size="sm" rotate={-3} thunk>
                    Verified
                  </Stamp>
                </div>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Stickers" note="Sticker shape=…">
                <Row gap={5} wrap align="center">
                  <Sticker tone="yolk" size="110px">
                    Fresh
                    <br />
                    daily
                  </Sticker>
                  <Sticker tone="strawberry" size="96px" rotate={-10}>
                    Likes
                    <br />
                    you
                  </Sticker>
                  <Sticker tone="matcha" shape="circle" size="96px" rotate={-6}>
                    100%
                    <br />
                    leaf
                  </Sticker>
                  <Sticker tone="blue" shape="pill" rotate={-4}>
                    New here
                  </Sticker>
                  <Sticker tone="paper" shape="tag" rotate={5}>
                    Nº 42
                  </Sticker>
                </Row>
              </Spec>
              <Spec label="Poster word" note="PosterWord · cropped by its parent">
                <div className={s.cropDemo}>
                  <PosterWord size="9rem" tone="matcha" className={s.cropWordA}>
                    Swipe
                  </PosterWord>
                  <PosterWord size="9rem" tone="ink" outline className={s.cropWordB}>
                    Right
                  </PosterWord>
                </div>
              </Spec>
            </div>
            <Spec label="Marquee" wide note="Marquee tone · tilt · speed">
              <div className={s.marquees}>
                <Marquee items={['Fresh matches daily', 'Ceremonial grade', 'Stone-ground']} tone="ink" />
                <Marquee items={["It's a match", 'Pour two cups']} tone="matcha" tilt={-2} reverse size="lg" />
                <Marquee items={['12 new likes', 'Somebody viewed you']} tone="strawberry" size="sm" speed={14} />
              </div>
            </Spec>
          </Section>

          {/* ------------------------------------------------------------ 6 furniture */}
          <Section id="furniture" n={6} title="Print furniture" intro="Halftones, flat patterns, perforations, serials, barcodes, crop and registration marks. Decorative: always aria-hidden, never carrying meaning on their own.">
            <div className={s.grid3}>
              {(['dots', 'halftone', 'stripes', 'grid', 'checks'] as const).map((k, i) => (
                <Spec key={k} label={`Pattern · ${k}`}>
                  <div className={s.patternBox} data-tone={(['matcha', 'yolk', 'paper', 'kraft', 'strawberry'] as const)[i]}>
                    <Pattern kind={k} tone="ink" opacity={k === 'checks' ? 0.12 : 0.35} />
                  </div>
                </Spec>
              ))}
              <Spec label="Halftone ramp" note="Halftone from=…">
                <div className={s.patternBox} data-tone="strawberry">
                  <Halftone from="bottom-left" tone="ink" columns={22} />
                </div>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Perforation" note="holes · dashes · notches">
                <Card pad="lg" shadow={2}>
                  <Label>Admit one</Label>
                  <Perforation variant="holes" />
                  <Text size="sm">Tear here.</Text>
                  <Perforation notches />
                  <Row justify="between">
                    <Serial value={4211} />
                    <Barcode value="ticket-4211" height={28} />
                  </Row>
                </Card>
              </Spec>
              <Spec label="Marks & numbers">
                <Stack gap={5}>
                  <Row gap={5} wrap>
                    <Serial value={42} />
                    <Serial value="A-0042" prefix="Lot" />
                    <Serial value={7} digits={3} tone="muted" />
                  </Row>
                  <Row gap={5} wrap align="end">
                    <Barcode value="matcha" caption />
                    <Barcode value="alice-27" height={48} />
                    <RegMark size={32} />
                    <RegMark size={20} tone="strawberry" />
                  </Row>
                  <div className={s.cropped}>
                    <CropMarks />
                    <Label>CropMarks around any box</Label>
                  </div>
                  <TicketHeader label="TicketHeader" meta="Nº 000042" />
                </Stack>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 7 buttons */}
          <Section id="buttons" n={7} title="Buttons">
            <Spec label="Variants" wide note="Button variant=…">
              <Row gap={4} wrap>
                <Button>Matcha</Button>
                <Button variant="ink">Ink</Button>
                <Button variant="strawberry">Strawberry</Button>
                <Button variant="yolk">Yolk</Button>
                <Button variant="blue">Cobalt</Button>
                <Button variant="paper">Paper</Button>
                <Button variant="ghost">Ghost</Button>
              </Row>
            </Spec>
            <div className={s.grid2}>
              <Spec label="Sizes & icons">
                <Stack gap={4} align="start">
                  <Row gap={4} wrap>
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                  </Row>
                  <Row gap={4} wrap>
                    <Button icon={<IconHeart size={20} filled />} variant="strawberry">
                      Like back
                    </Button>
                    <Button variant="paper" iconRight={<IconArrowRight size={20} strokeWidth={3} />}>
                      Next
                    </Button>
                  </Row>
                  <ButtonLink to="/discover" variant="ink" size="sm" icon={<IconCards size={18} />}>
                    ButtonLink
                  </ButtonLink>
                </Stack>
              </Spec>
              <Spec label="States">
                <Stack gap={4}>
                  <Row gap={4} wrap>
                    <Button loading>Saving</Button>
                    <Button disabled>Disabled</Button>
                    <Button variant="paper" disabled>
                      Disabled
                    </Button>
                  </Row>
                  <Button block size="lg">
                    Create account
                  </Button>
                </Stack>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Icon buttons" note="IconButton label=…">
                <Row gap={4} wrap>
                  <IconButton label="Search">
                    <IconSearch size={22} />
                  </IconButton>
                  <IconButton label="Filters" variant="matcha">
                    <IconSliders size={22} />
                  </IconButton>
                  <IconButton label="Messages" variant="ink" badge={4}>
                    <IconChat size={22} />
                  </IconButton>
                  <IconButton label="Settings" round size="lg">
                    <IconSettings size={24} />
                  </IconButton>
                  <IconButton label="Mail" size="sm">
                    <IconMail size={18} />
                  </IconButton>
                  <IconButton label="Delete" variant="ghost">
                    <IconTrash size={22} />
                  </IconButton>
                </Row>
              </Spec>
              <Spec label="Deck actions" note="ActionButton kind=…">
                <Row gap={4} align="center" justify="center" wrap>
                  <ActionButton kind="rewind" size="md" />
                  <ActionButton kind="pass" size="xl" />
                  <ActionButton kind="superlike" size="md" />
                  <ActionButton kind="like" size="xl" />
                  <ActionButton kind="like" size="md" disabled />
                </Row>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 8 forms */}
          <Section id="forms" n={8} title="Forms" intro="Fields are debossed into the page at rest and lift onto a hard shadow when focused. Labels are mono tickets above the box.">
            <div className={s.grid2}>
              <Spec label="Text fields">
                <Stack gap={5}>
                  <TextField label="Email" type="email" placeholder="you@example.com" icon={<IconMail size={20} />} hint="We send a link to verify it." />
                  <TextField label="Username" defaultValue="al" error="At least 3 characters." />
                  <PasswordField label="Password" defaultValue="matcha-latte" aside="Forgot?" />
                  <TextField label="Last name" disabled defaultValue="Locked" />
                </Stack>
              </Spec>
              <Spec label="Textarea & select">
                <Stack gap={5}>
                  <TextArea label="Biography" maxLength={500} value={bio} onChange={(e) => setBio(e.currentTarget.value)} hint="What should a match know first?" />
                  <Select
                    label="Language"
                    defaultValue="en"
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'fr', label: 'Français' },
                      { value: 'es', label: 'Español' },
                    ]}
                  />
                </Stack>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Segmented choice" note="Segmented">
                <Stack gap={5}>
                  <Segmented label="I am" options={GENDERS} value={gender} onChange={setGender} block />
                  <Segmented label="Show me" options={PREFS} value={pref} onChange={setPref} tone="yolk" />
                  <Segmented
                    label="Sort by"
                    options={[
                      { value: 'best', label: 'Best' },
                      { value: 'distance', label: 'Near' },
                      { value: 'fame', label: 'Fame' },
                      { value: 'age', label: 'Age' },
                    ]}
                    value={sort}
                    onChange={setSort}
                    error={sort === 'age' ? 'Example error state.' : undefined}
                  />
                </Stack>
              </Spec>
              <Spec label="Checkbox & switch">
                <Stack gap={4}>
                  <Checkbox defaultChecked description="Only people who share an interest with you.">
                    Interests first
                  </Checkbox>
                  <Checkbox error="You need to accept to continue.">
                    I accept the <a href="#forms">terms</a>
                  </Checkbox>
                  <Checkbox disabled>Disabled</Checkbox>
                  <Switch checked={notify} onChange={(e) => setNotify(e.currentTarget.checked)} description="New matches and messages.">
                    Notifications
                  </Switch>
                  <Switch disabled>Disabled switch</Switch>
                </Stack>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Sliders" note="Slider · DualSlider">
                <Stack gap={6}>
                  <Slider label="Distance" value={distance} onChange={setDistance} min={1} max={200} unit="km" />
                  <DualSlider label="Age range" value={ages} onChange={setAges} min={18} max={80} minGap={1} thumbLabels={['Minimum age', 'Maximum age']} />
                </Stack>
              </Spec>
              <Spec label="Tag input" note="TagInput · interests">
                <TagInput label="Interests" value={tags} onChange={setTags} suggestions={CATALOGUE} max={10} hint="Type and press Enter, or tap a suggestion." />
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Photo tiles" note="PhotoTile">
                <div className={s.photoGrid}>
                  <PhotoTile index={1} src={null} label="Add photo" onPick={(f) => toast.info('Picked', f.name)} />
                  <PhotoTile index={2} busy />
                  <PhotoTile index={3} disabled label="Max 5" />
                </div>
              </Spec>
              <Spec label="Errors & notices" note="FormError · Notice">
                <Stack gap={4}>
                  <FormError error={{ message: 'Validation failed', messages: ['Password is too common.', 'Email is already registered.'] }} />
                  <FormError error="Please verify your email before signing in." action={<Button size="sm" variant="ink">Resend email</Button>} />
                  <Notice tone="success" title="Profile saved" />
                  <Notice tone="info" title="Preview store" onDismiss={() => undefined}>
                    Data lives in this browser only.
                  </Notice>
                  <Notice tone="warning" title="Two photos to go">
                    Profiles with three pictures get twice the likes.
                  </Notice>
                </Stack>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 9 display */}
          <Section id="display" n={9} title="Display">
            <div className={s.grid3}>
              <Card label="Tin · paper" meta="Nº 01" shadow={3}>
                <Text size="sm">The default panel: card stock, keyline, hard shadow.</Text>
              </Card>
              <Card tone="matcha" label="Tin · matcha" meta="rim" rim>
                <Text size="sm">With an inner rim, like a lid.</Text>
              </Card>
              <Card tone="ink" label="Tin · ink" meta="Nº 03" tilt={-1.5}>
                <Text size="sm" style={{ color: 'var(--c-paper-hi)' }}>
                  Dark field; focus rings flip to yolk.
                </Text>
              </Card>
              <Card tone="yolk" shadow={4} tilt={1.5}>
                <Headline as="p" size="d3" width="condensed">
                  12 people liked you
                </Headline>
              </Card>
              <Card tone="kraft" shadow={0}>
                <Text size="sm">Kraft, flat (shadow 0) for wells.</Text>
              </Card>
              <Card dashed>
                <Text size="sm">Dashed: a drop zone / placeholder.</Text>
              </Card>
            </div>
            <div className={s.grid2}>
              <Spec label="Chips, badges, counts">
                <Stack gap={4}>
                  <Row gap={2} wrap>
                    <Chip>#ramen</Chip>
                    <Chip tone="matcha">#matcha</Chip>
                    <Chip tone="yolk" icon={<IconSparkle size={12} filled />}>
                      Common
                    </Chip>
                    <Chip size="sm">#small</Chip>
                    <Chip onRemove={() => undefined} removeLabel="Remove jazz" tone="matcha">
                      #jazz
                    </Chip>
                  </Row>
                  <Row gap={2} wrap>
                    <Chip onClick={() => undefined} selected>
                      Toggle on
                    </Chip>
                    <Chip onClick={() => undefined}>Toggle off</Chip>
                  </Row>
                  <Row gap={3} wrap>
                    <Badge>Online</Badge>
                    <Badge tone="matcha">New</Badge>
                    <Badge tone="yolk" rotate={-5}>
                      Likes you
                    </Badge>
                    <Badge tone="strawberry">Blocked</Badge>
                    <CountBadge count={3} />
                    <CountBadge count={128} tone="matcha" />
                    <CountBadge count={0} showZero tone="kraft" />
                  </Row>
                </Stack>
              </Spec>
              <Spec label="Avatars" note="Avatar size · online · initials">
                <Stack gap={4}>
                  <Row gap={3} wrap align="end">
                    <Avatar name="Alice Martin" size="2xl" online shadow />
                    <Avatar name="Noor" size="xl" online={false} />
                    <Avatar name="Bastien Roy" size="lg" online />
                    <Avatar name="Yuki" size="md" />
                    <Avatar name="Inès" size="sm" online />
                    <Avatar name="Marco" size="xs" />
                  </Row>
                  <Row gap={3}>
                    <Avatar name="Tile Shape" size="lg" shape="tile" shadow />
                    <Avatar name="Broken Image" src="/nope.png" size="lg" />
                  </Row>
                </Stack>
              </Spec>
            </div>
            <Spec label="Photo frames" wide note="PhotoFrame treatment · fallback is PosterFigure">
              <div className={s.photos}>
                <figure>
                  <PhotoFrame src={null} alt="Alice" seed="u-alice" shadow={2} />
                  <Label size="sm">fallback · seed alice</Label>
                </figure>
                <figure>
                  <PhotoFrame src={null} alt="Noor" seed="u-noor" shadow={2} tilt={-2} />
                  <Label size="sm">seed noor · tilt</Label>
                </figure>
                <figure>
                  <PhotoFrame src={null} alt="Bastien" seed="u-bastien" treatment="duotone" tone="strawberry" shadow={2} />
                  <Label size="sm">duotone · strawberry</Label>
                </figure>
                <figure>
                  <PhotoFrame src={null} alt="Yuki" seed="u-yuki" treatment="halftone" tone="blue" shadow={2} />
                  <Label size="sm">halftone · cobalt</Label>
                </figure>
              </div>
            </Spec>
            <div className={s.grid2}>
              <Spec label="Stats" note="Stat · StatGroup">
                <Stack gap={5}>
                  <StatGroup>
                    <Stat value={74} label="Fame" icon={<IconSparkle size={12} filled />} />
                    <Stat value={3} unit="km" label="Away" tone="yolk" />
                    <Stat value={27} label="Age" tone="strawberry" />
                  </StatGroup>
                  <Row gap={8}>
                    <Stat size="lg" value={128} label="Likes this week" tone="strawberry" />
                    <Stat size="lg" value="92" unit="%" label="Reply rate" />
                  </Row>
                </Stack>
              </Spec>
              <Spec label="Steps & tabs" note="Steps · Tabs">
                <Stack gap={6}>
                  <Steps current={3} total={5} labels={['Gender', 'Preference', 'Biography', 'Interests', 'Photos']} />
                  <div>
                    <Tabs
                      label="Activity"
                      idBase="sg-tabs"
                      value={tab}
                      onChange={setTab}
                      items={[
                        { value: 'likes', label: 'Likes', count: 12 },
                        { value: 'viewers', label: 'Viewers', count: 4 },
                        { value: 'matches', label: 'Matches' },
                      ]}
                    />
                    <TabPanel idBase="sg-tabs" value={tab} active>
                      <Text size="sm" muted>
                        Panel for “{tab}”. Use ← → to switch tabs.
                      </Text>
                    </TabPanel>
                  </div>
                </Stack>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="List rows" note="ListRow">
                <div className={s.rowsBox}>
                  <ListRow
                    onClick={() => undefined}
                    leading={<Avatar name="Alice" size="md" online decorative />}
                    title="Alice"
                    subtitle="Is the matcha place on Oberkampf still open?"
                    meta="14:02"
                    unread
                    trailing={<CountBadge count={2} label="unread" />}
                  />
                  <ListRow onClick={() => undefined} leading={<Avatar name="Noor" size="md" decorative />} title="Noor" subtitle="You: see you Saturday!" meta="2d" />
                  <ListRow leading={<IconSettings size={24} />} title="Static row" subtitle="No link, no chevron." />
                </div>
              </Spec>
              <Spec label="Loading" note="Spinner · Loader · Skeleton">
                <Stack gap={5}>
                  <Row gap={5}>
                    <Spinner />
                    <Spinner size={32} />
                    <span style={{ color: 'var(--c-strawberry-deep)' }}>
                      <Spinner size={24} />
                    </span>
                  </Row>
                  <Loader />
                  <Row gap={3}>
                    <Skeleton shape="circle" width={48} />
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Skeleton shape="text" width="60%" />
                      <Skeleton shape="text" width="90%" />
                    </Stack>
                  </Row>
                  <Skeleton height={120} />
                </Stack>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Empty state" note="EmptyState">
                <EmptyState
                  stamp="Sold out"
                  title="You've seen everyone nearby"
                  action={
                    <Button variant="ink" icon={<IconSliders size={20} />}>
                      Widen your filters
                    </Button>
                  }
                >
                  Come back tomorrow for a fresh batch, or stretch the distance a little.
                </EmptyState>
              </Spec>
              <Spec label="Profile card" note="ProfileCard · the deck face">
                <div className={s.cardDemo}>
                  <ProfileCard
                    name="Noor"
                    age={29}
                    seed="u-noor"
                    city="Montreuil"
                    distanceKm={6}
                    tags={['ceramics', 'matcha', 'running', 'jazz', 'film', 'ramen']}
                    commonTags={['matcha']}
                    stamp="nope"
                    stampStrength={0.7}
                    serial={4212}
                    photoCount={2}
                    onInfo={() => undefined}
                  />
                </div>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 10 overlays */}
          <Section id="overlays" n={10} title="Overlays" intro="Modal is a bottom sheet on phones and a centred dialog from 640px. It traps focus, closes on Escape, locks scroll and returns focus. Toasts are torn-off tickets with a burning fuse.">
            <div className={s.grid2}>
              <Spec label="Modal · Sheet">
                <Row gap={4} wrap>
                  <Button onClick={() => setModal(true)}>Open modal</Button>
                  <Button variant="paper" onClick={() => setFilters(true)} icon={<IconSliders size={20} />}>
                    Filters sheet
                  </Button>
                  <Button variant="ink" onClick={() => setSheet(true)}>
                    Action sheet
                  </Button>
                </Row>
              </Spec>
              <Spec label="Toasts" note="toast.show(…)">
                <Row gap={3} wrap>
                  <Button size="sm" variant="paper" onClick={() => toast.success('Profile saved', 'Looking sharp.')}>
                    Success
                  </Button>
                  <Button size="sm" variant="paper" onClick={() => toast.error('Could not send', 'Check your connection and try again.')}>
                    Error
                  </Button>
                  <Button size="sm" variant="paper" onClick={() => toast.info('Preview store', 'Data stays in this browser.')}>
                    Info
                  </Button>
                  <Button
                    size="sm"
                    variant="paper"
                    onClick={() =>
                      toast.show({
                        tone: 'yolk',
                        title: 'Alice liked you',
                        message: 'Swipe right on her to match.',
                        icon: <Avatar name="Alice" size="sm" decorative />,
                        action: { label: 'See her', onClick: () => undefined },
                      })
                    }
                  >
                    With action
                  </Button>
                </Row>
              </Spec>
            </div>
            <div className={s.grid2}>
              <Spec label="Dropdown menu" note="Menu · arrows, Esc">
                <Row gap={4}>
                  <Menu
                    align="start"
                    items={[
                      { label: 'View profile', icon: <IconUser size={20} />, onSelect: () => toast.info('View profile') },
                      { label: 'Report', icon: <IconFlag size={20} />, onSelect: () => toast.info('Report') },
                      { label: 'Block', icon: <IconBlock size={20} />, tone: 'danger', onSelect: () => toast.error('Blocked') },
                    ]}
                  />
                  <Text size="sm" muted>
                    Opens below the trigger (align start here, end by default).
                  </Text>
                </Row>
              </Spec>
              <Spec label="Action list" note="ActionList · inside sheets">
                <ActionList
                  items={[
                    { label: 'Report', description: 'Fake profile, spam, abuse.', icon: <IconFlag size={22} />, onSelect: () => undefined },
                    { label: 'Block', description: 'They will not see you again.', icon: <IconBlock size={22} />, tone: 'danger', onSelect: () => undefined },
                  ]}
                />
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 11 chat */}
          <Section id="chat" n={11} title="Chat">
            <div className={s.grid2}>
              <Spec label="Thread" note="ChatThread · ChatBubble · TypingIndicator">
                <div className={s.chatBox}>
                  <ChatThread>
                    <DayDivider>Yesterday</DayDivider>
                    <ChatBubble side="theirs" position="first">
                      Okay, important question.
                    </ChatBubble>
                    <ChatBubble side="theirs" position="last" time="21:40">
                      Usucha or koicha?
                    </ChatBubble>
                    <ChatBubble side="mine" time="21:42" status="read">
                      Koicha, obviously. I'm not a monster.
                    </ChatBubble>
                    <DayDivider>Today</DayDivider>
                    <ChatBubble side="mine" time="09:03" status="sending">
                      Sending…
                    </ChatBubble>
                    <ChatBubble side="mine" time="09:04" status="failed">
                      This one failed.
                    </ChatBubble>
                    <TypingIndicator name="Alice" />
                  </ChatThread>
                </div>
              </Spec>
              <Spec label="Composer" note="ChatComposer · Enter sends">
                <Stack gap={4}>
                  <ChatComposer value={draft} onChange={setDraft} onSend={(t) => { toast.success('Sent', t); setDraft('') }} />
                  <ChatComposer value="" onChange={() => undefined} onSend={() => undefined} disabled placeholder="Disabled" />
                </Stack>
              </Spec>
            </div>
          </Section>

          {/* ------------------------------------------------------------ 12 layout */}
          <Section id="layout" n={12} title="Layout" intro="AppShell (signed in), AuthLayout (signed out) and Screen (full-height, e.g. chat) switch on their own width: phone layout under 960px, rail + poster composition above. Open them full page:">
            <Row gap={4} wrap className={s.demoRow}>
              <ButtonLink href="?demo=shell" variant="ink" iconRight={<IconArrowRight size={18} strokeWidth={3} />}>
                AppShell
              </ButtonLink>
              <ButtonLink href="?demo=auth" variant="paper">
                AuthLayout
              </ButtonLink>
              <ButtonLink href="?demo=chat" variant="paper">
                Screen · chat
              </ButtonLink>
              <ButtonLink href="?demo=match" variant="strawberry" icon={<IconHeart size={18} filled />}>
                Match moment
              </ButtonLink>
            </Row>
            <Spec label="Page header" wide note="PageHeader size=…">
              <Stack gap={8}>
                <PageHeader title="Discover" kicker="32 people · within 25 km" actions={<IconButton label="Filters"><IconSliders size={22} /></IconButton>} />
                <PageHeader size="md" title="Edit profile" kicker="Step 03 / 05" back={() => undefined} />
                <PageHeader size="compact" title="Settings" back={() => undefined} actions={<IconButton label="Help" variant="ghost"><IconCup size={22} /></IconButton>} />
              </Stack>
            </Spec>
          </Section>

          {/* ------------------------------------------------------------ 13 patterns */}
          <Section id="patterns" n={13} title="Patterns" intro="Static mock-ups built only from the kit, at phone width. The real portraits will be risograph-style SVGs at about 3:4; the PosterFigure stands in for them here.">
            <Patterns />
          </Section>

          <footer className={s.colophon}>
            <ColorBar />
            <Label tone="muted">Matcha · Press Edition · printed in five drums on warm stock</Label>
            <Serial value={2026} />
          </footer>
        </main>
      </div>

      {/* overlays */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        kicker="Nº 0042 · Confirm"
        title="Unmatch Alice?"
        size="sm"
        footer={
          <>
            <Button variant="paper" onClick={() => setModal(false)}>
              Keep
            </Button>
            <Button variant="strawberry" onClick={() => setModal(false)}>
              Unmatch
            </Button>
          </>
        }
      >
        <Text>The conversation disappears for both of you. This cannot be undone.</Text>
      </Modal>

      <Modal
        open={filters}
        onClose={() => setFilters(false)}
        kicker="Discover"
        title="Filters"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFilters(false)}>
              Reset
            </Button>
            <Button onClick={() => setFilters(false)}>Show 32 people</Button>
          </>
        }
      >
        <Stack gap={6}>
          <DualSlider label="Age" value={ages} onChange={setAges} min={18} max={80} thumbLabels={['Minimum age', 'Maximum age']} />
          <Slider label="Distance" value={distance} onChange={setDistance} min={1} max={200} unit="km" />
          <Segmented
            label="Sort by"
            options={[
              { value: 'best', label: 'Best' },
              { value: 'distance', label: 'Near' },
              { value: 'fame', label: 'Fame' },
              { value: 'age', label: 'Age' },
            ]}
            value={sort}
            onChange={setSort}
            block
          />
          <TagInput label="Must share" value={tags} onChange={setTags} suggestions={CATALOGUE} max={5} />
        </Stack>
      </Modal>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Alice" kicker="Match options">
        <ActionList
          items={[
            { label: 'View profile', icon: <IconUser size={22} />, onSelect: () => setSheet(false) },
            { label: 'Report', description: 'Fake profile, spam, abuse.', icon: <IconFlag size={22} />, onSelect: () => setSheet(false) },
            { label: 'Block', description: 'They will not see you again.', icon: <IconBlock size={22} />, tone: 'danger', onSelect: () => setSheet(false) },
          ]}
        />
      </Sheet>
    </div>
  )
}

function readDemo(): DemoName | null {
  if (typeof window === 'undefined') return null
  const d = new URLSearchParams(window.location.search).get('demo')
  return d === 'shell' || d === 'auth' || d === 'chat' || d === 'match' ? d : null
}

function Body() {
  const [demo] = useState(readDemo)
  return (
    <>
      {demo === 'shell' && <ShellDemo />}
      {demo === 'auth' && <AuthDemo />}
      {demo === 'chat' && <ChatDemo />}
      {demo === 'match' && <MatchDemo />}
      {demo && <Toaster />}
      {!demo && <Guide />}
    </>
  )
}

/** The design-system showcase. Mounted at /styleguide in the app and by styleguide.html on its own. */
export default function StyleguidePage() {
  const inRouter = useInRouterContext()
  if (inRouter) return <Body />
  return (
    <MemoryRouter initialEntries={['/discover']}>
      <Body />
    </MemoryRouter>
  )
}
