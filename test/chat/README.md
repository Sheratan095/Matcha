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

## What it checks

1. Both users log in and resolve distinct ids; both sockets connect.
2. Setup: each likes the other so a **chat** exists (a mutual like creates it).
3. `POST /chat/message` (A→B) returns 200, **B receives `message` live**.
4. `GET /chat` lists the conversation with its `chatId` and last-message preview.
5. `GET /chat/:chatId` as A shows A's message as **`delivered`** (B was online).
6. `GET /chat/:chatId` as B returns the history, flips A's message to **`read`**, and **A receives `chat-seen`**.
7. Negative cases: message to self → **400**, to a non-match → **403**, history of a foreign chat → **403**.

Exit code is `0` when all checks pass, `1` otherwise (CI-friendly).

## Prerequisites

- Gateway + notification + profile + Postgres running, with migrations applied (incl.
  `007_messages.sql`) and the two users seeded.
- **The two users must be able to match.** Liking requires the liker to have a profile picture,
  so if the setup step logs `like … 403`, seed a picture for each user first (e.g. via the
  profile tester) — otherwise no chat exists and the chat checks will fail.
```
