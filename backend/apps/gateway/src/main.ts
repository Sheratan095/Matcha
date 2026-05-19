import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from "@repo/config";
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { IncomingMessage, ServerResponse, ClientRequest } from 'http';
import { setupSwagger } from './swagger';
import { Microservice } from './Models/Microservice';
import { Logger } from '@nestjs/common';

const logger = new Logger('GatewayBootstrap');

// List of all microservices and their ports
// This is where you would add more services as you build them out (eg. UserService, ProductService, etc.)
const	services : Microservice[] =
[
	new Microservice('auth', env.AUTH_HOST, env.AUTH_PORT, '/auth/docs-json'),
	new Microservice('notification', env.NOTIFICATION_HOST, env.NOTIFICATION_PORT, '/notification/docs-json'),
];

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);

	// Register proxy middleware directly on the Express app
	app.use(
		'/auth',
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

	// Not all endpoints are proxied because other are internal and not exposed o the outside
	app.use(
		'/notification/docs-json',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/notification/docs-json': '/docs-json' },
		}),
	);

	app.use(
		'/notification/health',
		createProxyMiddleware({
			target: `${env.NOTIFICATION_HOST}:${env.NOTIFICATION_PORT}`,
			changeOrigin: true,
			pathRewrite: { '^/notification/health': '/health' },
		} as any),
	);

	setupSwagger(app, services);

	await app.listen(env.GATEWAY_PORT);
	logger.log(`Listening on port ${env.GATEWAY_PORT}`);
	logger.log(`Proxying /auth to ${env.AUTH_HOST}:${env.AUTH_PORT}`);
}
bootstrap();
