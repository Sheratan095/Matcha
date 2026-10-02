import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';
import { env } from "@repo/config";
import { Profile, InterestTag, UserPicture, ProfileView } from '@repo/shared-types';

@Injectable()

// The DbService class is responsible for managing the connection to the PostgreSQL database and executing queries.
// It implements the OnModuleInit interface, which allows it to perform initialization logic when the module is loaded.
export class DbService implements OnModuleInit
{
	private pool: Pool;

	// The onModuleInit method is called by the NestJS framework when the module is initialized.
	// It creates a new connection pool to the PostgreSQL database using the configuration values from the environment variables.
	onModuleInit()
	{
		this.pool = new Pool({
			user: env.POSTGRES_USER,
			password: env.POSTGRES_PASSWORD,
			host: env.POSTGRES_HOST,
			port: Number(env.POSTGRES_PORT),
			database: env.POSTGRES_DB,
		});
	}

	// The query method is a wrapper around the pool's query method, allowing other parts of the application to execute SQL queries against the database.
	query(text: string, params?: any[]): Promise<QueryResult<any>>
	{
		return (this.pool.query(text, params));
	}

	// Insert a new profile row for the given user. first_name / last_name are optional
	// at creation (the user fills the rest of the profile in later).
	// RETURNING * exposes all columns in case the caller needs them.
	async createProfile(userId: string, firstName?: string, lastName?: string)
	{
		const result = await this.pool.query(
			'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3) RETURNING *',
			[userId, firstName ?? null, lastName ?? null]
		);

		return (result.rows[0]);
	}

	async getProfile(userId: string): Promise<Profile | null>
	{
		const result = await this.pool.query(
			`SELECT user_id, first_name, last_name, gender, sexual_preference, biography, created_at, updated_at
			 FROM profiles
			 WHERE user_id = $1`,
			[userId]
		);

		if (!result.rows[0])
			return (null);

		const [interests, pictures] = await Promise.all([
			this.getInterestsByUserId(userId),
			this.getPicturesByUserId(userId),
		]);

		return (Profile.fromDbRow(result.rows[0], interests, pictures));
	}

	async getInterestsByUserId(userId: string): Promise<InterestTag[]>
	{
		const result = await this.pool.query(
			`SELECT i.id, i.name
			 FROM interest_tags i
			 INNER JOIN user_interests ui ON i.id = ui.tag_id
			 WHERE ui.user_id = $1`,
			[userId]
		);

		return (result.rows.map(row => InterestTag.fromDbRow(row)));
	}

	async getPicturesByUserId(userId: string): Promise<UserPicture[]>
	{
		const result = await this.pool.query(
			`SELECT id, url, is_profile
			 FROM user_pictures
			 WHERE user_id = $1
			 ORDER BY created_at`,
			[userId]
		);

		return (result.rows.map(row => UserPicture.fromDbRow(row)));
	}

	async getPictureCount(userId: string): Promise<number>
	{
		const result = await this.pool.query(
			'SELECT COUNT(*) AS count FROM user_pictures WHERE user_id = $1',
			[userId]
		);

		return (parseInt(result.rows[0].count, 10));
	}

	async addPicture(userId: string, url: string, isProfile: boolean): Promise<UserPicture>
	{
		const result = await this.pool.query(
			`INSERT INTO user_pictures (user_id, url, is_profile)
			 VALUES ($1, $2, $3)
			 RETURNING id, url, is_profile`,
			[userId, url, isProfile]
		);

		return (UserPicture.fromDbRow(result.rows[0]));
	}

	// The user_id filter is the ownership check: another user's picture id simply matches nothing.
	// Returns the deleted picture's url (so the file can be removed from storage), or null if not found.
	async deletePicture(pictureId: string, userId: string): Promise<string | null>
	{
		const result = await this.pool.query(
			`DELETE FROM user_pictures
			 WHERE id = $1 AND user_id = $2
			 RETURNING url`,
			[pictureId, userId]
		);

		if (result.rows.length === 0)
			return (null);

		return (result.rows[0].url);
	}

	// Returns false if the picture doesn't exist or doesn't belong to the user.
	async setProfilePicture(userId: string, pictureId: string): Promise<boolean>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			// Clear first: the partial unique index allows only one is_profile = true row per user.
			await client.query(
				'UPDATE user_pictures SET is_profile = FALSE WHERE user_id = $1 AND is_profile',
				[userId]
			);

			const result = await client.query(
				'UPDATE user_pictures SET is_profile = TRUE WHERE id = $1 AND user_id = $2',
				[pictureId, userId]
			);

			if (result.rowCount === 0)
			{
				await client.query('ROLLBACK');

				return (false);
			}

			await client.query('COMMIT');

			return (true);
		}
		catch (err)
		{
			await client.query('ROLLBACK');
			throw (err);
		}
		finally
		{
			client.release();
		}
	}

	// Called by login so frontend knows if the user has completed their profile.
	// Instead of calling getFullProfile it just checks the required fields and returns a boolean.
	//	to reduce the amount of data sent over the network because interests and picture are just COUNT instead of SELECT.
	async isProfileComplete(userId: string): Promise<boolean>
	{
		const profile = await this.pool.query(
			`SELECT gender, biography, sexual_preference
			 FROM profiles
			 WHERE user_id = $1`,
			[userId]
		);
		if (profile.rows.length === 0)
			return (false);

		const { gender, sexual_preference, biography } = profile.rows[0];
		if (!gender || !sexual_preference || !biography)
			return (false);

		// At least one interest is required for profile completion
		const interests = await this.pool.query(
			`SELECT COUNT(*) AS count
			 FROM user_interests
			 WHERE user_id = $1`,
			[userId]
		);
		if (parseInt(interests.rows[0].count, 10) === 0)
			return (false);

		// PICTURES AREN'T A REQUIREMENT FOR PROFILE COMPLETION, SO THIS CHECK IS COMMENTED OUT
		// const pictures = await this.pool.query(
		// 	`SELECT COUNT(*) AS count
		// 	 FROM user_pictures
		// 	 WHERE user_id = $1`,
		// 	[userId]
		// );
		// if (parseInt(pictures.rows[0].count, 10) < 5)
		// 	return (false);

		return (true);
	}

	async updateProfile( userId: string,
		fields: { firstName?: string; lastName?: string; gender?: string; sexualPreference?: string; biography?: string },
		interests?: string[],
	): Promise<Profile | null>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			// Build a dynamic SET clause from only the fields that were provided.
			const	setClauses: string[] = ['updated_at = NOW()'];
			const	params: any[]        = [userId]; // $1 is always userId
			let		paramIndex           = 2;

			const	columnMap: Record<string, string> =
			{
				firstName:        'first_name',
				lastName:         'last_name',
				gender:           'gender',
				sexualPreference: 'sexual_preference',
				biography:        'biography',
			};

			for (const [key, column] of Object.entries(columnMap))
			{
				if (fields[key as keyof typeof fields] !== undefined)
				{
					setClauses.push(`${column} = $${paramIndex}`);
					params.push(fields[key as keyof typeof fields]);
					paramIndex++;
				}
			}

			await client.query(
				`UPDATE profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
				params,
			);

			if (interests !== undefined)
			{
				// Upsert each tag and collect its id.
				const	tagIds: string[] = [];

				for (const name of interests)
				{
					// Upsert the tag: insert if new, or do a no-op update (name = EXCLUDED.name)
					// just to satisfy ON CONFLICT so RETURNING id fires even on duplicates.
					const tagResult = await client.query(
						`INSERT INTO interest_tags (name) VALUES ($1)
						 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
						 RETURNING id`,
						[name.toLowerCase().trim()],
					);

					tagIds.push(tagResult.rows[0].id);
				}

				// Replace all interests for this user atomically.
				await client.query('DELETE FROM user_interests WHERE user_id = $1', [userId]);

				if (tagIds.length > 0)
				{
					const	valuePlaceholders = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');

					await client.query(
						`INSERT INTO user_interests (user_id, tag_id) VALUES ${valuePlaceholders}`,
						[userId, ...tagIds],
					);
				}
			}

			await client.query('COMMIT');
		}
		catch (err)
		{
			await client.query('ROLLBACK');
			throw (err);
		}
		finally
		{
			client.release();
		}

		return (this.getProfile(userId));
	}

	async addProfileView(viewerId: string, viewedId: string): Promise<void>
	{
		await this.pool.query(
			`INSERT INTO profile_views (viewer_id, viewed_id)
			 VALUES ($1, $2)
			 ON CONFLICT (viewer_id, viewed_id) DO NOTHING`,
			[viewerId, viewedId]
		);
	}

	async getProfileViewers(viewedId: string): Promise<ProfileView[]>
	{
		const result = await this.pool.query(
			`SELECT viewer_id, viewed_id
			 FROM profile_views
			 WHERE viewed_id = $1`,
			[viewedId]
		);

		return (result.rows.map(row => ProfileView.fromDbRow(row)));
	}
}
