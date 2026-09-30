CREATE TABLE IF NOT EXISTS users (
	-- Random UUID rather than a sequence: the id travels to clients (profile routes,
	-- JWT subject), so it must not leak the user count or allow walking 1..N.
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	username VARCHAR(30) UNIQUE NOT NULL,

	password_hash VARCHAR(128), -- NULL FOR OAUTH USERS

	email VARCHAR(100) UNIQUE NOT NULL,
	pending_email VARCHAR(100), -- New email awaiting verification before it replaces "email"
	email_verified BOOLEAN DEFAULT FALSE, -- Will be set to true after email verification

	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),

	language VARCHAR(10) DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	user_id UUID NOT NULL, -- Many-to-one relationship with users table (one user, multiple providers)

	provider VARCHAR(20) NOT NULL, -- e.g., 'github', 'google', etc.
	CHECK (provider IN ('github')), -- Ensure only valid providers are used

	provider_id VARCHAR(255) NOT NULL, -- The unique ID from the OAuth provider

	UNIQUE (user_id, provider), -- One user can only link one account per provider
	UNIQUE (provider, provider_id), -- A provider account can only be linked to one user

	created_at TIMESTAMPTZ DEFAULT NOW(),

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Using user_id as pk force the user to be logged just one device at time
CREATE TABLE IF NOT EXISTS refresh_tokens (
	user_id UUID PRIMARY KEY, -- Used as primary key because we only want one refresh token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
	user_id UUID PRIMARY KEY, -- Used as primary key because we only want one verification token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS forgot_password_tokens (
	user_id UUID PRIMARY KEY, -- Used as primary key because we only want one forgot password token per user
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,

	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);