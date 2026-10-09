-- Lets a user block another user. One row per (blocker, blocked): blocking is idempotent.
-- Effects are mutual (checked in either direction); unblocking removes only the caller's row.

CREATE TABLE IF NOT EXISTS blocks (
	blocker_id	UUID NOT NULL,
	blocked_id	UUID NOT NULL,

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	PRIMARY KEY (blocker_id, blocked_id), -- one block per blocker–blocked pair

	CHECK (blocker_id != blocked_id), -- a user cannot block themselves

	FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast reverse lookup: "who blocked me?" (filtering on blocked_id); the forward direction is the PK.
CREATE INDEX IF NOT EXISTS idx_blocks_blocked_id ON blocks (blocked_id);
