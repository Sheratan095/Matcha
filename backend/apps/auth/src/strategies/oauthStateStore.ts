import { randomBytes, timingSafeEqual } from 'crypto';
import { env } from '@repo/config';

// OAuth `state` parameter, kept in a short-lived cookie instead of a server session (the app has
// none, and passport-oauth2's built-in `state: true` requires express-session).
//
// WHY: without it, the callback accepts ANY authorization code. An attacker starts a GitHub sign-in
// with THEIR OWN account, stops before the callback, and gets the victim's browser to open
// /auth/github/callback?code=<attacker's code> (a link, an <img>, an auto-submitting page). The
// victim is then silently logged into the attacker's Matcha account, and whatever they do next
// (messages, likes, location, pictures) lands in an account the attacker can read.
//
// HOW: the browser that STARTS the sign-in gets a random value both in a cookie and in the `state`
// GitHub echoes back to the callback. The callback only proceeds when the two match, which only
// the browser that started the flow can make true: the attacker can put their code in a link, but
// can't set the victim's cookie.

const	COOKIE_NAME = 'oauth_state';
const	STATE_TTL_MS = 10 * 60 * 1000;

// The PUBLIC path, as the browser sees it through the gateway (which strips /auth before this
// service), so the cookie is sent to /auth/github/callback and nowhere else.
const	COOKIE_PATH = '/auth/github';

const	cookieOptions =
{
	httpOnly: true,
	// Lax, not Strict: the callback is a top-level redirect coming FROM github.com, and Strict
	// cookies are not sent on cross-site navigations, so the check would always fail.
	sameSite: 'lax' as const,
	secure: env.NODE_ENV === 'production', // Same rule as the auth cookies (utils/jwt.ts)
	path: COOKIE_PATH,
};

// Arity matters: passport-oauth2 picks the call shape from store.length (3) and verify.length (3).
export const	cookieStateStore =
{
	// Called when /auth/github redirects to GitHub. req.res is Express's response for this request.
	store(req: any, _meta: any, callback: (err: Error | null, state?: string) => void): void
	{
		const	state = randomBytes(32).toString('hex');

		req.res.cookie(COOKIE_NAME, state, { ...cookieOptions, maxAge: STATE_TTL_MS });
		callback(null, state);
	},

	// Called on /auth/github/callback with the `state` GitHub sent back.
	verify(req: any, providedState: unknown, callback: (err: Error | null, ok: boolean, info?: any) => void): void
	{
		const	expected = req.cookies?.[COOKIE_NAME];

		// Cleared whatever the outcome: the value is only needed for this one round trip, and the
		// 10-minute expiry is the backstop if the user never comes back from GitHub.
		req.res.clearCookie(COOKIE_NAME, cookieOptions);

		if (typeof expected !== 'string' || typeof providedState !== 'string' || expected.length !== providedState.length)
			return (callback(null, false, { message: 'Invalid OAuth state' }));

		// Constant-time, so the comparison doesn't leak how many leading characters matched
		const	ok = timingSafeEqual(Buffer.from(expected), Buffer.from(providedState));

		callback(null, ok, ok ? undefined : { message: 'Invalid OAuth state' });
	},
};
