-- DEV FIXTURES. Designed so that, straight after `make db-reset`, logging in as testuser and
-- calling GET /profile/discover returns a usable deck: several candidates at different distances,
-- ages, fame ratings and tag overlaps, so every filter has something to bite on.
--
-- Everyone here is deliberately ELIGIBLE for discovery, which needs all of: a gender, a date of
-- birth, a location, a non-empty bio, at least one interest and a profile picture (see
-- discover_candidates in 011_browsing.sql). bob is the one exception, on purpose — see below.

INSERT INTO users (username, email, password_hash, email_verified, id, language)
VALUES
	('admin',    'admin@matcha.local',    'fake_hash_1', TRUE, '2431cdae-98b5-4b63-9419-1d949ca05338', 'en'),
	('testuser', 'testuser@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, '1834c93f-c18f-4c06-a107-c6f96108e383', 'en'),
	('alice',    'alice@matcha.local',    '$2b$10$Gn584YCMsvRevFtDhRriguKdnIIFbJOBNMQyXMRwajz7yppzDhf8u', TRUE, '2331ccae-98b5-4b63-9419-1d920ca05338', 'en'),
	-- Discovery fixtures. Same bcrypt hash as testuser, so they all log in with '1234' too.
	('bob',      'bob@matcha.local',      '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, '3a1f0b21-0001-4000-8000-000000000001', 'en'),
	('carol',    'carol@matcha.local',    '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, '3a1f0b21-0002-4000-8000-000000000002', 'en'),
	('dave',     'dave@matcha.local',     '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, '3a1f0b21-0003-4000-8000-000000000003', 'en'),
	('eve',      'eve@matcha.local',      '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, '3a1f0b21-0004-4000-8000-000000000004', 'en')
ON CONFLICT DO NOTHING;
-- Password for every seeded account except admin is '1234' (bcrypt, 10 salt rounds). Real working
-- hashes, so you can log in with '1234'. admin's hash is fake: it exists to be looked at, not used.

-- first/last name live in the profiles table, so they are seeded there.
-- Subqueries resolve the user ids by username rather than repeating the UUIDs.
-- age is NOT a column: it is computed from date_of_birth on every read (see DbService.getProfile).
--
-- Coordinates are around Rome, with testuser at the centre so the distances from THEIR point of
-- view are round numbers worth filtering on:
--     bob ~1 km · eve ~1.5 km · alice ~5 km · carol ~15 km · dave ~35 km · admin ~61 km
INSERT INTO profiles (user_id, first_name, last_name, biography, gender, sexual_preference, date_of_birth, latitude, longitude)
VALUES
	-- The account to log in as when testing discovery. 'both' so every candidate below is
	-- compatible; the deck is then shaped by the filters rather than by orientation.
	((SELECT id FROM users WHERE username = 'testuser'), 'Test', 'User', 'I am a test user for this site.', 'other', 'both', '1998-04-12', 41.9028, 12.4964),

	-- pref 'other' rather than 'both', so a non-bisexual preference stays represented in the
	-- fixtures. Still matches testuser, whose gender IS 'other'.
	((SELECT id FROM users WHERE username = 'admin'), 'Admin', 'User', 'I am the admin of this site.', 'other', 'other', '1990-01-01', 42.4000, 12.8000),

	-- THE EXCLUSION FIXTURE: bob wants women, testuser's gender is 'other', so bob must NOT appear
	-- in testuser's deck even though he is the closest candidate of all. If he ever shows up, the
	-- reverse direction of the orientation check has regressed.
	((SELECT id FROM users WHERE username = 'bob'), 'Bob', 'Bricks', 'Climbing, mostly indoors.', 'male', 'female', '1999-01-10', 41.9100, 12.5000),

	-- Youngest, mid-distance: exercises minAge / maxAge together with maxDistanceKm.
	((SELECT id FROM users WHERE username = 'carol'), 'Carol', 'Hart', 'Pianist. Terrible at chess.', 'female', 'both', '2004-03-15', 42.0300, 12.5600),

	-- Oldest and far away, with zero tags in common: the profile that every narrowing filter drops.
	((SELECT id FROM users WHERE username = 'dave'), 'Dave', 'Noor', 'Weekend cyclist, weekday cook.', 'male', 'both', '1985-11-20', 42.2100, 12.6000),

	-- Nearly on top of testuser AND shares BOTH their tags, so eve is the strongest match in the
	-- deck: the one that proves the 0.5 proximity / 0.3 tags weighting puts the right person first.
	((SELECT id FROM users WHERE username = 'eve'), 'Eve', 'Lindqvist', 'Trail runner, film photographer.', 'female', 'both', '1996-06-30', 41.9150, 12.5050)
ON CONFLICT DO NOTHING;

-- alice has NO sexual_preference on purpose, to exercise the column DEFAULT 'both' and the
-- COALESCE(pref,'both') in the compatibility check: an unset orientation means bisexual.
INSERT INTO profiles (user_id, first_name, last_name, biography, gender, date_of_birth, latitude, longitude)
VALUES
	((SELECT id FROM users WHERE username = 'alice'), 'Alice', 'Wonderland', 'Curiouser and curiouser.', 'female', '2001-07-23', 41.9450, 12.5100)
ON CONFLICT DO NOTHING;

-- insert some interest tags for testing
INSERT INTO interest_tags (name)
VALUES
	('vegan'),
	('hiking'),
	('photography'),
	('travel'),
	('reading'),
	('gaming'),
	('cooking'),
	('fitness'),
	('music'),
	('art')
ON CONFLICT DO NOTHING;

-- Interests, chosen to give testuser a spread of commonTagCount to sort and filter on:
--   eve 2 (hiking + photography) · carol 1 (hiking) · admin 1 (hiking) · alice 0 · dave 0
INSERT INTO user_interests (user_id, tag_id)
VALUES
	((SELECT id FROM users WHERE username = 'testuser'), (SELECT id FROM interest_tags WHERE name = 'hiking')),
	((SELECT id FROM users WHERE username = 'testuser'), (SELECT id FROM interest_tags WHERE name = 'photography')),
	((SELECT id FROM users WHERE username = 'alice'),    (SELECT id FROM interest_tags WHERE name = 'travel')),
	((SELECT id FROM users WHERE username = 'alice'),    (SELECT id FROM interest_tags WHERE name = 'reading')),
	((SELECT id FROM users WHERE username = 'admin'),    (SELECT id FROM interest_tags WHERE name = 'hiking')),
	((SELECT id FROM users WHERE username = 'admin'),    (SELECT id FROM interest_tags WHERE name = 'cooking')),
	((SELECT id FROM users WHERE username = 'bob'),      (SELECT id FROM interest_tags WHERE name = 'travel')),
	((SELECT id FROM users WHERE username = 'carol'),    (SELECT id FROM interest_tags WHERE name = 'hiking')),
	((SELECT id FROM users WHERE username = 'carol'),    (SELECT id FROM interest_tags WHERE name = 'music')),
	((SELECT id FROM users WHERE username = 'dave'),     (SELECT id FROM interest_tags WHERE name = 'gaming')),
	((SELECT id FROM users WHERE username = 'dave'),     (SELECT id FROM interest_tags WHERE name = 'fitness')),
	((SELECT id FROM users WHERE username = 'eve'),      (SELECT id FROM interest_tags WHERE name = 'hiking')),
	((SELECT id FROM users WHERE username = 'eve'),      (SELECT id FROM interest_tags WHERE name = 'photography'))
ON CONFLICT DO NOTHING;

--- insert some fake user pictures for testing.
--- The files themselves are uploaded to Garage by `make seed-pictures`
--- (apps/profile/scripts/seed-pictures.mjs) under the "seed/" key prefix.
--- These URLs hardcode the default S3_PUBLIC_URL; if you change that in .env the seeded
--- URLs won't match the web endpoint (acceptable for a dev seed).
--- The new fixtures REUSE the seven existing objects rather than adding image files: a profile
--- picture is an eligibility requirement for discovery, and which image it is does not matter.
INSERT INTO user_pictures (user_id, url, is_profile)
VALUES
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-1.webp', TRUE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-2.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-3.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-4.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-5.webp', FALSE),
	((SELECT id FROM users WHERE username = 'alice'),    'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp',    TRUE),
	((SELECT id FROM users WHERE username = 'alice'),    'http://profile-pictures.web.garage.localhost:3902/seed/alice-2.webp',    FALSE),
	((SELECT id FROM users WHERE username = 'admin'),    'http://profile-pictures.web.garage.localhost:3902/seed/testuser-1.webp', TRUE),
	((SELECT id FROM users WHERE username = 'bob'),      'http://profile-pictures.web.garage.localhost:3902/seed/testuser-2.webp', TRUE),
	((SELECT id FROM users WHERE username = 'carol'),    'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp',    TRUE),
	((SELECT id FROM users WHERE username = 'dave'),     'http://profile-pictures.web.garage.localhost:3902/seed/testuser-3.webp', TRUE),
	((SELECT id FROM users WHERE username = 'eve'),      'http://profile-pictures.web.garage.localhost:3902/seed/alice-2.webp',    TRUE)
ON CONFLICT DO NOTHING;

-- Likes, so the deck shows a mix of likesYou true/false and the fame ratings below differ.
-- ONE DIRECTION ONLY, deliberately: a mutual like is a match, and a match must have a chats row
-- (addLikeAndMatch creates both in one transaction). Seeding one side keeps that invariant.
-- testuser likes NOBODY, because a user you have already liked is excluded from your own deck.
INSERT INTO likes (liker_id, liked_id)
VALUES
	((SELECT id FROM users WHERE username = 'alice'), (SELECT id FROM users WHERE username = 'testuser')),
	((SELECT id FROM users WHERE username = 'eve'),   (SELECT id FROM users WHERE username = 'testuser')),
	((SELECT id FROM users WHERE username = 'carol'), (SELECT id FROM users WHERE username = 'testuser')),
	((SELECT id FROM users WHERE username = 'dave'),  (SELECT id FROM users WHERE username = 'alice')),
	((SELECT id FROM users WHERE username = 'bob'),   (SELECT id FROM users WHERE username = 'alice')),
	((SELECT id FROM users WHERE username = 'bob'),   (SELECT id FROM users WHERE username = 'eve'))
ON CONFLICT DO NOTHING;

-- Profile views are the OTHER half of the fame denominator (viewers UNION likers), so seeding a
-- few makes the ratings spread out instead of everyone landing on the same number.
INSERT INTO profile_views (viewer_id, viewed_id)
VALUES
	((SELECT id FROM users WHERE username = 'bob'),   (SELECT id FROM users WHERE username = 'testuser')),
	((SELECT id FROM users WHERE username = 'dave'),  (SELECT id FROM users WHERE username = 'testuser')),
	((SELECT id FROM users WHERE username = 'carol'), (SELECT id FROM users WHERE username = 'alice')),
	((SELECT id FROM users WHERE username = 'eve'),   (SELECT id FROM users WHERE username = 'alice')),
	((SELECT id FROM users WHERE username = 'alice'), (SELECT id FROM users WHERE username = 'dave')),
	((SELECT id FROM users WHERE username = 'carol'), (SELECT id FROM users WHERE username = 'dave'))
ON CONFLICT DO NOTHING;

-- MUST BE LAST. 009_fame_rating.sql ends with the same UPDATE, but migrations run BEFORE seeds, so
-- that backfill saw an empty database and every row kept the column default of 40. Recomputing here
-- — after the pictures, interests, likes and views above exist — is what makes fame_rating real
-- after a reset, and therefore what makes the minFame / maxFame filters worth testing.
UPDATE profiles SET fame_rating = compute_fame_rating(user_id);
