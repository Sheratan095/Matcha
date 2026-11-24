/**
 * The shared profile sheet (deck, search, map, matches, chat, activity). A bottom sheet on phones, a
 * dialog from 640px (kit `Modal`).
 *
 * - It loads `apiProfile` (`actions.showApiProfile`): age, distance, fame, presence and the like
 *   relation; shared interests are worked out against your own profile. Opening a profile records a
 *   profile view on the backend. Without an `actions` slot the sheet offers like / unlike itself (a like
 *   that makes a match plays the app's match moment), and its menu reports a fake account or blocks
 *   (subject IV.5).
 * - `preview` shows at once while the full profile loads.
 * - Closing calls `onClose` and `actions.closeProfile()` (also when the caller sets `target` to null).
 */
import { useEffect, useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ApiError, OtherProfile, Profile, ProfileRelation } from '@/api/types'
import { useT } from '@/i18n'
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
import { actions, celebrateMatch, LOCAL_ERROR, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { displayName, distanceText, identityText, lastSeenText, mainPicture, orderedPictures, serialOf } from './format'
import { PhotoCarousel } from './PhotoCarousel'
import s from './ProfileSheet.module.css'

/** Which profile to show. */
export interface ProfileTarget {
  userId: string
  /** Already-known data to show immediately while the full profile loads. */
  preview?: OtherProfile
}

export interface ProfileSheetProps {
  /** null = closed. */
  target: ProfileTarget | null
  onClose: () => void
  /**
   * Controls rendered at the bottom of the sheet (like / pass / message...). Without them the sheet
   * shows its own like / unlike button.
   */
  actions?: ReactNode
  /** Called once the person has been blocked (the sheet then closes itself through `onClose`). */
  onBlocked?: (userId: string) => void
  /** Hide the built-in "Block" menu. Default false. */
  hideMenu?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function ProfileSheet({ target, onClose, actions: slot, onBlocked, hideMenu }: ProfileSheetProps) {
  const t = useT()
  const open = target !== null
  const key = target?.userId ?? null

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

  const api = useNodeValue('apiProfile')
  const status = useNodeStatus('apiProfile')
  const me = useNodeValue('myProfile')
  const aboutId = useId()
  const interestsId = useId()

  useEffect(() => {
    if (!key) return
    let live = true
    actions.showApiProfile(key).catch((error: unknown) => {
      const apiError = toApiError(error)
      // DROPPED: the sheet closed, or moved on to someone else, while it loaded (a StrictMode re-run
      // joins the request already on its way instead)
      if (live && apiError.code !== LOCAL_ERROR.DROPPED) setFailure({ key, error: apiError })
    })
    return () => {
      live = false
      actions.closeProfile()
    }
  }, [key, retry])

  // ---------------------------------------------------------------- what to show
  const loaded: OtherProfile | null = shown && api?.userId === shown.userId ? api : null
  const preview = shown?.preview?.userId === shown?.userId ? shown?.preview : undefined
  // Memoized on purpose: the spread builds a NEW object, and `merged !== kept` below sets state
  // during render. A fresh object on every render would make that check true forever
  // ("Too many re-renders") as soon as the full profile arrives on top of a preview.
  const merged: OtherProfile | null = useMemo(
    () => (loaded ? (preview ? { ...preview, ...loaded } : loaded) : (preview ?? null)),
    [loaded, preview],
  )

  const [kept, setKept] = useState<OtherProfile | null>(merged)
  if (open && merged && merged !== kept) setKept(merged)
  const data = open ? merged : kept

  // the action's rejection says it failed; the node status only fills in a missing message
  const failed = open && !loaded && failure?.key === key
  const failureMessage = (failure?.key === key ? failure.error.message : status.error?.message) ?? t('check.profileNotLoaded')
  const loading = open && !loaded && !failed

  const close = () => {
    onClose()
    actions.closeProfile()
  }

  const name = data ? displayName(data) : t('prof.profile')
  const isMe = !!data && !!me && data.userId === me.userId
  const baseRelation = data?.relation ?? null
  const relation = data && relationOverride?.userId === data.userId ? relationOverride.relation : baseRelation

  const confirmBlock = async () => {
    if (!data || blocking) return
    const userId = data.userId
    setBlocking(true)
    setBlockError(null)
    try {
      await actions.blockUser(userId)
      setConfirming(false)
      toast.show({ tone: 'ink', title: t('chat.blockedTitle', { name }), message: t('prof.blockedMessage') })
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
      toast.show({ tone: 'ink', title: t('prof.reportedTitle', { name }), message: t('prof.reportedMessage') })
    } catch (error) {
      toast.show({ tone: 'strawberry', title: t('prof.notReported'), message: toApiError(error).message })
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
        toast.show({ tone: 'ink', title: relation.matched ? t('prof.noLongerConnected', { name }) : t('prof.tookBack') })
      } else {
        const outcome = await actions.likeUser(userId, 'like')
        const matched = outcome.matched || relation.likesYou
        setRelationOverride({ userId, relation: { liked: true, likesYou: relation.likesYou, matched } })
        if (matched) {
          celebrateMatch({
            userId,
            name: data.firstName?.trim() || data.username || null,
            photo: mainPicture(data)?.url ?? null,
            theyLikedFirst: relation.likesYou,
          })
        } else {
          toast.show({ tone: 'strawberry', title: t('act.youLiked', { name }) })
        }
      }
    } catch (error) {
      toast.show({ tone: 'strawberry', title: t('deck.didNotWork'), message: toApiError(error).message })
    } finally {
      setLiking(false)
    }
  }

  const footer =
    slot ??
    (relation && !isMe && data ? (
      <div className={s.relationActions}>
        <ActionButton
          kind={relation.liked ? 'pass' : 'like'}
          size="lg"
          label={
            relation.liked
              ? relation.matched
                ? t('prof.disconnect', { name })
                : t('prof.takeBack', { name })
              : t('deck.likeName', { name })
          }
          disabled={liking}
          aria-busy={liking || undefined}
          onClick={() => void toggleLike()}
        />
        <Label tone="muted">
          {relation.liked
            ? relation.matched
              ? t('prof.hintConnected')
              : t('prof.hintLiked')
            : relation.likesYou
              ? t('prof.hintLikesYou')
              : t('prof.hintLike')}
        </Label>
      </div>
    ) : undefined)

  const menuItems = [
    {
      label: t('prof.report'),
      icon: <IconFlag size={18} />,
      onSelect: () => void report(),
    },
    {
      label: t('prof.blockName', { name }),
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
      <Modal open={open} onClose={close} title={t('prof.sheetTitle', { name })} hideTitle bleed size="md" footer={footer}>
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
                <Menu label={t('prof.moreFor', { name })} align="start" items={menuItems} />
              )
            }
            aboutId={aboutId}
            interestsId={interestsId}
          />
        ) : failed ? (
          <div className={s.state}>
            <Notice
              tone="error"
              title={t('prof.loadFailedTitle')}
              action={
                <Button
                  size="sm"
                  variant="paper"
                  onClick={() => {
                    setFailure(null)
                    setRetry((n) => n + 1)
                  }}
                >
                  {t('chat.retry')}
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
        title={t('chat.blockTitle', { name })}
        kicker={t('prof.blockKicker')}
        variant="dialog"
        size="sm"
        footer={
          <>
            <Button variant="paper" onClick={() => setConfirming(false)} disabled={blocking}>
              {t('kit.cancel')}
            </Button>
            <Button variant="strawberry" icon={<IconBlock size={18} />} loading={blocking} onClick={() => void confirmBlock()}>
              {t('chat.block')}
            </Button>
          </>
        }
      >
        <Stack gap={3}>
          <Text>{t('prof.blockBody', { name })}</Text>
          <FormError error={blockError} title={t('prof.notBlocked')} />
        </Stack>
      </Modal>
    </>
  )
}

interface ProfileBodyProps {
  data: OtherProfile
  relation: ProfileRelation | null
  me: Profile | null
  loading: boolean
  failed: string | null
  onRetry: () => void
  menu: ReactNode
  aboutId: string
  interestsId: string
}

/** What the sheet prints about someone. */
function factsOf(data: OtherProfile, relation: ProfileRelation | null) {
  return {
    age: data.age ?? null,
    distanceKm: data.distanceKm ?? null,
    fame: data.fameRating ?? null,
    online: data.isOnline ?? null,
    lastSeen: data.lastSeen ?? null,
    likesYou: relation?.likesYou === true,
    matched: relation?.matched === true,
  }
}

function ProfileBody({ data, relation, me, loading, failed, onRetry, menu, aboutId, interestsId }: ProfileBodyProps) {
  const t = useT()
  const facts = factsOf(data, relation)
  const name = displayName(data)
  const interests = data.interests.map((tag) => tag.name)
  const mine = new Set((me?.interests ?? []).map((tag) => tag.name))
  const common = me && me.userId !== data.userId ? interests.filter((tag) => mine.has(tag)) : []
  const ordered = [...common, ...interests.filter((tag) => !common.includes(tag))]
  const identity = identityText(data)
  const seen = facts.online === false ? (lastSeenText(facts.lastSeen) ?? t('prof.offline')) : null
  const bio = data.biography?.trim()
  const username = data.username

  return (
    <article className={s.profile} aria-busy={loading || undefined}>
      <PhotoCarousel key={data.userId} photos={orderedPictures(data)} name={name} seed={data.userId}>
        {menu ? <div className={s.menu}>{menu}</div> : null}
        {facts.matched ? (
          <Sticker tone="matcha" shape="burst" size="86px" rotate={12} className={s.likes}>
            {t.stack('prof.connectedSticker')}
          </Sticker>
        ) : facts.likesYou ? (
          <Sticker tone="yolk" shape="burst" size="86px" rotate={12} className={s.likes}>
            {t.stack('kit.likesYou')}
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
              {t('search.away', { distance: distanceText(facts.distanceKm) })}
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
                {t('prof.onlineNow')}
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
            <Stat value={Math.round(facts.fame)} label={t('prof.statFame')} />
            {facts.distanceKm != null ? (
              <Stat value={facts.distanceKm < 1 ? '<1' : Math.round(facts.distanceKm)} unit="km" label={t('prof.statAway')} tone="yolk" />
            ) : null}
            <Stat value={pad(common.length)} label={t('prof.statShared')} tone="strawberry" />
          </StatGroup>
        ) : null}

        {loading ? (
          <div className={s.loading} role="status">
            <Spinner size={18} label="" />
            <Label tone="muted">{t('prof.loadingFull')}</Label>
          </div>
        ) : null}
        {failed ? (
          <Notice
            tone="error"
            title={t('prof.partialTitle')}
            action={
              <Button size="sm" variant="paper" onClick={onRetry}>
                {t('chat.retry')}
              </Button>
            }
          >
            {failed}
          </Notice>
        ) : null}

        <section className={s.section} aria-labelledby={aboutId}>
          <TicketHeader label={<span id={aboutId}>{t('prof.about', { name })}</span>} />
          {bio ? (
            <Text className={s.bio}>{bio}</Text>
          ) : (
            <Text muted size="sm">
              {loading ? '…' : t('prof.noBio', { name })}
            </Text>
          )}
        </section>

        <section className={s.section} aria-labelledby={interestsId}>
          <TicketHeader
            label={<span id={interestsId}>{t('prof.interests')}</span>}
            meta={common.length > 0 ? t('prof.inCommon', { n: pad(common.length) }) : ordered.length > 0 ? pad(ordered.length) : null}
          />
          {ordered.length > 0 ? (
            <ul className={s.tags}>
              {ordered.map((tag) => {
                const shared = common.includes(tag)
                return (
                  <li key={tag}>
                    <Chip size="md" tone={shared ? 'matcha' : 'paper'}>
                      #{tag}
                      {shared ? <span className="sr-only">{t('prof.inCommonSr')}</span> : null}
                    </Chip>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Text muted size="sm">
              {t('prof.noInterests')}
            </Text>
          )}
        </section>
      </div>
    </article>
  )
}

function ProfileSkeleton() {
  const t = useT()
  return (
    <div className={s.profile} role="status" aria-label={t('prof.loadingProfile')}>
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
