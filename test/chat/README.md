# Chat end-to-end tester

Drives **two** users (defaults `testuser` + `alice`, password `1234`) through the whole chat
flow in one run — logging both in, opening both notification WebSockets, and asserting every
endpoint plus the realtime events and the `sent → delivered → read` transitions.

A conversation needs both sides, so this is a single orchestrating script rather than two
separate clients. For a one-user live socket listener, use `../ws` instead.

## Run

```bash
cd backend/test/chat
npm install        # first time only, pulls socket.io-client
npm run test:chat
```

## Config (env vars)

| Var             | Default                 | Notes                              |
| --------------- | ----------------------- | ---------------------------------- |
| `GATEWAY_URL`   | `http://localhost:3000` | Gateway base URL                   |
| `USER_A`/`PASS_A` | `testuser` / `1234`   | First user (the sender)            |
| `USER_B`/`PASS_B` | `alice` / `1234`      | Second user (the recipient)        |
| `EVENT_TIMEOUT` | `5000`                  | ms to wait for a WS event          |
| `OFFLINE_WAIT`  | `1500`                  | ms to let the server register a disconnect before the offline-send check |

## What it checks

1. Both users log in and resolve distinct ids; A + two B sockets connect.
2. Setup: each likes the other so a **chat** exists (a mutual like creates it).
3. `POST /chat/message` (A→B) → 200, delivered live to **both of B's devices** (multi-device fan-out).
4. `GET /chat` lists the conversation with its `chatId` and last-message preview.
5. `GET /chat/:chatId` as A shows A's message **`delivered`** (B online); as B returns the history, flips it to **`read`**, and **A receives `chat-seen`**.
6. **Burst ordering** — 5 rapid messages come back in send order.
7. **Validation → 400** — empty / >1000-char / missing `toUserId` / non-UUID `toUserId`.
8. **Auth → 401** — the three chat endpoints with no cookie.
9. **Negatives** — self → 400, non-match → 403, foreign chat → 403.
10. **Offline → reconnect** — send while B is disconnected reports not-delivered-live, the message is **queued and pushed on reconnect**, and is present in history.
11. **Teardown** — **unlike** and **block** each dissolve the chat (history/send → 403, conversation drops off the list); unblock restores a clean state.
12. **Informational** — whether logout closes A's live socket.

Exit code is `0` when all checks pass, `1` otherwise (CI-friendly). The logout probe is informational (an `INFO` line), not a pass/fail.

## Prerequisites

- Gateway + notification + profile + Postgres running, with migrations applied (incl.
  `007_messages.sql`) and the two users seeded.
- **The two users must be able to match.** Liking requires the liker to have a profile picture,
  so if the setup step logs `like … 403`, seed a picture for each user first (e.g. via the
  profile tester) — otherwise no chat exists and the chat checks will fail.
```
