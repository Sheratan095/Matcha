import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { env } from "@repo/config";

const logger = new Logger('NotificationBootstrap');

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
	logger.log(`Notification service is running on: ${port}`);
}
bootstrap();