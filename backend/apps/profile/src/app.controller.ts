import { Controller, Get, Post, Patch, Put, Delete, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { PictureIdParamDto, UploadPictureDto, PicturesResponseDto } from './dto/pictures.dto';
import { CreateProfileDto, CreateProfileResponseDto } from './dto/createProfile.dto';
import { IsProfileCompleteDto, IsProfileCompleteResponseDto } from './dto/isProfileComplete.dto';
import { GetProfileDto, GetProfileResponseDto, GetMyProfileResponseDto } from './dto/getProfile.dto';
import {  GetProfileViewersResponseDto } from './dto/getProfileViewers.dto';
import { GetVisitedProfilesResponseDto } from './dto/getVisitedProfiles.dto';
import { GetMyLikesResponseDto } from './dto/GetMyLikes.dto';
import { GetMatchesResponseDto } from './dto/getMatches.dto';
import { GetBlockedResponseDto } from './dto/getBlocked.dto';
import { UpdateProfileDto, UpdateProfileResponseDto } from './dto/updateProfile.dto';
import { GetInterestsResponseDto } from './dto/getInterests.dto';
import { InternalKeyGuard, AuthenticatedUserGuard, CurrentUser } from '@repo/utils';
import { IsOnlineDto, IsOnlineResponseDto } from './dto/is_online';
import { ReportUserDto } from './dto/reportUser.dto';
import { UpdateLocationDto, UpdateLocationResponseDto } from './dto/updateLocation.dto';
import { GetMatchesMapResponseDto } from './dto/getMatchesMap.dto';
import { DiscoverQueryDto, DiscoverCardDto } from './dto/discover.dto';
import { SearchQueryDto } from './dto/search.dto';
import { ErrorDto } from '@repo/shared-types';
import { GetCalendarResponseDto } from './dto/calendar.dto';

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

	@Post('internal/create')
	@HttpCode(HttpStatus.OK) // Override default 201 for consistency with the other services
	@ApiOperation({ summary: 'Create user profile', description: 'INTERNAL endpoint, called only by the AUTH service right after a user is registered, to create the matching profile row.' })
	@ApiBody({ type: CreateProfileDto })
	@ApiResponse({ status: 200, type: CreateProfileResponseDto, description: 'Profile successfully created' })
	@ApiResponse({ status: 409, type: ErrorDto, description: 'Profile already exists for this user' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields, or a date of birth that is not a real date or makes the user under 18' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async createProfile(@Body() req: CreateProfileDto)
	{
		return (await this.appService.createProfile(req.userId, req.firstName, req.lastName, req.dateOfBirth));
	}

	@Get()
	@ApiOperation({ summary: 'Get user profile', description: 'Retrieve the full profile of the authenticated user.' })
	@ApiResponse({ status: 200, type: GetMyProfileResponseDto, description: 'Profile retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Profile not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getMyProfile(@CurrentUser() userId: string)
	{
		const profile = await this.appService.getProfile(userId, userId);

		return (profile);
	}

	@Get('viewers')
	@ApiOperation({ summary: 'Get profile viewers', description: 'Returns the list of user IDs that have viewed your profile' })
	@ApiResponse({ status: 200, type: GetProfileViewersResponseDto, description: 'Viewers retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'Requesting user is not the profile owner' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getProfileViewers(@CurrentUser() userId: string)
	{
		const viewers = await this.appService.getProfileViewers(userId);

		return ({ viewers });
	}

	@Get('visited')
	@ApiOperation({ summary: 'Get my visit history', description: 'Returns the profiles the authenticated user has viewed, most recent visit first. The other direction of /viewers; blocked users (either way) are excluded.' })
	@ApiResponse({ status: 200, type: GetVisitedProfilesResponseDto, description: 'Visit history retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getVisitedProfiles(@CurrentUser() userId: string)
	{
		const visited = await this.appService.getVisitedProfiles(userId);

		return ({ visited });
	}

	@Get('likes')
	@ApiOperation({ summary: 'Get my likes', description: 'Returns the list of user IDs that have liked the authenticated user, excludind the ones which has a match with' })
	@ApiResponse({ status: 200, type: GetMyLikesResponseDto, description: 'Likes retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getMyLikes(@CurrentUser() userId: string)
	{
		const likes = await this.appService.getMyLikes(userId);

		return ({ likes });
	}

	@Get('matches')
	@ApiOperation({ summary: 'Get my matches', description: 'Returns the users the authenticated user is connected to (mutual like).' })
	@ApiResponse({ status: 200, type: GetMatchesResponseDto, description: 'Matches retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getMyMatches(@CurrentUser() userId: string)
	{
		const matches = await this.appService.getMyMatches(userId);

		return ({ matches });
	}

	@Get('matches/map')
	@ApiOperation({ summary: 'Get my matches for map', description: 'Returns the users the authenticated user is connected to (mutual like) with their location coordinates.' })
	@ApiResponse({ status: 200, type: GetMatchesMapResponseDto, description: 'Matches retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getMyMatchesMap(@CurrentUser() userId: string)
	{
		const matches = await this.appService.getMyMatchesMap(userId);

		return ({ matches });
	}

	@Get('blocks')
	@ApiOperation({ summary: 'Get my blocked users', description: 'Returns the users the authenticated user has blocked.' })
	@ApiResponse({ status: 200, type: GetBlockedResponseDto, description: 'Blocked users retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getBlockedUsers(@CurrentUser() userId: string)
	{
		const blocks = await this.appService.getBlockedUsers(userId);

		return ({ blocks });
	}

	// Declared before the ':userId' route below, otherwise '/interests' would be captured as a userId.
	@Get('interests')
	@ApiOperation({ summary: 'Get all interests', description: 'Returns every interest tag stored in the database, for the interest picker / autocomplete.' })
	@ApiResponse({ status: 200, type: GetInterestsResponseDto, description: 'Interests retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getAllInterests()
	{
		const interests = await this.appService.getAllInterests();

		return ({ interests });
	}

	// Declared ABOVE @Get(':userId'): Nest matches routes in declaration order, so the wildcard
	// below would otherwise capture 'discover' and try to parse it as a UUID.
	@Get('discover')
	@ApiOperation({
		summary: 'Browse suggested profiles',
		description: 'Suggested profiles: compatible with you in BOTH directions, weighted by proximity, common tags and fame, with nearby users prioritised. Only complete profiles are suggested; users you already liked or blocked are excluded, and ONES YOU PASSED ON SINK TO THE BOTTOM RATHER THAN DISAPPEARING. Returns the WHOLE filtered list (capped at 200) so the client can sort it by age, distance, fame or common tags without refetching — every one of those is on the card. `tags` matches candidates carrying ANY of the given tags. Does NOT count as a profile view.',
	})
	@ApiResponse({ status: 200, type: [DiscoverCardDto], description: 'Suggestions retrieved successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid filter, sort or inverted range (minAge > maxAge)' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async discover(@Query() query: DiscoverQueryDto, @CurrentUser() userId: string)
	{
		return (await this.appService.discoverProfiles(userId, query));
	}

	// Also declared ABOVE @Get(':userId'), for the same reason as 'discover'.
	@Get('search')
	@ApiOperation({
		summary: 'Advanced search',
		description: 'Search profiles by one or more criteria: age range, fame range, distance from you, interest tags, name (`q`), gender and sexual preference. At least one criterion is required. Unlike discover, `tags` matches candidates carrying ALL the given tags, and no orientation compatibility is applied — filter with `genders` / `preferences` instead. Only complete profiles; blocked users are excluded, users you already liked are INCLUDED, ones you passed on come last. Cards carry no `likesYou`; open the full profile for the like relation. Returns the WHOLE result list (capped at 200), nearest first, so the client can sort it by age, distance, fame or common tags. Does NOT count as a profile view.',
	})
	@ApiResponse({ status: 200, type: [DiscoverCardDto], description: 'Search results retrieved successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'No criterion, invalid value or inverted range (minAge > maxAge)' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'You have no location set' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async search(@Query() query: SearchQueryDto, @CurrentUser() userId: string)
	{
		return (await this.appService.searchProfiles(userId, query));
	}

	@Patch()
	@ApiOperation({ summary: 'Update user profile', description: 'Update the authenticated user\'s own profile. All fields are optional — only provided fields are applied. `interests` is a FULL REPLACEMENT of the tag list, so sending [] removes them all.' })
	@ApiBody({ type: UpdateProfileDto })
	@ApiResponse({ status: 200, type: UpdateProfileResponseDto, description: 'Profile updated successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields, or a date of birth that is not a real date or makes the user under 18' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 403, type: ErrorDto, description: 'Requesting user is not the profile owner' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Profile not found' })
	@ApiResponse({ status: 409, type: ErrorDto, description: 'Date of birth is already set' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async updateProfile(@Body() body: UpdateProfileDto, @CurrentUser() userId: string)
	{
		// dateOfBirth is pulled out explicitly: it is set-once and goes through its own guarded
		// update, never through the generic field update with the rest.
		const { interests, dateOfBirth, ...fields } = body;

		return (await this.appService.updateProfile(userId, fields, interests, dateOfBirth));
	}

	@Put('location')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Update my location', description: "Stores the authenticated user's location coordinates (from a map pin or GPS). Used by the matching algorithm; the frontend reverse-geocodes for a label when needed." })
	@ApiBody({ type: UpdateLocationDto })
	@ApiResponse({ status: 200, type: UpdateLocationResponseDto, description: 'Location updated successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid coordinates' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Profile not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async updateLocation(@Body() body: UpdateLocationDto, @CurrentUser() userId: string)
	{
		return (await this.appService.updateLocation(userId, body.latitude, body.longitude));
	}

	@Post('pictures')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Upload a picture', description: 'Upload one picture for the authenticated user (max 5). The image is re-encoded to WEBP and all EXIF metadata (GPS, camera...) is stripped. The first picture becomes the profile picture.' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: UploadPictureDto })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Picture uploaded, returns all user pictures' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Missing file, unsupported type, invalid image or picture limit reached' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 413, type: ErrorDto, description: 'File larger than 5 MB' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
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
	async uploadPicture(@UploadedFile() file: Parameters<AppService['uploadPicture']>[1], @CurrentUser() userId: string)
	{
		if (!file)
			throw new BadRequestException('Missing "file" field');

		const pictures = await this.appService.uploadPicture(userId, file);

		return ({ pictures });
	}

	@Delete('pictures/:pictureId')
	@ApiOperation({ summary: 'Delete a picture', description: 'Delete one of the authenticated user\'s pictures.' })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Picture deleted, returns remaining pictures' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid picture id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Picture not found or not owned by the user' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async deletePicture(@Param() req: PictureIdParamDto, @CurrentUser() userId: string)
	{
		const pictures = await this.appService.deletePicture(userId, req.pictureId);

		return ({ pictures });
	}

	@Patch('pictures/:pictureId/profile')
	@ApiOperation({ summary: 'Set profile picture', description: 'Mark one of the authenticated user\'s pictures as the profile picture.' })
	@ApiResponse({ status: 200, type: PicturesResponseDto, description: 'Profile picture updated, returns all user pictures' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid picture id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Picture not found or not owned by the user' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async setProfilePicture(@Param() req: PictureIdParamDto, @CurrentUser() userId: string)
	{
		const pictures = await this.appService.setProfilePicture(userId, req.pictureId);

		return ({ pictures });
	}

	// Also declared ABOVE @Get(':userId'), for the same reason as 'discover'.
	@Get('calendar')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get events', description: 'Returns the events for the authenticated user\'s calendar' })
	@ApiResponse({ status: 200, type: GetCalendarResponseDto, description: 'Events retrieved successfully' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async getCalendar(@CurrentUser() userId: string)
	{
		const events = await this.appService.getCalendar(userId);

		return ({ events });
	}

	@Get(':userId')
	@ApiOperation({ summary: 'Get user profile', description: 'Retrieve the full user profile.' })
	@ApiResponse({ status: 200, type: GetProfileResponseDto, description: 'Profile retrieved successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'Profile not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard) // This endpoint is protected and requires a valid JWT token
	async getProfile(@Param() req: GetProfileDto, @CurrentUser() userId: string )
	{
		const profile = await this.appService.getProfile(req.userId, userId);

		return (profile);
	}

	@Get('internal/:userId/is-complete')
	@ApiOperation({ summary: 'Check if user profile is complete', description: 'INTERNAL 🔒 endpoint, called by the AUTH service after a user logs in, to check if the profile is complete.' })
	@ApiResponse({ status: 200, type: IsProfileCompleteResponseDto, description: 'Profile completeness status' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	async isProfileComplete(@Param() req: IsProfileCompleteDto)
	{
		const isComplete = await this.appService.isProfileComplete(req.userId);

		return ({ isComplete });
	}

	@Get('internal/:userId/is-online')
	@ApiOperation({ summary: 'Check if user is online', description: 'INTERNAL 🔒 endpoint, called by the AUTH service after a user logs in, to check if the profile is complete.' })
	@ApiResponse({ status: 200, type: IsOnlineResponseDto, description: 'User online status' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Validation failed: missing or invalid fields' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid internal key' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async isUserOnline(@Param() req: IsOnlineDto)
	{
		const isOnline = await this.appService.isUserOnline(req.userId);

		return ({ isOnline });
	}

	@Post(':userId/report')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Report a user as fake', description: 'Flags the target user as a fake account. Idempotent: reporting the same user more than once has no additional effect.' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Cannot report yourself / invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async reportUser( @Param('userId', ParseUUIDPipe) reportedId: string, @Body() body: ReportUserDto, @CurrentUser() userId: string)
	{
		await this.appService.reportFakeAccount(reportedId, body.reason ?? null, userId);
	}

	@Post(':userId/like')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Like a user', description: 'Records that the authenticated user likes the target user. Idempotent: liking the same user more than once has no additional effect.' })
	@ApiResponse({ status: 200, description: 'User liked successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Cannot like yourself / invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async likeUser(@Param('userId', ParseUUIDPipe) likedId: string, @CurrentUser() userId: string)
	{
		// it returns just CODES and takes just param from the request so no need of dto
		await this.appService.likeUser(likedId, userId);
	}

	// Left swipe. The pass is stored (passes table), and a passed user is NOT excluded from
	// discovery: they sink to the bottom of the deck, after everyone not passed on yet.
	@Post(':userId/pass')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Pass on a user', description: 'Left swipe. Records that the authenticated user passed on the target user, who then sinks to the bottom of the discover deck and the search results instead of disappearing. Idempotent: passing the same user more than once has no additional effect.' })
	@ApiResponse({ status: 200, description: 'Pass recorded' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Cannot pass yourself / invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async passUser(@Param('userId', ParseUUIDPipe) passedId: string, @CurrentUser() userId: string)
	{
		await this.appService.passUser(passedId, userId);
	}

	@Delete(':userId/like')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Unlike a user', description: 'Removes a previously given like. Idempotent: unliking a user that was not liked has no effect.' })
	@ApiResponse({ status: 200, description: 'User unliked successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async unlikeUser(@Param('userId', ParseUUIDPipe) likedId: string, @CurrentUser() userId: string)
	{
		await this.appService.unlikeUser(likedId, userId);
	}

	@Post(':userId/block')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Block a user', description: 'Blocks the target user. Mutual effect, dissolves any existing match, and suppresses notifications both ways. Idempotent.' })
	@ApiResponse({ status: 200, description: 'User blocked successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Cannot block yourself / invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 404, type: ErrorDto, description: 'User not found' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async blockUser(@Param('userId', ParseUUIDPipe) blockedId: string, @CurrentUser() userId: string)
	{
		await this.appService.blockUser(blockedId, userId);
	}

	@Delete(':userId/block')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Unblock a user', description: 'Removes a block. Idempotent: unblocking a user that was not blocked has no effect. The previous match is not restored.' })
	@ApiResponse({ status: 200, description: 'User unblocked successfully' })
	@ApiResponse({ status: 400, type: ErrorDto, description: 'Invalid user id' })
	@ApiResponse({ status: 401, type: ErrorDto, description: 'Missing or invalid access token' })
	@ApiResponse({ status: 500, type: ErrorDto, description: 'Internal server error' })
	@UseGuards(AuthenticatedUserGuard)
	async unblockUser(@Param('userId', ParseUUIDPipe) blockedId: string, @CurrentUser() userId: string)
	{
		await this.appService.unblockUser(blockedId, userId);
	}
}