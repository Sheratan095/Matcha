import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiHeader } from '@nestjs/swagger';

// Specify that this class is a NestJS controller
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
	// ApiOperation is used to provide metadata for swagger documentation
	@ApiOperation({ summary: 'Test endpoint', description: 'Returns a test message. Accepts an optional *content* query parameter.' })
	// ApiQuery is used to document the query parameters for this endpoint in swagger
	@ApiQuery({ name: 'content', required: false, description: 'Optional content string to include in the response' })
	test(@Query('content') content?: string): string
	{
		return (content ? `This is a test endpoint: ${content}` : 'This is a test endpoint');
	}

	@Get('db-test')
	@ApiOperation({ summary: 'Test database connection', description: 'Returns current timestamp from the database.' })
	async testDb(): Promise<string>
	{
		return (this.appService.testDbConnection());
	}
}
