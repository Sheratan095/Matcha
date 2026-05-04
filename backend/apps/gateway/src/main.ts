import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// This is the bootstrap file, it imports NestFactory and you root module to spin up the http server

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	await app.listen(3000);
}
bootstrap();
