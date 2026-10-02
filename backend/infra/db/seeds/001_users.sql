INSERT INTO users (username, email, password_hash, email_verified, language)
VALUES
	('admin', 'admin@matcha.local', 'fake_hash_1', TRUE, 'en'),
	('testuser', 'testuser@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('alice', 'alice@matcha.local', '$2b$10$Gn584YCMsvRevFtDhRriguKdnIIFbJOBNMQyXMRwajz7yppzDhf8u', TRUE, 'en')
ON CONFLICT DO NOTHING;
-- Password for testuser and alice is '1234' (bcrypt, 10 salt rounds). These are real working hashes, so you can log in with '1234'.

-- first/last name now live in the profiles table, so seed them there.
-- Subqueries resolve the generated UUID user ids by username (they aren't predictable).
INSERT INTO profiles (user_id, first_name, last_name, biography, gender, sexual_preference)
VALUES
	((SELECT id FROM users WHERE username = 'admin'), 'Admin', 'User', 'I am the admin of this site.', 'other', 'other'),
	((SELECT id FROM users WHERE username = 'testuser'), 'Test', 'User', 'I am a test user for this site.', 'other', 'other'),
	((SELECT id FROM users WHERE username = 'alice'), 'Alice', 'Wonderland', 'Curiouser and curiouser.', 'female', 'both')
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

-- insert some user interests for testing
INSERT INTO user_interests (user_id, tag_id)
VALUES
	((SELECT id FROM users WHERE username = 'testuser'), (SELECT id FROM interest_tags WHERE name = 'hiking')),
	((SELECT id FROM users WHERE username = 'testuser'), (SELECT id FROM interest_tags WHERE name = 'photography')),
	((SELECT id FROM users WHERE username = 'alice'), (SELECT id FROM interest_tags WHERE name = 'travel')),
	((SELECT id FROM users WHERE username = 'alice'), (SELECT id FROM interest_tags WHERE name = 'reading'))
ON CONFLICT DO NOTHING;

--- insert some fake user pictures for testing.
--- The files themselves are uploaded to Garage by `make seed-pictures`
--- (apps/profile/scripts/seed-pictures.mjs) under the "seed/" key prefix.
--- These URLs hardcode the default S3_PUBLIC_URL; if you change that in .env the seeded
--- URLs won't match the web endpoint (acceptable for a dev seed).
INSERT INTO user_pictures (user_id, url, is_profile)
VALUES
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-1.webp', TRUE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-2.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-3.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-4.webp', FALSE),
	((SELECT id FROM users WHERE username = 'testuser'), 'http://profile-pictures.web.garage.localhost:3902/seed/testuser-5.webp', FALSE),
	((SELECT id FROM users WHERE username = 'alice'), 'http://profile-pictures.web.garage.localhost:3902/seed/alice-1.webp', TRUE),
	((SELECT id FROM users WHERE username = 'alice'), 'http://profile-pictures.web.garage.localhost:3902/seed/alice-2.webp', FALSE)
ON CONFLICT DO NOTHING;