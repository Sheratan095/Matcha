import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { MessagePayload, SupportedLanguage } from '@repo/shared-types';
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

	// The getUsernameById method fetches the username of a user by their ID.
	async getUsernameById(id: string): Promise<string | undefined>
	{
		const result = await this.pool.query('SELECT username FROM users WHERE id = $1', [id]);
		return (result.rows[0] ? result.rows[0].username : undefined);
	}

	async getProfilePictureUrl(userId: string): Promise<string | null>
	{
		const result = await this.pool.query(
			'SELECT url FROM user_pictures WHERE user_id = $1 AND is_profile = true',
			[userId],
		);

		return (result.rows[0]?.url ?? null);
	}

	// Stamps the user's last-online time. Called when their last WebSocket disconnects.
	// Every user has a profiles row (created at registration), so a plain UPDATE suffices.
	async updateLastSeen(userId: string): Promise<void>
	{
		await this.pool.query('UPDATE profiles SET last_seen = NOW() WHERE user_id = $1', [userId]);
	}

	async storeMessage(senderId: string, recipientId: string, content: string): Promise<MessagePayload>
	{
		const result = await this.pool.query(
			'INSERT INTO messages (sender_id, recipient_id, content, timestamp) VALUES ($1, $2, $3, NOW()) RETURNING id',
			[senderId, recipientId, content],
		);

		return (MessagePayload.fromDbRow({
			messageId: result.rows[0].id,
			content: result.rows[0].content,
			timestamp: result.rows[0].timestamp,

			userId: result.rows[0].sender_id,
			username: await this.getUsernameById(result.rows[0].sender_id),
			profilePictureUrl: await this.getProfilePictureUrl(result.rows[0].sender_id),
		}));
	}

	async areUsersConnected(userId1: string, userId2: string): Promise<boolean>
	{
		const result = await this.pool.query(
			'SELECT COUNT(*) FROM connections WHERE (user_id = $1 AND connection_id = $2) OR (user_id = $2 AND connection_id = $1)',
			[userId1, userId2],
		);

		return (result.rows[0].count > 0);
	}
}