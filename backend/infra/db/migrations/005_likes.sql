-- Lets a user like another user.
-- One row per (liker, liked): liking is idempotent; unliking deletes the row.

CREATE TABLE IF NOT EXISTS likes (
	liker_id	UUID NOT NULL,
	liked_id	UUID NOT NULL,

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	PRIMARY KEY (liker_id, liked_id), -- one like per liker–liked pair

	CHECK (liker_id != liked_id), -- a user cannot like themselves

	FOREIGN KEY (liker_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (liked_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast lookup: "who liked me?" (filtering on liked_id)
CREATE INDEX IF NOT EXISTS idx_likes_liked_id ON likes (liked_id);
