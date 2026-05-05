import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from "@repo/config";
import { createProxyMiddleware } from 'http-proxy-middleware';
import { setupSwagger } from './swagger';
import { Microservice } from './Models/Microservice';

// List of all microservices and their ports
// This is where you would add more services as you build them out (eg. UserService, ProductService, etc.)
const	services : Microservice[] =
[
	new Microservice('auth', env.AUTH_HOST, env.AUTH_PORT, '/auth/docs-json'),
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
			changeOrigin: true,
			pathRewrite: {
				'^/auth': '',
			},
		}),
	);

	setupSwagger(app, services);

	await app.listen(env.GATEWAY_PORT);
	console.log(`[GATEWAY] Listening on port ${env.GATEWAY_PORT}`);
	console.log(`[GATEWAY] Proxying /auth to ${env.AUTH_HOST}:${env.AUTH_PORT}`);
}
bootstrap();
