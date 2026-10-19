/* Static mock-ups composed only from the kit: proof that the language holds on the key screens. */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionButton,
  AuthLayout,
  Avatar,
  Badge,
  Button,
  ChatBubble,
  ChatComposer,
  ChatThread,
  Chip,
  CountBadge,
  DayDivider,
  IconBell,
  IconGithub,
  IconPencil,
  IconPin,
  IconSettings,
  IconSliders,
  IconButton,
  Label,
  ListRow,
  MatchCelebration,
  Menu,
  PageHeader,
  PasswordField,
  PhotoFrame,
  ProfileCard,
  Row,
  Screen,
  Serial,
  Stamp,
  Stat,
  StatGroup,
  Text,
  TextField,
  TypingIndicator,
  Wordmark,
} from '../index'
import { PEOPLE } from './Demos'
import s from './Styleguide.module.css'

function Phone({ caption, children, tone = 'paper' }: { caption: string; children: ReactNode; tone?: 'paper' | 'ink' }) {
  return (
    <figure className={s.phoneFig}>
      <div className={s.phone} data-tone={tone === 'ink' ? 'ink' : 'paper'}>
        <div className={s.phoneScreen}>{children}</div>
      </div>
      <figcaption className={s.phoneCaption}>{caption}</figcaption>
    </figure>
  )
}

function MiniTopBar() {
  return (
    <div className={s.miniTop}>
      <Wordmark size="sm" />
      <Row gap={2}>
        <IconButton label="Filters" size="sm">
          <IconSliders size={18} />
        </IconButton>
        <IconButton label="Notifications" size="sm" badge={2}>
          <IconBell size={18} />
        </IconButton>
      </Row>
    </div>
  )
}

export function Patterns() {
  const alice = PEOPLE[0]
  return (
    <div className={s.patterns}>
      <Phone caption="01 · Deck: the card mid-swipe, LIKE stamp coming in">
        <MiniTopBar />
        <div className={s.deckPattern}>
          <div className={s.deckStack}>
            <div className={s.deckUnder} aria-hidden="true" />
            <ProfileCard
              name={alice.name}
              age={alice.age}
              seed={alice.id}
              city={alice.city}
              distanceKm={alice.km}
              online
              tags={[...alice.tags]}
              commonTags={['matcha', 'risograph']}
              likedYou
              stamp="like"
              stampStrength={0.9}
              serial={4211}
              photoCount={4}
              photoIndex={1}
              onInfo={() => undefined}
              style={{ rotate: '5deg', translate: '14px 0' }}
            />
          </div>
          <div className={s.deckActions}>
            <ActionButton kind="rewind" size="md" />
            <ActionButton kind="pass" size="lg" />
            <ActionButton kind="superlike" size="md" />
            <ActionButton kind="like" size="lg" />
          </div>
        </div>
      </Phone>

      <Phone caption="02 · The match moment" tone="ink">
        <MatchCelebration
          me={{ name: 'You', seed: 'u-me' }}
          them={{ name: 'Alice', seed: 'u-alice' }}
          onMessage={() => undefined}
          onDismiss={() => undefined}
          animate={false}
        />
      </Phone>

      <Phone caption="03 · Chat thread">
        <Screen
          className={s.inFrame}
          header={
            <PageHeader
              size="compact"
              back={() => undefined}
              title={
                <Row gap={3}>
                  <Avatar name="Alice" size="sm" online decorative />
                  <span>Alice</span>
                </Row>
              }
              actions={<Menu items={[{ label: 'Unmatch', tone: 'danger', onSelect: () => undefined }]} />}
            />
          }
          footer={<ChatComposer value="" onChange={() => undefined} onSend={() => undefined} />}
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
              Yes! A little studio in Belleville.
            </ChatBubble>
            <ChatBubble side="mine" position="last" time="14:01" status="read">
              Want to see the drums sometime? Matcha after?
            </ChatBubble>
            <TypingIndicator name="Alice" />
          </ChatThread>
        </Screen>
      </Phone>

      <Phone caption="04 · Auth: poster band + ticket form">
        <AuthLayout
          title="Sign in"
          intro="Welcome back. Your matches have been steeping."
          footer={
            <>
              No account yet? <Link to="/register">Register</Link>
            </>
          }
        >
          <TextField label="Username" placeholder="alice" />
          <PasswordField label="Password" defaultValue="hunter22" />
          <Button size="lg" block>
            Sign in
          </Button>
          <Button variant="ink" block icon={<IconGithub size={20} />}>
            Continue with GitHub
          </Button>
        </AuthLayout>
      </Phone>

      <Phone caption="05 · Own profile header">
        <MiniTopBar />
        <div className={s.profilePattern}>
          <div className={s.profileHero}>
            <PhotoFrame src={null} alt="Alice" seed="u-alice" shadow={3} radius="xl" tilt={-2.5} className={s.profilePhoto} />
            <Stamp tone="matcha" size="sm" rotate={8} className={s.profileStamp}>
              Verified
            </Stamp>
          </div>
          <div className={s.profileName}>
            <Label tone="muted">
              <Serial value={4211} /> · Member since 2026
            </Label>
            <h2 className={s.profileH}>
              Alice <span>27</span>
            </h2>
            <Row gap={2}>
              <IconPin size={16} strokeWidth={3} />
              <Text size="sm" strong>
                Paris 11e · Online
              </Text>
            </Row>
          </div>
          <StatGroup>
            <Stat value={74} label="Fame" />
            <Stat value={12} label="Likes" tone="strawberry" />
            <Stat value={4} label="Views" tone="yolk" />
          </StatGroup>
          <Row gap={2} wrap>
            {['matcha', 'climbing', 'risograph', 'jazz'].map((t) => (
              <Chip key={t} tone={t === 'matcha' ? 'matcha' : 'paper'}>
                #{t}
              </Chip>
            ))}
          </Row>
          <Row gap={3}>
            <Button variant="paper" icon={<IconPencil size={18} />} style={{ flex: 1 }}>
              Edit
            </Button>
            <IconButton label="Settings" size="lg">
              <IconSettings size={24} />
            </IconButton>
          </Row>
        </div>
      </Phone>

      <Phone caption="06 · Matches list">
        <MiniTopBar />
        <div className={s.listPattern}>
          <PageHeader title="Matches" kicker="03 new · 05 total" />
          <div className={s.newRow}>
            {PEOPLE.slice(1, 5).map((p, i) => (
              <div key={p.id} className={s.newMatch}>
                <Avatar name={p.name} size="lg" shadow decorative />
                <Label size="sm">{p.name}</Label>
                {i === 0 ? (
                  <Badge tone="yolk" rotate={-6} className={s.newBadge}>
                    New
                  </Badge>
                ) : null}
              </div>
            ))}
          </div>
          <ul>
            {PEOPLE.map((p, i) => (
              <li key={p.id}>
                <ListRow
                  onClick={() => undefined}
                  leading={<Avatar name={p.name} size="md" online={i < 2} decorative />}
                  title={p.name}
                  subtitle={i === 0 ? 'Is the matcha place on Oberkampf still open?' : 'You matched. Say hi!'}
                  meta={i === 0 ? '14:02' : `${i}d`}
                  unread={i < 2}
                  trailing={i < 2 ? <CountBadge count={i === 0 ? 2 : 1} label="unread" /> : undefined}
                />
              </li>
            ))}
          </ul>
        </div>
      </Phone>
    </div>
  )
}
