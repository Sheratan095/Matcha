import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";

function swaggerSetup(app: any)
{
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

	swaggerSetup(app);

	const port = env.NOTIFICATION_PORT;
	await app.listen(port);
	console.log(`Notification service is running on: ${port}`);
}
bootstrap();