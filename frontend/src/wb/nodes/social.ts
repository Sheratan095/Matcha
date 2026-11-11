/** Matches, chat and activity (mocked service, docs/ARCHITECTURE.md §5.1). */
import type { BlockPayload, Card, Match, Message, OkResult, SendMessagePayload, SwipePayload, SwipeResult } from '@/api/types'
import {
  commands,
  derived,
  get,
  input,
  pathVariable,
  selection,
  session,
  trigger,
  type Command,
  type CommandNodes,
  type SpecsFor,
} from './builders'

export interface SocialCommands {
  /** `POST /swipes`: answers a like received (activity page, still mocked). */
  answerLike: Command<SwipePayload, SwipeResult>
  sendMessage: Command<SendMessagePayload, Message>
  /** Payload: the match id. */
  unmatch: Command<string, OkResult>
  block: Command<BlockPayload, OkResult>
  /** `POST /reset`: restores the viewer's demo data. */
  demoReset: Command<void, OkResult>
}

export interface SocialNodes extends CommandNodes<SocialCommands> {
  matchesRefresh: number
  /** Most recent activity first. */
  matches: Match[]
  /** Sum of `unread` over `matches`; 0 while they are not loaded. */
  unreadCount: number
  /** The conversation being read; null when none is open. */
  activeMatchId: string
  chatRefresh: number
  /** Oldest first. Loading them marks them read on the server. */
  chatMessages: Message[]
  /** People who liked the viewer and are not swiped yet. Refreshed by `activityRefresh`. */
  likesReceived: Card[]
  /** A mock person's id to open with `socialProfile`. */
  socialProfileId: string
  socialProfile: Card
}

export const socialNodes = {
  matchesRefresh: selection(),
  matches: get('social', '/matches', [session(), trigger('matchesRefresh')]),
  unreadCount: derived('unreadCount', [input('matches', 'matches')]),
  activeMatchId: selection(),
  chatRefresh: selection(),
  chatMessages: get('social', '/matches/{matchId}/messages', [
    session(),
    pathVariable('activeMatchId', 'matchId'),
    trigger('chatRefresh'),
  ]),
  likesReceived: get('social', '/likes', [session(), trigger('activityRefresh')]),
  socialProfileId: selection(),
  socialProfile: get('social', '/profiles/{userId}', [session(), pathVariable('socialProfileId', 'userId')]),
  ...commands<SocialCommands>({
    answerLike: { method: 'POST', serviceName: 'social', addr: '/swipes', payload: 'body' },
    sendMessage: { method: 'POST', serviceName: 'social', addr: '/messages', payload: 'body' },
    unmatch: {
      method: 'DELETE',
      serviceName: 'social',
      addr: '/matches/{matchId}',
      payload: { pathVariable: 'matchId' },
    },
    block: { method: 'POST', serviceName: 'social', addr: '/blocks', payload: 'body' },
    demoReset: { method: 'POST', serviceName: 'social', addr: '/reset', payload: 'none' },
  }),
} satisfies SpecsFor<SocialNodes>
