import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from "@repo/config";

async function bootstrap()
{
	const app = await NestFactory.create(AppModule);
	// Assuming 3002 is the notification port. We can use process.env.NOTIFICATION_PORT if configured in env
	const port = env.NOTIFICATION_PORT;
	await app.listen(port);
	console.log(`Notification service is running on: ${port}`);
}
bootstrap();