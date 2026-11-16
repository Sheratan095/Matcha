# SMTP Setup

Matcha sends two kinds of email: the **verification code** at sign-up and the **password-reset code**. Both go out from the **notification** service through [`nodemailer`](https://nodemailer.com/) (`backend/apps/notification/src/mail/mailer.service.ts`). The auth service only asks notification to send; it never talks to SMTP itself.

---

## Environment variables

All of them live in `backend/.env` (validated by `backend/packages/config/src/env.ts`).

| Variable | Default | Notes |
|----------|---------|-------|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | Must be a **STARTTLS** port. `465` (implicit TLS) does **not** work: the mailer hardcodes `secure: false` |
| `SMTP_USER` | *(required)* | Login **and** the `From` address (`"Matcha" <SMTP_USER>`) |
| `SMTP_PASS` | *(required)* | Login password. With Gmail this is an **App Password**, not the account password |

`SMTP_USER` and `SMTP_PASS` have no default: if either is empty the notification service **exits at startup** with `❌ Invalid environment variables`.

Related knobs (sensible defaults, rarely changed):

| Variable | Default | Notes |
|----------|---------|-------|
| `EMAIL_VERIFICATION_EXPIRATION_MS` | `900000` | Code lifetime (15 min), also printed in the email |
| `EMAIL_VERIFICATION_MAX_ATTEMPTS` | `3` | How many times auth retries a failed send |
| `FORGOT_PASSWORD_EXPIRATION_MS` | `900000` | Same, for password reset |
| `FORGOT_PASSWORD_MAX_ATTEMPTS` | `3` | Same, for password reset |

---

## Setup

### 1. Get credentials

**Gmail (default host)**

1. Enable 2-Step Verification on the Google account.
2. Create an App Password at <https://myaccount.google.com/apppasswords>.
3. `SMTP_USER` = the Gmail address, `SMTP_PASS` = the 16-character App Password (spaces don't matter).

**Any other provider**: use its STARTTLS host/port (usually `587`) and set `SMTP_HOST` / `SMTP_PORT` accordingly.

### 2. Put them in `.env`

The first `make dev` (or `make up`) runs `infra/generate-env.sh`, which creates `backend/.env` and **asks for `SMTP_USER` and `SMTP_PASS` in the terminal**. Just answer the prompts.

If `.env` already exists, or the script ran without a terminal (CI, piped input), the values stay empty. Fill them by hand:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

Then restart the notification service.

### 3. Verify

Register a user through the frontend (or `POST /auth/register` on the gateway). The notification log should show:

```
[MailerService] Verification email sent to you@example.com : token XXXXXXXX
```

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Service exits with `Invalid environment variables` and `SMTP_USER` / `SMTP_PASS` | Values empty in `.env` (see step 2) |
| `Invalid login: 535 ... Username and Password not accepted` | Gmail: you used the account password. Create an App Password (needs 2-Step Verification) |
| `Error: wrong version number` / `SSL routines` | Port `465` set. Switch back to `587` |
| `ECONNREFUSED` / `ETIMEDOUT` | Wrong `SMTP_HOST`, or outbound port `587` blocked on your network |
| Email arrives from a different address than expected | `From` is always `SMTP_USER`; change that, not a separate variable |
