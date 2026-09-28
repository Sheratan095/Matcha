import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiTags } from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';

// Specify that this class is a NestJS controller
@Controller()
@ApiTags('profile')
// This guard is applied to the entire controller for internal communication.
@UseGuards(InternalKeyGuard)
export class AppController
{
	constructor(private readonly appService: AppService)
	{ }

	@Get('health')
	getHealth(): string
	{
		return ('OK');
	}

	// TO DO profile endpoints (get profile, update gender/preferences/biography, manage interests, manage pictures)
}
