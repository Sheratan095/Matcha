INSERT INTO users (username, email, password_hash, email_verified, language)
VALUES --TO DO hash 1234 and insert here for better testing
	('admin', 'admin@matcha.local', 'fake_hash_1', TRUE, 'en'),
	('testuser', 'testuser@matcha.local', 'fake_hash_2', FALSE, 'en'),
	('alice', 'alice@matcha.local', 'fake_hash_3', FALSE, 'en')
ON CONFLICT DO NOTHING;

-- first/last name now live in the profiles table, so seed them there.
-- Subqueries resolve the SERIAL user ids by username (don't assume 1/2/3).
INSERT INTO profiles (user_id, first_name, last_name)
VALUES
	((SELECT id FROM users WHERE username = 'admin'), 'Admin', 'User'),
	((SELECT id FROM users WHERE username = 'testuser'), 'Test', 'User'),
	((SELECT id FROM users WHERE username = 'alice'), 'Alice', 'Wonderland')
ON CONFLICT DO NOTHING;
