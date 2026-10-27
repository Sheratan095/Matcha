-- Events can only exist between matched users, so every event hangs off the pair's chat
-- (a chat IS a match, see 007_messages.sql). Unmatching or blocking deletes the chat, and
-- the cascade on chat_id deletes the pair's events with it.

CREATE TABLE IF NOT EXISTS calendar_events (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	chat_id UUID NOT NULL, -- The match this event belongs to

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

	FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
	FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
	FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- The cascade from chats looks events up by chat_id
CREATE INDEX IF NOT EXISTS idx_calendar_events_chat_id ON calendar_events (chat_id);

-- Events are frozen once they've started: none can be created in the past, and an event that
-- has already started can't be modified (accepted, declined, cancelled, ...).
-- A plain CHECK can't do this: NOW() moves, so a CHECK would be re-evaluated against a different
-- clock on every later write of the row. The trigger raises a 23514 carrying a constraint name,
-- exactly like a named CHECK, so the service maps it to a 400 the same way.
CREATE OR REPLACE FUNCTION calendar_events_not_started()
RETURNS TRIGGER AS $$
BEGIN
	IF TG_OP = 'INSERT' AND NEW.start_time <= NOW() THEN
		RAISE EXCEPTION 'An event cannot start in the past'
			USING ERRCODE = 'check_violation', CONSTRAINT = 'calendar_events_future_start_check';
	END IF;

	IF TG_OP = 'UPDATE' AND OLD.start_time <= NOW() THEN
		RAISE EXCEPTION 'An event that has already started cannot be modified'
			USING ERRCODE = 'check_violation', CONSTRAINT = 'calendar_events_not_started_check';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_not_started ON calendar_events;
CREATE TRIGGER calendar_events_not_started
	BEFORE INSERT OR UPDATE ON calendar_events
	FOR EACH ROW EXECUTE FUNCTION calendar_events_not_started();