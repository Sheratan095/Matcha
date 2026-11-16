import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import { protectDocsWithInternalKey, SanitizeInputPipe } from '@repo/utils';
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

	// SanitizeInputPipe FIRST: it strips control / invisible characters from every incoming string
	// so the DTO rules below validate the text that will actually be stored (see @repo/utils sanitize.ts).
	// Then strip unknown fields and run class-validator/class-transformer on request DTOs
	// (matches the profile and notification services).
	app.useGlobalPipes(new SanitizeInputPipe(), new ValidationPipe({ whitelist: true, transform: true }));

	// Cookie parser is needed for the auth service to read the refresh JWT token from cookies.
	app.use(cookieParser());

	swaggerSetup(app);

	// Loopback only: just the gateway (same host) calls this service, SO OTHER MACHINES CAN'T REACH IT.
	await app.listen(env.AUTH_PORT, '127.0.0.1');
}
bootstrap();
