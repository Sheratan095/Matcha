import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { PictureIdParamDto, UploadPictureDto, PicturesResponseDto, PictureErrorDto } from './dto/pictures.dto';
import { CreateProfileDto, CreateProfileResponseDto, CreateProfileErrorDto } from './dto/createProfile.dto';
import { IsProfileCompleteDto, IsProfileCompleteResponseDto, IsProfileCompleteErrorDto } from './dto/isProfileComplete.dto';
import { GetProfileDto, GetProfileResponseDto, GetProfileErrorDto, GetMyProfileResponseDto } from './dto/getProfile.dto';
import {  GetProfileViewersResponseDto, GetProfileViewersErrorDto } from './dto/getProfileViewers.dto';
import { UpdateProfileDto, UpdateProfileResponseDto, UpdateProfileErrorDto } from './dto/updateProfile.dto';
import { InternalKeyGuard, AuthenticatedUserGuard, CurrentUser } from '@repo/utils';

const PICTURE_MAX_BYTES = 5 * 1024 * 1024;
const PICTURE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

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

	@Get()
	@ApiOperation({ summary: 'Get user profile', description: 'Retrieve the full profile of the authenticated user.' })
	@ApiResponse({ status: 200, type: GetMyProfileResponseDto, description: 'Profile retrieved successfully' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getMyProfile(@CurrentUser() userId: string)
	{
		const profile = await this.appService.getProfile(userId, userId);

		return (profile);
	}

	@Get('viewers')
	@ApiOperation({ summary: 'Get profile viewers', description: 'Returns the list of user IDs that have viewed your profile' })
	@ApiResponse({ status: 200, type: GetProfileViewersResponseDto, description: 'Viewers retrieved successfully' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: GetProfileViewersErrorDto, description: 'Requesting user is not the profile owner' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getProfileViewers(@CurrentUser() userId: string)
	{
		const viewers = await this.appService.getProfileViewers(userId);

		return ({ viewers });
	}

	@Patch()
	@ApiOperation({ summary: 'Update user profile', description: 'Update the authenticated user\'s own profile. All fields are optional — only provided fields are applied.' })
	@ApiBody({ type: UpdateProfileDto })
	@ApiResponse({ status: 200, type: UpdateProfileResponseDto, description: 'Profile updated successfully' })
	@ApiResponse({ status: 400, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: UpdateProfileErrorDto, description: 'Requesting user is not the profile owner' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async updateProfile(@Body() body: UpdateProfileDto, @CurrentUser() userId: string)
	{
		const { interests, ...fields } = body;

		return (await this.appService.updateProfile(userId, fields, interests));
	}

	@Post('pictures')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Upload a picture', description: 'Upload one picture for the authenticated user (max 5). The image is re-encoded to WEBP and all EXIF metadata (GPS, camera...) is stripped. The first picture becomes the profile picture.' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: UploadPictureDto })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Picture uploaded, returns all user pictures' })
	@ApiResponse({ status: 400, type: PictureErrorDto, description: 'Missing file, unsupported type, invalid image or picture limit reached' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 413, description: 'File larger than 5 MB' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	@UseInterceptors(FileInterceptor('file',
	{
		// No "dest"/"storage": multer keeps the file in RAM (file.buffer), it is re-encoded before reaching MinIO
		limits: { fileSize: PICTURE_MAX_BYTES, files: 1 },
		fileFilter: (_req, file, callback) =>
		{
			// Cheap first filter on the client-declared type; sharp decoding is the real check.
			if (!PICTURE_ALLOWED_MIME.includes(file.mimetype))
				return (callback(new BadRequestException('Only JPEG, PNG and WEBP images are allowed'), false));

			callback(null, true);
		},
	}))
	async uploadPicture(@UploadedFile() file: Express.Multer.File, @CurrentUser() userId: string)
	{
		if (!file)
			throw new BadRequestException('Missing "file" field');

		const pictures = await this.appService.uploadPicture(userId, file);

		return ({ pictures });
	}

	@Delete('pictures/:pictureId')
	@ApiOperation({ summary: 'Delete a picture', description: 'Delete one of the authenticated user\'s pictures.' })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Picture deleted, returns remaining pictures' })
	@ApiResponse({ status: 400, description: 'Invalid picture id' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: PictureErrorDto, description: 'Picture not found or not owned by the user' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async deletePicture(@Param() req: PictureIdParamDto, @CurrentUser() userId: string)
	{
		const pictures = await this.appService.deletePicture(userId, req.pictureId);

		return ({ pictures });
	}

	@Patch('pictures/:pictureId/profile')
	@ApiOperation({ summary: 'Set profile picture', description: 'Mark one of the authenticated user\'s pictures as the profile picture.' })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Profile picture updated, returns all user pictures' })
	@ApiResponse({ status: 400, description: 'Invalid picture id' })
	@ApiResponse({ status: 401, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: PictureErrorDto, description: 'Picture not found or not owned by the user' })
	@ApiResponse({ status: 500, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async setProfilePicture(@Param() req: PictureIdParamDto, @CurrentUser() userId: string)
	{
		const pictures = await this.appService.setProfilePicture(userId, req.pictureId);

		return ({ pictures });
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
}