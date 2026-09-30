-- Tracks who has viewed whose profile
-- One row per (viewer, viewed) 

CREATE TABLE IF NOT EXISTS profile_views (
	viewer_id	UUID NOT NULL,
	viewed_id	UUID NOT NULL,

	-- viewed_at	TIMESTAMPTZ DEFAULT NOW(), maybe fuuture feature: track when a user last viewed another user's profile

	PRIMARY KEY (viewer_id, viewed_id), -- one record per viewer–viewed pair

	CHECK (viewer_id != viewed_id), -- a user cannot view their own profile

	FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (viewed_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Fast lookup: "who viewed me?" (filtering on viewed_id)
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_id ON profile_views (viewed_id);
