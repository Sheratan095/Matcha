import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env, FRONTEND_BASE_URL } from "@repo/config";
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { timingSafeEqual } from 'node:crypto';
import { setupSwagger } from './swagger';
import { Microservice } from './Models/Microservice';
import { Logger } from '@nestjs/common';
import { createNotificationSocketProxy, isNotificationSocketRequest } from './websocketGateway';
import { applyGlobalRateLimit, applyRouteRateLimits, checkUpgradeRateLimit } from './rateLimit';
import { authenticateRequest, USER_ID_HEADER } from '@repo/utils';

const logger = new Logger('GatewayBootstrap');

const notificationSocketProxy = createNotificationSocketProxy(logger);

// List of all microservices and their ports
// This is where you would add more services as you build them out (eg. UserService, ProductService, etc.)
const	services : Microservice[] =
[
	new Microservice('auth', env.AUTH_HOST, env.AUTH_PORT, '/auth/docs-json'),
	new Microservice('notification', env.NOTIFICATION_HOST, env.NOTIFICATION_PORT, '/notification/docs-json'),
	new Microservice('profile', env.PROFILE_HOST, env.PROFILE_PORT, '/profile/docs-json'),
];

/**
 * @brief Validate an `Authorization: Basic ...` header against DOCS_USER / DOCS_PASSWORD.
 *
 * Compared with timingSafeEqual so a wrong guess cannot be narrowed down by response timing.
 * The password is rejoined on ':' because only the FIRST colon separates user from password.
 */
function hasValidDocsCredentials(header?: string): boolean
{
	if (!header || !header.startsWith('Basic '))
		return (false);

	const	decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
	const	separator = decoded.indexOf(':');

	if (separator === -1)
		return (false);

	const	provided = Buffer.from(`${decoded.slice(0, separator)}:${decoded.slice(separator + 1)}`);
	const	expected = Buffer.from(`${env.DOCS_USER}:${env.DOCS_PASSWORD}`);

	// timingSafeEqual throws on differing lengths, so the length check must come first.
	return (provided.length === expected.length && timingSafeEqual(provided, expected));
}

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);

	// Enable CORS so the frontend (http://localhost:4000) can call gateway endpoints
	app.enableCors({
		origin: FRONTEND_BASE_URL,
		credentials: true,
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: ['Content-Type', 'x-internal-key']
	});

	// RATE LIMITING, layer 1 (global, per IP). After CORS so a 429 still carries the CORS headers
	// (otherwise the browser hides it as a network error), and BEFORE the identity middleware so
	// a flood of fake access_token cookies is cut before it costs auth round-trips.
	// See rateLimit.ts and docs/backend/rate-limiting.md.
	applyGlobalRateLimit(app);

	// Best-effort identity for EVERY PROXIED REQUEST: when the caller carries a valid
	// access token, its userId is attached as USER_ID_HEADER so downstream services can
	// read it without parsing tokens themselves.
	//
	// It deliberately NEVER rejects, because public routes (login, register, health, docs)
	// must stay reachable. Enforcing that a user IS authenticated is the job of
	// AuthenticatedUserGuard on the microservice endpoint, or requireAuthenticatedUser()
	// when the gateway itself should block the request.
	app.use(async (req: IncomingMessage, _res: ServerResponse, next: () => void) =>
	{
		// Strip it FIRST and unconditionally: a client MUST NEVER BE ABLE TO SUPPLY
		// ITS OWN USERID and have a downstream service trust it.
		delete req.headers[USER_ID_HEADER];

		// Short-circuit when there is no access token to validate, so public traffic
		// never pays for a round-trip to the auth service.
		if (req.headers.cookie?.includes('access_token='))
		{
			const	userId = await authenticateRequest(req);
			if (userId)
				req.headers[USER_ID_HEADER] = userId;
		}

		next();
	});

	// RATE LIMITING, layers 2 and 3 (sensitive routes per IP, write actions per user). After the
	// identity middleware, because per-user limits key on the USER_ID_HEADER it sets, and before
	// every proxy.
	applyRouteRateLimits(app);

	// SECURITY BOUNDARY: the Swagger docs are a full inventory of the API surface (every route,
	// DTO and error shape), so they are not public. This runs before the proxies AND before
	// setupSwagger's own routes, covering the gateway's /docs + /docs-json, the swagger-ui assets
	// under /docs/*, and the per-service /<service>/docs* reached through the catch-all proxies.
	//
	// Fail closed: with no DOCS_USER/DOCS_PASSWORD configured the docs are not served at all.
	app.use((req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		const	path = (req.url || '').split('?')[0];

		if (!/(^|\/)docs(-json)?(\/|$)/.test(path))
			return (next());

		if (!env.DOCS_USER || !env.DOCS_PASSWORD)
		{
			logger.warn(`Blocked docs request (DOCS_USER/DOCS_PASSWORD not configured): ${req.method} ${path}`);
			res.statusCode = 404;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ statusCode: 404, message: 'Not Found', error: 'Not Found' }));

			return;
		}

		if (hasValidDocsCredentials(req.headers.authorization))
			return (next());

		logger.warn(`Rejected docs request with missing/invalid credentials: ${req.method} ${path}`);
		res.statusCode = 401;
		// Makes a browser show the credentials prompt instead of a blank 401.
		res.setHeader('WWW-Authenticate', 'Basic realm="Matcha API docs", charset="UTF-8"');
		res.setHeader('content-type', 'application/json');
		res.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }));
	});

	// SECURITY BOUNDARY: internal (service-to-service) endpoints must never be reachable from the
	// outside. This runs BEFORE every proxy and rejects any path containing an `internal` segment.
	//
	// It is needed because the /auth and /profile proxies below are catch-all AND inject the
	// internal key on every request — so InternalKeyGuard alone cannot tell a browser from a
	// service. Services call each other DIRECTLY (host:port), bypassing this gateway, so they are
	// unaffected. Blocking the whole segment is secure by default: a new /internal/* route is
	// unreachable externally without anyone maintaining an allowlist.
	app.use((req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		const	path = (req.url || '').split('?')[0];

		if (/(^|\/)internal(\/|$)/.test(path))
		{
			logger.warn(`Blocked external request to an internal endpoint: ${req.method} ${path}`);
			res.statusCode = 404;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ statusCode: 404, message: 'Not Found', error: 'Not Found' }));

			return;
		}

		next();
	});

	// Register proxy middleware directly on the Express app
	app.use( '/auth',
		createProxyMiddleware({
			target: `${env.AUTH_HOST}:${env.AUTH_PORT}`,

			// Change the origin of the host header to the target URL
			changeOrigin: true,

			// Remove the /auth prefix when forwarding to the auth service
			//	so the auth service can define its routes as /login, /register, etc. instead of /auth/login, /auth/register
			pathRewrite:
			{
				'^/auth': '',
			},

			// Add event handlers for the proxy
			on:
			{
				// Specify what to do before the proxy request is sent to the target service
				proxyReq: (proxyReq : ClientRequest, _req: Request, _res: Response) =>
				{
					// Add the internal key to the headers of all proxied requests for authentication between services
					const	internalKey = env.INTERNAL_KEY;
					if (internalKey)
						proxyReq.setHeader('x-internal-key', internalKey);
				},

				// Specify what to do in case of an error when proxying the request to the target service
				error: (err : Error, _req: Request, _res: Response) =>
				{
					logger.error('Proxy Error:', err);
				}
			},

		} as any),
	);

	// Remove the /profile prefix when forwarding to the profile service
	//	so the profile service can define its routes as /me, /pictures, etc. instead of /profile/me, /profile/pictures
	app.use( '/profile',
		createProxyMiddleware({
			target: `${env.PROFILE_HOST}:${env.PROFILE_PORT}`,

			// Change the origin of the host header to the target URL
			changeOrigin: true,

			pathRewrite:
			{
				'^/profile': '',
			},

			// Add event handlers for the proxy
			on:
			{
				// Add the internal key to the headers of all proxied requests for authentication between services
				proxyReq: (proxyReq : ClientRequest, _req: Request, _res: Response) =>
				{
					const	internalKey = env.INTERNAL_KEY;
					if (internalKey)
						proxyReq.setHeader('x-internal-key', internalKey);
				},

				// Specify what to do in case of an error when proxying the request to the target service
				error: (err : Error, _req: Request, _res: Response) =>
				{
					logger.error('Proxy Error:', err);
				}
			},

		} as any),
	);

	// Not all endpoints are proxied because other are internal and not exposed o the outside
	// Express strips the mount path before passing to middleware, so the proxy sees '/' not the full path
	app.use( '/notification/docs-json',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/': '/docs-json' },
			// The service's docs are internal-only (protectDocsWithInternalKey), so the spec is
			// only readable through here — i.e. only behind the docs Basic auth above.
			on:
			{
				proxyReq: (proxyReq: ClientRequest) =>
				{
					if (env.INTERNAL_KEY)
						proxyReq.setHeader('x-internal-key', env.INTERNAL_KEY);
				},
			},
		} as any),
	);

	app.use( '/notification/health',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/': '/health' },
		} as any),
	);

	app.use( '/notification/online',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/': '/online' },
			on:
			{
				proxyReq: (proxyReq: ClientRequest) =>
				{
					if (env.INTERNAL_KEY)
						proxyReq.setHeader('x-internal-key', env.INTERNAL_KEY);
				},
			},
		} as any),
	);

	// All client-facing chat traffic goes to the notification service.
	// Covers:
	// POST /chat/message (send)
	// GET /chat (list)
	// GET /chat/:userId (history)
	// Express strips the /chat mount prefix, so the rewrite re-adds it (e.g. /message -> /chat/message).
	app.use( '/chat',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/': '/chat/' },
			on:
			{
				proxyReq: (proxyReq: ClientRequest) =>
				{
					if (env.INTERNAL_KEY)
						proxyReq.setHeader('x-internal-key', env.INTERNAL_KEY);
				},
			},
		} as any),
	);

	// Handle the notification socket HANDSHAKE over HTTP long-polling (socket.io's
	// fallback transport). We authenticate only the initial handshake (no sid yet);
	// subsequent polls carry a sid and reuse the already-authenticated session.
	app.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) =>
	{
		if (!isNotificationSocketRequest(req.url))
			return (next());

		// Unlike a plain HTTP endpoint, a socket connection cannot proceed anonymously,
		// so here we DO reject. The global identity middleware already validated the token
		// and injected the header, so no second call to the auth service is needed.
		if (!req.url?.includes('sid=') && !req.headers[USER_ID_HEADER])
		{
			logger.warn('Rejected notification socket handshake: invalid or missing access token');
			res.statusCode = 401;
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ statusCode: 401, message: 'Unauthorized', error: 'Unauthorized' }));
			return;
		}

		notificationSocketProxy(req as any, res as any, next);
	});

	// Handle the notification WebSocket upgrade (native ws transport).
	app.getHttpServer().on('upgrade', async (req: IncomingMessage, socket: NodeJS.Socket, head: Buffer) =>
	{
		// If the request is not for the notification WebSocket, ignore it
		if (!isNotificationSocketRequest(req.url))
			return;

		// Upgrades skip the Express rate limiters too, so they are counted here, BEFORE the
		// auth round-trip below (see checkUpgradeRateLimit in rateLimit.ts).
		const retryAfter = await checkUpgradeRateLimit(req);
		if (retryAfter > 0)
		{
			logger.warn('Rejected notification websocket upgrade: rate limit exceeded');
			socket.write(`HTTP/1.1 429 Too Many Requests\r\nRetry-After: ${retryAfter}\r\n\r\n`);
			(socket as any).destroy();
			return;
		}

		// 'upgrade' events bypass the Express middleware stack entirely, so the global
		// identity middleware never ran for this request: we must validate it here MANUALLY.
		const userId = await authenticateRequest(req);
		if (!userId)
		{
			logger.warn('Rejected notification websocket upgrade: invalid or missing access token');
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			(socket as any).destroy();
			return;
		}

		// Inject the trusted userId so notification never relies on client-supplied values.
		req.headers[USER_ID_HEADER] = userId;

		notificationSocketProxy.upgrade(req as any, socket as any, head);
	});

	setupSwagger(app, services);

	// NOT loopback-only as other services because gateway is the oublc entry for the whoke backend
	// await app.listen(env.GATEWAY_PORT, '127.0.0.1');
	await app.listen(env.GATEWAY_PORT);

	logger.log(`Listening on port ${env.GATEWAY_PORT}`);
	logger.log(`Proxying /auth to ${env.AUTH_HOST}:${env.AUTH_PORT}`);
	logger.log(`Proxying /notification to ${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`);
	logger.log(`Proxying /profile to ${env.PROFILE_HOST}:${env.PROFILE_PORT}`);
}
bootstrap();
