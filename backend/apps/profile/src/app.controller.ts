import { Controller, Get, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { InternalKeyGuard } from '@repo/utils';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CreateProfileDto, CreateProfileResponseDto, CreateProfileErrorDto } from './dto/createProfile.dto';

// Specify that this class is a NestJS controller
@Controller()
@ApiTags('profile')
// This guard is applied to the entire controller for internal communication.
// Only callers that present a valid x-internal-key (i.e. other backend services
// like AUTH) can reach these endpoints; they are NOT exposed to end users.
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

	@Post('profile')
	@HttpCode(HttpStatus.OK) // Override default 201 for consistency with the other services
	@ApiOperation({ summary: 'Create user profile', description: 'INTERNAL endpoint, called only by the AUTH service right after a user is registered, to create the matching profile row.' })
	@ApiBody({ type: CreateProfileDto })
	@ApiResponse({ status: 200, type: CreateProfileResponseDto, description: 'Profile successfully created' })
	@ApiResponse({ status: 409, type: CreateProfileErrorDto, description: 'Profile already exists for this user' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	async createProfile(@Body() req: CreateProfileDto)
	{
		return (await this.appService.createProfile(req.userId, req.firstName, req.lastName));
	}
}
