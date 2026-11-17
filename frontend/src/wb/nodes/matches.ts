/**
 * Connections, likes received and chat (docs/ARCHITECTURE.md §4.5): the profile service
 * (`GET /profile/matches`, `GET /profile/likes`) and the notification service's chat
 * (`/chat*`), both behind the gateway.
 *
 * A conversation is addressed by the other person's user id: the backend lists a chat, and so gives
 * its id, only once it holds a message, so a fresh connection has no chat id yet.
 *
 * The open thread is fetched whole once, then only what is new (`GET /chat/{chatId}?after=<epoch ms>`):
 * `chatHistory` holds the last answer, whole or partial, and `chatThread` the merged conversation
 * (src/wb/actions.ts `watchChat`). Writing `chatAfter` is what fetches: null for the whole history, the
 * newest timestamp held for the delta.
 */
import type {
  ChatHistoryResult,
  ChatListResult,
  ChatSeenResult,
  ConnectionsResult,
  LikersResult,
  Match,
  Message,
  SendMessagePayload,
  SendMessageResult,
} from '@/api/types'
import {
  commands,
  derived,
  get,
  input,
  pathVariable,
  queryParameter,
  selection,
  session,
  trigger,
  type Command,
  type CommandNodes,
  type SpecsFor,
} from './builders'

export interface ChatCommands {
  /** `POST /chat/message`: 403 unless you are connected. */
  chatSend: Command<SendMessagePayload, SendMessageResult>
  /** Payload: the chat id. Marks their messages read and tells them (`chat-seen`). */
  chatSeen: Command<string, ChatSeenResult>
}

export interface MatchesNodes extends CommandNodes<ChatCommands> {
  connectionsRefresh: number
  /** `GET /profile/matches`: everyone you are connected to (mutual like). */
  connections: ConnectionsResult
  chatListRefresh: number
  /** `GET /chat`: the conversations that have at least one message. */
  chatList: ChatListResult
  /** Per user id: messages from them that arrived over the socket since their chat was last opened. */
  unreadByUser: Record<string, number>
  /** `connections` with their conversation; null while `connections` is not loaded. */
  matches: Match[]
  /** Sum of `unread` over `matches`; 0 while they are not loaded. */
  unreadCount: number
  /** The other person of the open conversation; null when none is open. */
  activeChatUserId: string
  /** The open conversation's chat id; null when none is open or it has no message yet. */
  activeChatId: string
  /** `?after=` of the next `chatHistory` request (epoch ms); null for the whole history. Each write fetches. */
  chatAfter: number
  /** `GET /chat/{chatId}[?after=]`, oldest first: the last answer, whole or only the newer messages. A pure read. */
  chatHistory: ChatHistoryResult
  /** The open conversation, whole, merged from `chatHistory`'s answers; null while none is loaded. */
  chatThread: ChatHistoryResult
  /** `chatThread` as the thread draws it. */
  chatMessages: Message[]
  likesRefresh: number
  /** `GET /profile/likes`: people who liked you and whom you have not liked back. */
  likesReceived: LikersResult
}

export const matchesNodes = {
  connectionsRefresh: selection(),
  connections: get('api', '/profile/matches', [session(), trigger('connectionsRefresh')]),
  chatListRefresh: selection(),
  chatList: get('api', '/chat', [session(), trigger('chatListRefresh')]),
  unreadByUser: selection({}),
  matches: derived('matches', [
    input('connections', 'connections'),
    input('chatList', 'chats'),
    input('unreadByUser', 'unread'),
  ]),
  unreadCount: derived('unreadCount', [input('matches', 'matches')]),
  activeChatUserId: selection(),
  activeChatId: selection(),
  chatAfter: selection(),
  chatHistory: get('api', '/chat/{chatId}', [
    session(),
    pathVariable('activeChatId', 'chatId'),
    queryParameter('chatAfter', 'after', { optional: true, inPlace: true }),
  ]),
  chatThread: selection(),
  chatMessages: derived('chatMessages', [input('chatThread', 'history')]),
  likesRefresh: selection(),
  likesReceived: get('api', '/profile/likes', [session(), trigger('likesRefresh')]),
  ...commands<ChatCommands>({
    chatSend: { method: 'POST', serviceName: 'api', addr: '/chat/message', payload: 'body' },
    chatSeen: {
      method: 'POST',
      serviceName: 'api',
      addr: '/chat/{chatId}/seen',
      payload: { pathVariable: 'chatId' },
    },
  }),
} satisfies SpecsFor<MatchesNodes>
