/**
 * The shared profile sheet (deck, matches, chat, activity). A bottom sheet on phones, a dialog from
 * 640px (kit `Modal`).
 *
 * - `source: 'social'` loads `socialProfile` (`actions.showSocialProfile`): a full card.
 * - `source: 'api'` loads `apiProfile` (`actions.showApiProfile`): a real profile without the card
 *   extras (age, city, fame, presence); those come from `preview` when given, otherwise they are left
 *   out, and shared interests are worked out against your own profile. Opening a real profile records
 *   a profile view on the backend.
 * - `preview` shows at once while the full profile loads.
 * - Closing calls `onClose` and `actions.closeProfile()` (also when the caller sets `target` to null).
 */
import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiError, Card, Profile } from '@/api/types'
import {
  Badge,
  Button,
  Chip,
  FormError,
  IconBlock,
  IconClock,
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
  /** Already-loaded card data to show immediately while the full profile loads. */
  preview?: Card
}

export interface ProfileSheetProps {
  /** null = closed. */
  target: ProfileTarget | null
  onClose: () => void
  /** Extra controls rendered at the bottom of the sheet (like / pass / message...). */
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
  if (target && target !== lastTarget) setLastTarget(target)
  const shown = target ?? lastTarget

  const [retry, setRetry] = useState(0)
  const [failure, setFailure] = useState<{ key: string; error: ApiError } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [blockError, setBlockError] = useState<ApiError | null>(null)

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
  const loaded: Card | Profile | null = !shown
    ? null
    : shown.source === 'social'
      ? social?.userId === shown.userId
        ? social
        : null
      : api?.userId === shown.userId
        ? api
        : null
  const preview = shown?.preview?.userId === shown?.userId ? shown?.preview : undefined
  const merged: Card | Profile | null = loaded
    ? preview && !isCard(loaded)
      ? ({ ...preview, ...loaded } as Card)
      : loaded
    : (preview ?? null)

  const [kept, setKept] = useState<Card | Profile | null>(merged)
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

  const confirmBlock = async () => {
    if (!data || blocking) return
    const userId = data.userId
    setBlocking(true)
    setBlockError(null)
    try {
      await actions.block(userId)
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

  return (
    <>
      <Modal open={open} onClose={close} title={`${name}'s profile`} hideTitle bleed size="md" footer={slot}>
        {data ? (
          <ProfileBody
            data={data}
            me={me ?? null}
            loading={loading}
            failed={failed ? failureMessage : null}
            onRetry={() => {
              setFailure(null)
              setRetry((n) => n + 1)
            }}
            menu={
              hideMenu || isMe ? null : (
                <Menu
                  label={`More options for ${name}`}
                  align="start"
                  items={[
                    {
                      label: `Block ${name}`,
                      icon: <IconBlock size={18} />,
                      tone: 'danger',
                      onSelect: () => {
                        setBlockError(null)
                        setConfirming(true)
                      },
                    },
                  ]}
                />
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
  data: Card | Profile
  me: Profile | null
  loading: boolean
  failed: string | null
  onRetry: () => void
  menu: ReactNode
  aboutId: string
  interestsId: string
}

function ProfileBody({ data, me, loading, failed, onRetry, menu, aboutId, interestsId }: ProfileBodyProps) {
  const card = isCard(data) ? data : null
  const name = displayName(data)
  const interests = data.interests.map((tag) => tag.name)
  const mine = new Set((me?.interests ?? []).map((tag) => tag.name))
  const common = card ? card.commonTags : me && me.userId !== data.userId ? interests.filter((tag) => mine.has(tag)) : []
  const ordered = [...common.filter((tag) => interests.includes(tag)), ...interests.filter((tag) => !common.includes(tag))]
  const identity = identityText(data)
  const seen = card && !card.online ? lastSeenText(card.lastSeen) : null
  const bio = data.biography?.trim()

  return (
    <article className={s.profile} aria-busy={loading || undefined}>
      <PhotoCarousel key={data.userId} photos={orderedPictures(data)} name={name} seed={data.userId}>
        {menu ? <div className={s.menu}>{menu}</div> : null}
        {card?.likedYou ? (
          <Sticker tone="yolk" shape="burst" size="86px" rotate={12} className={s.likes}>
            Likes
            <br />
            you
          </Sticker>
        ) : null}
      </PhotoCarousel>

      <div className={s.body}>
        <div className={s.strip} data-clear={card?.likedYou || undefined}>
          <Serial value={serialOf(data.userId)} digits={4} />
          <i aria-hidden="true" />
          {card ? (
            <span className={s.where}>
              <IconPin size={14} strokeWidth={3} />
              {distanceText(card.distanceKm)} away · {card.city}
            </span>
          ) : null}
        </div>

        <h3 className={s.name}>
          <span className={s.first}>{name}</span>
          {card ? <span className={s.age}>{card.age}</span> : null}
        </h3>

        {card?.online || seen || identity ? (
          <div className={s.meta}>
            {card?.online ? (
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

        {card ? (
          <StatGroup className={s.stats}>
            <Stat value={card.fame} label="Fame" />
            <Stat value={card.distanceKm < 1 ? '<1' : Math.round(card.distanceKm)} unit="km" label="Away" tone="yolk" />
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
