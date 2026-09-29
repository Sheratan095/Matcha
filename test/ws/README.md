# WebSocket tester

Logs in through the gateway and opens the `/notification` WebSocket using the
returned auth cookies — the same flow a browser does, which Postman can't do
automatically for WS requests.

## Run

```bash
cd backend/test/ws
npm install        # first time only, pulls socket.io-client
npm run test:ws
```

## Config (env vars)

| Var           | Default                  | Notes                          |
| ------------- | ------------------------ | ------------------------------ |
| `GATEWAY_URL` | `http://localhost:3000`  | Gateway base URL               |
| `USERNAME`    | `testuser`               | Seeded user (password `1234`)  |
| `PASSWORD`    | `1234`                   |                                |

Example:

```bash
GATEWAY_URL=http://localhost:3000 USERNAME=alice PASSWORD=1234 npm run test:ws
```

A successful run prints `[ws] connected, socket id = ...` and then logs any
event pushed to the socket. A `connect_error` means the handshake was rejected
(bad/expired cookie or auth service down).
