INSERT INTO users (username, email, password_hash, email_verified, language)
VALUES
	('admin', 'admin@matcha.local', 'fake_hash_1', TRUE, 'en'),
	('testuser', 'testuser@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('alice', 'alice@matcha.local', '$2b$10$Gn584YCMsvRevFtDhRriguKdnIIFbJOBNMQyXMRwajz7yppzDhf8u', FALSE, 'en')
ON CONFLICT DO NOTHING;
-- Password for testuser and alice is '1234' (bcrypt, 10 salt rounds). These are real working hashes, so you can log in with '1234'.

-- first/last name now live in the profiles table, so seed them there.
-- Subqueries resolve the SERIAL user ids by username (don't assume 1/2/3).
INSERT INTO profiles (user_id, first_name, last_name, biography, gender, sexual_preference)
VALUES
	((SELECT id FROM users WHERE username = 'admin'), 'Admin', 'User', 'I am the admin of this site.', 'other', 'other'),
	((SELECT id FROM users WHERE username = 'testuser'), 'Test', 'User', 'I am a test user for this site.', 'other', 'other'),
	((SELECT id FROM users WHERE username = 'alice'), 'Alice', 'Wonderland')
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

--- insert some fake user pictures for testing
INSERT INTO user_pictures (user_id, url, is_profile, position)
VALUES
	((SELECT id FROM users WHERE username = 'testuser'), 'https://example.com/testuser1.jpg', TRUE, 0),
	((SELECT id FROM users WHERE username = 'testuser'), 'https://example.com/testuser2.jpg', FALSE, 1),
	((SELECT id FROM users WHERE username = 'testuser'), 'https://example.com/testuser3.jpg', FALSE, 2),
	((SELECT id FROM users WHERE username = 'testuser'), 'https://example.com/testuser4.jpg', FALSE, 3),
	((SELECT id FROM users WHERE username = 'testuser'), 'https://example.com/testuser5.jpg', FALSE, 4),
	((SELECT id FROM users WHERE username = 'alice'), 'https://example.com/alice1.jpg', TRUE, 0),
	((SELECT id FROM users WHERE username = 'alice'), 'https://example.com/alice2.jpg', FALSE, 1)
ON CONFLICT DO NOTHING;