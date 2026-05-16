import { Module } from '@nestjs/common';
import { DbService } from './db.service';

@Module({
	providers: [DbService],
	exports: [DbService],
})
export class DbModule {}

// EVERY MICROSERVICE HAS IT'S OWN DB MODULE, THIS ONE IS FOR THE AUTH MICROSERVICE,
// THERE COULD BE JUST ONE DB MODULE FOR THE WHOLE BACKEND, BUT THIS WAY IT'S MORE MODULAR AND EASIER TO MAINTAIN.