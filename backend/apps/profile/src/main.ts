import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";

// This is the bootstrap file, it imports NestFactory and your root module to spin up the http server

function swaggerSetup(app : any)
{
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
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
	swaggerSetup(app);
	await app.listen(env.PROFILE_PORT);
}
bootstrap();
