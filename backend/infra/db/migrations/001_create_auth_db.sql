CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,
	username VARCHAR(255) UNIQUE NOT NULL,
	email VARCHAR(255) UNIQUE NOT NULL,
	password_hash VARCHAR(255) NOT NULL,

	verified BOOLEAN DEFAULT FALSE, -- Will be set to true after email verification
	verification_token VARCHAR(255),
	verification_token_expires TIMESTAMP
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one refresh token per user
	token VARCHAR(255) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	expires_at TIMESTAMP NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one verification token per user
	token VARCHAR(255) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	expires_at TIMESTAMP NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);