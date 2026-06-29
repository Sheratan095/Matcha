import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { SupportedLanguage } from '@repo/shared-types';
import { User } from '@repo/shared-types';
import { hashToken, compareTokens } from '../utils/tokenHash';

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

	// 	RETRIEVE USER METHODS

	async getUserByUsername(username: string): Promise<User | undefined>
	{
		// Return the first user that matches the given username from the database. This is a helper method for authentication purposes.
		const result = await this.pool.query('SELECT * FROM users WHERE username = $1', [username]);
		return (result.rows[0] ? new User(result.rows[0]) : undefined);
	}

	async getUserByEmail(email: string): Promise<User | undefined>
	{
		// Return the first user that matches the given email from the database. This is a helper method for authentication purposes.
		const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
		return (result.rows[0] ? new User(result.rows[0]) : undefined);
	}

	async getUserById(id: string): Promise<User | undefined>
	{
		// Return the first user that matches the given ID from the database. This is a helper method for authentication purposes.
		const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
		return (result.rows[0] ? new User(result.rows[0]) : undefined);
	}

	async getUserByOAuth(provider: string, providerId: string): Promise<User | undefined>
	{
		// Retrieve user details by joining with the oauth_accounts table.
		const query = `
			SELECT u.* 
			FROM users u
			JOIN oauth_accounts oa ON u.id = oa.user_id
			WHERE oa.provider = $1 AND oa.provider_id = $2
		`;
		const result = await this.pool.query(query, [provider, providerId]);
		return (result.rows[0] ? new User(result.rows[0]) : undefined);
	}


	// 	MODIFY USER METHODS

	async createUser(email: string, username: string, passwordHash: string, language: SupportedLanguage, firstName: string, lastName: string) : Promise<User | undefined> 
	{
		// Insert a new user into the database with the provided email, username, and password hash. This is a helper method for user registration.
		// RETURNING * ensures all user fields are available for constructing the User object
		const result = await this.pool.query('INSERT INTO users (email, username, password_hash, language, first_name, last_name) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [email, username, passwordHash, language, firstName, lastName]);
		return (result.rows[0] ? new User(result.rows[0]) : undefined);
	}

	async markUserEmailVerified(userId: string)
	{
		// Update the user's record in the database to mark their email as verified. This is a helper method for email verification.
		await this.pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [userId]);
	}


	//	JWT TOKEN MANAGEMENT METHODS

	async saveRefreshToken(userId: string, refreshTokenHash: string, expiresAt: Date)
	{
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one refresh token is stored per user.
		await this.pool.query(`
			INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = CURRENT_TIMESTAMP
		`, [userId, refreshTokenHash, expiresAt]);
	}

	async deleteRefreshToken(userId: string)
	{
		// Delete the refresh token for a user from the database. This is a helper method for logout and token invalidation.
		await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
	}

	async getRefreshTokenRecord(refreshTokenPlain: string, userId : string): Promise<any>
	{
		// Retrieve the refresh token record from the database that matches the given hashed token. This is a helper method for validating refresh tokens.
		// In this case we also filter by user_id to reduce the number of tokens we have to compare with bcrypt
		const result = await this.pool.query('SELECT * FROM refresh_tokens WHERE expires_at > CURRENT_TIMESTAMP AND user_id = $1', [userId]);
		// result should be just one row due to the ON CONFLICT clause in saveRefreshToken, but we still have to compare with bcrypt to find if the token matches because of salting

		// Forced to pass trough all non-expired tokens and compare with bcrypt
		// because we hash the token before storing it and just re-hashing the input token and comparing hashes
		// doesn't work with bcrypt due to salting
		for (const row of result.rows)
			if (await compareTokens(refreshTokenPlain, row.token_hash))
				return (row);

		return (null);
	}


	// EMAIL VERIFICATION MANAGEMENT METHODS + CHANGE EMAIL METHODS

	async saveVerificationToken(userId: string, tokenHash: string, expiresAt: Date)
	{
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one verification token is stored per user.
		await this.pool.query(`
			INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = CURRENT_TIMESTAMP
		`, [userId, tokenHash, expiresAt]);
	}

	async deleteVerificationToken(userId: string)
	{
		// Delete the email verification token for a user from the database. This is a helper method for token invalidation after email verification.
		await this.pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
	}

	async getVerificationTokenRecord(tokenPlain: string): Promise<any>
	{
		// Retrieve the email verification token record from the database that matches the given hashed token. This is a helper method for validating email verification tokens.
		const result = await this.pool.query('SELECT * FROM email_verification_tokens WHERE expires_at > CURRENT_TIMESTAMP');

		// Forced to pass trough all non-expired tokens and compare with bcrypt
		// because we hash the token before storing it and just re-hashing the input token and comparing hashes
		// doesn't work with bcrypt due to salting
		for (const row of result.rows)
			if (await compareTokens(tokenPlain, row.token_hash))
				return (row);

		return (null);
	}

	async updateUserEmail(userId: string, newEmail: string)
	{
		// Update the user's email in the database. This is a helper method for changing email addresses.
		// Automatically sets email_verified to FALSE since the new email hasn't been verified yet.
		await this.pool.query('UPDATE users SET email = $1, email_verified = FALSE WHERE id = $2', [newEmail, userId]);
	}

	async emailExists(email: string): Promise<boolean>
	{
		// Check if an email already exists in the database. This is a helper method for validation during registration and email change.
		const result = await this.pool.query('SELECT COUNT(*) FROM users WHERE email = $1', [email]);
		return (parseInt(result.rows[0].count) > 0);
	}


	// FORGOT + RESET PASSWORD MANAGEMENT METHODS

	async saveForgotPasswordToken(userId: string, tokenHash: string, expiresAt: Date)
	{
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one forgot password token is stored per user.
		await this.pool.query(`
			INSERT INTO forgot_password_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, created_at = CURRENT_TIMESTAMP
		`, [userId, tokenHash, expiresAt]);
	}

	async deleteForgotPasswordToken(userId: string)
	{
		// Delete the forgot password token for a user from the database. This is a helper method for token invalidation after password reset.
		await this.pool.query('DELETE FROM forgot_password_tokens WHERE user_id = $1', [userId]);
	}

	async getForgotPasswordTokenRecord(tokenPlain: string): Promise<any>
	{
		// Retrieve the forgot password token record from the database that matches the given hashed token. This is a helper method for validating forgot password tokens.
		const result = await this.pool.query('SELECT * FROM forgot_password_tokens WHERE expires_at > CURRENT_TIMESTAMP');

		// Forced to pass trough all non-expired tokens and compare with bcrypt
		// because we hash the token before storing it and just re-hashing the input token and comparing hashes
		// doesn't work with bcrypt due to salting
		for (const row of result.rows)
			if (await compareTokens(tokenPlain, row.token_hash))
				return (row);

		return (null);
	}

	async updateUserPassword(userId: string, newPasswordHash: string)
	{
		// Update the user's password hash in the database. This is a helper method for the password reset process.
		await this.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
	}

	// Creates a new user from OAuth profile information in a single transaction.
	async createOAuthUser(profile: { email: string; username: string; provider: string; providerId: string }): Promise<User | undefined>
	{
		const { email, username, provider, providerId } = profile;
		const client = await this.pool.connect();

		try
		{
			await client.query('BEGIN');

			// 1. Insert the basic user info. We set email_verified to TRUE as the OAuth provider has already verified it.
			const userResult = await client.query(
				'INSERT INTO users (email, username, email_verified) VALUES ($1, $2, TRUE) RETURNING *',
				[email, username]
			);
			const newUser = new User(userResult.rows[0]);

			// 2. Insert the link between the new user and the OAuth provider.
			await client.query(
				'INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3)',
				[newUser.id, provider, providerId]
			);

			await client.query('COMMIT');
			return (newUser);
		}
		catch (error)
		{
			await client.query('ROLLBACK');
			throw (error);
		}
		finally
		{
			client.release();
		}
	}

	// Links an existing user account to an OAuth provider (e.g., when a user who registered manually logs in via GitHub).
	async linkOAuthAccount(userId: string, provider: string, providerId: string) {
		await this.pool.query(
			'INSERT INTO oauth_accounts (user_id, provider, provider_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, provider) DO UPDATE SET provider_id = $3',
			[userId, provider, providerId]
		);
	}
}