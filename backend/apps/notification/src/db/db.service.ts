import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from "@repo/config";
import { MessagePayload, ChatListItem, MessageStatus } from '@repo/shared-types';

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
	// Canonical pair lookup: a chat is stored with user_a < user_b, so sort the two ids before
	// querying. Returns the chat id, or null when the two users have no chat (i.e. not matched).
	async getChatId(userId1: string, userId2: string): Promise<string | null>
	{
		const [userA, userB] = [userId1, userId2].sort();

		const result = await this.pool.query(
			'SELECT id FROM chats WHERE user_a = $1 AND user_b = $2',
			[userA, userB],
		);

		return (result.rows[0]?.id ?? null);
	}

	// Persists one message into an existing chat and returns the payload to deliver. A single CTE
	// does the INSERT and joins the sender's username / profile picture, so it is one round trip
	// and the row feeds fromDbRow directly.
	async storeMessage(chatId: string, senderId: string, content: string): Promise<MessagePayload>
	{
		const result = await this.pool.query(
			`WITH ins AS (
				INSERT INTO messages (chat_id, sender_id, content)
				VALUES ($1, $2, $3)
				RETURNING id, sender_id, content, created_at, status
			 )
			 SELECT ins.id AS message_id, ins.content, ins.created_at, ins.status,
			        ins.sender_id AS user_id, u.username, up.url AS profile_picture_url
			 FROM ins
			 INNER JOIN users u ON u.id = ins.sender_id
			 LEFT JOIN user_pictures up ON up.user_id = ins.sender_id AND up.is_profile`,
			[chatId, senderId, content],
		);

		return (MessagePayload.fromDbRow(result.rows[0]));
	}

	// Conversation history between two users, oldest first. Joins the sender's username + profile
	// picture so each message carries its author (the rich MessagePayload shape), aliasing the
	// columns to the names fromDbRow reads. The (sender_id, recipient_id, created_at) index serves
	// both directions of the OR.
	// True when the chat exists and userId is one of its two participants — the authorization check
	// for reading a conversation by its id (so a known/guessed chatId can't expose someone else's).
	async isChatParticipant(chatId: string, userId: string): Promise<boolean>
	{
		const result = await this.pool.query(
			'SELECT 1 FROM chats WHERE id = $1 AND (user_a = $2 OR user_b = $2)',
			[chatId, userId],
		);

		return ((result.rowCount ?? 0) > 0);
	}

	// Given a chat and one of its participants, returns the OTHER participant's id — or null when
	// the chat doesn't exist or userId isn't part of it.
	async getOtherParticipant(chatId: string, userId: string): Promise<string | null>
	{
		const result = await this.pool.query(
			`SELECT CASE WHEN user_a = $2 THEN user_b ELSE user_a END AS other_id
			 FROM chats
			 WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
			[chatId, userId],
		);

		return (result.rows[0]?.other_id ?? null);
	}

	// Full history of one chat, oldest first — a single range scan on (chat_id, created_at).
	// Conversation history oldest-first. With `afterMs` (epoch ms of the client's last-known
	// message) it returns ONLY newer messages — a delta the client merges — served by the
	// (chat_id, created_at) index. Without it, the full history.
	async getConversation(chatId: string, afterMs?: number): Promise<MessagePayload[]>
	{
		const	params: any[] = [chatId];
		let		cursor = '';

		if (afterMs !== undefined)
		{
			params.push(afterMs);
			cursor = ' AND m.created_at > to_timestamp($2 / 1000.0)';
		}

		const result = await this.pool.query(
			`SELECT m.id AS message_id, m.content, m.created_at, m.status,
			        m.sender_id AS user_id, u.username, up.url AS profile_picture_url
			 FROM messages m
			 INNER JOIN users u ON u.id = m.sender_id
			 LEFT JOIN user_pictures up ON up.user_id = m.sender_id AND up.is_profile
			 WHERE m.chat_id = $1` + cursor + `
			 ORDER BY m.created_at ASC`,
			params,
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
			`SELECT c.id AS chat_id, other.id AS user_id, other.username, up.url AS profile_picture_url,
			        last.content AS last_message, last.created_at AS last_created_at, last.sender_id AS last_sender_id
			 FROM chats c
			 INNER JOIN users other
				ON other.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
			 LEFT JOIN user_pictures up ON up.user_id = other.id AND up.is_profile
			 INNER JOIN LATERAL (
				SELECT content, created_at, sender_id
				FROM messages m
				WHERE m.chat_id = c.id
				ORDER BY m.created_at DESC
				LIMIT 1
			 ) last ON TRUE
			 WHERE c.user_a = $1 OR c.user_b = $1
			 ORDER BY last.created_at DESC`,
			[userId],
		);

		return (result.rows.map(row => ChatListItem.fromDbRow(row)));
	}

	async updateMessageStatus(messageId: string, status: MessageStatus): Promise<void>
	{
		await this.pool.query(
			'UPDATE messages SET status = $1 WHERE id = $2',
			[status, messageId],
		);
	}

	async updateMessagesStatusByChat(chatId: string, readerId: string, status: MessageStatus): Promise<void>
	{
		// Update all messages in this chat
		// Just those that are not already READ and not sent by the reader
		await this.pool.query(
			'UPDATE messages SET status = $1 WHERE chat_id = $2 AND status != $3 AND sender_id <> $4',
			[status, chatId, MessageStatus.READ, readerId],
		);
	}

	// Persists one pending notification for an OFFLINE recipient (write-through from the ws layer).
	// Only ever called off the live path. Keeps the per-user queue bounded: after inserting, trims
	// to the newest NOTIFICATION_MAX_PENDING_PER_USER rows so an absent user can't grow it forever.
	async addPendingNotification(userId: string, event: string, payload: any): Promise<void>
	{
		// Dedupe identical pending notifications: the same (recipient, event, payload) queues once.
		// On a repeat we just bump created_at so it keeps its place as the most recent activity.
		await this.pool.query(
			`INSERT INTO notifications (user_id, event, payload)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, event, payload) DO UPDATE SET created_at = NOW()`,
			[userId, event, JSON.stringify(payload)],
		);

		await this.pool.query(
			`DELETE FROM notifications
			 WHERE user_id = $1 AND id NOT IN (
				SELECT id FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2
			 )`,
			[userId, env.NOTIFICATION_MAX_PENDING_PER_USER],
		);
	}

	// Atomically returns AND removes every pending notification for a user (drained on reconnect),
	// oldest first. DELETE ... RETURNING means notifications inserted after the drain starts are
	// kept, not lost.
	async drainPendingNotifications(userId: string): Promise<{ event: string; payload: any }[]>
	{
		const result = await this.pool.query(
			'DELETE FROM notifications WHERE user_id = $1 RETURNING event, payload, created_at',
			[userId],
		);

		return (result.rows
			.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
			.map(r => ({ event: r.event, payload: r.payload })));
	}

	// Two users are "connected" (may chat) when a mutual like exists — the same self-join the
	// profile service uses for matches. Because blocking dissolves the likes in both directions,
	// a blocked pair is never connected, so this one check also enforces the block rule.
}