import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Controller is a decorator that marks the AppController class as a controller in the NestJS framework.
// Controllers are responsible for handling incoming HTTP requests and returning responses to the client.
@Controller()
export class AppController
{
	constructor(private readonly appService: AppService)
	{ }

	//@ is a decorator that marks the method as a route handler for GET requests to the 'health' endpoint. When a GET request is made to '/health'
	// getHealth method will be invoked, and it will return the result of appService.getHello(), which is 'OK'.
	@Get('health')


	getHealth(): string
	{
		return (this.appService.getHealth());
	}
}
