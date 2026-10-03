# Profile tester (web UI)

A small browser UI to exercise the **profile** service end-to-end through the API gateway:
login, get/update profile, upload/delete pictures, set the profile picture, list viewers.

It is a zero-dependency Node script (`node:http` + built-in `fetch`/`FormData`). The browser
talks only to this local server; the server holds the JWT cookies (`access_token` /
`refresh_token`) **server-side** and forwards them to the gateway — so it behaves like a real
logged-in user without fighting HTTP-only cookies or the gateway's CORS rules.

## Run

Start the backend first (gateway + auth + profile + db + garage):

```bash
make up              # DB migrations + user/profile seeds run on first container init
make seed-pictures   # upload the sample images into Garage so thumbnails load
```

The user seeds (`testuser` / `alice`) are applied automatically when the postgres container
first initializes. If they aren't there, `make db-reset` wipes volumes and re-runs init +
`seed-pictures` from scratch.

Then launch the tester and open the printed URL (default http://localhost:4100):

```bash
node docs/test/profile/server.mjs
```

It auto-logs in as the seeded `testuser` and loads their profile. Override defaults with env vars:

```bash
GATEWAY_URL=http://localhost:3000 PORT=4100 node docs/test/profile/server.mjs
```

## Credentials

Seeded users (`infra/db/seeds/001_users.sql`), all with password `1234` and verified email:

- `testuser` — has 5 pictures + interests
- `alice` — has 2 pictures + interests

## Notes

- Everything goes through the gateway (`/auth/*`, `/profile/*`), never the profile service directly.
- Picture uploads are limited to 5 per user and re-encoded to WEBP server-side.
- Seeded picture URLs point at Garage's web endpoint; without `make seed-pictures` the files
  don't exist yet, so thumbnails render dimmed (the metadata still works).
