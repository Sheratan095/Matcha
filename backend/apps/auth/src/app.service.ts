import { Injectable } from '@nestjs/common';

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()

export class AppService
{
	getHello(): string
	{
		return ('HELLO FROM AUTH');
	}

	getHealth(): string
	{
		return ('OK');
	}
}
