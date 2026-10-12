import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { MessagePayload, ChatListItem, SupportedLanguage } from '@repo/shared-types';
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

	// Persists one message and returns the payload to deliver. The sender's id/content come from
	// the arguments; only the generated id and timestamp come back from the INSERT. (Build the
	// payload directly — do NOT route the hand-built object through fromDbRow, which expects
	// snake_case DB columns.)
	async storeMessage(senderId: string, recipientId: string, content: string): Promise<MessagePayload>
	{
		const result = await this.pool.query(
			`INSERT INTO messages (sender_id, recipient_id, content)
			 VALUES ($1, $2, $3)
			 RETURNING id, created_at`,
			[senderId, recipientId, content],
		);

		// The INSERT can only return columns of the messages table, so username / profile picture
		// (which live in users / user_pictures) are fetched separately and the payload is built by
		// hand rather than via fromDbRow. The sender always exists, so username is never empty.
		return (new MessagePayload({
			messageId:         result.rows[0].id,
			content,
			timestamp:         new Date(result.rows[0].created_at).getTime(),
			userId:            senderId,
			username:          await this.getUsernameById(senderId) ?? '',
			profilePictureUrl: await this.getProfilePictureUrl(senderId),
		}));
	}

	// Conversation history between two users, oldest first. Joins the sender's username + profile
	// picture so each message carries its author (the rich MessagePayload shape), aliasing the
	// columns to the names fromDbRow reads. The (sender_id, recipient_id, created_at) index serves
	// both directions of the OR.
	async getConversation(userId: string, otherUserId: string): Promise<MessagePayload[]>
	{
		const result = await this.pool.query(
			`SELECT m.id AS message_id, m.content, m.created_at,
			        m.sender_id AS user_id, u.username, up.url AS profile_picture_url
			 FROM messages m
			 INNER JOIN users u ON u.id = m.sender_id
			 LEFT JOIN user_pictures up ON up.user_id = m.sender_id AND up.is_profile
			 WHERE (m.sender_id = $1 AND m.recipient_id = $2)
			    OR (m.sender_id = $2 AND m.recipient_id = $1)
			 ORDER BY m.created_at ASC`,
			[userId, otherUserId],
		);

		return (result.rows.map(row => MessagePayload.fromDbRow(row)));
	}

	// Lists the caller's conversations: one row per partner the caller has exchanged messages with,
	// carrying the latest message of each, newest conversation first. DISTINCT ON picks the most
	// recent message per partner; the EXISTS keeps only partners the caller is still matched with
	// (so unmatched / blocked conversations drop off, consistent with the send/history gate).
	async getChatList(userId: string): Promise<ChatListItem[]>
	{
		const result = await this.pool.query(
			`SELECT last.partner_id AS user_id, u.username, up.url AS profile_picture_url,
			        last.content AS last_message, last.created_at AS last_created_at, last.sender_id AS last_sender_id
			 FROM (
				SELECT DISTINCT ON (partner_id) partner_id, content, created_at, sender_id
				FROM (
					SELECT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id,
					       content, created_at, sender_id
					FROM messages
					WHERE sender_id = $1 OR recipient_id = $1
				) conv
				ORDER BY partner_id, created_at DESC
			 ) last
			 INNER JOIN users u ON u.id = last.partner_id
			 LEFT JOIN user_pictures up ON up.user_id = last.partner_id AND up.is_profile
			 WHERE EXISTS (
				SELECT 1 FROM likes a
				INNER JOIN likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
				WHERE a.liker_id = $1 AND a.liked_id = last.partner_id
			 )
			 ORDER BY last.created_at DESC`,
			[userId],
		);

		return (result.rows.map(row => ChatListItem.fromDbRow(row)));
	}

	// Two users are "connected" (may chat) when a mutual like exists — the same self-join the
	// profile service uses for matches. Because blocking dissolves the likes in both directions,
	// a blocked pair is never connected, so this one check also enforces the block rule.
	async areUsersConnected(userId1: string, userId2: string): Promise<boolean>
	{
		const result = await this.pool.query(
			`SELECT EXISTS (
				SELECT 1 FROM likes a
				INNER JOIN likes b
					ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
				WHERE a.liker_id = $1 AND a.liked_id = $2
			 ) AS connected`,
			[userId1, userId2],
		);

		return (result.rows[0].connected === true);
	}
}