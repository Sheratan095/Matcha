-- Fame rating: a public 0-100 popularity score, stored on profiles and recomputed by the
-- profile service whenever one of its inputs changes (see DbService.recomputeFameRating).
--
-- It lives in its OWN migration rather than in 002 next to the profiles table, because the
-- function below reads likes / profile_views / fake_reports / blocks, which are created in
-- 003-006. Postgres parses a LANGUAGE SQL body at CREATE time, so declaring it in 002 fails
-- with 'relation does not exist'.

-- ALTER (not a column in 002's CREATE TABLE): CREATE TABLE IF NOT EXISTS is a no-op against an
-- existing database, so only an ALTER reaches a live DB on `make db-migrate`.
-- DEFAULT 50 is the score the formula itself yields for a user nobody has seen yet, so a brand
-- new row already reads correctly before the first recompute.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fame_rating SMALLINT NOT NULL DEFAULT 50;

-- Serves the future discovery query's `sort=fame` (descending).
CREATE INDEX IF NOT EXISTS idx_profiles_fame_rating ON profiles (fame_rating DESC);

-- The formula, kept in SQL so the backfill below and the profile service share ONE definition:
--
--   core    = 100 * (likes_received + 5) / (views_received + 10)
--   penalty = 5 * min(reports, 4) + 2 * min(blocks, 5)
--   bonus   = 10 when the profile is complete (>=1 picture, >=1 interest, non-empty bio)
--   fame    = clamp(round(core - penalty + bonus), 0, 100)
--
-- Why a SMOOTHED RATE and not a raw like count: a rate is age-independent, so a two-day-old
-- account can rank well, and the +5/+10 prior pulls small samples toward 50 instead of letting
-- one like off one view read as 100%. A user nobody has seen scores exactly 50.
--
-- Why the penalties are CAPPED: reports and blocks are abusable. Without LEAST() a handful of
-- coordinated fake reports could drive any account to 0. The caps bound the damage at -20 and
-- -10. Both counts are inherently per-DISTINCT-reporter, since fake_reports and blocks are keyed
-- on (reporter_id, reported_id) / (blocker_id, blocked_id).
--
-- STABLE, not IMMUTABLE (unlike snap_coord in 002): this reads tables, so its result for the
-- same argument changes as the data does.
CREATE OR REPLACE FUNCTION compute_fame_rating(uid UUID)
RETURNS SMALLINT
AS $$
	SELECT GREATEST(0, LEAST(100, ROUND(
		  100.0 * ((SELECT COUNT(*) FROM likes WHERE liked_id = uid) + 5)
				/ ((SELECT COUNT(*) FROM profile_views WHERE viewed_id = uid) + 10)
		- 5 * LEAST((SELECT COUNT(*) FROM fake_reports WHERE reported_id = uid), 4)
		- 2 * LEAST((SELECT COUNT(*) FROM blocks WHERE blocked_id = uid), 5)
		+ CASE
			WHEN EXISTS (SELECT 1 FROM user_pictures WHERE user_id = uid)
			 AND EXISTS (SELECT 1 FROM user_interests WHERE user_id = uid)
			 AND COALESCE((SELECT biography FROM profiles WHERE user_id = uid), '') <> ''
			THEN 10
			ELSE 0
		  END
	)))::smallint;
$$ LANGUAGE SQL STABLE;

-- Backfill every existing profile. Idempotent and cheap at this scale, so each `make db-migrate`
-- re-syncs every score from the underlying truth -- which also repairs any row left stale by a
-- recompute that was missed while the column did not exist yet.
UPDATE profiles SET fame_rating = compute_fame_rating(user_id);
