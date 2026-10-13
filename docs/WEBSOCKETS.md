# WebSocket notifications

Live notifications are delivered over a single socket.io namespace served by the **notification**
service. Other services never touch sockets directly: they POST to internal REST endpoints, and the
notification service fans the event out to the recipient's connected sockets (or queues it for later).

```
producer app (profile, ...)                notification service                 browser
      │                                           │                                │
      │  POST /notify/<type>  (x-internal-key)     │                                │
      ├──────────────────────────────────────────▶│  AppService builds payload     │
      │                                           │  WsGateway.sendToUser()        │
      │                                           │  WsManager → socket.emit(type) ─┼──▶ socket.on(type)
      │                                           │        └─ offline? queue it     │
```

## Namespace & connection

- **Namespace:** `/notification`
- **Transport:** socket.io (clients connect through the gateway, which proxies the upgrade).

### Authentication

The client never sends its own user id. The **gateway** authenticates the JWT and injects a trusted
`x-user-id` header onto the handshake. The notification gateway reads it in `handleConnection`; a
connection with no `x-user-id` is rejected and disconnected immediately.

### Connection lifecycle

- A user may hold **multiple sockets** (several tabs/devices); all of them receive each notification.
- On connect, any **pending** notifications queued while the user was offline are flushed in order.
- On disconnect, only that socket is removed; the user is dropped once their last socket closes.

### Offline queue

If a notification targets a user with no live socket, it is buffered in memory and delivered on their
next connect. The per-user queue is capped by `NOTIFICATION_MAX_PENDING_PER_USER` (default `50`);
once full, the **oldest** entry is dropped to keep the newest.

> **Limitations (current):** the client registry and offline queue are **in memory and per
> instance** — notifications are lost on a service restart, and there is no cross-instance fan-out if
> the notification service is scaled horizontally. For durable history, treat the database as the
> source of truth and fetch unread on connect; the socket is a best-effort live push.

## Event contract

**One socket event per notification type** — the event name is the `NotificationType` value
(`packages/shared-types/src/Notification.ts`). The browser listens per type:

```js
const socket = io('/notification'); // connected through the gateway

socket.on('profile-view', (payload) => {
  // payload: { userId, username, profilePictureUrl } — the viewer
  console.log(`${payload.username} (${payload.userId}) viewed your profile`);
});
```

### Shared payload shapes

Most events carry the **standard payload** (`StdPayload`, `packages/shared-types/src/StdPayload.ts`),
which identifies the user the event is *about* (the viewer, liker, match, …):

```ts
interface IStdPayload {
  userId: string;            // the other user (viewer / liker / match / unmatch)
  username: string;
  profilePictureUrl: string | null;  // never undefined — null when unset
}
```

Chat events carry richer payloads:

```ts
// MessagePayload (extends IStdPayload) — packages/shared-types/src/MessagePayload.ts
interface IMessagePayload extends IStdPayload {
  messageId: string;
  content: string;
  timestamp: number;         // epoch milliseconds
  status: 'sent' | 'delivered' | 'read';  // MessageStatus
  // userId/username/profilePictureUrl identify the SENDER
}

// ChatReadPayload — packages/shared-types/src/ChatReadPayload.ts
interface IChatReadPayload {
  userId: string;            // the reader who just opened the chat
  chatId: string;
}
```

### Types & payloads

| Event name (`NotificationType`) | Trigger endpoint                               | Payload              | Recipient(s)                    | Queued offline?    |
|---------------------------------|------------------------------------------------|----------------------|---------------------------------|--------------------|
| `profile-view`                  | `POST /notify/profile-view`                    | `StdPayload` (viewer)| profile owner                   | yes                |
| `profile-like`                  | `POST /notify/profile-like`                    | `StdPayload` (liker) | liked user                      | yes                |
| `match`                         | `POST /notify/profile-like` (when `matched: true`) | `StdPayload` (the other user) | **both** users      | yes                |
| `unmatch`                       | `POST /notify/profile-unlike`                  | `StdPayload` (the other user) | **both** users          | yes                |
| `message`                       | `POST /chat/message`                           | `MessagePayload`     | message recipient               | yes                |
| `chat-seen`                     | `GET /chat/:chatId` (opening a chat)           | `ChatReadPayload`    | the other participant           | **no** (ephemeral) |

> `match` and `unmatch` are emitted to **both** participants, each receiving the *other* user in the
> payload. `match` is a side effect of `POST /notify/profile-like` when the like completes a mutual
> pair (`matched: true`); it is not a standalone endpoint.

### Message status lifecycle

A chat message carries a `status` that advances as it travels (`MessageStatus`,
`packages/shared-types/src/MessagePayload.ts`):

- **`sent`** — persisted; emitted to the recipient's live socket(s).
- **`delivered`** — reached at least one live socket (the `/chat/message` response's `delivered`
  flag is `true`); the DB row is flipped to `delivered`.
- **`read`** — the recipient opened the conversation (`GET /chat/:chatId`), which marks every
  message in the chat (not sent by the reader, not already read) as `read` and fires `chat-seen` to
  the original sender so their UI flips the ticks live.

`chat-seen` is **ephemeral** (`store = false`): it is *not* queued for an offline recipient, because
on reconnect their `GET /chat/:chatId` history fetch already reflects the read state from the DB.

## Triggering a notification (for producer services)

Internal, service-to-service only — every `/notify/*` route sits behind `InternalKeyGuard`, so callers
must send the `x-internal-key` header (set once via `HttpModule.register` in the caller's module).

```
POST {NOTIFICATION_HOST}:{NOTIFICATION_PORT}/notify/profile-view
x-internal-key: <INTERNAL_KEY>
Content-Type: application/json

{ "recipientId": "<uuid>", "viewerId": "<uuid>" }
```

Response: `{ "delivered": true }` when pushed to a live socket, `false` when queued for an offline
recipient. Reference caller helper: `apps/profile/src/utils/notification.ts`
(`sendProfileViewNotification`), fired fire-and-forget from the profile `GET /:userId` view hook.

The `profile-like`/`match` and `unmatch` events fan out the same way, from
`POST /notify/profile-like` (`matched` flag in the body) and `POST /notify/profile-unlike`.

> **Chat events are client-triggered, not internal.** `message` and `chat-seen` originate from
> **end-user** calls — `POST /chat/message` and `GET /chat/:chatId` — guarded by
> `AuthenticatedUserGuard` (the caller's own JWT), not from the internal `/notify/*` path. The
> notification service owns the chat tables, so it emits these events directly as it persists the
> message / updates read status; no producer service is involved.

To add a new type: add the value (and payload interface) to `NotificationType`, add a DTO in
`apps/notification/src/dto/notify.dto.ts`, a `POST /notify/<type>` route + an `AppService.notify<Type>`
method that builds the payload and calls `WsGateway.sendToUser(recipientId, NotificationType.X, payload)`,
then a caller helper in the producing service. Update the table above.
