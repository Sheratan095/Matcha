import { Injectable, Logger, ConflictException, ForbiddenException, InternalServerErrorException, BadRequestException, NotFoundException, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'crypto';
import { DbService } from './db/db.service';
import { StorageService } from './storage/storage.service';
import { sanitizeImage, PICTURE_OUTPUT_EXT, PICTURE_OUTPUT_MIME } from './pictures/image.processor';
import { Profile, UserPicture, InterestTag, MAX_USER_PICTURES } from '@repo/shared-types';

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

	async getProfile(userId: string, requestorUserId: string)
	{
		try
		{
			const profile: Profile | null = await this.dbService.getProfile(userId);


			if (!profile)
			{
				this.logger.warn(`Profile not found for user ID ${userId}`);
				throw new NotFoundException('Profile not found');
			}

			// Views are only recorded if the requestor is not the owner of the profile.
			// Failures here must never block the response.
			if (userId !== requestorUserId)
			{
				this.dbService.addProfileView(requestorUserId, userId).catch(err =>
					this.logger.warn(`Failed to record profile view for viewer ${requestorUserId}: ${err.message}`)
				);
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

	async getProfileViewers(userId: string): Promise<string[]>
	{
		try
		{
			const views = await this.dbService.getProfileViewers(userId);

			return (views.map(view => view.viewerId));
		}
		catch (error: any)
		{
			this.logger.error(`Error fetching profile viewers for user ID ${userId}`, error);
			throw new InternalServerErrorException('Failed to fetch profile viewers');
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
