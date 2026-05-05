import { Controller, Get, Headers, UnauthorizedException } from '@nestjs/common';
import { AppService } from './app.service';
import { validateInternalKey } from '@repo/utils';

@Controller()
export class AppController
{

	constructor(private readonly appService: AppService)
	{ }

	@Get('health')
	getHealth(@Headers('x-internal-key') internalKey?: string): string
	{
		if (!validateInternalKey(internalKey))
		{
			throw new UnauthorizedException('Invalid or missing internal key');
		}

		return (this.appService.getHealth());
	}

	@Get('test')
	test(@Headers('x-internal-key') internalKey?: string): string
	{
		if (!validateInternalKey(internalKey))
			throw (new UnauthorizedException('Invalid or missing internal key'));

		return ('This is a test endpoint');
	}
}
