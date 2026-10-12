-- Private chat messages between two users. A conversation is just the rows between a given
-- (sender, recipient) pair in either direction; eligibility (the two must be matched, and not
-- blocked) is enforced in the notification service, not here. ON DELETE CASCADE means that
-- deleting a user removes their messages.

CREATE TABLE IF NOT EXISTS messages (
	id				UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	sender_id		UUID NOT NULL,
	recipient_id	UUID NOT NULL,

	content			TEXT NOT NULL,

	created_at		TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	STATUS VARCHAR(10) NOT NULL DEFAULT 'sent', -- sent, delivered, read
	CHECK (STATUS IN ('sent', 'delivered', 'read')),

	CHECK (sender_id != recipient_id), -- a user cannot message themselves

	FOREIGN KEY (sender_id)    REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversation history: both directions of a pair are (sender_id, recipient_id) prefix lookups,
-- so this one composite index serves the whole "messages between A and B, oldest first" query.
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient_created ON messages (sender_id, recipient_id, created_at);
