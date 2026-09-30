import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool, QueryResult } from 'pg';
import { env } from "@repo/config";
import { IProfile, IInterestTag, IUserPicture } from '@repo/shared-types';

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

	async getProfile(userId: string): Promise<IProfile | null>
	{
		const result = await this.pool.query(
			`SELECT user_id, first_name, last_name, gender, sexual_preference, biography, created_at, updated_at
			 FROM profiles
			 WHERE user_id = $1`,
			[userId]
		);

		if (!result.rows[0])
			return (null);

		const interest : IInterestTag[] = await this.getInterestsByUserId(userId);
		const pictures : IUserPicture[] = await this.getPicturesByUserId(userId);

		const	row = result.rows[0];
		const profile: IProfile = {
			userId:           row.user_id,
			firstName:        row.first_name,
			lastName:         row.last_name,
			gender:           row.gender,
			sexualPreference: row.sexual_preference,
			biography:        row.biography,
			createdAt:        row.created_at,
			updatedAt:        row.updated_at,
			interests:        interest,
			pictures:         pictures,
		};

		return (profile);
	}

	async getInterestsByUserId(userId: string): Promise<IInterestTag[]>
	{
		const result = await this.pool.query(
			`SELECT i.id, i.name
			 FROM interest_tags i
			 INNER JOIN user_interests ui ON i.id = ui.tag_id
			 WHERE ui.user_id = $1`,
			[userId]
		);

		return (result.rows);
	}

	async getPicturesByUserId(userId: string): Promise<IUserPicture[]>
	{
		const result = await this.pool.query(
			`SELECT id, url, is_profile, position
			 FROM user_pictures
			 WHERE user_id = $1
			 ORDER BY position`,
			[userId]
		);

		return (result.rows.map(row => ({
			id:        row.id,
			url:       row.url,
			isProfile: row.is_profile,
			position:  row.position,
		})));
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

		const interests = await this.pool.query(
			`SELECT COUNT(*) AS count
			 FROM user_interests
			 WHERE user_id = $1`,
			[userId]
		);
		if (parseInt(interests.rows[0].count, 10) === 0)
			return (false);

		const pictures = await this.pool.query(
			`SELECT COUNT(*) AS count
			 FROM user_pictures
			 WHERE user_id = $1`,
			[userId]
		);
		if (parseInt(pictures.rows[0].count, 10) < 5)
			return (false);

		return (true);
	}

	// TO DO more profile db methods (read/update profiles, interest_tags, user_interests, user_pictures)
}
