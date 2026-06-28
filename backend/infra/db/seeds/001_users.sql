INSERT INTO users (username, email, password_hash, first_name, last_name)
VALUES
	('admin', 'admin@matcha.local', 'fake_hash_1', 'Admin', 'User'),
	('testuser', 'testuser@matcha.local', 'fake_hash_2', 'Test', 'User'),
	('alice', 'alice@matcha.local', 'fake_hash_3', 'Alice', 'Wonderland')
ON CONFLICT DO NOTHING;