CREATE TABLE IF NOT EXISTS users (
	id SERIAL PRIMARY KEY,

	username VARCHAR(30) UNIQUE NOT NULL,

	password_hash VARCHAR(128) NOT NULL,

	email VARCHAR(100) UNIQUE NOT NULL,
	email_verified BOOLEAN DEFAULT FALSE, -- Will be set to true after email verification

	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),

	language VARCHAR(10) DEFAULT 'en',
	first_name VARCHAR(50),
	last_name VARCHAR(50)
);

-- Using user_id as pk force the user to be logged just one device at time
CREATE TABLE IF NOT EXISTS refresh_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one refresh token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one verification token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forgot_password_tokens (
	user_id INTEGER PRIMARY KEY, -- Used as primary key because we only want one forgot password token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);