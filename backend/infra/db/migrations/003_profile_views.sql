-- Tracks who has viewed whose profile. Read both ways: "who viewed me" (GET /profile/viewers)
-- and the viewer's own visit history (GET /profile/visited).
-- One row per (viewer, viewed)

CREATE TABLE IF NOT EXISTS profile_views (
	viewer_id	UUID NOT NULL,
	viewed_id	UUID NOT NULL,

	-- The LAST time viewer opened viewed's profile (bumped on every revisit, see
	-- DbService.addProfileView), so the visit history lists the most recent first.
	viewed_at	TIMESTAMPTZ NOT NULL DEFAULT NOW(),

	PRIMARY KEY (viewer_id, viewed_id), -- one record per viewer–viewed pair; also serves "my visit history" (filtering on viewer_id)

	CHECK (viewer_id != viewed_id), -- a user cannot view their own profile

	FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (viewed_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast lookup: "who viewed me?" (filtering on viewed_id)
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_id ON profile_views (viewed_id);
