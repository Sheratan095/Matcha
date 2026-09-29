INSERT INTO users (username, email, password_hash, email_verified, language)
VALUES
	('admin', 'admin@matcha.local', 'fake_hash_1', TRUE, 'en'),
	('testuser', 'testuser@matcha.local', '$2b$10$iLPDZU0P/A75NdItQtMnzOk30w4.py4iRIZr1R3iceJPfV48TcxUG', TRUE, 'en'),
	('alice', 'alice@matcha.local', '$2b$10$Gn584YCMsvRevFtDhRriguKdnIIFbJOBNMQyXMRwajz7yppzDhf8u', FALSE, 'en')
ON CONFLICT DO NOTHING;
-- Password for testuser and alice is '1234' (bcrypt, 10 salt rounds). These are real working hashes, so you can log in with '1234'.

-- first/last name now live in the profiles table, so seed them there.
-- Subqueries resolve the SERIAL user ids by username (don't assume 1/2/3).
INSERT INTO profiles (user_id, first_name, last_name)
VALUES
	((SELECT id FROM users WHERE username = 'admin'), 'Admin', 'User'),
	((SELECT id FROM users WHERE username = 'testuser'), 'Test', 'User'),
	((SELECT id FROM users WHERE username = 'alice'), 'Alice', 'Wonderland')
ON CONFLICT DO NOTHING;
