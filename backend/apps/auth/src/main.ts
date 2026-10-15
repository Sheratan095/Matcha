import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import { protectDocsWithInternalKey } from '@repo/utils';
import cookieParser from 'cookie-parser';

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

function swaggerSetup(app : any)
{
	// First, so the docs can never be mounted without their guard: everything below is
	// reachable only with the internal key, i.e. only through the gateway (which injects it
	// and sits behind DOCS_USER/DOCS_PASSWORD).
	protectDocsWithInternalKey(app, 'AUTH');

	const config = new DocumentBuilder()
		.setTitle('Auth API')
		.setVersion('1.0')
		// .addBearerAuth() // for JWT auth
		.addServer('/auth') // base path for the auth service, so in docs the endpoints will be shown as /auth/endpoint instead of just /endpoint
		.build();

	const document = SwaggerModule.createDocument(app, config);

	SwaggerModule.setup('docs', app, document);
}

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
	app.use(cookieParser());
	swaggerSetup(app);
	await app.listen(env.AUTH_PORT);
}
bootstrap();
