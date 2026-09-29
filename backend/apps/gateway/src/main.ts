import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from "@repo/config";
import { createProxyMiddleware } from 'http-proxy-middleware';
import { ClientRequest, IncomingMessage, ServerResponse } from 'http';
import { setupSwagger } from './swagger';
import { Microservice } from './Models/Microservice';
import { Logger } from '@nestjs/common';
import { createNotificationSocketProxy, isNotificationSocketRequest } from './websocketGateway';
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

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);

	// Enable CORS so the frontend (http://localhost:4000) can call gateway endpoints
	app.enableCors({
		origin: `${env.FRONTEND_URL}:${env.FRONTEND_PORT}`,
		credentials: true,
		methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
		allowedHeaders: ['Content-Type', 'x-internal-key']
	});

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
		}),
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
			res.end('Unauthorized');
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

	await app.listen(env.GATEWAY_PORT);
	logger.log(`Listening on port ${env.GATEWAY_PORT}`);
	logger.log(`Proxying /auth to ${env.AUTH_HOST}:${env.AUTH_PORT}`);
	logger.log(`Proxying /notification to ${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`);
	logger.log(`Proxying /profile to ${env.PROFILE_HOST}:${env.PROFILE_PORT}`);
}
bootstrap();
