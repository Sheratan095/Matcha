-- Profile data kept separate from the "users" (identity/auth) table.
-- Split off so the auth app only touches "users", while profile features
-- (gender, preferences, biography, interests, pictures) live here.

CREATE TABLE IF NOT EXISTS profiles (
	-- user_id is both PK and FK: enforces a strict 1:1 with the users table
	user_id UUID PRIMARY KEY,

	gender VARCHAR(10),
	CHECK (gender IN ('male', 'female', 'other')), -- Mirrors the Gender union in shared-types

	sexual_preference VARCHAR(10) DEFAULT 'both',
	CHECK (sexual_preference IN ('male', 'female', 'both', 'other')) , -- Mirrors SexualPreference union

	-- Updated every time the user disconnects from EVERY websocket connection (more tab open)
	last_seen TIMESTAMPTZ,

	biography TEXT,

	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),

	first_name VARCHAR(50),
	last_name VARCHAR(50),

	-- FULL precision on purpose: the matching algorithm sorts by distance. Nothing that leaves
	-- the API may carry this precision — see snap_coord() below.
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,
	CONSTRAINT profiles_latitude_range_check  CHECK (latitude  BETWEEN -90  AND 90),
	CONSTRAINT profiles_longitude_range_check CHECK (longitude BETWEEN -180 AND 180),
	-- A location is a point: both coordinates or neither (NULL/NULL until the user sets one)
	CONSTRAINT profiles_location_pair_check CHECK ((latitude IS NULL) = (longitude IS NULL)),

	date_of_birth DATE, -- Nullable because GitHub OAuth sign-ups start without a date of birth and set it later

	-- ON DELETE CASCADE ENSURES THAT IF A USER IS DELETED FROM THE "users" TABLE, THEIR ASSOCIATED PROFILE IS ALSO DELETED.
	--	it's possible because profile and auth aren in the same db, just in different schemas, so we can reference the users table here.
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

---------------------LOCATION MASKING---------------------

-- An exact coordinate is a home address, so no coordinate ever leaves the API unmasked.
-- Kept in SQL (rather than in the services) so the raw values never travel to the application
-- just to be thrown away, and so the future discovery/browse query can sort by distance
-- server-side instead of fetching every candidate's position.

-- Quantizes a coordinate to a ~1 km grid (2 decimal places: ~1.11 km of latitude, and ~0.83 km
-- of longitude at Rome's latitude). The subject only requires neighbourhood-level accuracy.
--
-- Quantizing is what defeats trilateration, and it works ONLY because it is deterministic:
-- merely ROUNDING THE REPORTED DISTANCE is not enough, because an attacker who moves their own
-- position and re-reads the distance gains a fresh constraint on the true point every time and
-- intersects them (this is how Tinder and Grindr were de-anonymized in 2014). Deriving every
-- public number from the SAME snapped point means a thousand probes reveal no more than one.
--
-- ROUND and not FLOOR/TRUNC so the function is IDEMPOTENT in floating point: snapping an
-- already-snapped value must not shift it into the neighbouring cell, because the callers
-- apply it defensively at more than one layer.
CREATE OR REPLACE FUNCTION snap_coord(coord DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
AS $$
	SELECT ROUND($1::numeric, 2)::double precision;
$$ LANGUAGE SQL IMMUTABLE STRICT;

-- Great-circle distance in kilometres (haversine, mean Earth radius 6371 km).
-- STRICT: a user who never set a location yields NULL instead of a bogus 0 km.
CREATE OR REPLACE FUNCTION distance_km(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION,
										lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION
AS $$
	-- LEAST(1, ...) clamps the asin() argument: for two nearly antipodal points the floating
	-- point arithmetic can overshoot 1, and asin() would then raise a domain error.
	SELECT 2 * 6371 * asin(LEAST(1, sqrt(
		power(sin(radians($3 - $1) / 2), 2)
		+ cos(radians($1)) * cos(radians($3)) * power(sin(radians($4 - $2) / 2), 2)
	)));
$$ LANGUAGE SQL IMMUTABLE STRICT;

---------------------INTEREST TAGS AND USER INTERESTS---------------------

-- Reusable interest tags: each tag stored once, shared across many users.
CREATE TABLE IF NOT EXISTS interest_tags (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	name VARCHAR(50) UNIQUE NOT NULL, -- Stored without the leading '#', lowercased and trimmed (e.g. "vegan")

	created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Join table: many-to-many between users and reusable interest tags.
CREATE TABLE IF NOT EXISTS user_interests (
	user_id UUID NOT NULL,
	tag_id UUID NOT NULL,

	PRIMARY KEY (user_id, tag_id), -- A user can't add the same tag twice

	-- ON DELETE CASCADE ENSURES THAT IF A USER IS DELETED, THEIR ASSOCIATED INTERESTS ARE ALSO DELETED.
	-- ON DELETE CASCADE ENSURES THAT IF A TAG IS DELETED, IT'S ALSO REMOVED FROM ALL USERS' INTERESTS.
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (tag_id) REFERENCES interest_tags(id) ON DELETE CASCADE
);

----------------------USER PICTURES---------------------

-- Up to 5 pictures per user, one of which is the profile picture.
CREATE TABLE IF NOT EXISTS user_pictures (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	user_id UUID NOT NULL,

	url VARCHAR(255) NOT NULL,

	is_profile BOOLEAN DEFAULT FALSE, -- The single designated profile picture

	created_at TIMESTAMPTZ DEFAULT NOW(),

	-- ON DELETE CASCADE ENSURES THAT IF A USER IS DELETED, THEIR ASSOCIATED PICTURES ARE ALSO DELETED.
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Enforce at most ONE profile picture per user.
-- A partial unique index only indexes rows where is_profile is true.
CREATE UNIQUE INDEX IF NOT EXISTS one_profile_picture_per_user
	ON user_pictures (user_id)
	WHERE is_profile;

