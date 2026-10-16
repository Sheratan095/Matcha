
-- Durable "catch up while offline" notifications (profile views, likes, matches, unmatches).
--
-- Write-through from the websocket layer: a row is inserted ONLY when the recipient is offline,
-- then delivered and deleted when they reconnect. Live delivery to online users never touches this
-- table. Chat messages are deliberately NOT stored here — they live in `messages` and are caught
-- up via history — nor are ephemeral events like chat-seen.

CREATE TABLE IF NOT EXISTS notifications (
	id			UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	user_id		UUID NOT NULL,          -- the recipient

	event		VARCHAR(40) NOT NULL,   -- the NotificationType value (the socket event name)
	payload		JSONB NOT NULL,         -- the payload to emit verbatim on reconnect

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Drain "all pending for this user, oldest first".
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at);

-- Dedupe: the same (recipient, event, payload) queues once, not N times — e.g. the same person
-- viewing your profile repeatedly while you're offline surfaces as a single "X viewed you" on
-- reconnect. jsonb takes a btree unique index and these payloads are small (StdPayload), so it is
-- within the btree row-size limit. The write path uses INSERT ... ON CONFLICT to dedupe atomically.
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_event_payload ON notifications (user_id, event, payload);
