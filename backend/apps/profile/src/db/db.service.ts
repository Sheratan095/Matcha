import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";

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
	query(text: string, params?: any[])
	{
		return (this.pool.query(text, params));
	}

	// Insert a new profile row for the given user. first_name / last_name are optional
	// at creation (the user fills the rest of the profile in later).
	// RETURNING * exposes all columns in case the caller needs them.
	async createProfile(userId: number, firstName?: string, lastName?: string)
	{
		const result = await this.pool.query(
			'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3) RETURNING *',
			[userId, firstName ?? null, lastName ?? null]
		);

		return (result.rows[0]);
	}

	// retrieve profile by userId, including all related tables (interests, pictures, etc.)
	async ProfileByUserId(userId: number)
	{
		const result = await this.pool.query(
			`SELECT * FROM profiles p WHERE p.user_id = $1`,
			[userId]
		);

		return (result.rows[0]);
	}

	// retrieve tags of interests for a given userId
	async getInterestsByUserId(userId: number)
	{
		const result = await this.pool.query(
			`SELECT i.tag
			 FROM interest_tags i
			 INNER JOIN user_interests ui ON i.id = ui.interest_tag_id
			 WHERE ui.user_id = $1`,
			[userId]
		);

		return (result.rows.map(row => row.tag));
	}

	// Called by login so frontend knows if the user has completed their profile.
	// Instead of calling getFullProfile it just checks the required fields and returns a boolean.
	//	to reduce the amount of data sent over the network because interests and picture are just COUNT instead of SELECT.
	async isProfileComplete(userId: number): Promise<boolean>
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
