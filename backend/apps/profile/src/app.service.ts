import { Injectable, Logger, ConflictException, InternalServerErrorException, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';
import { DbService } from './db/db.service';
import { StorageService } from './storage/storage.service';
import { sanitizeImage, PICTURE_OUTPUT_EXT, PICTURE_OUTPUT_MIME } from './pictures/image.processor';
import { Profile, UserPicture, InterestTag, StdPayload, MAX_USER_PICTURES } from '@repo/shared-types';
import { sendProfileViewNotification, checkIsUserOnline, sendProfileLikeNotification, sendProfileUnlikeNotification } from './utils/notification';

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
	async createProfile(userId: string, firstName?: string, lastName?: string)
	{
		try
		{
			await this.dbService.createProfile(userId, firstName, lastName);

			this.logger.log(`Profile created for user ID ${userId}`);

			return ({ message: 'Profile created', userId });
		}
		catch (error: any)
		{
			this.logger.error(`Error creating profile for user ID ${userId}`, error);

			// PostgreSQL unique violation error code is '23505' (profile already exists for this user)
			if (error && error.code === '23505')
				throw new ConflictException('Profile already exists');

			// Fallback for other DB / unexpected errors
			throw new InternalServerErrorException('Profile creation failed');
		}
	}

	// To be completed the user should:
	//   have a gender
	//   have a bio
	//   specify a sexual orientation
	//   a list of interests
	//   upload at least 5 pictures
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
			// (A block would have 404'd above, so a visible profile is never blocked.)
			if (userId !== requestorUserId)
			{
				// Online status lives in the notification service. Keep it non-blocking:
				// a failure there degrades to "offline", never breaks the profile fetch.
				const	isOnline = await this.isUserOnline(userId);

				const	{ liked, likesYou } = await this.dbService.getLikeRelation(requestorUserId, userId);

				const	relation = { liked, likesYou, matched: liked && likesYou };

				return ({ ...profile, isOnline, relation });
			}

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
	): Promise<Profile>
	{
		try
		{
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

			this.logger.error(`Error updating profile for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to update profile');
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

		try
		{
			const	created = await this.dbService.addLike(likerId, likedId);

			if (created)
			{
				// Check if the like resulted in a match (mutual like).
				const nowMatched = await this.dbService.areConnected(likerId, likedId);

				this.logger.log(`User ${likedId} liked by ${likerId}; Matched: ${nowMatched}`);

				// Send notification just if a new like was created
				// If they are matched, another notitification will be sent to both users ws: MATCHED event.
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
			const wereConnected = await this.dbService.areConnected(likerId, likedId);

			const	removed = await this.dbService.removeLike(likerId, likedId);

			if (removed)
			{
				// Send notification only if they were previusly connected
				if (wereConnected)
					await sendProfileUnlikeNotification(likedId, likerId, this.httpService);

				this.logger.log(`User ${likedId} unliked by ${likerId}`);
			}
			else
				this.logger.log(`Unlike for user ${likedId} by ${likerId} had no existing like to remove`);

			//TODO : send notification to liked user that they were unliked (if they were previously liked)
			// only if they were connected

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
}
