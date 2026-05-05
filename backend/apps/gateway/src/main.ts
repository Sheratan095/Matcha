import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import { createProxyMiddleware } from 'http-proxy-middleware';

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

function swaggerSetup(app : any)
{
	const config = new DocumentBuilder()
		.setTitle('GATEWAY API')
		.setVersion('1.0')
		.addBearerAuth() // for JWT auth
		.build();

	const document = SwaggerModule.createDocument(app, config);

	SwaggerModule.setup('docs', app, document);
}

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

	swaggerSetup(app);

	await app.listen(env.GATEWAY_PORT);
	console.log(`[GATEWAY] Listening on port ${env.GATEWAY_PORT}`);
	console.log(`[GATEWAY] Proxying /auth to ${env.AUTH_HOST}:${env.AUTH_PORT}`);
}
bootstrap();
