INSERT INTO users (username, email, password_hash)
VALUES
	('admin', 'admin@matcha.local', 'fake_hash_1'),
	('testuser', 'testuser@matcha.local', 'fake_hash_2'),
	('alice', 'alice@matcha.local', 'fake_hash_3')
ON CONFLICT DO NOTHING;