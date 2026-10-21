-- FAME RATING: A PUBLIC 0-100 SCORE STORED ON PROFILES. The profile service recomputes it
-- whenever one of its inputs changes (see DbService.recomputeFameRating).

-- Its OWN MIGRATION, not 002: the function below reads likes / profile_views / fake_reports /
-- blocks, created in 003-006, and Postgres checks a SQL body when the function is created.

-- DEFAULT 40 = what the formula gives a profile with nothing filled in yet, which is exactly
-- what a row looks like when it is created at registration. Any other default would show one
-- number until the first recompute and then jump.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fame_rating SMALLINT NOT NULL DEFAULT 40;

-- For the discovery query's `sort=fame` (descending).
CREATE INDEX IF NOT EXISTS idx_profiles_fame_rating ON profiles (fame_rating DESC);

-- The formula, kept in SQL so the backfill below and the profile service share one definition:

--   core    = 100 * (likes + 4) / (people_who_engaged + 10)
--   penalty = 5 * min(reports, 4) + 2 * min(blocks, 5)
--   bonus   = 10 if the profile is complete (a picture, an interest, a bio)
--   fame    = clamp(round(core - penalty + bonus), 0, 100)

-- A RATE and not a like count, so a two-day-old account can still score well. The + 4 / + 10
-- is a prior: without it, one like from one viewer would read as 100%.
--
-- 4/10 and not 5/10 so that the +10 bonus lands a finished profile on exactly 50: a new user
-- with nothing filled in scores 40, and completing the profile brings them to the neutral 50.
-- The 10 is the prior's WEIGHT (10 imaginary reactions), so real data outweighs it at ~10 real
-- ones. Changing the bonus means changing the 4 too, or neutral stops being 50.

-- "Engaged" means viewers UNION likers, not just views. A profile_views row is only written
-- when someone opens the FULL PROFILE, never when a card shows up in the swipe deck, so most
-- likes come from people who never viewed. Dividing by views alone would push the rate above
-- 1 and leave everyone popular stuck at 100. Counting every liker in the denominator keeps it
-- under 1: opening a profile without liking costs score, a deck like raises it.

-- The penalties are CAPPED because reports and blocks are abusable: without LEAST() a few
-- coordinated fake reports could zero any account.

CREATE OR REPLACE FUNCTION compute_fame_rating(uid UUID)
RETURNS SMALLINT
AS $$
	SELECT GREATEST(0, LEAST(100, ROUND(
		  100.0 * ((SELECT COUNT(*) FROM likes WHERE liked_id = uid) + 4)
				/ ((SELECT COUNT(*) FROM (
						SELECT viewer_id AS person FROM profile_views WHERE viewed_id = uid
						UNION -- not UNION ALL: someone who viewed AND liked counts once
						SELECT liker_id  AS person FROM likes         WHERE liked_id  = uid
				   ) engaged) + 10)
		- 5 * LEAST((SELECT COUNT(*) FROM fake_reports WHERE reported_id = uid), 4)
		- 2 * LEAST((SELECT COUNT(*) FROM blocks WHERE blocked_id = uid), 5)
		-- IF the profile has at least one picture, at least one interest, and a non-empty bio
		+ CASE
				WHEN EXISTS (SELECT 1 FROM user_pictures WHERE user_id = uid)
				AND EXISTS (SELECT 1 FROM user_interests WHERE user_id = uid)
				-- COALESCE() returns the first non-null value in a list
				AND COALESCE((SELECT biography FROM profiles WHERE user_id = uid), '') <> ''
			 -- THEN give it a bonus.
			THEN 10
			ELSE 0
		  END
	)))::smallint;
$$ LANGUAGE SQL STABLE;

-- Backfill. Idempotent, so every `make db-migrate` re-syncs all scores from the real counts.
UPDATE profiles SET fame_rating = compute_fame_rating(user_id);
