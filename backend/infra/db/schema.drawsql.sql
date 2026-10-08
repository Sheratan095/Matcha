CREATE TABLE users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	username VARCHAR(30) UNIQUE NOT NULL,
	password_hash VARCHAR(128),
	email VARCHAR(100) UNIQUE NOT NULL,
	pending_email VARCHAR(100),
	email_verified BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	language VARCHAR(10) DEFAULT 'en'
);

CREATE TABLE oauth_accounts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL,
	provider VARCHAR(20) NOT NULL,
	provider_id VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	UNIQUE (user_id, provider),
	UNIQUE (provider, provider_id),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE refresh_tokens (
	user_id UUID PRIMARY KEY,
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE email_verification_tokens (
	user_id UUID PRIMARY KEY,
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE forgot_password_tokens (
	user_id UUID PRIMARY KEY,
	token_hash VARCHAR(255) NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	expires_at TIMESTAMPTZ NOT NULL,
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE profiles (
	user_id UUID PRIMARY KEY,
	gender VARCHAR(10),
	sexual_preference VARCHAR(10) DEFAULT 'both',
	last_seen TIMESTAMPTZ,
	biography TEXT,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	updated_at TIMESTAMPTZ DEFAULT NOW(),
	first_name VARCHAR(50),
	last_name VARCHAR(50),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE interest_tags (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	name VARCHAR(50) UNIQUE NOT NULL,
	created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_interests (
	user_id UUID NOT NULL,
	tag_id UUID NOT NULL,
	PRIMARY KEY (user_id, tag_id),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (tag_id) REFERENCES interest_tags(id) ON DELETE CASCADE
);

CREATE TABLE user_pictures (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL,
	url VARCHAR(255) NOT NULL,
	is_profile BOOLEAN DEFAULT FALSE,
	created_at TIMESTAMPTZ DEFAULT NOW(),
	FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE profile_views (
	viewer_id UUID NOT NULL,
	viewed_id UUID NOT NULL,
	PRIMARY KEY (viewer_id, viewed_id),
	FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (viewed_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE fake_reports (
	reporter_id UUID NOT NULL,
	reported_id UUID NOT NULL,
	reason VARCHAR(128),
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (reporter_id, reported_id),
	FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE likes (
	liker_id UUID NOT NULL,
	liked_id UUID NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	PRIMARY KEY (liker_id, liked_id),
	FOREIGN KEY (liker_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (liked_id) REFERENCES users(id) ON DELETE CASCADE
);
