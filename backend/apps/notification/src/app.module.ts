import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailerService } from './mail/mailer.service';
import { DbModule } from './db/db.module';
import { env } from '@repo/config';
import { WsGateway } from './websocket/gateway.ws';

@Module({
	imports: [
		HttpModule.register({
			headers: {
				'x-internal-key': env.INTERNAL_KEY,
			},
		}),
		DbModule,
	],
	controllers: [AppController],
	providers: [AppService, MailerService, WsGateway],
})
export class AppModule {}