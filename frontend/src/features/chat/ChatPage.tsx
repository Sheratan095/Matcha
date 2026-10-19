/**
 * `/chat/:matchId`: one conversation, full screen (no app shell).
 *
 * Opens the conversation on enter (`actions.openChat`, which also marks it read) and closes it on
 * leave. New messages arrive through realtime refreshes of `chatMessages`; messages typed here are
 * drawn at once (sending / failed with retry) and handed over to the server copy without redrawing.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { ApiError, Match, Message } from '@/api/types'
import ProfileSheet, { type ProfileTarget } from '@/features/profile/ProfileSheet'
import {
  Avatar,
  Button,
  ButtonLink,
  ChatBubble,
  ChatComposer,
  ChatThread,
  cx,
  DayDivider,
  EmptyState,
  IconBlock,
  IconChevronDown,
  IconRefresh,
  IconTrash,
  IconUser,
  Menu,
  Notice,
  PageHeader,
  Screen,
  Skeleton,
  toast,
  TypingIndicator,
} from '@/ui'
import { actions, getNodeValue, LOCAL_ERROR, MAX_MESSAGE_LENGTH, toApiError, useNodeStatus, useNodeValue } from '@/wb'
import { useNow } from './hooks'
import { LeaveDialog, type LeaveKind } from './LeaveDialog'
import { MatchIntro } from './MatchIntro'
import { firstNameOf, mainPicture } from './people'
import { presenceLabel } from './time'
import { buildTimeline, type PendingMessage } from './timeline'
import { usePartnerTyping, useStickToBottom } from './useChatView'
import s from './ChatPage.module.css'

export default function ChatPage() {
  const { matchId = '' } = useParams()
  // One screen per conversation: drafts in progress, pending messages and scroll state never leak.
  return <ChatScreen key={matchId} matchId={matchId} />
}

/** Unsent drafts, per conversation, for this tab's lifetime. */
const drafts = new Map<string, string>()
let localSeq = 0
/** Ids of messages typed here; unique across remounts and hot reloads. */
function newLocalId(): string {
  localSeq += 1
  return `local-${Date.now().toString(36)}-${localSeq}`
}

/**
 * Leaving a conversation closes it one tick later, unless the same conversation opens again at
 * once (StrictMode's remount, a retry): closing and reopening would drop the request in flight.
 */
let closing: { matchId: string; timer: number } | null = null

/** Keeps the last non-null value (a refresh that fails must not blank what is on screen). */
function useLastKnown<T>(value: T | null | undefined): T | null {
  const [kept, setKept] = useState<T | null>(value ?? null)
  if (value != null && value !== kept) setKept(value)
  return value ?? kept
}

function isNotFound(error: ApiError | null | undefined): boolean {
  return error?.status === 404 || error?.code === LOCAL_ERROR.INVALID
}

function ChatScreen({ matchId }: { matchId: string }) {
  const navigate = useNavigate()
  const now = useNow(30_000)

  const matches = useNodeValue('matches')
  const matchesStatus = useNodeStatus('matches')
  const activeMatchId = useNodeValue('activeMatchId')
  const chatMessages = useNodeValue('chatMessages')
  const chatStatus = useNodeStatus('chatMessages')
  const myProfile = useNodeValue('myProfile')
  const myId = useNodeValue('sessionUserId')

  // ------------------------------------------------------------ open / close
  const [attempt, setAttempt] = useState(0)
  const [openFailure, setOpenFailure] = useState<{ attempt: number; error: ApiError } | null>(null)
  useEffect(() => {
    if (closing?.matchId === matchId) {
      window.clearTimeout(closing.timer)
      closing = null
    }
    let live = true
    actions.openChat(matchId).catch((error: unknown) => {
      if (live) setOpenFailure({ attempt, error: toApiError(error) })
    })
    return () => {
      live = false
      const timer = window.setTimeout(() => {
        if (closing?.timer === timer) closing = null
        // Another conversation may have opened meanwhile: only close this one.
        if (getNodeValue('activeMatchId') === matchId) actions.closeChat()
      }, 0)
      closing = { matchId, timer }
    }
  }, [matchId, attempt])
  const openError = openFailure?.attempt === attempt ? openFailure.error : null

  // ------------------------------------------------------------ the match and its messages
  // While unmatching / blocking, the screen keeps what it showed until it navigates away.
  const [frozen, setFrozen] = useState<{ match: Match; messages: Message[] } | null>(null)
  const listed = Array.isArray(matches) ? (matches.find((match) => match.id === matchId) ?? null) : undefined
  const keptMatch = useLastKnown(listed)
  const match = frozen?.match ?? (listed === null ? null : keptMatch)

  // Memoised: a new array on every render would never settle `useLastKnown`.
  const liveMessages = useMemo(
    () =>
      activeMatchId === matchId && Array.isArray(chatMessages)
        ? chatMessages.filter((message) => message.matchId === matchId)
        : null,
    [activeMatchId, chatMessages, matchId],
  )
  const keptMessages = useLastKnown(liveMessages)
  const messages = frozen?.messages ?? keptMessages

  const notFound =
    !frozen &&
    (isNotFound(openError) || (chatStatus.status === 'error' && isNotFound(chatStatus.error)) || listed === null)
  const loadError = !notFound && !messages ? (openError ?? (chatStatus.status === 'error' ? chatStatus.error : null)) : null
  const matchesError = !match && !notFound && matchesStatus.status === 'error' ? matchesStatus.error : null

  const partnerId = match?.profile.userId ?? null
  const name = firstNameOf(match?.profile, 'Your match')
  const me = {
    name: firstNameOf(myProfile, 'You'),
    photo: mainPicture(myProfile),
    seed: myId ?? 'me',
  }

  // ------------------------------------------------------------ pending messages
  const [pending, setPending] = useState<PendingMessage[]>([])
  const [keyFor, setKeyFor] = useState<ReadonlyMap<string, string>>(() => new Map())

  const timeline = buildTimeline(messages ?? [], pending, partnerId ?? '', now, keyFor)
  const typing = usePartnerTyping(matchId, partnerId, timeline.theirIds)

  const deliver = useCallback(
    (localId: string, text: string) => {
      actions.sendMessage(matchId, text).then(
        (message) => {
          setKeyFor((current) => new Map(current).set(message.id, localId))
          setPending((current) => current.filter((item) => item.localId !== localId))
        },
        (error: unknown) => {
          const problem = toApiError(error)
          setPending((current) =>
            current.map((item) => (item.localId === localId ? { ...item, status: 'failed', error: problem.message } : item)),
          )
        },
      )
    },
    [matchId],
  )

  // ------------------------------------------------------------ scrolling
  const contentRef = useRef<HTMLDivElement>(null)
  const { pinned, scrollToBottom } = useStickToBottom(contentRef)
  const [unseen, setUnseen] = useState(0)
  const theirCount = timeline.theirIds.length
  const [seenCount, setSeenCount] = useState(theirCount)
  if (theirCount !== seenCount) {
    // New messages from them while the reader is scrolled up: offer the jump instead of moving.
    if (theirCount > seenCount && !pinned) setUnseen(unseen + (theirCount - seenCount))
    setSeenCount(theirCount)
  }
  if (pinned && unseen !== 0) setUnseen(0)

  // ------------------------------------------------------------ composer
  const [draft, setDraftState] = useState(() => drafts.get(matchId) ?? '')
  const setDraft = (value: string) => {
    if (value) drafts.set(matchId, value)
    else drafts.delete(matchId)
    setDraftState(value)
  }
  const composerRef = useRef<HTMLDivElement>(null)
  const focusComposer = () => {
    const box = composerRef.current?.querySelector('textarea')
    if (!box) return
    box.focus()
    box.setSelectionRange(box.value.length, box.value.length)
  }

  const canWrite = match != null && !frozen && !notFound
  // On desktop, land in the message box once the conversation is there (not on phones: no keyboard pop-up).
  const focusedOnce = useRef(false)
  useEffect(() => {
    if (!canWrite || messages == null || focusedOnce.current) return
    focusedOnce.current = true
    if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) focusComposer()
  }, [canWrite, messages])

  const send = (text: string) => {
    if (!canWrite) return
    const id = newLocalId()
    const known = new Set((messages ?? []).map((message) => message.id))
    setPending((current) => [...current, { localId: id, text, status: 'sending', createdAt: Date.now(), known, error: null }])
    setDraft('')
    scrollToBottom()
    deliver(id, text)
  }

  const retry = (localId: string) => {
    const item = pending.find((candidate) => candidate.localId === localId)
    if (!item) return
    const known = new Set((messages ?? []).map((message) => message.id))
    setPending((current) =>
      current.map((candidate) =>
        candidate.localId === localId ? { ...candidate, status: 'sending', error: null, known, createdAt: Date.now() } : candidate,
      ),
    )
    scrollToBottom()
    deliver(localId, item.text)
  }

  const discard = (localId: string) => setPending((current) => current.filter((item) => item.localId !== localId))

  const insertIcebreaker = (text: string) => {
    setDraft(text)
    requestAnimationFrame(focusComposer)
  }

  // ------------------------------------------------------------ profile sheet, unmatch, block
  const [profileOpen, setProfileOpen] = useState(false)
  const profileTarget: ProfileTarget | null =
    profileOpen && match ? { userId: match.profile.userId, source: 'social', preview: match.profile } : null

  const [leaveKind, setLeaveKind] = useState<LeaveKind | null>(null)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [leaveError, setLeaveError] = useState<ApiError | null>(null)
  const askLeave = (kind: LeaveKind) => {
    setLeaveError(null)
    setLeaveKind(kind)
  }
  const confirmLeave = (kind: LeaveKind, reason?: string) => {
    if (!match || leaveBusy) return
    setLeaveBusy(true)
    setLeaveError(null)
    setFrozen({ match, messages: messages ?? [] })
    const done = kind === 'unmatch' ? actions.unmatch(match.id) : actions.block(match.profile.userId, reason)
    done.then(
      () => {
        drafts.delete(matchId)
        toast.show({
          tone: 'ink',
          title: kind === 'block' ? `${name} is blocked` : `You unmatched ${name}`,
          message: kind === 'block' ? 'They will not see you or message you again.' : undefined,
        })
        navigate('/matches', { replace: true })
      },
      (error: unknown) => {
        setFrozen(null)
        setLeaveBusy(false)
        setLeaveError(toApiError(error))
      },
    )
  }

  // ------------------------------------------------------------ render
  const presence = match ? (typing ? 'Typing…' : presenceLabel(match.profile.online, match.profile.lastSeen, now)) : ''
  const header = (
    <PageHeader
      size="compact"
      back="/matches"
      backLabel="Back to matches"
      title={
        match ? (
          <button type="button" className={s.who} onClick={() => setProfileOpen(true)}>
            <Avatar src={mainPicture(match.profile)} name={name} size="sm" online={match.profile.online} decorative />
            <span className={s.whoText}>
              <span className={s.whoName}>{name}</span>
              <span className={cx(s.whoPresence, (typing || match.profile.online) && s.whoLive)} aria-hidden={typing || undefined}>
                {presence}
              </span>
            </span>
            <span className="sr-only">: view profile</span>
          </button>
        ) : notFound ? (
          'Conversation'
        ) : (
          <span className={s.whoSkeleton} aria-label="Loading">
            <Skeleton shape="circle" width={36} height={36} />
            <Skeleton shape="text" width={120} height={18} />
          </span>
        )
      }
      actions={
        match && !notFound ? (
          <Menu
            label="Conversation options"
            items={[
              { label: 'View profile', icon: <IconUser size={20} />, onSelect: () => setProfileOpen(true) },
              { label: 'Unmatch', icon: <IconTrash size={20} />, tone: 'danger', onSelect: () => askLeave('unmatch') },
              { label: 'Block', icon: <IconBlock size={20} />, tone: 'danger', onSelect: () => askLeave('block') },
            ]}
          />
        ) : null
      }
    />
  )

  if (notFound) {
    return (
      <Screen header={header} poster="Chat">
        <div className={s.notFound}>
          <EmptyState
            stamp="Gone cold"
            stampTone="ink"
            title="This conversation has left the pot"
            action={
              <ButtonLink to="/matches" size="lg">
                Back to matches
              </ButtonLink>
            }
          >
            The match may have ended, or the link is not quite right. Your other conversations are where you left them.
          </EmptyState>
        </div>
      </Screen>
    )
  }

  const footer = (
    <div ref={composerRef} className={s.footer}>
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={send}
        maxLength={MAX_MESSAGE_LENGTH}
        disabled={!canWrite}
        label={match ? `Message ${name}` : 'Message'}
        placeholder={match ? `Message ${name}…` : 'Write something nice…'}
      />
    </div>
  )

  const ready = match != null && messages != null
  const empty = ready && timeline.items.length === 0
  const showJump = !pinned && unseen > 0

  return (
    <Screen header={header} footer={footer} poster={match ? name : 'Chat'}>
      <div ref={contentRef} className={s.content}>
        {ready ? (
          <>
            <div className={s.conversation}>
            <MatchIntro match={match} me={me} now={now} empty={empty} onIcebreaker={insertIcebreaker} />
            <ChatThread label={`Conversation with ${name}`}>
              {timeline.items.map((item) =>
                item.kind === 'day' ? (
                  <DayDivider key={item.key}>{item.label}</DayDivider>
                ) : (
                  <Fragment key={item.key}>
                    <ChatBubble side={item.side} position={item.position} time={item.time} status={item.status}>
                      {item.text}
                    </ChatBubble>
                    {item.status === 'failed' && item.pendingId ? (
                      <FailedActions
                        error={pending.find((candidate) => candidate.localId === item.pendingId)?.error ?? null}
                        onRetry={() => retry(item.pendingId as string)}
                        onDiscard={() => discard(item.pendingId as string)}
                      />
                    ) : null}
                  </Fragment>
                ),
              )}
              {typing ? <TypingIndicator name={name} /> : null}
            </ChatThread>
            </div>
            {chatStatus.status === 'error' && !isNotFound(chatStatus.error) ? (
              <div className={s.inlineNotice}>
                <Notice
                  tone="warning"
                  title="Not up to date"
                  action={
                    <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} onClick={() => setAttempt((n) => n + 1)}>
                      Reload
                    </Button>
                  }
                >
                  The latest messages could not be loaded.
                </Notice>
              </div>
            ) : null}
          </>
        ) : loadError || matchesError ? (
          <div className={s.loadError}>
            <Notice
              tone="error"
              title="The conversation did not load"
              action={
                <Button size="sm" variant="ink" icon={<IconRefresh size={16} />} onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
              }
            >
              {(loadError ?? matchesError)?.message ?? 'Something went wrong.'}
            </Notice>
          </div>
        ) : (
          <ThreadSkeleton />
        )}

        <div className={s.jumpDock}>
          {showJump ? (
            <button
              type="button"
              className={s.jump}
              onClick={() => {
                scrollToBottom(true)
                // The button goes away: keep keyboard focus in the conversation rather than losing it.
                contentRef.current?.closest('main')?.focus({ preventScroll: true })
              }}
            >
              <IconChevronDown size={18} strokeWidth={3} />
              {unseen === 1 ? '1 new message' : `${unseen} new messages`}
            </button>
          ) : null}
        </div>
      </div>

      <LeaveDialog
        kind={leaveKind}
        name={name}
        busy={leaveBusy}
        error={leaveError}
        onCancel={() => setLeaveKind(null)}
        onConfirm={confirmLeave}
      />
      <ProfileSheet target={profileTarget} onClose={() => setProfileOpen(false)} />
    </Screen>
  )
}

function FailedActions({ error, onRetry, onDiscard }: { error: string | null; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className={s.failed}>
      {error ? <span className={s.failedWhy}>{error}</span> : null}
      <Button size="sm" variant="paper" icon={<IconRefresh size={16} />} onClick={onRetry}>
        Retry
      </Button>
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        Delete
      </Button>
    </div>
  )
}

function ThreadSkeleton() {
  return (
    <div className={s.skeleton} aria-busy="true" aria-label="Loading the conversation">
      <Skeleton width="58%" height={44} style={{ borderRadius: 18 }} />
      <Skeleton width="42%" height={44} style={{ borderRadius: 18 }} />
      <Skeleton width="64%" height={64} style={{ borderRadius: 18, alignSelf: 'flex-end' }} />
      <Skeleton width="36%" height={44} style={{ borderRadius: 18 }} />
      <Skeleton width="50%" height={44} style={{ borderRadius: 18, alignSelf: 'flex-end' }} />
    </div>
  )
}
