import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { SupportedLanguage } from '@repo/shared-types';

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

	async getUserByUsername(username: string)
	{
		// Return the first user that matches the given username from the database. This is a helper method for authentication purposes.
		const result = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
		return (result.rows[0]);
	}

	// Return the userId
	async createUser(email: string, username: string, passwordHash: string, language: SupportedLanguage, firstName: string, lastName: string) : Promise<string>
	{
		// Insert a new user into the database with the provided email, username, and password hash. This is a helper method for user registration.
		const result = await this.pool.query('INSERT INTO users (email, username, password_hash, language, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [email, username, passwordHash, language, firstName, lastName]);
		return (result.rows[0].id);
	}

	async markUserEmailVerified(userId: string)
	{
		// Update the user's record in the database to mark their email as verified. This is a helper method for email verification.
		await this.pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
	}

	async saveRefreshToken(userId: string, refreshToken: string, expiresAt: Date)
	{
		// Save the refresh token for a user in the database. This is a helper method for token management.
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one refresh token is stored per user.
		await this.pool.query(`
			INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = CURRENT_TIMESTAMP
		`, [userId, refreshToken, expiresAt]);
	}

	async getRefreshToken(userId: string)
	{
		// Retrieve the refresh token for a user from the database. This is a helper method for token validation.
		const result = await this.pool.query('SELECT token FROM refresh_tokens WHERE user_id = $1', [userId]);
		return (result.rows[0]?.token);
	}

	async saveVerificationToken(userId: string, token: string, expiresAt: Date)
	{
		// Save the email verification token for a user in the database. This is a helper method for email verification.
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one verification token is stored per user.
		await this.pool.query(`
			INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = CURRENT_TIMESTAMP
		`, [userId, token, expiresAt]);
	}

	async getVerificationToken(token: string)
	{
		// Retrieve the user ID associated with a given email verification token from the database. This is a helper method for email verification.
		const result = await this.pool.query('SELECT * FROM email_verification_tokens WHERE token = $1', [token]);
		return (result.rows[0]);
	}

}