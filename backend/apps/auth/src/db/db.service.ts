import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { SupportedLanguage } from '@repo/shared-types';
import { User } from '@repo/shared-types';

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

	async deleteRefreshToken(userId: string)
	{
		// Delete the refresh token for a user from the database. This is a helper method for logout and token invalidation.
		await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
	}


	// EMAIL VERIFICATION MANAGEMENT METHODS

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
		// Retrieve the email verification token record by token. This is a helper method for email verification.
		const result = await this.pool.query('SELECT * FROM email_verification_tokens WHERE token = $1', [token]);
		return result.rows[0];
	}

	async deleteVerificationToken(userId: string)
	{
		// Delete the email verification token for a user from the database. This is a helper method for token invalidation after email verification.
		await this.pool.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
	}


	// FORGOT + RESET PASSWORD MANAGEMENT METHODS

	async saveForgotPasswordToken(userId: string, token: string, expiresAt: Date)
	{
		// Save the forgot password token for a user in the database. This is a helper method for the forgot password process.
		// ON CONFLICT clause is used to update the token if a record for the user already exists, ensuring that only one forgot password token is stored per user.
		await this.pool.query(`
			INSERT INTO forgot_password_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)
			ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, created_at = CURRENT_TIMESTAMP
		`, [userId, token, expiresAt]);
	}

	async getForgotPasswordToken(token: string)
	{
		// Retrieve the forgot password token record by token. This is a helper method for the forgot password process.
		const result = await this.pool.query('SELECT * FROM forgot_password_tokens WHERE token = $1', [token]);
		return result.rows[0];
	}

	async deleteForgotPasswordToken(userId: string)
	{
		// Delete the forgot password token for a user from the database. This is a helper method for token invalidation after password reset.
		await this.pool.query('DELETE FROM forgot_password_tokens WHERE user_id = $1', [userId]);
	}

	async updateUserPassword(userId: string, newPasswordHash: string)
	{
		// Update the user's password hash in the database. This is a helper method for the password reset process.
		await this.pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
	}
}