import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';

// Specify that this class is a NestJS controller
@Controller()
@ApiTags('Notification')
// This guard is applied to the entire controller for internal communication.
@UseGuards(InternalKeyGuard)
export class AppController
{
	constructor(private readonly appService: AppService)
	{}

	@Get()
	getTestNotification(): string
	{
		return this.appService.getTestNotification();
	}
}