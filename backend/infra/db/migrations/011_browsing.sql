-- BROWSING / SUGGESTIONS (subject IV.3): who may appear in another user's swipe deck, and how
-- well they match. Everything here is a RULE — eligibility, orientation compatibility, masked
-- distance, common-tag count, the weighted score — so it lives in SQL, next to compute_fame_rating.

-- Its OWN MIGRATION, not 002: the body reads likes / blocks / passes / user_interests, created
-- in 005, 006, 010 and 002, and Postgres validates a SQL body when the function is created.

-- WHAT IS DELIBERATELY *NOT* HERE: the filters, the sort and the LIMIT/OFFSET. Those are one
-- request's shape, not an invariant, so DbService.getDiscoverCandidates appends them around the
-- call. That split is also forced by the planner: Postgres only INLINES a set-returning SQL
-- function when its body is a single plain SELECT — a CTE, GROUP BY, DISTINCT, ORDER BY or LIMIT
-- in here would turn it into an opaque box that computes every candidate before the caller's
-- WHERE and LIMIT could run. Kept inlinable, it behaves like a parameterized VIEW: the caller's
-- filters and ORDER BY are pushed down into it and idx_profiles_fame_rating still gets used.
-- Hence also the LATERAL below instead of a WITH, and the aggregates hidden inside subqueries
-- (an aggregate in the function's own target list would block inlining too).


CREATE OR REPLACE FUNCTION discover_candidates(viewer UUID)
RETURNS TABLE (
	user_id             UUID,
	username            TEXT,
	first_name          TEXT,
	age                 SMALLINT,
	distance_km         DOUBLE PRECISION,
	common_tag_count    INT,
	likes_you           BOOLEAN,
	already_passed      BOOLEAN,
	profile_picture_url TEXT,
	fame_rating         SMALLINT,
	match_score         DOUBLE PRECISION
)
AS $$
	SELECT
		c.user_id,
		u.username::text,
		c.first_name::text,
		EXTRACT(YEAR FROM age(CURRENT_DATE, c.date_of_birth))::smallint,

		-- RAW distance, not the 1 km-floored integer the profile endpoint shows: the caller may
		-- ORDER BY this, and rounding first would collapse every nearby candidate into one tie.
		-- Only the TARGET is snapped (the viewer knows their own position), which is what caps
		-- trilateration — see snap_coord in 002_create_profiles.sql.
		m.dist,

		m.common_tag_count,

		-- Drives the "they liked you first" badge on the card.
		EXISTS (SELECT 1 FROM likes WHERE liker_id = c.user_id AND liked_id = viewer),

		-- A pass does NOT remove a candidate, it only marks them so the caller can sort them to
		-- the BOTTOM of the deck. Excluding them outright would empty the deck for good once the
		-- user had swiped left on everyone; this way they resurface only after the fresh ones.
		EXISTS (SELECT 1 FROM passes WHERE user_id = viewer AND passed_id = c.user_id),

		pic.url::text,
		c.fame_rating,

		-- The subject's three weighted criteria: same area, most common tags, highest fame.
		-- Each term is normalised to 0..1 first so the weights mean what they say.
		(
			-- Proximity decays linearly over 100 km; beyond that (or with no location at all,
			-- when distance_km is NULL because it is STRICT) it contributes nothing.
			  0.5 * (1 - LEAST(COALESCE(m.dist, 'Infinity'::double precision) / 100.0, 1))
			-- Share of the VIEWER's own tags that the candidate matches, so having many tags
			-- yourself does not make everyone look like a weak match.
			+ 0.3 * LEAST(m.common_tag_count::double precision / GREATEST(m.my_tag_count, 1), 1)
			+ 0.2 * (c.fame_rating / 100.0)
		)::double precision

	FROM profiles c
	-- The viewer's own row, joined once rather than fetched by scalar subqueries per column.
	INNER JOIN profiles v ON v.user_id = viewer
	INNER JOIN users u ON u.id = c.user_id
	-- Doubles as the "must have a profile picture" rule: no picture, no row.
	INNER JOIN user_pictures pic ON pic.user_id = c.user_id AND pic.is_profile
	-- LATERAL and not a CTE (see the header): a WITH here would block inlining outright. It lets
	-- the distance and the tag counts be WRITTEN once, but be aware it does not make them
	-- EVALUATED once: inlining flattens this subquery and substitutes each expression into every
	-- place that references it, so common_tag_count really runs twice per candidate — once for
	-- the output column, once inside match_score (visible as two SubPlans in EXPLAIN). Harmless
	-- at this scale; `OFFSET 0` inside this subquery is the fence that would force a single
	-- evaluation, at the cost of a trick no reader guesses, if the pool ever grows enough to care.
	CROSS JOIN LATERAL (
		SELECT
			distance_km(v.latitude, v.longitude,
						snap_coord(c.latitude), snap_coord(c.longitude)) AS dist,
			(SELECT COUNT(*)
			   FROM user_interests mine
			   INNER JOIN user_interests theirs ON theirs.tag_id = mine.tag_id
			  WHERE mine.user_id = viewer AND theirs.user_id = c.user_id)::int AS common_tag_count,
			(SELECT COUNT(*) FROM user_interests WHERE user_id = viewer)::int AS my_tag_count
	) m

	WHERE c.user_id <> viewer

	  -- ONLY COMPLETE PROFILES are suggested. gender is needed to check orientation, the date of
	  -- birth and the location to render the card's age and distance, and a bio/interests/picture
	  -- make a card worth swiping on at all (mirrors DbService.isProfileComplete).
	  AND c.gender IS NOT NULL
	  AND c.date_of_birth IS NOT NULL
	  AND c.latitude IS NOT NULL
	  AND c.longitude IS NOT NULL
	  AND COALESCE(c.biography, '') <> ''
	  AND EXISTS (SELECT 1 FROM user_interests WHERE user_id = c.user_id)

	  -- Orientation must work in BOTH directions, or a straight man would be shown to straight
	  -- men who happen to match his own preference. COALESCE makes an unset preference behave as
	  -- 'both' (the column default), i.e. bisexual, as the subject requires. 'other' as a
	  -- preference means "interested in gender 'other'", so plain equality covers it.
	  AND COALESCE(c.sexual_preference, 'both') IN ('both', v.gender)
	  AND COALESCE(v.sexual_preference, 'both') IN ('both', c.gender)

	  -- Already swiped RIGHT: they belong to /likes now, not to the deck.
	  AND NOT EXISTS (SELECT 1 FROM likes WHERE liker_id = viewer AND liked_id = c.user_id)

	  -- A block hides the pair from each other in either direction.
	  AND NOT EXISTS (SELECT 1 FROM blocks
					   WHERE (blocker_id = viewer     AND blocked_id = c.user_id)
						  OR (blocker_id = c.user_id AND blocked_id = viewer));
$$ LANGUAGE SQL STABLE;
