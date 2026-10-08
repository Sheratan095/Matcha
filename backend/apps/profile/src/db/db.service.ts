import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';
import { env } from "@repo/config";
import { Profile, InterestTag, UserPicture, StdPayload } from '@repo/shared-types';

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
			`SELECT p.user_id, u.username, p.first_name, p.last_name, p.gender, p.sexual_preference, p.biography, p.last_seen AS last_online, p.created_at, p.updated_at
			 FROM profiles p
			 INNER JOIN users u ON u.id = p.user_id
			 WHERE p.user_id = $1`,
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

	// Every interest tag in the system, for the "pick your interests" autocomplete.
	async getAllInterests(): Promise<InterestTag[]>
	{
		const result = await this.pool.query(
			`SELECT id, name
			 FROM interest_tags
			 ORDER BY name`
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
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			// Clear first: the partial unique index allows only one is_profile = true row per
			// user, so a new profile picture must demote the current one before being inserted.
			if (isProfile)
				await client.query(
					'UPDATE user_pictures SET is_profile = FALSE WHERE user_id = $1 AND is_profile',
					[userId]
				);

			const result = await client.query(
				`INSERT INTO user_pictures (user_id, url, is_profile)
				 VALUES ($1, $2, $3)
				 RETURNING id, url, is_profile`,
				[userId, url, isProfile]
			);

			await client.query('COMMIT');

			return (UserPicture.fromDbRow(result.rows[0]));
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

	// The user_id filter is the ownership check: another user's picture id simply matches nothing.
	// Returns the deleted picture's url (so the file can be removed from storage), or null if not found.
	// If the deleted picture was the profile picture, the oldest remaining picture is promoted so the
	// user is never left without a profile picture while they still have at least one picture.
	async deletePicture(pictureId: string, userId: string): Promise<string | null>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			const result = await client.query(
				`DELETE FROM user_pictures
				 WHERE id = $1 AND user_id = $2
				 RETURNING url, is_profile`,
				[pictureId, userId]
			);

			if (result.rows.length === 0)
			{
				await client.query('ROLLBACK');

				return (null);
			}

			const { url, is_profile } = result.rows[0];

			// Only promote when the profile picture itself was removed; the partial unique
			// index is safe here since the previous is_profile = true row is already gone.
			if (is_profile)
			{
				await client.query(
					`UPDATE user_pictures SET is_profile = TRUE
					 WHERE id = (
						SELECT id FROM user_pictures
						WHERE user_id = $1
						ORDER BY created_at
						LIMIT 1
					 )`,
					[userId]
				);
			}

			await client.query('COMMIT');

			return (url);
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

	// Records that reporterId flagged reportedId as a fake account. Idempotent: a second
	// report for the same pair is a no-op (ON CONFLICT DO NOTHING). Returns true when a new
	// report was stored, false when this reporter had already reported this user.
	// A missing reportedId trips the users(id) foreign key (error code 23503), which the
	// service layer translates into a 404.
	async reportFake(reporterId: string, reason: string | null, reportedId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`INSERT INTO fake_reports (reporter_id, reported_id, reason)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (reporter_id, reported_id) DO NOTHING`,
			[reporterId, reportedId, reason]
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Records that likerId liked likedId. Idempotent: a second like for the same pair is a
	// no-op (ON CONFLICT DO NOTHING). Returns true when a new like was stored, false when the
	// like already existed. A missing likedId trips the users(id) foreign key (error code
	// 23503), which the service layer translates into a 404.
	async addLike(likerId: string, likedId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`INSERT INTO likes (liker_id, liked_id)
			 VALUES ($1, $2)
			 ON CONFLICT (liker_id, liked_id) DO NOTHING`,
			[likerId, likedId]
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Removes a previously given like. Idempotent: removing a like that isn't there is a no-op.
	// Returns true when a like was actually removed, false when there was nothing to remove.
	async removeLike(likerId: string, likedId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`DELETE FROM likes
			 WHERE liker_id = $1 AND liked_id = $2`,
			[likerId, likedId]
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Two users are connected (a "match") when the like exists in both directions. The order of
	// the two ids does not matter: the EXISTS checks one direction and the implicit reverse pair
	// the other. Returns true only when both rows are present.
	async areConnected(userAId: string, userBId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`SELECT EXISTS (
				SELECT 1 FROM likes a
				INNER JOIN likes b
					ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
				WHERE a.liker_id = $1 AND a.liked_id = $2
			 ) AS connected`,
			[userAId, userBId]
		);

		return (result.rows[0].connected === true);
	}

	// Lists the users who liked likedId (the "who liked me" view). Mirrors getProfileViewers:
	// joins the username and the profile picture (LEFT JOIN, so a user with no picture still
	// shows up with a null url). Filters on liked_id, served by idx_likes_liked_id.
	async getLikers(likedId: string): Promise<StdPayload[]>
	{
		const result = await this.pool.query(
			`SELECT l.liker_id, u.username, up.url AS profile_picture_url
			 FROM likes l
			 INNER JOIN users u ON l.liker_id = u.id
			 LEFT JOIN user_pictures up ON up.user_id = l.liker_id AND up.is_profile
			 WHERE l.liked_id = $1`,
			[likedId]
		);

		return (result.rows.map(row => StdPayload.fromLikeData(row)));
	}

	async getProfileViewers(viewedId: string): Promise<StdPayload[]>
	{
		const result = await this.pool.query(
			`SELECT pv.viewer_id, u.username, up.url AS profile_picture_url
			 FROM profile_views pv
			 INNER JOIN users u ON pv.viewer_id = u.id
			 LEFT JOIN user_pictures up ON up.user_id = pv.viewer_id AND up.is_profile
			 WHERE pv.viewed_id = $1`,
			[viewedId]
		);

		return (result.rows.map(row => StdPayload.fromViewData(row)));
	}

	// Lists the users userId is connected to (a mutual like exists in both directions). `mine`
	// are the likes userId gave; `theirs` is the reciprocal like back. The PK on (liker_id,
	// liked_id) guarantees at most one row per direction, so each connection appears once with
	// no need for DISTINCT. Joins username + profile picture of the other user, served by the
	// (liker_id, liked_id) PK one way and idx_likes_liked_id the other.
	async getMatches(userId: string): Promise<StdPayload[]>
	{
		const result = await this.pool.query(
			`SELECT other.id AS connection_id, other.username, up.url AS profile_picture_url
			 FROM likes mine
			 INNER JOIN likes theirs ON theirs.liker_id = mine.liked_id AND theirs.liked_id = mine.liker_id
			 INNER JOIN users other ON other.id = mine.liked_id
			 LEFT JOIN user_pictures up ON up.user_id = mine.liked_id AND up.is_profile
			 WHERE mine.liker_id = $1`,
			[userId]
		);

		return (result.rows.map(row => StdPayload.fromConnectionData(row)));
	}
}
