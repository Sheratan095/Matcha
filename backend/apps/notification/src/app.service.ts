import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService
{
	getTestNotification(): string
	{
		return ('Notification test endpoint works!');
	}
}