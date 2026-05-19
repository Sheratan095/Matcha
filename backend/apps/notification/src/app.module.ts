import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MailerService } from './mail/mailer.service';
import { env } from '@repo/config';

@Module({
	imports: [
		HttpModule.register({
			headers: {
				'x-internal-key': env.INTERNAL_KEY,
			},
		}),
	],
	controllers: [AppController],
	providers: [AppService, MailerService],
})
export class AppModule {}