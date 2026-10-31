import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import { protectDocsWithInternalKey } from '@repo/utils';

// This is the bootstrap file, it imports NestFactory and your root module to spin up the http server

function swaggerSetup(app : any)
{
	// First, so the docs can never be mounted without their guard: everything below is
	// reachable only with the internal key, i.e. only through the gateway (which injects it
	// and sits behind DOCS_USER/DOCS_PASSWORD).
	protectDocsWithInternalKey(app, 'PROFILE');

	const config = new DocumentBuilder()
		.setTitle('Profile API')
		.setVersion('1.0')
		// .addBearerAuth() // for JWT auth
		.addServer('/profile') // base path for the profile service, so in docs the endpoints will be shown as /profile/endpoint instead of just /endpoint
		.build();

	const document = SwaggerModule.createDocument(app, config);

	SwaggerModule.setup('docs', app, document);
}

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);

	// Strip unknown fields and run class-validator/class-transformer on request DTOs
	// (matches the auth and profile services).
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

	swaggerSetup(app);

	// Loopback only: just the gateway (same host) calls this service, SO OTHER MACHINES CAN'T REACH IT.
	await app.listen(env.PROFILE_PORT, '127.0.0.1');
}
bootstrap();
