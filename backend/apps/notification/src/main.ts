import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import { protectDocsWithInternalKey } from '@repo/utils';

function swaggerSetup(app: any)
{
	// First, so the docs can never be mounted without their guard: everything below is
	// reachable only with the internal key, i.e. only through the gateway (which injects it
	// and sits behind DOCS_USER/DOCS_PASSWORD).
	protectDocsWithInternalKey(app, 'NOTIFICATION');

	const config = new DocumentBuilder()
		.setTitle('Notification API')
		.setVersion('1.0')
		.addServer('/notification')
		.build();

	const document = SwaggerModule.createDocument(app, config);
	SwaggerModule.setup('docs', app, document);
	SwaggerModule.setup('docs-json', app, document);
}

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);

	// Strip unknown fields and run class-validator/class-transformer on request DTOs
	// (matches the auth and profile services).
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

	swaggerSetup(app);

	// Loopback only: just the gateway (same host) calls this service, SO OTHER MACHINES CAN'T REACH IT.
	await app.listen(env.NOTIFICATION_PORT, '127.0.0.1');
}
bootstrap();