import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';

@Controller()

// This guard is applied to the entire controller, so all endpoints will require the internal key for authentication.
// This ensures that only requests with the correct internal key can access these endpoints, providing a layer of security for inter-service communication.
@UseGuards(InternalKeyGuard)

export class AppController
{

	constructor(private readonly appService: AppService)
	{ }

	@Get('health')
	getHealth(): string
	{
		return (this.appService.getHealth());
	}

	@Get('test')
	test(): string
	{
		return ('This is a test endpoint');
	}
}
