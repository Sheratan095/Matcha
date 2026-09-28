-- Profile data kept separate from the "users" (identity/auth) table.
-- Split off so the auth app only touches "users", while profile features
-- (gender, preferences, biography, interests, pictures) live here.

CREATE TABLE IF NOT EXISTS profiles (
	-- user_id is both PK and FK: enforces a strict 1:1 with the users table
	user_id INTEGER PRIMARY KEY,

	gender VARCHAR(10),
	CHECK (gender IN ('male', 'female', 'other')), -- Mirrors the Gender union in shared-types

	sexual_preference VARCHAR(10),
	CHECK (sexual_preference IN ('male', 'female', 'both', 'other')), -- Mirrors SexualPreference union

	biography TEXT,

	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),

	first_name VARCHAR(50),
	last_name VARCHAR(50),

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Reusable interest tags: each tag stored once, shared across many users.
CREATE TABLE IF NOT EXISTS interest_tags (
	id SERIAL PRIMARY KEY,

	name VARCHAR(50) UNIQUE NOT NULL, -- Stored without the leading '#', lowercased (e.g. "vegan")

	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join table: many-to-many between users and reusable interest tags.
CREATE TABLE IF NOT EXISTS user_interests (
	user_id INTEGER NOT NULL,
	tag_id INTEGER NOT NULL,

	PRIMARY KEY (user_id, tag_id), -- A user can't add the same tag twice

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (tag_id) REFERENCES interest_tags(id) ON DELETE CASCADE
);

-- Up to 5 pictures per user, one of which is the profile picture.
CREATE TABLE IF NOT EXISTS user_pictures (
	id SERIAL PRIMARY KEY,

	user_id INTEGER NOT NULL,

	url VARCHAR(255) NOT NULL,
	is_profile BOOLEAN DEFAULT FALSE, -- The single designated profile picture

	position SMALLINT NOT NULL, -- Ordering within the gallery, 0..4
	CHECK (position BETWEEN 0 AND 4), -- Caps the gallery slots (max 5 pictures)

	created_at TIMESTAMPTZ DEFAULT NOW(),

	UNIQUE (user_id, position), -- One picture per slot per user

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Enforce at most ONE profile picture per user.
-- A partial unique index only indexes rows where is_profile is true.
CREATE UNIQUE INDEX IF NOT EXISTS one_profile_picture_per_user
	ON user_pictures (user_id)
	WHERE is_profile;
