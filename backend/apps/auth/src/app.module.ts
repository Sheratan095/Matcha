import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { env } from "@repo/config";
import { JwtHelper } from './utils/jwt';

@Module({
	imports: [
		DbModule,
		PassportModule,
		JwtModule.register({
			secret: env.JWT_ACCESS_SECRET,
			signOptions: { expiresIn: env.JWT_ACCESS_EXPIRATION_MS },
		}),
	],
	controllers: [AppController],
	// Jwt helper is a service that generates and verifies JWT tokens, it is used in the AppService to handle token logic
	providers: [AppService, JwtHelper],
})
export class AppModule {}
