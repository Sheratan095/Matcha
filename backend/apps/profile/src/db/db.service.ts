import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';
import { env } from "@repo/config";
import { Profile, InterestTag, UserPicture, StdPayload, StdPayloadGeo } from '@repo/shared-types';

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
	// age is not inserted: the profiles_set_age trigger derives it from date_of_birth, and
	// profiles_age_check refuses the row when that age is under 18.
	async createProfile(userId: string, firstName?: string, lastName?: string, dateOfBirth?: string)
	{
		const result = await this.pool.query(
			'INSERT INTO profiles (user_id, first_name, last_name, date_of_birth) VALUES ($1, $2, $3, $4) RETURNING *',
			[userId, firstName ?? null, lastName ?? null, dateOfBirth ?? null]
		);

		return (result.rows[0]);
	}

	async getProfile(userId: string): Promise<Profile | null>
	{
		const result = await this.pool.query(
			// date_of_birth is selected as TEXT on purpose: node-postgres parses a DATE into a JS Date at
			// LOCAL midnight, and with TZ=Europe/Rome that serialises as the previous day
			// ('1998-04-12' -> '1998-04-11T22:00:00.000Z').
			`SELECT p.user_id, u.username, p.first_name, p.last_name, p.gender, p.sexual_preference, p.biography, p.last_seen, p.latitude, p.longitude, p.fame_rating,
					to_char(p.date_of_birth, 'YYYY-MM-DD') AS date_of_birth, p.age, p.created_at, p.updated_at
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

			// A picture is part of the fame rating's completeness bonus, so the FIRST one can
			// raise the score. Recomputing unconditionally keeps this cheap and correct without
			// the method having to know whether this was the first.
			await this.recomputeFameRating(userId, client);

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

			// Deleting the LAST picture breaks profile completeness and costs the bonus.
			await this.recomputeFameRating(userId, client);

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

	async hasAnyPicture(userId: string) : Promise<boolean>
	{
		const result = await this.pool.query(
			`SELECT COUNT(*) AS count
			 FROM user_pictures
			 WHERE user_id = $1`,
			[userId]
		);
		return (parseInt(result.rows[0].count, 10) > 0);
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

			// The biography and the interest list both feed the fame rating's completeness bonus,
			// so editing either can move the score. Recomputed before COMMIT so the returned
			// profile below already carries the new value.
			await this.recomputeFameRating(userId, client);

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

	// Stores the user's location coordinates (set client-side from a map pin or GPS). Returns
	// false when no profile row exists for the user (should not happen for an authenticated user).
	async updateLocation(userId: string, latitude: number, longitude: number): Promise<boolean>
	{
		const result = await this.pool.query(
			`UPDATE profiles
			 SET latitude = $2, longitude = $3, updated_at = NOW()
			 WHERE user_id = $1`,
			[userId, latitude, longitude]
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Sets the date of birth ONCE. The `date_of_birth IS NULL` guard makes it set-once inside the
	// statement itself, so two concurrent requests cannot both succeed. Returns false when it was
	// already set. age is filled by the profiles_set_age trigger, and an invalid date or an age
	// under 18 makes Postgres throw (22008 / 23514 on profiles_age_check), handled by the caller.
	async setDateOfBirth(userId: string, dateOfBirth: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`UPDATE profiles
			 SET date_of_birth = $2, updated_at = NOW()
			 WHERE user_id = $1 AND date_of_birth IS NULL`,
			[userId, dateOfBirth]
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Whole kilometres between two users, for the "N km away" shown on someone else's profile.
	// Returns null when either user has no location set (distance_km is STRICT).
	//
	// Only the TARGET is snapped: the viewer already knows their own position, so quantizing it
	// would only add error. Snapping the target is what caps what repeated probes can learn —
	// an attacker who moves around and re-reads this can at best recover the ~1 km grid cell.
	//
	// Rounded to whole kilometres because the snap already costs up to ~1.5 km of accuracy;
	// reporting decimals would claim a precision this number does not have.
	//
	// Floored at 1 km: a literal 0 reads like a bug, and it is also the most sensitive answer
	// this endpoint can give, since it places the target within ~500 m of the viewer.
	async getDistanceKm(fromUserId: string, toUserId: string): Promise<number | null>
	{
		const result = await this.pool.query(
			`SELECT ROUND(distance_km(viewer.latitude, viewer.longitude,
									  snap_coord(target.latitude), snap_coord(target.longitude)))::int AS distance_km
			 FROM profiles viewer, profiles target
			 WHERE viewer.user_id = $1 AND target.user_id = $2`,
			[fromUserId, toUserId]
		);

		const	distanceKm = result.rows[0]?.distance_km ?? null;

		// A user with no location must stay null, never become "1 km away". Hence the clamp is
		// HERE and not GREATEST(1, ...) in the query above: GREATEST IGNORES NULLS in Postgres,
		// so GREATEST(1, NULL) is 1, not NULL.
		if (distanceKm === null)
			return (null);

		// Clamped on the way OUT, never inside an ORDER BY: when the discovery query starts
		// sorting candidates by distance it must sort on the real distance_km(), otherwise every
		// nearby candidate collapses into a single tie and "nearest first" stops meaning anything.
		return (Math.max(1, distanceKm));
	}

	// Recomputes and stores userId's fame rating from the current state of likes, profile views,
	// reports, blocks and profile completeness. The formula itself lives in SQL
	// (compute_fame_rating, see 009_fame_rating.sql) so this method and the migration's backfill
	// can never disagree about what fame means.
	//
	// The optional client lets a caller run this INSIDE its own transaction: the score must commit
	// together with the like/block that changed it, or a rolled-back like would leave the rating
	// permanently wrong. Callers with no transaction pass nothing and get the pool.
	async recomputeFameRating(userId: string, client?: PoolClient): Promise<void>
	{
		await (client ?? this.pool).query(
			`UPDATE profiles
			 SET fame_rating = compute_fame_rating($1)
			 WHERE user_id = $1`,
			[userId]
		);
	}

	async addProfileView(viewerId: string, viewedId: string): Promise<void>
	{
		const result = await this.pool.query(
			`INSERT INTO profile_views (viewer_id, viewed_id)
			 VALUES ($1, $2)
			 ON CONFLICT (viewer_id, viewed_id) DO NOTHING`,
			[viewerId, viewedId]
		);

		// Views are the DENOMINATOR of the fame rating, so a new viewer changes it. Guarded on
		// rowCount because the table is keyed on (viewer_id, viewed_id): the same person opening
		// a profile a second time inserts nothing and must not trigger a pointless UPDATE.
		if ((result.rowCount ?? 0) > 0)
			await this.recomputeFameRating(viewedId);
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

		const	created = (result.rowCount ?? 0) > 0;

		// A report costs the reported user fame (capped, see compute_fame_rating).
		if (created)
			await this.recomputeFameRating(reportedId);

		return (created);
	}

	// Records that likerId liked likedId. Idempotent: a second like for the same pair is a
	// no-op (ON CONFLICT DO NOTHING). Returns true when a new like was stored, false when the
	// like already existed. A missing likedId trips the users(id) foreign key (error code
	// 23503), which the service layer translates into a 404.
	// Likes likedId on behalf of likerId and, atomically, opens the chat if this completes a mutual
	// like. One transaction, so a match can never exist without its chat (nor vice versa). Returns
	// whether a new like was stored and whether the pair is now matched. A missing likedId trips
	// the users(id) foreign key (error code 23503), which the service layer translates into a 404.
	async addLikeAndMatch(likerId: string, likedId: string): Promise<{ created: boolean; nowMatched: boolean }>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			const likeResult = await client.query(
				`INSERT INTO likes (liker_id, liked_id)
				 VALUES ($1, $2)
				 ON CONFLICT (liker_id, liked_id) DO NOTHING`,
				[likerId, likedId]
			);
			const created = (likeResult.rowCount ?? 0) > 0;

			let	nowMatched = false;

			// Only a brand-new like can create a match, so skip the work on a duplicate.
			if (created)
			{
				const matchResult = await client.query(
					`SELECT EXISTS (
						SELECT 1 FROM likes a
						INNER JOIN likes b
							ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
						WHERE a.liker_id = $1 AND a.liked_id = $2
					 ) AS connected`,
					[likerId, likedId]
				);
				nowMatched = matchResult.rows[0].connected === true;

				// A new match opens its chat, stored canonically (user_a < user_b), in the same tx.
				if (nowMatched)
					await client.query(
						`INSERT INTO chats (user_a, user_b)
						 VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid))
						 ON CONFLICT (user_a, user_b) DO NOTHING`,
						[likerId, likedId]
					);

				// The liked user's fame rating counts likes received, so it moves on a new like.
				// Inside the transaction on purpose: if the like rolls back, so must the score.
				await this.recomputeFameRating(likedId, client);
			}

			await client.query('COMMIT');

			return ({ created, nowMatched });
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

	// Removes a previously given like. Idempotent: removing a like that isn't there is a no-op.
	// Returns true when a like was actually removed, false when there was nothing to remove.
	// Removes likerId's like of likedId and, atomically, closes the chat if this breaks a match.
	// One transaction, so a dissolved match never leaves its chat (and messages) behind. Returns
	// whether a like was actually removed and whether the pair had been matched (so the service
	// notifies only on a real unmatch). Removing a like that isn't there is a no-op.
	async removeLikeAndUnmatch(likerId: string, likedId: string): Promise<{ removed: boolean; wasMatched: boolean }>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			// Capture the match state BEFORE removing the like (removing it breaks the mutual).
			const matchResult = await client.query(
				`SELECT EXISTS (
					SELECT 1 FROM likes a
					INNER JOIN likes b
						ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
					WHERE a.liker_id = $1 AND a.liked_id = $2
				 ) AS connected`,
				[likerId, likedId]
			);
			const wasMatched = matchResult.rows[0].connected === true;

			const deleteResult = await client.query(
				`DELETE FROM likes
				 WHERE liker_id = $1 AND liked_id = $2`,
				[likerId, likedId]
			);
			const removed = (deleteResult.rowCount ?? 0) > 0;

			// The removed like broke the match => close the chat (cascade wipes its messages).
			if (removed && wasMatched)
				await client.query(
					`DELETE FROM chats
					 WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`,
					[likerId, likedId]
				);

			// The liked user lost a like, so their fame rating drops. Same transaction as above.
			if (removed)
				await this.recomputeFameRating(likedId, client);

			await client.query('COMMIT');

			return ({ removed, wasMatched });
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

	// Two users are connected (a "match") when the like exists in both directions. The order of
	// the two ids does not matter: the EXISTS checks one direction and the implicit reverse pair
	// the other. Returns true only when both rows are present.
	// Directional like state between a viewer and a target, in a single round trip:
	// `liked`    = the viewer has liked the target (viewer -> target),
	// `likesYou` = the target has liked the viewer (target -> viewer).
	// The caller derives "matched" as liked && likesYou.
	async getLikeRelation(viewerId: string, targetId: string): Promise<{ liked: boolean; likesYou: boolean }>
	{
		const result = await this.pool.query(
			`SELECT
				EXISTS(SELECT 1 FROM likes WHERE liker_id = $1 AND liked_id = $2) AS liked,
				EXISTS(SELECT 1 FROM likes WHERE liker_id = $2 AND liked_id = $1) AS likes_you`,
			[viewerId, targetId]
		);

		return ({
			liked:    result.rows[0].liked === true,
			likesYou: result.rows[0].likes_you === true,
		});
	}

	// Lists the users who liked likedId but whom likedId has NOT liked back — i.e. pending
	// admirers, excluding matches (those live in getMatches) and blocked pairs. Mirrors
	// getProfileViewers for the join; filters on liked_id, served by idx_likes_liked_id.
	async getLikers(likedId: string): Promise<StdPayload[]>
	{
		const result = await this.pool.query(
			`SELECT l.liker_id, u.username, up.url AS profile_picture_url
			 FROM likes l
			 INNER JOIN users u ON l.liker_id = u.id
			 LEFT JOIN user_pictures up ON up.user_id = l.liker_id AND up.is_profile
			 WHERE l.liked_id = $1
			   AND NOT EXISTS (
				SELECT 1 FROM likes mine
				WHERE mine.liker_id = $1 AND mine.liked_id = l.liker_id
			   )
			   AND NOT EXISTS (
				SELECT 1 FROM blocks bl
				WHERE (bl.blocker_id = $1 AND bl.blocked_id = l.liker_id)
				   OR (bl.blocker_id = l.liker_id AND bl.blocked_id = $1)
			   )`,
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
			 WHERE pv.viewed_id = $1
			   AND NOT EXISTS (
				SELECT 1 FROM blocks bl
				WHERE (bl.blocker_id = $1 AND bl.blocked_id = pv.viewer_id)
				   OR (bl.blocker_id = pv.viewer_id AND bl.blocked_id = $1)
			   )`,
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
		//	No block filter needed: addBlock() deletes the likes in both directions, so a
		//  blocked pair can never have a mutual like (hence never a match) to begin with.

		const result = await this.pool.query(
			`SELECT other.id AS connection_id, other.username, up.url AS profile_picture_url
			 FROM likes mine
			 INNER JOIN likes theirs ON theirs.liker_id = mine.liked_id AND theirs.liked_id = mine.liker_id
			 INNER JOIN users other ON other.id = mine.liked_id
			 LEFT JOIN user_pictures up ON up.user_id = mine.liked_id AND up.is_profile
			 WHERE mine.liker_id = $1`,
			[userId]
		);

		return (result.rows.map(row => StdPayload.fromMatchData(row)));
	}

	async getMatchesMap(userId: string): Promise<StdPayloadGeo[]>
	{
		//	No block filter needed: addBlock() deletes the likes in both directions, so a
		//  blocked pair can never have a mutual like (hence never a match) to begin with.

		// snap_coord: a match's position is pinned on a map, so it must be quantized to the
		// ~1 km grid before it leaves the DB (see 002_create_profiles.sql).
		const result = await this.pool.query(
			`SELECT other.id AS user_id, other.username, up.url AS profile_picture_url,
					snap_coord(p.latitude) AS latitude, snap_coord(p.longitude) AS longitude
			 FROM likes mine
			 INNER JOIN likes theirs ON theirs.liker_id = mine.liked_id AND theirs.liked_id = mine.liker_id
			 INNER JOIN users other ON other.id = mine.liked_id
			 INNER JOIN profiles p ON p.user_id = mine.liked_id
			 LEFT JOIN user_pictures up ON up.user_id = mine.liked_id AND up.is_profile
			 WHERE mine.liker_id = $1`,
			[userId]
		);

		return (result.rows.map(row => StdPayloadGeo.fromMatchMapData(row)));
	}

	// Blocks blockedId on behalf of blockerId and dissolves any relationship between the pair.
	// Runs in a transaction: records whether the two were matched (mutual like) BEFORE deleting,
	// inserts the block idempotently (ON CONFLICT DO NOTHING), then deletes the likes in BOTH
	// directions so an existing match ends immediately. Returns { created, wasMatched } so the
	// service can push an unmatch notification only when a match actually existed. A missing
	// blockedId trips the users(id) foreign key (error code 23503), translated into a 404.
	async addBlock(blockerId: string, blockedId: string): Promise<{ created: boolean; wasMatched: boolean }>
	{
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			const matchResult = await client.query(
				`SELECT EXISTS (
					SELECT 1 FROM likes a
					INNER JOIN likes b
						ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
					WHERE a.liker_id = $1 AND a.liked_id = $2
				 ) AS connected`,
				[blockerId, blockedId]
			);
			const wasMatched = matchResult.rows[0].connected === true;

			const blockResult = await client.query(
				`INSERT INTO blocks (blocker_id, blocked_id)
				 VALUES ($1, $2)
				 ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
				[blockerId, blockedId]
			);

			// Dissolve the relationship: remove likes in both directions between the pair.
			await client.query(
				`DELETE FROM likes
				 WHERE (liker_id = $1 AND liked_id = $2)
				    OR (liker_id = $2 AND liked_id = $1)`,
				[blockerId, blockedId]
			);

			// Remove the chat too (cascade wipes its messages). LEAST/GREATEST match the canonical
			// (user_a < user_b) ordering the chats table is stored in.
			await client.query(
				`DELETE FROM chats
				 WHERE user_a = LEAST($1::uuid, $2::uuid) AND user_b = GREATEST($1::uuid, $2::uuid)`,
				[blockerId, blockedId]
			);

			// Both users move: the likes above were deleted in BOTH directions (each may have lost
			// a like received), and the blocked user also takes the block penalty. Inside the
			// transaction, so a rolled-back block cannot leave two wrong scores behind.
			//
			// Locked in a CANONICAL order (sorted ids) rather than (blocker, blocked): two users
			// blocking each other at the same moment would otherwise lock the same two profiles
			// rows in opposite orders and deadlock (40P01). Any consistent order fixes it, so a
			// plain string sort is enough — the same reasoning behind chats' LEAST/GREATEST pair.
			const	[firstId, secondId] = [blockerId, blockedId].sort();

			await this.recomputeFameRating(firstId, client);
			await this.recomputeFameRating(secondId, client);

			await client.query('COMMIT');

			return ({ created: (blockResult.rowCount ?? 0) > 0, wasMatched });
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

	// Removes a block. Idempotent: unblocking when no block exists is a no-op. Only the caller's
	// own block row (blocker_id = blockerId) is removed; a block the other user holds is untouched.
	async removeBlock(blockerId: string, blockedId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`DELETE FROM blocks
			 WHERE blocker_id = $1 AND blocked_id = $2`,
			[blockerId, blockedId]
		);

		const	removed = (result.rowCount ?? 0) > 0;

		// Unblocking lifts the block penalty from the blocked user. The likes stay deleted, so
		// this does NOT restore the score they had before the block.
		if (removed)
			await this.recomputeFameRating(blockedId);

		return (removed);
	}

	// True when a block exists in EITHER direction between the two users (mutual effect gate for
	// likes and profile views).
	async isBlocked(userAId: string, userBId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`SELECT EXISTS (
				SELECT 1 FROM blocks
				WHERE (blocker_id = $1 AND blocked_id = $2)
				   OR (blocker_id = $2 AND blocked_id = $1)
			 ) AS blocked`,
			[userAId, userBId]
		);

		return (result.rows[0].blocked === true);
	}

	// Lists the users userId has blocked (directional: blocker_id = userId), for the "my blocks"
	// view. Mirrors getLikers: username + profile picture of the blocked user.
	async getBlockedUsers(userId: string): Promise<StdPayload[]>
	{
		const result = await this.pool.query(
			`SELECT b.blocked_id, u.username, up.url AS profile_picture_url
			 FROM blocks b
			 INNER JOIN users u ON b.blocked_id = u.id
			 LEFT JOIN user_pictures up ON up.user_id = b.blocked_id AND up.is_profile
			 WHERE b.blocker_id = $1`,
			[userId]
		);

		return (result.rows.map(row => StdPayload.fromBlockData(row)));
	}
}
