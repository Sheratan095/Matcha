/* Full-page demos of the real layout components, opened from the styleguide (?demo=…). */
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ActionButton,
  AppShell,
  AuthLayout,
  Avatar,
  Badge,
  Button,
  ChatBubble,
  ChatComposer,
  ChatThread,
  Checkbox,
  CountBadge,
  DayDivider,
  EmptyState,
  FormError,
  IconBell,
  IconCards,
  IconChat,
  IconGithub,
  IconHeart,
  IconSliders,
  IconUser,
  ListRow,
  MatchMoment,
  Menu,
  PageHeader,
  PasswordField,
  ProfileCard,
  Row,
  Screen,
  Stack,
  Stat,
  StatGroup,
  Tabs,
  TextField,
  TypingIndicator,
  IconBlock,
  IconFlag,
  IconTrash,
  IconButton,
  toast,
} from '../index'
import type { ShellTab } from '../index'
import s from './Styleguide.module.css'

export type DemoName = 'shell' | 'auth' | 'chat' | 'match'

export const PEOPLE = [
  { id: 'u-alice', name: 'Alice', age: 27, city: 'Paris 11e', km: 2, tags: ['matcha', 'climbing', 'risograph', 'jazz', 'ramen', 'cats'] },
  { id: 'u-noor', name: 'Noor', age: 29, city: 'Montreuil', km: 6, tags: ['ceramics', 'matcha', 'running'] },
  { id: 'u-bastien', name: 'Bastien', age: 31, city: 'Paris 3e', km: 1, tags: ['vinyl', 'cycling'] },
  { id: 'u-yuki', name: 'Yuki', age: 25, city: 'Vincennes', km: 9, tags: ['film', 'tea', 'hiking'] },
  { id: 'u-ines', name: 'Inès', age: 33, city: 'Paris 18e', km: 4, tags: ['poetry', 'matcha'] },
] as const

function BackStrip() {
  return (
    <div className={s.backStrip}>
      <span>Styleguide demo</span>
      <a href="?">← Back to the styleguide</a>
    </div>
  )
}

const TABS: ShellTab[] = [
  { to: '/discover', label: 'Discover', icon: <IconCards size={24} /> },
  { to: '/matches', label: 'Matches', icon: <IconChat size={24} />, badge: 3 },
  { to: '/activity', label: 'Activity', icon: <IconHeart size={24} />, badge: 12 },
  { to: '/me', label: 'Me', icon: <IconUser size={24} /> },
]

function DeckDemo() {
  const [i, setI] = useState(0)
  const p = PEOPLE[i % PEOPLE.length]
  const next = () => setI((v) => v + 1)
  return (
    <div className={s.deckDemo}>
      <div className={s.deckStack}>
        <div className={s.deckUnder} aria-hidden="true" />
        <ProfileCard
          name={p.name}
          age={p.age}
          seed={p.id}
          city={p.city}
          distanceKm={p.km}
          online={i % 2 === 0}
          tags={[...p.tags]}
          commonTags={['matcha']}
          likedYou={i % 3 === 0}
          serial={4211 + i}
          photoCount={3}
          photoIndex={0}
          onInfo={() => toast.info('Profile sheet', 'Opens the full profile.')}
          fill
          style={{ rotate: '-1.2deg' }}
        />
      </div>
      <div className={s.deckActions}>
        <ActionButton kind="rewind" size="md" onClick={() => setI((v) => Math.max(0, v - 1))} />
        <ActionButton kind="pass" size="lg" onClick={next} />
        <ActionButton kind="superlike" size="md" onClick={next} />
        <ActionButton kind="like" size="lg" onClick={next} />
      </div>
    </div>
  )
}

function MatchesDemo() {
  return (
    <>
      <PageHeader title="Matches" kicker="03 new · 05 total" />
      <ul>
        {PEOPLE.map((p, i) => (
          <li key={p.id}>
            <ListRow
              to="/matches"
              leading={<Avatar name={p.name} size="lg" online={i < 2} decorative />}
              title={p.name}
              subtitle={i === 0 ? 'Is the matcha place on rue Oberkampf still open?' : 'You matched. Say hi!'}
              meta={i === 0 ? '14:02' : `${i}d`}
              unread={i < 2}
              trailing={i < 2 ? <CountBadge count={i === 0 ? 2 : 1} label="unread" /> : undefined}
            />
          </li>
        ))}
      </ul>
    </>
  )
}

function ActivityDemo() {
  const [tab, setTab] = useState<'likes' | 'viewers'>('likes')
  return (
    <>
      <PageHeader title="Activity" kicker="This week">
        <Tabs
          label="Activity"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'likes', label: 'Likes you', count: 12 },
            { value: 'viewers', label: 'Viewed you', count: 4 },
          ]}
        />
      </PageHeader>
      <EmptyState
        stamp="Nobody yet"
        title="Quiet on the press"
        action={
          <Button variant="ink" icon={<IconCards size={20} />}>
            Back to the deck
          </Button>
        }
      >
        When someone likes your profile, their ticket lands here.
      </EmptyState>
    </>
  )
}

function MeDemo() {
  return (
    <>
      <PageHeader title="Alice" kicker="Your profile · 82% complete" />
      <Stack gap={5}>
        <StatGroup>
          <Stat value={74} label="Fame" />
          <Stat value={27} unit="yrs" label="Age" tone="yolk" />
          <Stat value={12} label="Likes" tone="strawberry" />
        </StatGroup>
        <Button variant="paper" block>
          Edit profile
        </Button>
      </Stack>
    </>
  )
}

export function ShellDemo() {
  const { pathname } = useLocation()
  const section = pathname.startsWith('/matches')
    ? 'matches'
    : pathname.startsWith('/activity')
      ? 'activity'
      : pathname.startsWith('/me')
        ? 'me'
        : 'discover'
  return (
    <AppShell
      tabs={TABS}
      banner={<BackStrip />}
      poster={section}
      flush={section === 'discover'}
      actions={
        <>
          <IconButton label="Filters" variant="paper">
            <IconSliders size={22} />
          </IconButton>
          <IconButton label="Notifications" variant="paper" badge={2}>
            <IconBell size={22} />
          </IconButton>
        </>
      }
    >
      {section === 'discover' && <DeckDemo />}
      {section === 'matches' && <MatchesDemo />}
      {section === 'activity' && <ActivityDemo />}
      {section === 'me' && <MeDemo />}
    </AppShell>
  )
}

export function AuthDemo() {
  const [tried, setTried] = useState(false)
  return (
    <>
      <BackStrip />
      <AuthLayout
        title="Sign in"
        intro="Welcome back. Your matches have been steeping."
        footer={
          <>
            No account yet? <Link to="/register">Register</Link>
          </>
        }
      >
        <form
          className={s.authForm}
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
          }}
        >
          <TextField label="Username" name="username" autoComplete="username" placeholder="alice" />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            aside={<Link to="/forgot-password">Forgot?</Link>}
            error={tried ? 'Wrong username or password.' : undefined}
          />
          <Checkbox defaultChecked>Keep me signed in</Checkbox>
          <FormError error={tried ? { message: 'Please verify your email first.', messages: [] } : null} />
          <Button type="submit" size="lg" block>
            Sign in
          </Button>
          <div className={s.or}>
            <span>or</span>
          </div>
          <Button variant="ink" size="md" block icon={<IconGithub size={20} />}>
            Continue with GitHub
          </Button>
        </form>
      </AuthLayout>
    </>
  )
}

export function ChatDemo() {
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState<string[]>([])
  return (
    <Screen
      banner={<BackStrip />}
      poster="Alice"
      header={
        <PageHeader
          size="compact"
          back={() => window.history.back()}
          title={
            <Row gap={3}>
              <Avatar name="Alice" size="sm" online decorative />
              <span>Alice</span>
            </Row>
          }
          actions={
            <Menu
              items={[
                { label: 'View profile', icon: <IconUser size={20} />, onSelect: () => toast.info('Profile') },
                { label: 'Report', icon: <IconFlag size={20} />, onSelect: () => toast.info('Reported') },
                { label: 'Block', icon: <IconBlock size={20} />, tone: 'danger', onSelect: () => toast.error('Blocked') },
                { label: 'Unmatch', icon: <IconTrash size={20} />, tone: 'danger', onSelect: () => toast.error('Unmatched') },
              ]}
            />
          }
        />
      }
      footer={
        <ChatComposer
          value={draft}
          onChange={setDraft}
          onSend={(t) => {
            setSent((v) => [...v, t])
            setDraft('')
          }}
        />
      }
    >
      <ChatThread>
        <DayDivider>Matched · 12 Mar</DayDivider>
        <ChatBubble side="theirs" position="first">
          Hey! Your risograph posters are amazing.
        </ChatBubble>
        <ChatBubble side="theirs" position="last" time="13:58">
          Did you print them yourself?
        </ChatBubble>
        <ChatBubble side="mine" position="first">
          Thank you! Yes, at a little studio in Belleville.
        </ChatBubble>
        <ChatBubble side="mine" position="last" time="14:01" status="read">
          Want to see the drums sometime? Matcha after?
        </ChatBubble>
        <DayDivider>Today</DayDivider>
        {sent.map((t, i) => (
          <ChatBubble key={i} side="mine" time="now" status="sent">
            {t}
          </ChatBubble>
        ))}
        <TypingIndicator name="Alice" />
      </ChatThread>
    </Screen>
  )
}

export function MatchDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div className={s.matchDemo}>
      <BackStrip />
      <Stack gap={4} align="center" style={{ padding: 48 }}>
        <Badge tone="yolk">Match moment demo</Badge>
        <Button onClick={() => setOpen(true)}>Replay the match</Button>
      </Stack>
      <MatchMoment
        open={open}
        onClose={() => setOpen(false)}
        me={{ name: 'You', seed: 'u-me' }}
        them={{ name: 'Alice', seed: 'u-alice' }}
        onMessage={() => {
          setOpen(false)
          toast.success('Chat opened', 'This would go to /chat/:matchId.')
        }}
      />
    </div>
  )
}
