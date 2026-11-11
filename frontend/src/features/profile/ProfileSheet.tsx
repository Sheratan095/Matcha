/**
 * The shared profile sheet (deck, matches, chat, activity). A bottom sheet on phones, a dialog from
 * 640px (kit `Modal`).
 *
 * - `source: 'social'` loads `socialProfile` (`actions.showSocialProfile`): a full card.
 * - `source: 'api'` loads `apiProfile` (`actions.showApiProfile`): a real user, with age, distance,
 *   fame, presence and the like relation; shared interests are worked out against your own profile.
 *   Opening a real profile records a profile view on the backend. Without an `actions` slot the sheet
 *   offers like / unlike itself, and its menu reports a fake account or blocks (subject IV.5).
 * - `preview` shows at once while the full profile loads.
 * - Closing calls `onClose` and `actions.closeProfile()` (also when the caller sets `target` to null).
 */
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiError, Card, OtherProfile, Profile, ProfileRelation } from '@/api/types'
import {
  Badge,
  Button,
  Chip,
  FormError,
  IconBlock,
  IconClock,
  IconFlag,
  IconPin,
  Label,
  Menu,
  Modal,
  Notice,
  Serial,
  Skeleton,
  Spinner,
  Stack,
  Stat,
  StatGroup,
  Sticker,
  Text,
  TicketHeader,
  toast,
  ActionButton,
} from '@/ui'
import { actions, LOCAL_ERROR, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { displayName, distanceText, identityText, isCard, lastSeenText, orderedPictures, serialOf } from './format'
import { PhotoCarousel } from './PhotoCarousel'
import s from './ProfileSheet.module.css'

/**
 * Which profile to show. `social` people come from the (mocked) social service,
 * `api` people are real users fetched from the profile service by id.
 */
export interface ProfileTarget {
  userId: string
  source: 'social' | 'api'
  /** Already-loaded data to show immediately while the full profile loads. */
  preview?: Card | OtherProfile
}

export interface ProfileSheetProps {
  /** null = closed. */
  target: ProfileTarget | null
  onClose: () => void
  /**
   * Controls rendered at the bottom of the sheet (like / pass / message...). For a real profile
   * (`source: 'api'`) the sheet shows its own like / unlike button when this is not given.
   */
  actions?: ReactNode
  /** Called once the person has been blocked (the sheet then closes itself through `onClose`). */
  onBlocked?: (userId: string) => void
  /** Hide the built-in "Block" menu. Default false. */
  hideMenu?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

function keyOf(target: ProfileTarget | null): string | null {
  return target ? `${target.source}|${target.userId}` : null
}

export default function ProfileSheet({ target, onClose, actions: slot, onBlocked, hideMenu }: ProfileSheetProps) {
  const open = target !== null
  const key = keyOf(target)

  // The last target and data stay on screen while the sheet animates out.
  const [lastTarget, setLastTarget] = useState<ProfileTarget | null>(target)
  /** The like relation after a like / unlike from this sheet (the profile is not refetched). */
  const [relationOverride, setRelationOverride] = useState<{ userId: string; relation: ProfileRelation } | null>(null)
  if (target && target !== lastTarget) {
    setLastTarget(target)
    // A new opening loads a fresh profile: its relation is the truth again.
    setRelationOverride(null)
  }
  const shown = target ?? lastTarget

  const [retry, setRetry] = useState(0)
  const [failure, setFailure] = useState<{ key: string; error: ApiError } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<ApiError | null>(null)
  const [liking, setLiking] = useState(false)

  const social = useNodeValue('socialProfile')
  const api = useNodeValue('apiProfile')
  const socialStatus = useNodeStatus('socialProfile')
  const apiStatus = useNodeStatus('apiProfile')
  const me = useNodeValue('myProfile')
  const aboutId = useId()
  const interestsId = useId()

  useEffect(() => {
    if (!key) return
    const at = key.indexOf('|')
    const source = key.slice(0, at)
    const userId = key.slice(at + 1)
    let live = true
    const load: Promise<unknown> = source === 'social' ? actions.showSocialProfile(userId) : actions.showApiProfile(userId)
    load.catch((error: unknown) => {
      const apiError = toApiError(error)
      // DROPPED: the sheet closed (or StrictMode re-ran the effect) while it loaded
      if (live && apiError.code !== LOCAL_ERROR.DROPPED) setFailure({ key, error: apiError })
    })
    return () => {
      live = false
      actions.closeProfile()
    }
  }, [key, retry])

  // ---------------------------------------------------------------- what to show
  const loaded: Card | OtherProfile | null = !shown
    ? null
    : shown.source === 'social'
      ? social?.userId === shown.userId
        ? social
        : null
      : api?.userId === shown.userId
        ? api
        : null
  const preview = shown?.preview?.userId === shown?.userId ? shown?.preview : undefined
  const merged: Card | OtherProfile | null = loaded
    ? preview && !isCard(loaded)
      ? ({ ...preview, ...loaded } as Card | OtherProfile)
      : loaded
    : (preview ?? null)

  const [kept, setKept] = useState<Card | OtherProfile | null>(merged)
  if (open && merged && merged !== kept) setKept(merged)
  const data = open ? merged : kept

  // the action's rejection says it failed; the node status only fills in a missing message
  const status = shown?.source === 'api' ? apiStatus : socialStatus
  const failed = open && !loaded && failure?.key === key
  const failureMessage = (failure?.key === key ? failure.error.message : status.error?.message) ?? 'The profile could not be loaded.'
  const loading = open && !loaded && !failed

  const close = () => {
    onClose()
    actions.closeProfile()
  }

  const name = data ? displayName(data) : 'Profile'
  const isMe = !!data && !!me && data.userId === me.userId
  const real = shown?.source === 'api'
  const baseRelation = data && !isCard(data) ? (data.relation ?? null) : null
  const relation = data && relationOverride?.userId === data.userId ? relationOverride.relation : baseRelation

  const confirmBlock = async () => {
    if (!data || blocking) return
    const userId = data.userId
    setBlocking(true)
    setBlockError(null)
    try {
      if (real) await actions.blockUser(userId)
      else await actions.block(userId)
      setConfirming(false)
      toast.show({ tone: 'ink', title: `${name} is blocked`, message: 'You will not see each other again.' })
      onBlocked?.(userId)
      close()
    } catch (error) {
      setBlockError(toApiError(error))
    } finally {
      setBlocking(false)
    }
  }

  const report = async () => {
    if (!data) return
    try {
      await actions.reportUser(data.userId)
      toast.show({ tone: 'ink', title: `${name} is reported`, message: 'Thank you: the team will look into this account.' })
    } catch (error) {
      toast.show({ tone: 'strawberry', title: 'Not reported', message: toApiError(error).message })
    }
  }

  /** Like, or take a like back (which disconnects a match). */
  const toggleLike = async () => {
    if (!data || !relation || liking) return
    const userId = data.userId
    setLiking(true)
    try {
      if (relation.liked) {
        await actions.unlikeUser(userId)
        setRelationOverride({ userId, relation: { liked: false, likesYou: relation.likesYou, matched: false } })
        toast.show({ tone: 'ink', title: relation.matched ? `You and ${name} are no longer connected` : `You took back your like` })
      } else {
        const outcome = await actions.likeUser(userId, 'like')
        const matched = outcome.matched || relation.likesYou
        setRelationOverride({ userId, relation: { liked: true, likesYou: relation.likesYou, matched } })
        toast.show({ tone: 'strawberry', title: matched ? `You and ${name} are connected` : `You liked ${name}` })
      }
    } catch (error) {
      toast.show({ tone: 'strawberry', title: 'That did not work', message: toApiError(error).message })
    } finally {
      setLiking(false)
    }
  }

  const footer =
    slot ??
    (real && relation && !isMe && data ? (
      <div className={s.relationActions}>
        <ActionButton
          kind={relation.liked ? 'pass' : 'like'}
          size="lg"
          label={relation.liked ? (relation.matched ? `Disconnect from ${name}` : `Take back your like for ${name}`) : `Like ${name}`}
          disabled={liking}
          aria-busy={liking || undefined}
          onClick={() => void toggleLike()}
        />
        <Label tone="muted">
          {relation.liked ? (relation.matched ? 'Connected · tap to disconnect' : 'Liked · tap to take it back') : relation.likesYou ? 'Likes you · like back to connect' : 'Like'}
        </Label>
      </div>
    ) : undefined)

  const menuItems = [
    ...(real
      ? [
          {
            label: 'Report as fake account',
            icon: <IconFlag size={18} />,
            onSelect: () => void report(),
          },
        ]
      : []),
    {
      label: `Block ${name}`,
      icon: <IconBlock size={18} />,
      tone: 'danger' as const,
      onSelect: () => {
        setBlockError(null)
        setConfirming(true)
      },
    },
  ]

  return (
    <>
      <Modal open={open} onClose={close} title={`${name}'s profile`} hideTitle bleed size="md" footer={footer}>
        {data ? (
          <ProfileBody
            data={data}
            relation={relation}
            me={me ?? null}
            loading={loading}
            failed={failed ? failureMessage : null}
            onRetry={() => {
              setFailure(null)
              setRetry((n) => n + 1)
            }}
            menu={
              hideMenu || isMe ? null : (
                <Menu label={`More options for ${name}`} align="start" items={menuItems} />
              )
            }
            aboutId={aboutId}
            interestsId={interestsId}
          />
        ) : failed ? (
          <div className={s.state}>
            <Notice
              tone="error"
              title="This profile could not be loaded"
              action={
                <Button
                  size="sm"
                  variant="paper"
                  onClick={() => {
                    setFailure(null)
                    setRetry((n) => n + 1)
                  }}
                >
                  Retry
                </Button>
              }
            >
              {failureMessage}
            </Notice>
          </div>
        ) : (
          <ProfileSkeleton />
        )}
      </Modal>

      <Modal
        open={open && confirming}
        onClose={() => {
          if (!blocking) setConfirming(false)
        }}
        title={`Block ${name}?`}
        kicker="No take-backs"
        variant="dialog"
        size="sm"
        footer={
          <>
            <Button variant="paper" onClick={() => setConfirming(false)} disabled={blocking}>
              Cancel
            </Button>
            <Button variant="strawberry" icon={<IconBlock size={18} />} loading={blocking} onClick={() => void confirmBlock()}>
              Block
            </Button>
          </>
        }
      >
        <Stack gap={3}>
          <Text>
            {name} disappears from your deck, your matches and your likes, and any conversation ends. They are not told.
          </Text>
          <FormError error={blockError} title="Not blocked" />
        </Stack>
      </Modal>
    </>
  )
}

interface ProfileBodyProps {
  data: Card | OtherProfile
  relation: ProfileRelation | null
  me: Profile | null
  loading: boolean
  failed: string | null
  onRetry: () => void
  menu: ReactNode
  aboutId: string
  interestsId: string
}

/** What the sheet prints about someone, from a mocked card or a real profile. */
function factsOf(data: Card | OtherProfile, relation: ProfileRelation | null) {
  if (isCard(data)) {
    return {
      age: data.age,
      distanceKm: data.distanceKm as number | null,
      fame: data.fame,
      online: data.online as boolean | null,
      lastSeen: data.lastSeen,
      city: data.city as string | null,
      likesYou: data.likedYou,
      matched: false,
    }
  }
  return {
    age: data.age ?? null,
    distanceKm: data.distanceKm ?? null,
    fame: data.fameRating ?? null,
    online: data.isOnline ?? null,
    lastSeen: data.lastSeen ?? null,
    city: null as string | null,
    likesYou: relation?.likesYou === true,
    matched: relation?.matched === true,
  }
}

function ProfileBody({ data, relation, me, loading, failed, onRetry, menu, aboutId, interestsId }: ProfileBodyProps) {
  const card = isCard(data) ? data : null
  const facts = factsOf(data, relation)
  const name = displayName(data)
  const interests = data.interests.map((tag) => tag.name)
  const mine = new Set((me?.interests ?? []).map((tag) => tag.name))
  const common = card ? card.commonTags : me && me.userId !== data.userId ? interests.filter((tag) => mine.has(tag)) : []
  const ordered = [...common.filter((tag) => interests.includes(tag)), ...interests.filter((tag) => !common.includes(tag))]
  const identity = identityText(data)
  const seen = facts.online === false ? (lastSeenText(facts.lastSeen) ?? 'Offline') : null
  const bio = data.biography?.trim()
  const username = !card ? data.username : undefined

  return (
    <article className={s.profile} aria-busy={loading || undefined}>
      <PhotoCarousel key={data.userId} photos={orderedPictures(data)} name={name} seed={data.userId}>
        {menu ? <div className={s.menu}>{menu}</div> : null}
        {facts.matched ? (
          <Sticker tone="matcha" shape="burst" size="86px" rotate={12} className={s.likes}>
            Con-
            <br />
            nected
          </Sticker>
        ) : facts.likesYou ? (
          <Sticker tone="yolk" shape="burst" size="86px" rotate={12} className={s.likes}>
            Likes
            <br />
            you
          </Sticker>
        ) : null}
      </PhotoCarousel>

      <div className={s.body}>
        <div className={s.strip} data-clear={facts.likesYou || facts.matched || undefined}>
          <Serial value={serialOf(data.userId)} digits={4} />
          <i aria-hidden="true" />
          {facts.distanceKm != null ? (
            <span className={s.where}>
              <IconPin size={14} strokeWidth={3} />
              {distanceText(facts.distanceKm)} away{facts.city ? ` · ${facts.city}` : ''}
            </span>
          ) : null}
        </div>

        <h3 className={s.name}>
          <span className={s.first}>{name}</span>
          {facts.age != null ? <span className={s.age}>{facts.age}</span> : null}
        </h3>
        {username ? <Label tone="muted">@{username}</Label> : null}

        {facts.online || seen || identity ? (
          <div className={s.meta}>
            {facts.online ? (
              <Badge tone="matcha" className={s.online}>
                Online now
              </Badge>
            ) : seen ? (
              <Label tone="muted" className={s.seen}>
                <IconClock size={14} strokeWidth={3} /> {seen}
              </Label>
            ) : null}
            {identity ? <Label tone="ink">{identity}</Label> : null}
          </div>
        ) : null}

        {facts.fame != null ? (
          <StatGroup className={s.stats}>
            <Stat value={Math.round(facts.fame)} label="Fame" />
            {facts.distanceKm != null ? (
              <Stat value={facts.distanceKm < 1 ? '<1' : Math.round(facts.distanceKm)} unit="km" label="Away" tone="yolk" />
            ) : null}
            <Stat value={pad(common.length)} label="Shared" tone="strawberry" />
          </StatGroup>
        ) : null}

        {loading ? (
          <div className={s.loading} role="status">
            <Spinner size={18} label="" />
            <Label tone="muted">Loading the full profile</Label>
          </div>
        ) : null}
        {failed ? (
          <Notice
            tone="error"
            title="Could not load everything"
            action={
              <Button size="sm" variant="paper" onClick={onRetry}>
                Retry
              </Button>
            }
          >
            {failed}
          </Notice>
        ) : null}

        <section className={s.section} aria-labelledby={aboutId}>
          <TicketHeader label={<span id={aboutId}>About {name}</span>} />
          {bio ? (
            <Text className={s.bio}>{bio}</Text>
          ) : (
            <Text muted size="sm">
              {loading ? '…' : `${name} has not written a biography yet.`}
            </Text>
          )}
        </section>

        <section className={s.section} aria-labelledby={interestsId}>
          <TicketHeader
            label={<span id={interestsId}>Interests</span>}
            meta={common.length > 0 ? `${pad(common.length)} in common` : ordered.length > 0 ? pad(ordered.length) : null}
          />
          {ordered.length > 0 ? (
            <ul className={s.tags}>
              {ordered.map((tag) => {
                const shared = common.includes(tag)
                return (
                  <li key={tag}>
                    <Chip size="md" tone={shared ? 'matcha' : 'paper'}>
                      #{tag}
                      {shared ? <span className="sr-only"> (in common)</span> : null}
                    </Chip>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Text muted size="sm">
              No interests listed.
            </Text>
          )}
        </section>
      </div>
    </article>
  )
}

function ProfileSkeleton() {
  return (
    <div className={s.profile} role="status" aria-label="Loading the profile">
      <Skeleton className={s.skPhoto} />
      <div className={s.body} aria-hidden="true">
        <Skeleton shape="text" width="40%" height={10} />
        <Skeleton width="65%" height={52} />
        <Skeleton shape="text" width="50%" height={14} />
        <Skeleton height={64} />
        <Skeleton shape="text" width="90%" height={14} />
        <Skeleton shape="text" width="75%" height={14} />
      </div>
    </div>
  )
}
