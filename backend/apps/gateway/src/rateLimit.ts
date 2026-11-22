import { INestApplication, Logger } from '@nestjs/common';
import { IncomingMessage, ServerResponse } from 'http';
import { rateLimit, ipKeyGenerator, MemoryStore, MINUTE, HOUR, Options, RateLimitRequestHandler, AugmentedRequest } from 'express-rate-limit';
import { env } from '@repo/config';
import { USER_ID_HEADER } from '@repo/utils';

// Every limit lives in this file. Full specification (algorithm, layers, keys, limits table):
// docs/backend/rate-limiting.md — keep the two in sync when a limit changes.
//
// express-rate-limit's MemoryStore is a FIXED window per client: the window opens on the
// client's first hit and the count resets windowMs later. Each limiter below is independent
// (own store, own counters), so budgets never share hits; every request also counts against
// the global limiter.

const	logger = new Logger('GatewayRateLimit');

type LimitKey = 'ip' | 'user';

interface RouteLimit
{
	methods:	string[];
	pattern:	RegExp;
	limiter:	RateLimitRequestHandler;
}

// Health checks are polled by Docker every few seconds and cost nothing.
const	UNLIMITED_PATHS = ['/health', '/notification/health'];

const	UPGRADE_WINDOW_MS = MINUTE;
const	UPGRADE_LIMIT = 30;

function	pathOf(url: string | undefined): string
{
	return ((url || '').split('?')[0]);
}

// Whole seconds until the client's window resets, never 0 (a "retry in 0 seconds" is useless).
function	secondsUntil(resetTime: Date | undefined, windowMs: number): number
{
	if (!resetTime)
		return (Math.ceil(windowMs / 1000));

	return (Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)));
}

// Logged-in users are counted on their own id, so people sharing one public IP (a campus NAT,
// evaluators on the same network) don't share a budget. Anonymous requests fall back to the IP.
// USER_ID_HEADER is trustworthy here: the identity middleware in main.ts strips any client-sent
// copy and sets it only from a validated token, and it runs before these limiters.
const	userOrIpKey: Options['keyGenerator'] = (req) =>
{
	const	userId = req.headers[USER_ID_HEADER];

	if (typeof userId === 'string')
		return (`user:${userId}`);

	// ipKeyGenerator groups IPv6 addresses by /56, so one client can't rotate through its own
	// block of addresses to get a fresh budget each time.
	return (`ip:${ipKeyGenerator(req.ip ?? '')}`);
};

// Same shape as Nest's HttpException responses, so the frontend's toApiError() reads it like any
// other error. Retry-After and the RateLimit-* headers are set by the library before this runs.
function	tooManyRequests(name: string): Options['handler']
{
	return ((req, res, _next, options) =>
	{
		const	retryAfter = secondsUntil((req as AugmentedRequest).rateLimit?.resetTime, options.windowMs);

		logger.warn(`Rate limit '${name}' exceeded: ${req.method} ${pathOf(req.originalUrl)} (${req.headers[USER_ID_HEADER] ?? req.ip})`);

		res.status(429).json({ statusCode: 429, message: `Too many requests, retry in ${retryAfter} seconds`, error: 'Too Many Requests' });
	});
}

// Each call builds an independent limiter: no store is passed, so the library creates a fresh
// MemoryStore for it (sharing one store between limiters is flagged as ERR_ERL_STORE_REUSE).
function	createLimiter(name: string, windowMs: number, limit: number, key: LimitKey, extra: Partial<Options> = {}): RateLimitRequestHandler
{
	const	options: Partial<Options> =
	{
		windowMs,
		limit,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		handler: tooManyRequests(name),
		...extra,
	};

	// 'ip' keeps the library's default key generator, which is ipKeyGenerator(req.ip).
	if (key === 'user')
		options.keyGenerator = userOrIpKey;

	return (rateLimit(options));
}

// Patterns end in \/?$ and use the i flag on purpose: Express routing ignores a trailing slash
// and letter case, so '/auth/Login/' reaches the same handler as '/auth/login' and must hit the
// same limiter. A request matches at most one entry.
const	ROUTE_LIMITS: RouteLimit[] =
[
	// --- Public auth routes, per IP: brute force and email spam ---

	// Only FAILED logins count (skipSuccessfulRequests): a user who types the right password is
	// never locked out by their own earlier mistakes.
	{ methods: ['POST'], pattern: /^\/auth\/login\/?$/i,
		limiter: createLimiter('login', 15 * MINUTE, 10, 'ip', { skipSuccessfulRequests: true }) },

	// Each one sends an email.
	{ methods: ['POST'], pattern: /^\/auth\/register\/?$/i,
		limiter: createLimiter('register', HOUR, 10, 'ip') },
	{ methods: ['POST'], pattern: /^\/auth\/forgot-password\/?$/i,
		limiter: createLimiter('forgot-password', HOUR, 5, 'ip') },

	// The tokens are random hex, so guessing them is already hopeless: this is just hygiene.
	{ methods: ['POST'], pattern: /^\/auth\/(verify-email|reset-password)\/?$/i,
		limiter: createLimiter('email-token', 15 * MINUTE, 20, 'ip') },

	// --- Write actions, per user: spam and notification floods ---

	// Sends an email to the new address.
	{ methods: ['POST'], pattern: /^\/auth\/change-email\/?$/i,
		limiter: createLimiter('change-email', HOUR, 5, 'user') },

	{ methods: ['POST'], pattern: /^\/chat\/message\/?$/i,
		limiter: createLimiter('chat-message', MINUTE, 30, 'user') },

	// Each of these can push a notification to the target user (like / unlike / match / unmatch).
	{ methods: ['POST', 'DELETE'], pattern: /^\/profile\/[^/]+\/(like|pass|block|report)\/?$/i,
		limiter: createLimiter('social-action', MINUTE, 30, 'user') },

	{ methods: ['POST'], pattern: /^\/profile\/calendar\/event\/?$/i,
		limiter: createLimiter('calendar-event', HOUR, 20, 'user') },

	// Every upload is decoded and re-encoded by sharp, which is CPU heavy.
	{ methods: ['POST'], pattern: /^\/profile\/pictures\/?$/i,
		limiter: createLimiter('picture-upload', HOUR, 20, 'user') },
];

// Layer 1. Must be registered BEFORE the identity middleware: that middleware calls the auth
// service for every request carrying an access_token cookie, so a flood of fake cookies would
// otherwise cost one auth round-trip per request before ever being counted.
export function	applyGlobalRateLimit(app: INestApplication): void
{
	if (!env.RATE_LIMIT_ENABLED)
	{
		logger.warn('Rate limiting is DISABLED (RATE_LIMIT_ENABLED=false)');
		return;
	}

	// Generous on purpose: one SPA page fires several requests, socket.io long-polling adds more,
	// and a whole campus can sit behind a single IP.
	app.use(createLimiter('global', MINUTE, 600, 'ip',
	{
		skip: (req) => UNLIMITED_PATHS.includes(pathOf(req.originalUrl)),
	}));
}

// Layers 2 and 3. Must be registered AFTER the identity middleware (per-user keys read
// USER_ID_HEADER) and BEFORE the proxies.
export function	applyRouteRateLimits(app: INestApplication): void
{
	if (!env.RATE_LIMIT_ENABLED)
		return;

	app.use((req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		const	path = pathOf(req.url);

		for (const rule of ROUTE_LIMITS)
		{
			if (rule.methods.includes(req.method || '') && rule.pattern.test(path))
				return (rule.limiter(req as any, res as any, next));
		}

		next();
	});
}

// WebSocket upgrades never pass through Express, so no middleware above sees them: they are
// counted here on a bare MemoryStore, per IP, BEFORE authenticateRequest (same amplification
// reasoning as the global limiter).
const	upgradeStore = new MemoryStore();
upgradeStore.init({ windowMs: UPGRADE_WINDOW_MS } as Options);

// The client's address for an upgrade, by the same rule as Express's `trust proxy: 'loopback'` (main.ts),
// which never runs here: behind the frontend's server (same host, so loopback) it is the last
// X-Forwarded-For entry, the one that server appended; from anywhere else, the socket's own address.
function	upgradeClientIp(req: IncomingMessage): string
{
	const	socketIp = req.socket.remoteAddress ?? '';
	const	loopback = socketIp === '::1' || socketIp.startsWith('127.') || socketIp.startsWith('::ffff:127.');
	const	forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);

	return (loopback && forwarded.length > 0 ? forwarded[forwarded.length - 1] : socketIp);
}

// Returns 0 when the upgrade may proceed, otherwise the NUMBER OF SECONDS TO WAIT.
// Used by the GATEWAY'S UPGRADE HANDLER (ws-proxy.ts) to throttle WebSocket floods. The
export async function	checkUpgradeRateLimit(req: IncomingMessage): Promise<number>
{
	if (!env.RATE_LIMIT_ENABLED)
		return (0);

	const	key = ipKeyGenerator(upgradeClientIp(req));
	const	{ totalHits, resetTime } = await upgradeStore.increment(key);

	if (totalHits <= UPGRADE_LIMIT)
		return (0);

	return (secondsUntil(resetTime, UPGRADE_WINDOW_MS));
}
