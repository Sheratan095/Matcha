import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { CreateProfileDto, CreateProfileResponseDto, CreateProfileErrorDto } from './dto/createProfile.dto';
import { IsProfileCompleteDto, IsProfileCompleteResponseDto, IsProfileCompleteErrorDto } from './dto/isProfileComplete.dto';
import { GetProfileDto, GetProfileResponseDto, GetProfileErrorDto } from './dto/getProfile.dto';
import { GetProfileViewersDto, GetProfileViewersResponseDto, GetProfileViewersErrorDto } from './dto/getProfileViewers.dto';
import { InternalKeyGuard, AuthenticatedUserGuard, CurrentUser } from '@repo/utils';

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

	@Post()
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

	@Get(':userId/is-complete')
	@ApiOperation({ summary: 'Check if user profile is complete', description: 'INTERNAL endpoint, called by the AUTH service after a user logs in, to check if the profile is complete.' })
	@ApiResponse({ status: 200, type: IsProfileCompleteResponseDto, description: 'Profile completeness status' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 500, type: IsProfileCompleteErrorDto, description: 'Internal server error' })
	async isProfileComplete(@Param() req: IsProfileCompleteDto)
	{
		const isComplete = await this.appService.isProfileComplete(req.userId);

		return ({ isComplete });
	}

	@Get('viewers')
	@ApiOperation({ summary: 'Get profile viewers', description: 'Returns the list of user IDs that have viewed your profile' })
	@ApiResponse({ status: 200, type: GetProfileViewersResponseDto, description: 'Viewers retrieved successfully' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: GetProfileViewersErrorDto, description: 'Requesting user is not the profile owner' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getProfileViewers(@Param() req: GetProfileViewersDto, @CurrentUser() userId: string)
	{
		const viewers = await this.appService.getProfileViewers(userId);

		return ({ viewers });
	}

	@Get(':userId')
	@ApiOperation({ summary: 'Get user profile', description: 'Retrieve the full user profile.' })
	@ApiResponse({ status: 200, type: GetProfileResponseDto, description: 'Profile retrieved successfully' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 404, type: GetProfileErrorDto, description: 'Profile not found' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard) // This endpoint is protected and requires a valid JWT token
	async getProfile(@Param() req: GetProfileDto, @CurrentUser() userId: string )
	{
		const profile = await this.appService.getProfile(req.userId, userId);

		return (profile);
	}
}