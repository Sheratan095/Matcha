-- Chat conversations and their messages (Option A: a chat IS a match).
--
-- Exactly one chat row per matched pair, created on a mutual like and removed on unmatch / block.
-- The two users are stored canonically (user_a < user_b) with a UNIQUE constraint, so a pair maps
-- to one chat regardless of who liked first — the app sorts the two ids before insert / lookup.
-- Because messages.chat_id cascades, deleting a chat (on unmatch / block) wipes its messages.

CREATE TABLE IF NOT EXISTS chats (
	id			UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	user_a		UUID NOT NULL,
	user_b		UUID NOT NULL,

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- == matchedAt

	CHECK (user_a < user_b), -- canonical ordering => one chat per pair, and no self-chat

	UNIQUE (user_a, user_b),

	FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
);

-- "Which chats is this user in?" — a user may sit on either side of the ordered pair.
CREATE INDEX IF NOT EXISTS idx_chats_user_a ON chats (user_a);
CREATE INDEX IF NOT EXISTS idx_chats_user_b ON chats (user_b);

CREATE TABLE IF NOT EXISTS messages (
	id			UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	chat_id		UUID NOT NULL,
	sender_id	UUID NOT NULL, -- always one of the chat's two participants (enforced in the app)

	content		TEXT NOT NULL,

	status		VARCHAR(10) NOT NULL DEFAULT 'sent', -- sent | delivered | read
	CHECK (status IN ('sent', 'delivered', 'read')),

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	FOREIGN KEY (chat_id)   REFERENCES chats(id) ON DELETE CASCADE,
	FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversation history and "latest message in a chat": a chat_id range scan ordered by time.
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages (chat_id, created_at);
