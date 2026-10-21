-- Records when a user passes on another user (left swipe).
-- One row per (user, passed): passing is idempotent; passes do not get deleted/reversed.

CREATE TABLE IF NOT EXISTS passes (
	user_id	UUID NOT NULL,
	passed_id UUID NOT NULL,

	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	PRIMARY KEY (user_id, passed_id), -- one pass per user–passed pair

	CHECK (user_id != passed_id), -- a user cannot pass themselves

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (passed_id) REFERENCES users(id) ON DELETE CASCADE
);
