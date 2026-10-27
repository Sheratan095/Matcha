import { Injectable, Logger, ConflictException, InternalServerErrorException, BadRequestException, NotFoundException, HttpException, ForbiddenException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';
import { DbService } from './db/db.service';
import { StorageService } from './storage/storage.service';
import { sanitizeImage, PICTURE_OUTPUT_EXT, PICTURE_OUTPUT_MIME } from './pictures/image.processor';
import { Profile, UserPicture, InterestTag, StdPayload, StdPayloadGeo, DiscoverCard, MAX_USER_PICTURES, CalendarEvent } from '@repo/shared-types';
import { DiscoverQueryDto } from './dto/discover.dto';
import { SearchQueryDto } from './dto/search.dto';
import { sendProfileViewNotification, checkIsUserOnline, sendProfileLikeNotification, sendProfileUnlikeNotification } from './utils/notification';
import { getDateOfBirthError, isInvalidDateOfBirth, INVALID_DATE_OF_BIRTH } from './utils/dateOfBirth';

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger("PROFILE AppService");

	constructor(
			private readonly dbService: DbService,
			private readonly httpService: HttpService,
			private readonly storageService: StorageService )
	{}

	// Called internally by the AUTH service after a user is registered, to create
	// the matching profile row (1:1 with the user).
	async createProfile(userId: string, firstName?: string, lastName?: string, dateOfBirth?: string)
	{
		// Validate date of birth before attempting to create the profile
		if (dateOfBirth)
		{
			const dobError = getDateOfBirthError(dateOfBirth);
			if (dobError)
				throw new BadRequestException(dobError);
		}

		try
		{
			await this.dbService.createProfile(userId, firstName, lastName, dateOfBirth);

			this.logger.log(`Profile created for user ID ${userId}`);

			return ({ message: 'Profile created', userId });
		}
		catch (error: any)
		{
			// A 400, not a 500: the auth service relays it to the user registering.
			if (isInvalidDateOfBirth(error))
				throw new BadRequestException(INVALID_DATE_OF_BIRTH);

			this.logger.error(`Error creating profile for user ID ${userId}`, error);

			// PostgreSQL unique violation error code is '23505' (profile already exists for this user)
			if (error && error.code === '23505')
				throw new ConflictException('Profile already exists');

			// Fallback for other DB / unexpected errors
			throw new InternalServerErrorException('Profile creation failed');
		}
	}

	// To be completed the user should (see DbService.isProfileComplete):
	//   have a gender
	//   specify a sexual preference
	//   have a non-empty bio
	//   have at least one interest
	// Pictures are NOT required here. Appearing in discover and search is stricter: it also needs
	// a date of birth, a location and a profile picture (discover_candidates, 011_browsing.sql).
	async isProfileComplete(userId: string): Promise<boolean>
	{
		try
		{
			return (await this.dbService.isProfileComplete(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error checking profile completeness for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to check profile completeness');
		}
	}

	// used both from GET profile/ and GET profile/:id endpoints
	async getProfile(userId: string, requestorUserId: string)
	{
		try
		{
			// Check block before fetching the profile
			if (userId !== requestorUserId && await this.dbService.isBlocked(userId, requestorUserId))
			{
				this.logger.warn(`Profile ${userId} hidden from ${requestorUserId} due to a block`);
				throw new NotFoundException('Profile not found');
			}

			const profile: Profile | null = await this.dbService.getProfile(userId);

			if (!profile)
			{
				this.logger.warn(`Profile not found for user ID ${userId}`);
				throw new NotFoundException('Profile not found');
			}

			// Views are only recorded if the requestor is not the owner of the profile.
			// Once recorded, push a live 'profile-view' notification to the owner.
			// Both steps are fire-and-forget: failures must never block the response.
			if (userId !== requestorUserId)
			{
				this.dbService.addProfileView(requestorUserId, userId)
					.then(() => sendProfileViewNotification(userId, requestorUserId, this.httpService))
					.catch(err =>
						this.logger.warn(`Failed to record/notify profile view for viewer ${requestorUserId}: ${err.message}`)
					);

				this.logger.log(`Profile view recorded for user ID ${userId} by viewer ${requestorUserId}`);
			}

			// Only when viewing someone else's profile: add the online status and the like/match
			// relation so the frontend can render presence, the like button state and a
			// "likes you" / "matched" badge. Both are meaningless on your own profile — and
			// isOnline would otherwise cost a notification-service round trip on every self-fetch.
			// The distanceKm is also only relevant when viewing another user's profile
			// (A block would have 404'd above, so a visible profile is never blocked.)
			if (userId !== requestorUserId)
			{
				// Three independent lookups (one HTTP, two queries), so run them concurrently.
				// Online status lives in the notification service; isUserOnline() swallows its
				// own failures and degrades to "offline", so it never breaks the profile fetch.
				const	[isOnline, { liked, likesYou }, distanceKm] = await Promise.all([
					this.isUserOnline(userId),
					this.dbService.getLikeRelation(requestorUserId, userId),
					this.dbService.getDistanceKm(requestorUserId, userId),
				]);

				const	relation = { liked, likesYou, matched: liked && likesYou };

				// Another user's coordinates NEVER leave the API: an exact position is a home
				// address, and distance alone is enough for the UI. distanceKm is derived from a
				// ~1 km-snapped position (see snap_coord in 002_create_profiles.sql), so an
				// attacker who re-reads it while moving around cannot trilaterate past that cell.
				// Same idea for the exact date of birth: others get the age, not the date.
				const	{ latitude, longitude, dateOfBirth, ...visible } = profile;

				return ({ ...visible, isOnline, relation, distanceKm });
			}

			// Own profile: returned whole. Full-precision coordinates so the frontend can place the
			// user's own map pin, and the fame rating too — it is a public number, so there is no
			// reason to hide a user's own score from them.
			return (profile);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error fetching profile for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch profile');
		}
	}

	async updateProfile( userId: string,
		fields: { firstName?: string; lastName?: string; gender?: string; sexualPreference?: string; biography?: string },
		interests?: string[],
		dateOfBirth?: string,
	): Promise<Profile>
	{
		try
		{
			// Validate date of birth before attempting to set it
			if (dateOfBirth !== undefined)
			{
				const dobError = getDateOfBirthError(dateOfBirth);
				if (dobError)
					throw new BadRequestException(dobError);
			}

			// Set-once, and applied FIRST: if it is refused, none of the other fields change.
			if (dateOfBirth !== undefined && !(await this.dbService.setDateOfBirth(userId, dateOfBirth)))
				throw new ConflictException('Date of birth is already set');

			const profile = await this.dbService.updateProfile(userId, fields, interests);

			// This endpoint sits behind the JWT guard, so a valid token should always
			// map to an existing profile. A miss here means the JWT and the users/profile
			// tables are out of sync (e.g. a deleted user with a still-valid token).
			if (!profile)
			{
				this.logger.warn(`Profile not found for user ID ${userId} during update`);
				throw new NotFoundException('Profile not found');
			}

			this.logger.log(`Profile updated for user ID ${userId}`);

			return (profile);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			if (isInvalidDateOfBirth(error))
				throw new BadRequestException(INVALID_DATE_OF_BIRTH);

			this.logger.error(`Error updating profile for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to update profile');
		}
	}

	// Stores the user's location (coordinates from a client-side map pin or GPS). The backend keeps
	// only the raw coordinates; the frontend reverse-geocodes for a label when it needs one.
	async updateLocation(userId: string, latitude: number, longitude: number)
	{
		try
		{
			const	updated = await this.dbService.updateLocation(userId, latitude, longitude);

			if (!updated)
			{
				this.logger.warn(`Profile not found for user ID ${userId} during location update`);
				throw new NotFoundException('Profile not found');
			}

			this.logger.log(`Location updated for user ID ${userId}`);

			return ({ updated: true });
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error updating location for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to update location');
		}
	}

	// Returns the users who viewed the profile of userId (the "who viewed my profile" list).
	async getProfileViewers(userId: string): Promise<StdPayload[]>
	{
		try
		{
			this.logger.log(`My likes requested for user ID ${userId}`);

			return (await this.dbService.getProfileViewers(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching profile viewers for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch profile viewers');
		}
	}

	// Returns the profiles userId has viewed, most recent first (the "my visit history" list).
	async getVisitedProfiles(userId: string): Promise<StdPayload[]>
	{
		try
		{
			this.logger.log(`Visit history requested for user ID ${userId}`);

			return (await this.dbService.getVisitedProfiles(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching visit history for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch visit history');
		}
	}

	// Returns the users who liked userId (the "who liked me" list).
	async getMyLikes(userId: string): Promise<StdPayload[]>
	{
		try
		{
			this.logger.log(`My likes requested for user ID ${userId}`);

			return (await this.dbService.getLikers(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching likers for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch likers');
		}
	}

	// Returns the users userId is connected to (mutual like).
	async getMyMatches(userId: string): Promise<StdPayload[]>
	{
		try
		{
			this.logger.log(`Matches requested for user ID ${userId}`);

			return (await this.dbService.getMatches(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching matches for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch matches');
		}
	}

	async getMyMatchesMap(userId: string): Promise<StdPayloadGeo[]>
	{
		try
		{
			this.logger.log(`Matches for map requested for user ID ${userId}`);

			return (await this.dbService.getMatchesMap(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching matches for map for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch matches for map');
		}
	}

	// Flags reportedId as a fake account on behalf of reporterId. Idempotent: reporting the
	// same user twice still resolves successfully, so the client never learns whether a prior
	// report existed.
	async reportFakeAccount(reportedId: string, reason: string | null, reporterId: string)
	{
		if (reportedId === reporterId)
			throw new BadRequestException('You cannot report yourself');

		try
		{
			const	created = await this.dbService.reportFake(reporterId, reason, reportedId);

			if (created)
				this.logger.log(`User ${reportedId} reported as fake by ${reporterId}`);
			else
				this.logger.log(`Duplicate fake report for user ${reportedId} by ${reporterId} ignored`);

			return ({ reported: true });
		}
		catch (error: any)
		{
			// Foreign key violation: the reported user does not exist.
			if (error && error.code === '23503')
				throw new NotFoundException('User not found');

			this.logger.error(`Error reporting user ${reportedId} as fake by ${reporterId}`, error);
			throw new InternalServerErrorException('Failed to report user');
		}
	}

	// Records that passerId passed on passedId (left swipe). Idempotent: passing the same user
	// twice still resolves successfully. Returns 404 if passedId doesn't exist (FK error 23503).
	// A pass only reorders discovery (passed users come last), it never hides anyone.
	async passUser(passedId: string, passerId: string)
	{
		if (passedId === passerId)
			throw new BadRequestException('You cannot pass yourself');

		try
		{
			const	created = await this.dbService.passUser(passerId, passedId);

			if (created)
				this.logger.log(`User ${passerId} passed on ${passedId}`);
			else
				this.logger.log(`User ${passerId} already passed on ${passedId}`);
		}
		catch (error: any)
		{
			// FK error 23503: passedId doesn't exist
			if (error && error.code === '23503')
				throw new NotFoundException('User not found');

			this.logger.error(`Error recording pass for user ${passerId} on ${passedId}`, error);
			throw new InternalServerErrorException('Failed to record pass');
		}
	}

	// The browsing deck (subject IV.3): profiles compatible with this user, weighted by proximity,
	// common tags and fame. The eligibility rules and the score live in SQL (discover_candidates,
	// 011_browsing.sql); this method only validates the request and hands it to the query builder.
	//
	// Does NOT record a profile view: views are the fame rating's denominator and are only written
	// when someone opens a FULL profile, so counting deck impressions would push every popular
	// user's like-rate down (see the note in 009_fame_rating.sql).
	async discoverProfiles(userId: string, query: DiscoverQueryDto): Promise<DiscoverCard[]>
	{
		// An inverted range is a client bug that would silently return an empty deck, which is
		// indistinguishable from "you have seen everyone". Say so instead.
		if (query.minAge !== undefined && query.maxAge !== undefined && query.minAge > query.maxAge)
			throw new BadRequestException('minAge cannot be greater than maxAge');

		if (query.minFame !== undefined && query.maxFame !== undefined && query.minFame > query.maxFame)
			throw new BadRequestException('minFame cannot be greater than maxFame');

		try
		{
			// if (await this.dbService.hasAnyPicture(userId) === false)
			// {
			// 	this.logger.warn(`Discover attempt by user ${userId} failed: user has no pictures`);
			// 	throw new ForbiddenException('You must have at least one picture to browse other users');
			// }

			if (await this.dbService.hasLocation(userId) === false)
			{
				this.logger.warn(`Discover attempt by user ${userId} failed: user has no location`);
				throw new ForbiddenException('You must have a location to browse other users');
			}

			const	cards = await this.dbService.getDiscoverCandidates(userId, query);

			this.logger.log(`Discover: ${cards.length} card(s) for user ID ${userId}`);

			return (cards);
		}
		catch (error: any)
		{
			// The location guard above throws from INSIDE the try, so without this its 403 would be
			// swallowed and reported as a 500 with the wrong message.
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error fetching suggestions for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch suggestions');
		}
	}

	// Advanced search (subject IV.4): eligibility lives in SQL (search_candidates, 011_browsing.sql),
	// the criteria are applied by DbService.getSearchCandidates. Like discover, it does NOT record
	// profile views.
	async searchProfiles(userId: string, query: SearchQueryDto): Promise<DiscoverCard[]>
	{
		// The subject's search is "selecting one or more criteria": an empty one is a client bug,
		// and answering it would just be the whole deck without the orientation rule.
		const	hasCriterion = Object.values(query).some((value) =>
			Array.isArray(value) ? value.length > 0 : value !== undefined);

		if (!hasCriterion)
			throw new BadRequestException('At least one search criterion is required');

		// Same reasoning as in discoverProfiles: an inverted range would silently return nothing.
		if (query.minAge !== undefined && query.maxAge !== undefined && query.minAge > query.maxAge)
			throw new BadRequestException('minAge cannot be greater than maxAge');

		if (query.minFame !== undefined && query.maxFame !== undefined && query.minFame > query.maxFame)
			throw new BadRequestException('minFame cannot be greater than maxFame');

		if (query.minDistanceKm !== undefined && query.maxDistanceKm !== undefined && query.minDistanceKm > query.maxDistanceKm)
			throw new BadRequestException('minDistanceKm cannot be greater than maxDistanceKm');

		try
		{
			// Distances are measured from YOUR location, as in discover.
			if (await this.dbService.hasLocation(userId) === false)
			{
				this.logger.warn(`Search attempt by user ${userId} failed: user has no location`);
				throw new ForbiddenException('You must have a location to search other users');
			}

			const	cards = await this.dbService.getSearchCandidates(userId, query);

			this.logger.log(`Search: ${cards.length} result(s) for user ID ${userId}`);

			return (cards);
		}
		catch (error: any)
		{
			// Rethrow the 403 above instead of reporting it as a 500.
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error searching profiles for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to search profiles');
		}
	}

	// Records that likerId liked likedId. Idempotent: liking the same user twice still resolves
	// successfully, so the client never learns whether a prior like existed.
	async likeUser(likedId: string, likerId: string)
	{
		if (likedId === likerId)
			throw new BadRequestException('You cannot like yourself');

		// A block in either direction hides the target: report it as not found — identical to a
		// nonexistent user (the FK-miss 404 below) — so a block is never distinguishable from
		// "user doesn't exist", matching how getProfile hides a blocked profile.
		if (await this.dbService.isBlocked(likerId, likedId))
		{
			this.logger.warn(`Like attempt from ${likerId} to ${likedId} blocked due to a block`);
			throw new NotFoundException('User not found');
		}

		if (await this.dbService.hasAnyPicture(likerId) === false)
		{
			this.logger.warn(`Like attempt from ${likerId} to ${likedId} failed: user has no pictures`);
			throw new ForbiddenException('You must have at least one picture to like other users');
		}

		try
		{
			// One transaction records the like and, if it completes a match, opens the chat.
			const	{ created, nowMatched } = await this.dbService.addLikeAndMatch(likerId, likedId);

			if (created)
			{
				this.logger.log(`User ${likedId} liked by ${likerId}; Matched: ${nowMatched}`);

				// Notify only on a new like. If they are now matched, a MATCHED event is also sent
				// to both users over the websocket.
				await sendProfileLikeNotification(likedId, likerId, nowMatched, this.httpService);
			}
			else
				this.logger.log(`Duplicate like for user ${likedId} by ${likerId} ignored`);

			return ({ liked: true });
		}
		catch (error: any)
		{
			// Foreign key violation: the liked user does not exist.
			if (error && error.code === '23503')
				throw new NotFoundException('User not found');

			this.logger.error(`Error liking user ${likedId} by ${likerId}`, error);
			throw new InternalServerErrorException('Failed to like user');
		}
	}

	// Removes a previously given like. Idempotent: unliking a user that wasn't liked still
	// resolves successfully.
	async unlikeUser(likedId: string, likerId: string)
	{
		if (likedId === likerId)
			throw new BadRequestException('You cannot unlike yourself');

		try
		{
			// One transaction removes the like and, if it broke a match, closes the chat.
			const	{ removed, wasMatched } = await this.dbService.removeLikeAndUnmatch(likerId, likedId);

			if (removed)
			{
				// Notify both users only when a real match was dissolved.
				if (wasMatched)
					await sendProfileUnlikeNotification(likedId, likerId, this.httpService);

				this.logger.log(`User ${likedId} unliked by ${likerId}`);
			}
			else
				this.logger.log(`Unlike for user ${likedId} by ${likerId} had no existing like to remove`);

			return ({ liked: false });
		}
		catch (error: any)
		{
			this.logger.error(`Error unliking user ${likedId} by ${likerId}`, error);
			throw new InternalServerErrorException('Failed to unlike user');
		}
	}

	// Blocks blockedId on behalf of blockerId. Mutual effect + dissolves any existing match.
	// Idempotent: blocking the same user twice still resolves successfully.
	async blockUser(blockedId: string, blockerId: string)
	{
		if (blockedId === blockerId)
			throw new BadRequestException('You cannot block yourself');

		try
		{
			const	{ created, wasMatched } = await this.dbService.addBlock(blockerId, blockedId);

			if (created)
				this.logger.log(`User ${blockedId} blocked by ${blockerId}`);
			else
				this.logger.log(`Duplicate block for user ${blockedId} by ${blockerId} ignored`);

			// If a match was dissolved, clear both sides' match/chat views with the existing
			// unmatch push. To the blocked user this is indistinguishable from a normal unmatch,
			// so the block itself is never revealed.
			if (wasMatched)
				await sendProfileUnlikeNotification(blockedId, blockerId, this.httpService);

			return ({ blocked: true });
		}
		catch (error: any)
		{
			// Foreign key violation: the blocked user does not exist.
			if (error && error.code === '23503')
				throw new NotFoundException('User not found');

			this.logger.error(`Error blocking user ${blockedId} by ${blockerId}`, error);
			throw new InternalServerErrorException('Failed to block user');
		}
	}

	// Removes a block. Idempotent: unblocking a user that wasn't blocked still resolves. The
	// previous match is NOT restored — the users must like each other again.
	async unblockUser(blockedId: string, blockerId: string)
	{
		if (blockedId === blockerId)
			throw new BadRequestException('You cannot unblock yourself');

		try
		{
			const	removed = await this.dbService.removeBlock(blockerId, blockedId);

			if (removed)
				this.logger.log(`User ${blockedId} unblocked by ${blockerId}`);
			else
				this.logger.log(`Unblock for user ${blockedId} by ${blockerId} had no existing block to remove`);

			return ({ blocked: false });
		}
		catch (error: any)
		{
			this.logger.error(`Error unblocking user ${blockedId} by ${blockerId}`, error);
			throw new InternalServerErrorException('Failed to unblock user');
		}
	}

	// Returns the users blocked by userId (the "my blocks" list).
	async getBlockedUsers(userId: string): Promise<StdPayload[]>
	{
		try
		{
			this.logger.log(`Blocked users requested for user ID ${userId}`);

			return (await this.dbService.getBlockedUsers(userId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching blocked users for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch blocked users');
		}
	}

	async getAllInterests(): Promise<InterestTag[]>
	{
		try
		{
			return (await this.dbService.getAllInterests());
		}
		catch (error: any)
		{
			this.logger.error('Error fetching interests', error);
			throw new InternalServerErrorException('Failed to fetch interests');
		}
	}

	async isUserOnline(userId: string): Promise<boolean>
	{
		try
		{
			this.logger.log(`Checking online status for user ID ${userId}`);

			return (await checkIsUserOnline(userId, this.httpService));
		}
		catch (error: any)
		{
			this.logger.error(`Error checking online status for user ID ${userId}`, error);

			// Degrade gracefully: if the notification service is down, assume offline
			return (false);
		}
	}

	//	PICTURES

	async uploadPicture(userId: string, file: { buffer: Buffer }): Promise<UserPicture[]>
	{
		const	count = await this.dbService.getPictureCount(userId);

		if (count >= MAX_USER_PICTURES)
			throw new BadRequestException(`You can upload at most ${MAX_USER_PICTURES} pictures`);

		this.logger.log(`Uploading picture for user ID ${userId}, current count: ${count}`);

		let	cleanImage: Buffer;

		try
		{
			cleanImage = await sanitizeImage(file.buffer);

			this.logger.log(`Picture sanitized for user ID ${userId}, size: ${cleanImage.length} bytes`);
		}
		catch
		{
			throw new BadRequestException('File is not a valid image');
		}

		const	key = `${userId}/${randomUUID()}.${PICTURE_OUTPUT_EXT}`;
		let		url: string;

	
		try
		{
			// Upload the sanitized image to STORAGE AND GET THE URL
			url = await this.storageService.upload(key, cleanImage, PICTURE_OUTPUT_MIME);

			this.logger.log(`Picture uploaded to STORAGE for user ID ${userId}, URL: ${url}`);
		}
		catch (error: any)
		{
			this.logger.error(`Error uploading picture to storage for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to store picture');
		}

		try
		{
			// Upload the picture URL to the DB, associated with the user. The DB will return the new picture row.
			// The first picture becomes the profile picture automatically.
			await this.dbService.addPicture(userId, url, count === 0);

			this.logger.log(`Picture URL saved to DB for user ID ${userId}, URL: ${url}`);
		}
		catch (error: any)
		{
			this.logger.error(`Error saving picture for user ID ${userId}, removing orphan file`, error);
			this.storageService.delete(key).catch(() => {});
			throw new InternalServerErrorException('Failed to save picture');
		}

		return (await this.dbService.getPicturesByUserId(userId));
	}

	async deletePicture(userId: string, pictureId: string): Promise<UserPicture[]>
	{
		try
		{
			const	url = await this.dbService.deletePicture(pictureId, userId);

			if (!url)
				throw new NotFoundException('Picture not found');

			// The DB row is already gone, so a storage failure only leaves an unreachable file behind.
			this.storageService.delete(this.storageService.keyFromUrl(url)).catch(err =>
				this.logger.warn(`Failed to delete picture file ${url}: ${err.message}`)
			);

			this.logger.log(`Picture ${pictureId} deleted for user ID ${userId}`);

			return (await this.dbService.getPicturesByUserId(userId));
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error deleting picture ${pictureId} for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to delete picture');
		}
	}

	async setProfilePicture(userId: string, pictureId: string): Promise<UserPicture[]>
	{
		try
		{
			if (!await this.dbService.setProfilePicture(userId, pictureId))
				throw new NotFoundException('Picture not found');

			this.logger.log(`Profile picture set to ${pictureId} for user ID ${userId}`);

			return (await this.dbService.getPicturesByUserId(userId));
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error setting profile picture ${pictureId} for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to set profile picture');
		}
	}

	// ------------------------- CALENDAR EVENTS -------------------------

	async getCalendar(userId: string): Promise<CalendarEvent[]>
	{
		try
		{
			const events = await this.dbService.getCalendarEvents(userId);

			this.logger.log(`Calendar events retrieved for user ID ${userId}, count: ${events.length}`);

			return (events);
		}
		catch (error: any)
		{
			this.logger.error(`Error retrieving calendar events for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to retrieve calendar events');
		}
	}

	// The match check lives in the INSERT itself (see DbService.createCalendarEvent): null means
	// the two users aren't matched. The self check runs first because a self "match" can't exist,
	// so it would otherwise surface as a 403 instead of a 400.
	async createCalendarEvent(event: CalendarEvent): Promise<CalendarEvent>
	{
		if (event.inviterId === event.inviteeId)
			throw new BadRequestException('You cannot add an event for yourself');

		try
		{
			const	newEvent = await this.dbService.createCalendarEvent(event);

			if (!newEvent)
				throw new ForbiddenException('You can only add events for your matches');

			this.logger.log(`Calendar event ${newEvent.eventId} created by ${newEvent.inviterId} for ${newEvent.inviteeId}`);

			return (newEvent);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			// CHECK violation: start_time >= end_time (or the self-invite backstop)
			if (error && error.code === '23514' && error.constraint === 'calendar_events_time_order_check')
				throw new BadRequestException('Event start time must be before its end time');
			if (error && error.code === '23514' && error.constraint === 'calendar_events_not_self_check')
				throw new BadRequestException('You cannot add an event for yourself');

			// Malformed uuid (22P02) or timestamp (22007 / 22008) that slipped past the DTO
			if (error && ['22P02', '22007', '22008'].includes(error.code))
				throw new BadRequestException('Invalid event fields');

			this.logger.error(`Error creating calendar event for user ID ${event.inviterId}`, error);
			throw new InternalServerErrorException('Failed to create calendar event');
		}
	}

	async acceptCalendarEvent(eventId: string, userId: string): Promise<Boolean>
	{
		try
		{
			const	updatedEvent = await this.dbService.acceptCalendarEvent(eventId, userId);

			if (!updatedEvent)
				throw new NotFoundException('Event not found or you are not the invitee');

			this.logger.log(`Calendar event ${eventId} accepted by ${userId}`);

			return (updatedEvent);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error accepting calendar event ${eventId} for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to accept calendar event');
		}
	}

	async declineCalendarEvent(eventId: string, userId: string): Promise<Boolean>
	{
		try
		{
			const	updatedEvent = await this.dbService.declineCalendarEvent(eventId, userId);

			if (!updatedEvent)
				throw new NotFoundException('Event not found or you are not the invitee');

			this.logger.log(`Calendar event ${eventId} declined by ${userId}`);

			return (updatedEvent);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error declining calendar event ${eventId} for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to decline calendar event');
		}
	}

	async cancelCalendarEvent(eventId: string, userId: string): Promise<Boolean>
	{
		try
		{
			const	updatedEvent = await this.dbService.cancelCalendarEvent(eventId, userId);

			if (!updatedEvent)
				throw new NotFoundException('Event not found or it can\'t be cancelled by you');

			this.logger.log(`Calendar event ${eventId} canceled by ${userId}`);

			return (updatedEvent);
		}
		catch (error: any)
		{
			if (error instanceof HttpException)
				throw (error);

			this.logger.error(`Error canceling calendar event ${eventId} for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to cancel calendar event');
		}
	}
}
