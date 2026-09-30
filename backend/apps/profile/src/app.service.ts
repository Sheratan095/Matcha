import { Injectable, Logger, ConflictException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { DbService } from './db/db.service';
import { Profile } from '@repo/shared-types';

// Services contain the core business logic like the db calls

// The @Injectable() decorator marks the AppService class as a provider that can be injected into other classes (like controllers) in the NestJS framework
// This allows for dependency injection, making it easier to manage and test the application's components.
@Injectable()
export class AppService
{
	private readonly logger = new Logger("PROFILE AppService");

	constructor(
			private readonly dbService: DbService,
			private readonly httpService: HttpService )
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
				throw new ConflictException('Profile not found');
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

			if (!profile)
			{
				this.logger.warn(`Profile not found for user ID ${userId} during update`);
				throw new ConflictException('Profile not found');
			}

			return (profile);
		}
		catch (error: any)
		{
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
}
