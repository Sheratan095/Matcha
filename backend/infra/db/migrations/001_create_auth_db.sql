CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,
	username VARCHAR(255) UNIQUE NOT NULL,
	email VARCHAR(255) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one refresh token per user
	token VARCHAR(255) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);