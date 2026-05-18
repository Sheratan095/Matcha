import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";
import cookieParser from 'cookie-parser';

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

function swaggerSetup(app : any)
{
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
