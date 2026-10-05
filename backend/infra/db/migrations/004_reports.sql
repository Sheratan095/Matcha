-- Lets a user report another user as a fake account.
-- One row per (reporter, reported): a user can report a given user at most once.

CREATE TABLE IF NOT EXISTS fake_reports (
	reporter_id	UUID NOT NULL,
	reported_id	UUID NOT NULL,
	reason		VARCHAR(128),

	created_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),


	PRIMARY KEY (reporter_id, reported_id), -- one report per reporter–reported pair

	CHECK (reporter_id != reported_id), -- a user cannot report themselves

	FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast lookup / count: "how many reports against this user?" (filtering on reported_id)
CREATE INDEX IF NOT EXISTS idx_fake_reports_reported_id ON fake_reports (reported_id);
