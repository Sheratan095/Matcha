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
  // payload: { viewerId: string, createdAt: string }
  console.log(`${payload.viewerId} viewed your profile at ${payload.createdAt}`);
});
```

### Types & payloads

| Event name (`NotificationType`) | Trigger endpoint            | Payload                               | Status    |
|---------------------------------|-----------------------------|---------------------------------------|-----------|
| `profile-view`                  | `POST /notify/profile-view` | `{ viewerId: string, createdAt: string }` | **shipped** |
| `like`                          | —                           | TBD                                   | planned   |
| `match`                         | —                           | TBD                                   | planned   |
| `message`                       | —                           | TBD                                   | planned   |
| `unlike`                        | —                           | TBD                                   | planned   |

Planned types exist in the `NotificationType` enum but have **no endpoint or producer yet**; they
ship as their features land.

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

To add a new type: add the value (and payload interface) to `NotificationType`, add a DTO in
`apps/notification/src/dto/notify.dto.ts`, a `POST /notify/<type>` route + an `AppService.notify<Type>`
method that builds the payload and calls `WsGateway.sendToUser(recipientId, NotificationType.X, payload)`,
then a caller helper in the producing service. Update the table above.
