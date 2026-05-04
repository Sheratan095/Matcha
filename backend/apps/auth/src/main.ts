import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

function swaggerSetup(app : any)
{
	const config = new DocumentBuilder()
		.setTitle('AUTH API')
		.setVersion('1.0')
		.addBearerAuth() // for JWT auth
		.build();

	const document = SwaggerModule.createDocument(app, config);

	SwaggerModule.setup('docs', app, document);
}

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);
	swaggerSetup(app);
	await app.listen(3001);
}
bootstrap();
