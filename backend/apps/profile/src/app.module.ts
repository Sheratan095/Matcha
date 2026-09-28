import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { env } from "@repo/config";
import { HttpModule } from '@nestjs/axios';

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
	providers: [AppService],
})
export class AppModule {}
