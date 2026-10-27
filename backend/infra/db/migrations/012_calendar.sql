CREATE TABLE IF NOT EXISTS calendar_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	inviter_id UUID NOT NULL, -- The user who created the event
	invitee_id UUID NOT NULL, -- The user who is invited to the event

	created_at TIMESTAMPTZ DEFAULT NOW(),

	title VARCHAR(100) NOT NULL,
	description TEXT,

	start_time TIMESTAMPTZ NOT NULL,
	end_time TIMESTAMPTZ NOT NULL,
	-- Ensure that the start time is before the end time
	CONSTRAINT calendar_events_time_order_check CHECK (start_time < end_time),

	-- No event with yourself (the service maps this named CHECK to a 400)
	CONSTRAINT calendar_events_not_self_check CHECK (inviter_id <> invitee_id),

	-- Location of the event (latitude and longitude)
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,

	status VARCHAR(20) NOT NULL DEFAULT 'pending', -- e.g., 'pending', 'accepted', 'declined'
	CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),

	FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
)